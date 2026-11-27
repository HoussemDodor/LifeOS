import "server-only";
import { db, hasDatabase } from "@/lib/supabase";

export interface AccountView {
  id: string;
  name: string;
  kind: "current" | "savings" | "brokerage" | "crypto";
  balance: number | null;
  balanceAsOf: string | null;
}

export interface TxnView {
  id: string;
  bookedAt: string;
  amount: number;
  counterparty: string;
  description: string | null;
  category: string;
  account: string;
}

export interface MonthSummary {
  month: string; // YYYY-MM
  spent: number; // positive number, excludes transfers and investing
  received: number;
  byCategory: { category: string; amount: number }[];
}

export interface FinanceData {
  accounts: AccountView[];
  transactions: TxnView[];
  month: MonthSummary | null;
  isSample: boolean;
}

/** Not real spending: money moving between your own pots. */
const NOT_SPENDING = new Set(["Transfers", "Investing"]);

export function summarize(month: string, txns: Pick<TxnView, "amount" | "category">[]): MonthSummary {
  const by = new Map<string, number>();
  let spent = 0;
  let received = 0;
  for (const t of txns) {
    if (NOT_SPENDING.has(t.category)) continue;
    if (t.amount < 0) {
      spent += -t.amount;
      by.set(t.category, (by.get(t.category) ?? 0) - t.amount);
    } else received += t.amount;
  }
  return {
    month,
    spent,
    received,
    byCategory: [...by].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
  };
}

const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(d);

export async function getFinance(now = new Date()): Promise<FinanceData> {
  if (!hasDatabase()) return sample(now);

  const { data: accounts, error } = await db()
    .from("finance_accounts")
    .select("id,name,kind,balance,balance_as_of")
    .order("kind")
    .order("name");
  if (error) throw new Error(`finance_accounts: ${error.message}`);
  if (!accounts.length) return { accounts: [], transactions: [], month: null, isSample: false };

  const names = new Map(accounts.map((a) => [a.id, a.name as string]));
  const { data: txns, error: e2 } = await db()
    .from("transactions")
    .select("id,booked_at,amount,counterparty,description,category,account_id")
    .order("booked_at", { ascending: false })
    .limit(60);
  if (e2) throw new Error(`transactions: ${e2.message}`);

  // The month of the newest transaction, so an import from last month still shows something.
  const latest = txns[0]?.booked_at as string | undefined;
  let month: MonthSummary | null = null;
  if (latest) {
    const m = latest.slice(0, 7);
    const [y, mo] = m.split("-").map(Number);
    const next = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
    const { data: monthTxns } = await db()
      .from("transactions")
      .select("amount,category")
      .gte("booked_at", `${m}-01`)
      .lt("booked_at", next);
    month = summarize(m, (monthTxns ?? []).map((t) => ({ amount: Number(t.amount), category: t.category ?? "Other" })));
  }

  return {
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      balance: a.balance === null ? null : Number(a.balance),
      balanceAsOf: a.balance_as_of,
    })),
    transactions: txns.map((t) => ({
      id: t.id,
      bookedAt: t.booked_at,
      amount: Number(t.amount),
      counterparty: t.counterparty ?? "Unknown",
      description: t.description,
      category: t.category ?? "Other",
      account: names.get(t.account_id) ?? "",
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
  const t = (n: number, amount: number, counterparty: string, category: string, account = "ING current ··4567") => ({
    id: `t${n}${counterparty}`,
    bookedAt: day(n),
    amount,
    counterparty,
    description: null,
    category,
    account,
  });
  const transactions = [
    t(0, -23.45, "Albert Heijn 1234", "Groceries"),
    t(1, -13.99, "Netflix International B.V.", "Subscriptions"),
    t(1, -4.2, "NS Groep IZ NS Reizigers", "Transport"),
    t(2, -500, "Oranje Spaarrekening", "Transfers"),
    t(2, 500, "Van ING current", "Transfers", "Oranje spaarrekening"),
    t(3, 3100, "Werkgever BV", "Income"),
    t(4, -1150, "Woonstichting", "Housing"),
    t(5, -38.6, "Thuisbezorgd.nl", "Eating out"),
    t(6, -89.95, "Coolblue", "Shopping"),
  ];
  return {
    accounts: [
      { id: "a1", name: "ING current ··4567", kind: "current", balance: 1976.55, balanceAsOf: day(0) },
      { id: "a2", name: "Oranje spaarrekening", kind: "savings", balance: 10500, balanceAsOf: day(2) },
    ],
    transactions,
    month: summarize(today.slice(0, 7), transactions),
    isSample: true,
  };
}
