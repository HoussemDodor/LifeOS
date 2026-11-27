import "server-only";
import { db } from "@/lib/supabase";
import { matchPaybacks, WINDOW_DAYS, type MatchTxn } from "./tikkie";

export function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Transactions between two dates (inclusive), in the shape the matcher needs. */
export async function loadMatchTxns(from: string, to?: string): Promise<MatchTxn[]> {
  const out: MatchTxn[] = [];
  // Page through in 1000s (the API's row limit).
  for (let page = 0; ; page++) {
    let q = db()
      .from("transactions")
      .select("id,booked_at,amount,counterparty,description,category,offsets_id,offsets_source")
      .gte("booked_at", from)
      .order("booked_at")
      .order("id")
      .range(page * 1000, page * 1000 + 999);
    if (to) q = q.lte("booked_at", to);
    const { data, error } = await q;
    if (error) throw new Error(`loadMatchTxns: ${error.message}`);
    out.push(
      ...data.map((t) => ({
        id: t.id,
        bookedAt: t.booked_at,
        amount: Number(t.amount),
        counterparty: t.counterparty ?? "",
        description: t.description,
        category: t.category ?? "Other",
        offsetsId: t.offsets_id,
        offsetsSource: t.offsets_source,
      })),
    );
    if (data.length < 1000) return out;
  }
}

/** Find and save automatic Tikkie links for paybacks booked on or after `from`. Returns how many were linked. */
export async function runPaybackMatching(from: string): Promise<number> {
  const all = await loadMatchTxns(addDaysYmd(from, -WINDOW_DAYS));
  const links = matchPaybacks(all);
  for (const [paybackId, originalId] of links) {
    await db().from("transactions").update({ offsets_id: originalId, offsets_source: "auto" }).eq("id", paybackId);
  }
  return links.size;
}
