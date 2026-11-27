import "server-only";
import { db, hasDatabase } from "@/lib/supabase";

export type Provider = "ing" | "degiro" | "bitvavo" | "manual";

export interface AccountView {
  id: string;
  provider: Provider;
  name: string;
  kind: "current" | "savings" | "brokerage" | "crypto";
  balance: number | null;
  balanceAsOf: string | null;
  syncedAt: string | null;
  /** Newest transaction date (ING) — what "up to date" means for a bank account. */
  latestTxn: string | null;
}

export interface HoldingView {
  accountId: string;
  symbol: string;
  name: string;
  quantity: number;
  price: number | null;
  valueEur: number;
  asOf: string;
}

export interface TxnView {
  id: string;
  bookedAt: string;
  amount: number;
  counterparty: string;
  description: string | null;
  category: string;
  categorySource: "rule" | "manual" | "agent";
  account: string;
  /** For a payment: total paid back to you via Tikkie (positive). */
  paidBack: number;
  /** For a payback: the payment it belongs to. */
  offsets: { id: string; label: string; source: "auto" | "manual" } | null;
  /** For a payback the user marked "not a match". */
  unlinked: boolean;
}

export interface MonthSummary {
  month: string; // YYYY-MM
  spent: number; // your share, excludes transfers, investing and paybacks
  received: number;
  byCategory: { category: string; amount: number }[];
}

export interface FinanceData {
  accounts: AccountView[];
  holdings: HoldingView[];
  transactions: TxnView[];
  month: MonthSummary | null;
  isSample: boolean;
}

/** Not spending and not income: moving money between your own pots, and friends paying you back. */
const NEITHER = new Set(["Transfers", "Investing", "Paybacks"]);

/**
 * `paidBack` is subtracted from a payment, so a shared € 80 dinner with € 60 back counts as € 20.
 * Only the Income category counts as money in; other incoming money is a refund.
 */
export function summarize(month: string, txns: Pick<TxnView, "amount" | "category" | "paidBack">[]): MonthSummary {
  const by = new Map<string, number>();
  let spent = 0;
  let received = 0;
  for (const t of txns) {
    if (NEITHER.has(t.category)) continue;
    if (t.amount < 0) {
      const share = Math.max(0, -t.amount - t.paidBack);
      spent += share;
      by.set(t.category, (by.get(t.category) ?? 0) + share);
    } else if (t.category === "Income") received += t.amount;
    else {
      // A refund from a shop lowers what you spent in that category.
      spent -= t.amount;
      by.set(t.category, (by.get(t.category) ?? 0) - t.amount);
    }
  }
  return {
    month,
    spent,
    received,
    byCategory: [...by]
      .filter(([, a]) => a > 0)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}

const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(d);

const nextMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
};

/** Sum of paybacks per payment id. */
async function paybackTotals(paymentIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < paymentIds.length; i += 200) {
    const { data } = await db()
      .from("transactions")
      .select("offsets_id,amount")
      .in("offsets_id", paymentIds.slice(i, i + 200));
    for (const r of data ?? []) out.set(r.offsets_id, (out.get(r.offsets_id) ?? 0) + Number(r.amount));
  }
  return out;
}

