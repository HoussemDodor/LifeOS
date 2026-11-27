/**
 * Parser for ING Netherlands CSV exports (Mijn ING → Af- en bijschrijvingen →
 * Downloaden → CSV). Reads columns by header name, so it handles the Dutch and
 * English exports, both ";" and "," separators, and the savings ("Sparen")
 * export. No imports: this file is unit-tested directly with Node.
 */

export interface IngRow {
  account: string; // IBAN or savings account number
  accountName?: string;
  bookedAt: string; // YYYY-MM-DD
  amount: number; // negative = money out
  currency: string;
  name: string;
  counterIban?: string;
  type?: string;
  notes?: string;
  balanceAfter?: number;
  /** Stable identity for de-duplication across re-imports. */
  key: string;
}

export interface IngParseResult {
  rows: IngRow[];
  kind: "current" | "savings";
  skipped: number;
}

const COLUMNS = {
  date: ["datum", "date"],
  name: ["naam / omschrijving", "name / description", "omschrijving", "description"],
  account: ["rekening", "account"],
  accountName: ["rekening naam", "account name"],
  counter: ["tegenrekening", "counterparty"],
  direction: ["af bij", "af/bij", "debit/credit"],
  amount: ["bedrag (eur)", "amount (eur)", "bedrag", "amount"],
  currency: ["valuta", "currency"],
  type: ["mutatiesoort", "transaction type"],
  notes: ["mededelingen", "notifications", "notes"],
  balance: ["saldo na mutatie", "resulting balance", "balance after transaction"],
} as const;
const REQUIRED = ["date", "name", "account", "direction", "amount"] as const;

export class IngFormatError extends Error {}

/** Split CSV text into records, honouring quotes ("" is an escaped quote). */
function parseCsv(text: string, sep: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) out.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) out.push(row);
  return out;
}

