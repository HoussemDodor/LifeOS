/**
 * Match Tikkie paybacks to the payment they reimburse, so only Houssem's own
 * share of a shared cost counts as spending. Pure function, no imports:
 * unit-tested directly with Node.
 */

export interface MatchTxn {
  id: string;
  bookedAt: string; // YYYY-MM-DD
  amount: number; // negative = money out
  counterparty: string;
  description: string | null;
  category: string;
  offsetsId: string | null;
  /** "manual" with offsetsId null means: Houssem said "no match", leave it alone. */
  offsetsSource: "auto" | "manual" | null;
}

/** Look this many days back from a payback for the original payment. */
export const WINDOW_DAYS = 21;
const NEVER_SHARED = new Set(["Transfers", "Investing", "Cash", "Paybacks", "Income", "Housing", "Insurance", "Utilities"]);
const SHARED_LIKELY = new Set(["Eating out", "Groceries", "Shopping", "Transport", "Other", "Subscriptions"]);
const STOP = new Set([
  "tikkie", "omschrijving", "iban", "kenmerk", "naam", "betaalverzoek", "via", "van", "het", "een", "voor", "and", "the",
  "from", "with", "this", "your", "abn", "amro", "eur", "pasvolgnr", "transactie", "term", "apple", "pay",
]);

const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-zà-ÿ]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  );

export function isPayback(t: MatchTxn): boolean {
  return t.amount > 0 && t.category === "Paybacks";
}

/** The Tikkie request text without the payer's name, so paybacks for one request share a key. */
const requestKey = (t: MatchTxn) => (t.description ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Total is a whole multiple of the payback (€ 80 = 4 × € 20): typical for splitting evenly. */
const evenSplit = (total: number, part: number) => {
  const n = total / part;
  return n >= 1.9 && Math.abs(n - Math.round(n)) < 0.02;
};

/** Candidate originals for one payback, best first. Also used for the "link to…" picker. */
export function candidatesFor(
  payback: MatchTxn,
  all: MatchTxn[],
  offsetSum: Map<string, number>,
  sameRequest?: string,
) {
  const pbWords = words(`${payback.counterparty} ${payback.description ?? ""}`);
  return all
    .filter((o) => {
      if (o.amount >= 0 || NEVER_SHARED.has(o.category)) return false;
      const d = days(o.bookedAt, payback.bookedAt);
      if (d < 0 || d > WINDOW_DAYS) return false;
      // Friends can't pay back more than you paid (your own share stays above zero).
      const left = -o.amount - (offsetSum.get(o.id) ?? 0);
      return payback.amount < left + 0.005;
    })
    .map((o) => {
      const d = days(o.bookedAt, payback.bookedAt);
      const oWords = words(`${o.counterparty} ${o.description ?? ""}`);
      const overlap = [...pbWords].some((w) => oWords.has(w));
      const sibling = sameRequest === o.id;
      const score =
        (overlap ? 3 : 0) +
        (sibling ? 3 : 0) +
        (evenSplit(-o.amount, payback.amount) ? 1.5 : 0) +
        (SHARED_LIKELY.has(o.category) ? 1 : 0) -
        d / 7;
      return { txn: o, score, overlap: overlap || sibling, daysBefore: d };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * New automatic links: paybackId → originalId. Only confident matches: a shared
 * word between the Tikkie text and the payment, or a likely-shared payment at
 * most 3 days earlier. Anything else stays unmatched (still not counted as income).
 */
export function matchPaybacks(all: MatchTxn[]): Map<string, string> {
  const offsetSum = new Map<string, number>();
  for (const t of all) {
    if (t.offsetsId) offsetSum.set(t.offsetsId, (offsetSum.get(t.offsetsId) ?? 0) + t.amount);
  }
  const links = new Map<string, string>();
  const open = all
    .filter((t) => isPayback(t) && !t.offsetsId && t.offsetsSource === null)
    .sort((a, b) => a.bookedAt.localeCompare(b.bookedAt));

  // Paybacks for the same Tikkie request belong to the same payment.
  const byRequest = new Map<string, string>();
  for (const t of all) if (t.offsetsId && isPayback(t)) byRequest.set(requestKey(t), t.offsetsId);

  for (const pb of open) {
    const key = requestKey(pb);
    const best = candidatesFor(pb, all, offsetSum, key ? byRequest.get(key) : undefined)[0];
    if (!best) continue;
    // A Tikkie is always for a recent shared cost; a plain bank transfer from a person might be
    // anything, so that only links on a shared word between the two descriptions.
    const isRequest = /tikkie|betaalverzoek|payment request|wiebetaaltwat/i.test(`${pb.counterparty} ${pb.description ?? ""}`);
    const confident = best.overlap || (isRequest && best.daysBefore <= 3 && SHARED_LIKELY.has(best.txn.category));
    if (!confident) continue;
    links.set(pb.id, best.txn.id);
    if (key) byRequest.set(key, best.txn.id);
    offsetSum.set(best.txn.id, (offsetSum.get(best.txn.id) ?? 0) + pb.amount);
  }
  return links;
}
