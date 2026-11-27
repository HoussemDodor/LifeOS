"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { isSignedIn } from "@/lib/require-session";
import { db, hasDatabase } from "@/lib/supabase";
import { categorize, IngFormatError, parseIngCsv, type IngRow } from "./ing-csv";

export interface ImportResult {
  ok: boolean;
  message: string;
}

const MAX_FILE = 5 * 1024 * 1024;
const MAX_FILES = 12;

/** ING exports are usually UTF-8; older ones are Windows-1252. */
async function readText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
}

const last4 = (account: string) => account.replace(/\D/g, "").slice(-4);
const plural = (n: number, word: string) => `${n.toLocaleString("en-GB")} ${word}${n === 1 ? "" : "s"}`;

export async function importIngCsv(_prev: ImportResult | null, form: FormData): Promise<ImportResult> {
  if (!(await isSignedIn())) return { ok: false, message: "Sign in again to import." };

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false, message: "Choose one or more ING CSV files first." };
  if (files.length > MAX_FILES) return { ok: false, message: `Import up to ${MAX_FILES} files at a time.` };
  if (files.some((f) => f.size > MAX_FILE)) return { ok: false, message: "Each file can be at most 5 MB." };

  // Parse everything first, so one bad file stops the import before anything is saved.
  const parsed: { rows: IngRow[]; kind: "current" | "savings" }[] = [];
  let skipped = 0;
  for (const f of files) {
    try {
      const r = parseIngCsv(await readText(f));
      parsed.push(r);
      skipped += r.skipped;
    } catch (err) {
      const why = err instanceof IngFormatError ? err.message : "It couldn’t be read.";
      return { ok: false, message: `${f.name}: ${why}` };
    }
  }
  const rowCount = parsed.reduce((n, p) => n + p.rows.length, 0);
  if (!rowCount) return { ok: false, message: "No transactions found in the file." };

  if (!hasDatabase()) {
    return { ok: true, message: `Read ${plural(rowCount, "transaction")}. Sample mode: nothing was saved.` };
  }

  // 1. Accounts (one per IBAN / savings number).
  const kinds = new Map<string, { kind: "current" | "savings"; name?: string }>();
  for (const p of parsed) for (const r of p.rows) kinds.set(r.account, { kind: p.kind, name: r.accountName });

  const { data: existing, error: accErr } = await db()
    .from("finance_accounts")
    .select("id,external_id,balance_as_of")
    .eq("provider", "ing");
  if (accErr) return fail("accounts", accErr.message);

  const ids = new Map((existing ?? []).map((a) => [a.external_id as string, a]));
  const toCreate = [...kinds].filter(([acc]) => !ids.has(acc));
  if (toCreate.length) {
    const { data: created, error } = await db()
      .from("finance_accounts")
      .insert(
        toCreate.map(([acc, k]) => ({
          provider: "ing",
          external_id: acc,
          kind: k.kind,
          name: k.name || `ING ${k.kind === "savings" ? "savings" : "current"} ··${last4(acc)}`,
        })),
      )
      .select("id,external_id,balance_as_of");
    if (error) return fail("create accounts", error.message);
    for (const a of created ?? []) ids.set(a.external_id, a);
  }

  // 2. Transactions, skipping ones already imported.
  const own = new Set(ids.keys());
  const rows = parsed.flatMap((p) => p.rows);
  const records = rows.map((r) => ({
    account_id: ids.get(r.account)!.id,
    booked_at: r.bookedAt,
    amount: r.amount,
    currency: r.currency,
    counterparty: r.name || null,
    description: r.notes ?? null,
    category: categorize(r, own),
    external_id: createHash("sha256").update(r.key).digest("hex"),
  }));

  let added = 0;
  for (let i = 0; i < records.length; i += 500) {
    const { data, error } = await db()
      .from("transactions")
      .upsert(records.slice(i, i + 500), { onConflict: "account_id,external_id", ignoreDuplicates: true })
      .select("id");
    if (error) return fail("save transactions", error.message);
    added += data?.length ?? 0;
  }

  // 3. Latest balance per account: the first row of the newest day (ING lists newest first).
  for (const [acc, a] of ids) {
    const withBalance = rows.filter((r) => r.account === acc && r.balanceAfter !== undefined);
    if (!withBalance.length) continue;
    const newestDay = withBalance.reduce((d, r) => (r.bookedAt > d ? r.bookedAt : d), "");
    if (a.balance_as_of && a.balance_as_of > newestDay) continue;
    const newest = withBalance.find((r) => r.bookedAt === newestDay)!;
    await db().from("finance_accounts").update({ balance: newest.balanceAfter, balance_as_of: newestDay }).eq("id", a.id);
  }

  revalidatePath("/finance");
  const already = records.length - added;
  return {
    ok: true,
    message:
      `Added ${plural(added, "transaction")} across ${plural(kinds.size, "account")}.` +
      (already ? ` ${plural(already, "transaction")} were already here.` : "") +
      (skipped ? ` ${plural(skipped, "row")} couldn’t be read and were skipped.` : ""),
  };
}

function fail(step: string, detail: string): ImportResult {
  console.error(`importIngCsv ${step}:`, detail);
  return { ok: false, message: "Saving failed. Import the file again: transactions already saved are skipped." };
}