export async function getFinance(now = new Date()): Promise<FinanceData> {
  if (!hasDatabase()) return sample(now);

  const { data: accounts, error } = await db()
    .from("finance_accounts")
    .select("id,provider,name,kind,balance,balance_as_of,synced_at")
    .order("kind")
    .order("name");
  if (error) throw new Error(`finance_accounts: ${error.message}`);
  if (!accounts.length) return { accounts: [], holdings: [], transactions: [], month: null, isSample: false };

  const latestTxn = new Map<string, string>();
  await Promise.all(
    accounts
      .filter((a) => a.provider === "ing")
      .map(async (a) => {
        const { data } = await db()
          .from("transactions")
          .select("booked_at")
          .eq("account_id", a.id)
          .order("booked_at", { ascending: false })
          .limit(1);
        if (data?.[0]) latestTxn.set(a.id, data[0].booked_at);
      }),
  );

  const { data: holdingRows } = await db()
    .from("holdings")
    .select("account_id,symbol,name,quantity,price,value_eur,as_of")
    .order("value_eur", { ascending: false });

  const names = new Map(accounts.map((a) => [a.id, a.name as string]));
  const { data: txns, error: e2 } = await db()
    .from("transactions")
    .select("id,booked_at,amount,counterparty,description,category,category_source,account_id,offsets_id,offsets_source")
    .order("booked_at", { ascending: false })
    .limit(60);
  if (e2) throw new Error(`transactions: ${e2.message}`);

  const paidBack = await paybackTotals(txns.filter((t) => Number(t.amount) < 0).map((t) => t.id));
  const originalIds = [...new Set(txns.map((t) => t.offsets_id).filter(Boolean))] as string[];
  const { data: originals } = originalIds.length
    ? await db().from("transactions").select("id,counterparty,booked_at").in("id", originalIds)
    : { data: [] as { id: string; counterparty: string | null; booked_at: string }[] };
  const originalLabel = new Map((originals ?? []).map((o) => [o.id, `${o.counterparty ?? "a payment"} (${o.booked_at})`]));

  // The month of the newest transaction, so an import from last month still shows something.
  const latest = txns[0]?.booked_at as string | undefined;
  let month: MonthSummary | null = null;
  if (latest) {
    const m = latest.slice(0, 7);
    const { data: monthTxns } = await db()
      .from("transactions")
      .select("id,amount,category")
      .gte("booked_at", `${m}-01`)
      .lt("booked_at", nextMonth(m));
    const rows = monthTxns ?? [];
    const back = await paybackTotals(rows.filter((t) => Number(t.amount) < 0).map((t) => t.id));
    month = summarize(
      m,
      rows.map((t) => ({ amount: Number(t.amount), category: t.category ?? "Other", paidBack: back.get(t.id) ?? 0 })),
    );
  }

  return {
    accounts: accounts.map((a) => ({
      id: a.id,
      provider: a.provider,
      name: a.name,
      kind: a.kind,
      balance: a.balance === null ? null : Number(a.balance),
      balanceAsOf: a.balance_as_of,
      syncedAt: a.synced_at,
      latestTxn: latestTxn.get(a.id) ?? null,
    })),
    holdings: (holdingRows ?? []).map((h) => ({
      accountId: h.account_id,
      symbol: h.symbol,
      name: h.name ?? h.symbol,
      quantity: Number(h.quantity),
      price: h.price === null ? null : Number(h.price),
      valueEur: Number(h.value_eur ?? 0),
      asOf: h.as_of,
    })),
    transactions: txns.map((t) => ({
      id: t.id,
      bookedAt: t.booked_at,
      amount: Number(t.amount),
      counterparty: t.counterparty ?? "Unknown",
      description: t.description,
      category: t.category ?? "Other",
      categorySource: t.category_source,
      account: names.get(t.account_id) ?? "",
      paidBack: paidBack.get(t.id) ?? 0,
      offsets: t.offsets_id
        ? { id: t.offsets_id, label: originalLabel.get(t.offsets_id) ?? "a payment", source: t.offsets_source }
        : null,
      unlinked: !t.offsets_id && t.offsets_source === "manual",
    })),
    month,
    isSample: false,
  };
}

function sample(now: Date): FinanceData {
  const today = ymd(now);
  const day = (n: number) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const t = (n: number, amount: number, counterparty: string, category: string, extra: Partial<TxnView> = {}): TxnView => ({
    id: `t${n}${counterparty}`,
    bookedAt: day(n),
    amount,
    counterparty,
    description: null,
    category,
    categorySource: "rule",
    account: "ING current ··4567",
    paidBack: 0,
    offsets: null,
    unlinked: false,
    ...extra,
  });
  const transactions = [
    t(0, -23.45, "Albert Heijn 1234", "Groceries"),
    t(0, 20, "J Jansen via Tikkie", "Paybacks", { offsets: { id: "t2Restaurant De Kas", label: "Restaurant De Kas", source: "auto" } }),
    t(1, -13.99, "Netflix International B.V.", "Subscriptions"),
    t(1, -4.2, "NS Groep IZ NS Reizigers", "Transport"),
    t(2, -80, "Restaurant De Kas", "Eating out", { paidBack: 60 }),
    t(2, -500, "Oranje Spaarrekening", "Transfers"),
    t(3, 3100, "Werkgever BV", "Income"),
    t(4, -1150, "Woonstichting", "Housing"),
    t(5, -38.6, "Thuisbezorgd.nl", "Eating out"),
    t(6, -89.95, "Coolblue", "Shopping", { categorySource: "manual" }),
  ];
  const acc = (id: string, provider: Provider, name: string, kind: AccountView["kind"], balance: number | null, n: number): AccountView => ({
    id,
    provider,
    name,
    kind,
    balance,
    balanceAsOf: day(n),
    syncedAt: `${day(n)}T09:00:00Z`,
    latestTxn: provider === "ing" ? day(n) : null,
  });
  return {
    accounts: [
      acc("a1", "ing", "ING current ··4567", "current", 1976.55, 0),
      acc("a2", "ing", "Oranje spaarrekening", "savings", 10500, 2),
      acc("a3", "degiro", "DEGIRO", "brokerage", null, 1),
      acc("a4", "bitvavo", "Bitvavo", "crypto", null, 0),
    ],
    holdings: [
      { accountId: "a3", symbol: "IE00BK5BQT80", name: "Vanguard FTSE All-World", quantity: 120, price: 128.4, valueEur: 15408, asOf: day(1) },
      { accountId: "a3", symbol: "NL0010273215", name: "ASML Holding", quantity: 3, price: 690.2, valueEur: 2070.6, asOf: day(1) },
      { accountId: "a4", symbol: "BTC", name: "Bitcoin", quantity: 0.012, price: 82000, valueEur: 984, asOf: day(0) },
    ],
    transactions,
    month: summarize(today.slice(0, 7), transactions),
    isSample: true,
  };
}
