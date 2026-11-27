/**
 * Parsers for DEGIRO exports (Inbox → Portfolio / Transactions → Export → CSV).
 * Dutch and English headers. DEGIRO puts each amount's currency in an unnamed
 * column right before or after it, so amounts are read by header position with
 * a fallback to the neighbouring column. No imports: unit-tested with Node.
 */

export interface DegiroHolding {
  symbol: string; // ISIN, or "CASH" for the cash line
  name: string;
  quantity: number;
  price: number | null;
  valueEur: number;
}

export interface DegiroTrade {
  tradedAt: string; // YYYY-MM-DD
  isin: string;
  product: string;
  quantity: number; // negative = sell
  price: number | null;
  currency: string | null;
  totalEur: number | null;
  feesEur: number | null;
  externalId: string;
}

export class DegiroFormatError extends Error {}

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

/** "1.234,56", "1234,56", "1234.56", "-12,30" → number. A lone "." with 3 decimals is a thousands dot. */
export function num(s: string | undefined): number | null {
  if (s === undefined) return null;
  let t = s.trim().replace(/\s|€/g, "");
  if (!t || !/\d/.test(t)) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const isCurrency = (s: string | undefined) => /^[A-Z]{3}$/.test((s ?? "").trim());

function table(input: string) {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const first = text.split(/\r?\n/, 1)[0];
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const [header, ...rows] = parseCsv(text, sep);
  if (!header) throw new DegiroFormatError("The file is empty.");
  const names = header.map((h) => h.trim().toLowerCase());
  const find = (...aliases: string[]) => names.findIndex((n) => aliases.some((a) => n === a || n.startsWith(a)));
  return { rows, names, find };
}

/**
 * Amount at a header position; if that cell is a currency code, the number sits next to it.
 * An empty cell means no amount (e.g. no fee on the second part of a split order):
 * never borrow the neighbouring column, which is a different amount.
 */
function amountAt(r: string[], i: number): { value: number | null; currency: string | null } {
  if (i < 0) return { value: null, currency: null };
  const here = num(r[i]);
  if (here !== null) return { value: here, currency: isCurrency(r[i + 1]) ? r[i + 1].trim() : isCurrency(r[i - 1]) ? r[i - 1].trim() : null };
  if (isCurrency(r[i])) return { value: num(r[i + 1]), currency: r[i].trim() };
  return { value: null, currency: null };
}

export function parsePortfolio(input: string): DegiroHolding[] {
  const { rows, find } = table(input);
  const cProduct = find("product");
  const cIsin = find("symbool/isin", "symbol/isin", "isin");
  const cQty = find("aantal", "quantity", "amount");
  const cPrice = find("slotkoers", "closing", "koers", "price");
  const cEur = find("waarde in eur", "value in eur", "waarde (eur)", "value (eur)");
  if (cProduct < 0 || cEur < 0) {
    throw new DegiroFormatError("This doesn’t look like a DEGIRO Portfolio export (needs Product and Value in EUR columns).");
  }
  const out: DegiroHolding[] = [];
  for (const r of rows) {
    const name = (r[cProduct] ?? "").trim();
    if (!name) continue;
    // The value in EUR is the last number on the line.
    const nums = r.map((c) => num(c));
    const valueEur = num(r[cEur]) ?? [...nums].reverse().find((n) => n !== null) ?? null;
    if (valueEur === null) continue;
    const isCash = /cash|geldmarkt|money market/i.test(name) && !(r[cIsin] ?? "").trim();
    out.push({
      symbol: isCash ? "CASH" : (r[cIsin] ?? "").trim() || name,
      name: isCash ? "Cash" : name,
      quantity: isCash ? valueEur : (num(r[cQty]) ?? 0),
      price: isCash ? 1 : amountAt(r, cPrice).value,
      valueEur,
    });
  }
  // Several cash lines (EUR, other currencies, money-market fund) → one.
  const cash = out.filter((h) => h.symbol === "CASH");
  const rest = out.filter((h) => h.symbol !== "CASH");
  if (cash.length) {
    const total = cash.reduce((s, h) => s + h.valueEur, 0);
    rest.push({ symbol: "CASH", name: "Cash", quantity: total, price: 1, valueEur: Math.round(total * 100) / 100 });
  }
  return rest;
}

const toDate = (s: string) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s.trim()) ?? null;
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? s.trim() : null;
};

/** A fee as large as the whole trade is a misread column, not a fee. */
const fees = (fee: number | null, total: number | null) =>
  fee === null ? 0 : total !== null && Math.abs(fee) >= Math.abs(total) * 0.5 ? 0 : fee;

export function parseTrades(input: string): DegiroTrade[] {
  const { rows, find } = table(input);
  const cDate = find("datum", "date");
  const cTime = find("tijd", "time");
  const cProduct = find("product");
  const cIsin = find("isin");
  const cQty = find("aantal", "quantity", "number");
  const cPrice = find("koers", "price");
  const cFees = find("transactiekosten", "transaction and/or third", "transaction costs", "kosten");
  const cTotal = find("totaal", "total");
  const cOrder = find("order id", "order-id", "orderid");
  if (cDate < 0 || cIsin < 0 || cQty < 0) {
    throw new DegiroFormatError("This doesn’t look like a DEGIRO Transactions export (needs Date, ISIN and Quantity columns).");
  }
  const seen = new Map<string, number>();
  const out: DegiroTrade[] = [];
  for (const r of rows) {
    const tradedAt = toDate(r[cDate] ?? "");
    const isin = (r[cIsin] ?? "").trim();
    const quantity = num(r[cQty]);
    if (!tradedAt || !isin || quantity === null) continue;
    const price = amountAt(r, cPrice);
    const order = cOrder >= 0 ? (r[cOrder] ?? "").trim() : "";
    const base = order || [tradedAt, (r[cTime] ?? "").trim(), isin, quantity, price.value].join("|");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.push({
      tradedAt,
      isin,
      product: (r[cProduct] ?? "").trim(),
      quantity,
      price: price.value,
      currency: price.currency,
      totalEur: amountAt(r, cTotal).value,
      feesEur: fees(amountAt(r, cFees).value, amountAt(r, cTotal).value),
      // One order can fill in parts with the same order id, hence the counter.
      externalId: `${base}|${n}`,
    });
  }
  return out;
}

/** Which kind of DEGIRO export is this? */
export function degiroKind(input: string): "portfolio" | "trades" | null {
  const first = (input.charCodeAt(0) === 0xfeff ? input.slice(1) : input).split(/\r?\n/, 1)[0].toLowerCase();
  if (/isin/.test(first) && /(datum|date)/.test(first) && /(aantal|quantity|number)/.test(first)) return "trades";
  if (/product/.test(first) && /(waarde in eur|value in eur)/.test(first)) return "portfolio";
  return null;
}