function parseDate(s: string): string | null {
  const t = s.trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(t) ?? /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** "1.234,56", "1234,56", "1234.56" or "-12,30" → number. */
export function parseAmount(s: string): number | null {
  let t = s.trim().replace(/\s|€/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

export function parseIngCsv(input: string): IngParseResult {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input; // drop a byte-order mark
  const firstLine = text.split(/\r?\n/, 1)[0];
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const [header, ...records] = parseCsv(text, sep);
  if (!header) throw new IngFormatError("The file is empty.");

  const names = header.map((h) => h.trim().toLowerCase());
  const col = {} as Record<keyof typeof COLUMNS, number>;
  for (const [k, aliases] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, readonly string[]][]) {
    col[k] = names.findIndex((n) => aliases.includes(n));
  }
  const missing = REQUIRED.filter((k) => col[k] < 0);
  if (missing.length) {
    throw new IngFormatError(
      `This doesn’t look like an ING export. Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`,
    );
  }

  const get = (r: string[], k: keyof typeof COLUMNS) => (col[k] >= 0 ? r[col[k]] : undefined);
  const seen = new Map<string, number>();
  const rows: IngRow[] = [];
  let skipped = 0;

  for (const r of records) {
    const bookedAt = parseDate(get(r, "date") ?? "");
    const abs = parseAmount(get(r, "amount") ?? "");
    const dir = clean(get(r, "direction")).toLowerCase();
    const account = clean(get(r, "account")).replace(/\s/g, "").toUpperCase();
    if (!bookedAt || abs === null || !account || !["af", "bij", "debit", "credit"].includes(dir)) {
      skipped++;
      continue;
    }
    const amount = Math.round((dir === "af" || dir === "debit" ? -Math.abs(abs) : Math.abs(abs)) * 100) / 100;
    const balanceRaw = get(r, "balance");
    const balanceAfter = balanceRaw ? (parseAmount(balanceRaw) ?? undefined) : undefined;
    const name = clean(get(r, "name"));
    const notes = clean(get(r, "notes")) || undefined;
    const counterIban = clean(get(r, "counter")).replace(/\s/g, "").toUpperCase() || undefined;

    // ING exports have no transaction id. These fields (plus the running balance
    // when present) identify a row; a counter separates true same-day duplicates.
    const base = [account, bookedAt, amount.toFixed(2), name, counterIban ?? "", notes ?? "", balanceAfter ?? ""].join("|");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);

    rows.push({
      account,
      accountName: clean(get(r, "accountName")) || undefined,
      bookedAt,
      amount,
      currency: clean(get(r, "currency")) || "EUR",
      name,
      counterIban,
      type: clean(get(r, "type")) || undefined,
      notes,
      balanceAfter,
      key: `${base}|${n}`,
    });
  }

  const looksSavings = col.accountName >= 0 || col.currency >= 0 || rows.some((r) => !/^NL\d{2}INGB/.test(r.account));
  return { rows, kind: looksSavings ? "savings" : "current", skipped };
}

/* ---------- Categories ---------------------------------------------------- */

export const CATEGORIES = [
  "Income",
  "Groceries",
  "Eating out",
  "Transport",
  "Housing",
  "Utilities",
  "Insurance",
  "Health & sport",
  "Subscriptions",
  "Shopping",
  "Investing",
  "Cash",
  "Transfers",
  "Paybacks",
  "Other",
] as const;
export type Category = (typeof CATEGORIES)[number];

const RULES: [Category, RegExp][] = [
  ["Groceries", /albert heijn|\bah\b|jumbo|lidl|aldi|\bplus\b|dirk|vomar|hoogvliet|spar\b|ekoplaza|picnic|crisp/],
  ["Eating out", /thuisbezorgd|uber ?eats|deliveroo|restaurant|cafe|caf[eé]|bistro|mcdonald|burger king|kfc|starbucks|domino|new york pizza|subway|febo/],
  ["Transport", /\bns\b|ns groep|ov-?chip|translink|\bgvb\b|\bret\b|\bhtm\b|arriva|connexxion|shell|\bbp\b|esso|tango|tinq|texaco|total|uber|bolt|q-?park|parkeren|parkmobile|yellowbrick|anwb|swapfiets/],
  ["Housing", /huur|hypotheek|woonstichting|woningcorporatie|vve\b|rent\b/],
  ["Utilities", /vattenfall|eneco|essent|greenchoice|budget energie|ziggo|kpn|odido|t-mobile|vodafone|simyo|lebara|waternet|vitens|evides|brabant water|gemeente|belastingdienst|waterschap/],
  ["Insurance", /verzekering|zilveren kruis|\bcz\b|\bvgz\b|menzis|ohra|centraal beheer|interpolis|ditzo|\bfbto\b|nationale-nederlanden|a\.s\.r|asr\b/],
  ["Health & sport", /apotheek|tandarts|huisarts|fysio|basic-?fit|sportschool|fit for free|anytime fitness|trainmore|hevy/],
  ["Subscriptions", /netflix|spotify|apple\.com|itunes|google|youtube|disney|videoland|hbo|amazon prime|prime video|patreon|chatgpt|openai|anthropic|claude|icloud|microsoft|adobe/],
  ["Shopping", /bol\.com|coolblue|amazon|zalando|ikea|hema|action\b|mediamarkt|kruidvat|etos|decathlon|primark|h&m|uniqlo|wehkamp/],
  ["Investing", /degiro|flatex|bitvavo|coinbase|kraken|meesman|brand new day|trade republic|saxo/],
];

/** Tikkie / payment-request paybacks: money friends send back for a shared cost. */
export const isPaybackText = (text: string) => /tikkie|betaalverzoek|payment request/i.test(text);

/** Rule-based category from the counterparty name, notes and transaction type. */
export function categorize(row: Pick<IngRow, "name" | "notes" | "type" | "amount" | "counterIban">, ownAccounts: Set<string>): Category {
  const text = `${row.name} ${row.notes ?? ""}`.toLowerCase();
  const type = (row.type ?? "").toLowerCase();
  if ((row.counterIban && ownAccounts.has(row.counterIban)) || /spaarrekening|oranje spaar|savings account/.test(text)) {
    return "Transfers";
  }
  if (row.amount > 0 && isPaybackText(text)) return "Paybacks";
  if (/geldautomaat|atm|opname/.test(type) || /geldautomaat/.test(text)) return "Cash";
  if (row.amount > 0 && /salaris|salary|loon|wages|payroll/.test(text)) return "Income";
  for (const [cat, re] of RULES) if (re.test(text)) return cat;
  if (row.amount > 0) return "Income";
  return "Other";
}
