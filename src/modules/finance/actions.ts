"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { isSignedIn } from "@/lib/require-session";
import { db, hasDatabase } from "@/lib/supabase";
import { ensureAccount, hasBitvavo, syncBitvavo } from "./bitvavo";
import { degiroKind, DegiroFormatError, parsePortfolio, parseTrades, type DegiroHolding, type DegiroTrade } from "./degiro-csv";
import { CATEGORIES, categorize, IngFormatError, parseIngCsv, type IngRow } from "./ing-csv";
import { addDaysYmd, loadMatchTxns, runPaybackMatching } from "./matching";
import { candidatesFor } from "./tikkie";

export interface ImportResult {
  ok: boolean;
  message: string;
}

const MAX_FILE = 5 * 1024 * 1024;
const MAX_FILES = 12;
const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);

/** Exports are usually UTF-8; older ING ones are Windows-1252. */
async function readText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  return utf8.includes(REPLACEMENT_CHAR) ? new TextDecoder("windows-1252").decode(bytes) : utf8;
}

const last4 = (account: string) => account.replace(/\D/g, "").slice(-4);
const plural = (n: number, word: string) => `${n.toLocaleString("nl-NL")} ${word}${n === 1 ? "" : "s"}`;
const eurText = (n: number, digits = 0) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

type IngFile = { rows: IngRow[]; kind: "current" | "savings" };

/**
 * The monthly upload: any mix of ING exports and DEGIRO Portfolio / Transactions
 * exports. Each file is recognised by its columns. Everything is parsed first,
 * so one bad file stops the import before anything is saved.
 */
export async function importExports(_prev: ImportResult | null, form: FormData): Promise<ImportResult> {
  if (!(await isSignedIn())) return { ok: false, message: "Sign in again to import." };

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false, message: "Choose your export files first." };
  if (files.length > MAX_FILES) return { ok: false, message: `Import up to ${MAX_FILES} files at a time.` };
  if (files.some((f) => f.size > MAX_FILE)) return { ok: false, message: "Each file can be at most 5 MB." };

  const ing: IngFile[] = [];
  let portfolio: DegiroHolding[] | null = null;
  const trades: DegiroTrade[] = [];
  let skipped = 0;
  for (const f of files) {
    try {
      const text = await readText(f);
      const kind = degiroKind(text);
      if (kind === "portfolio") portfolio = parsePortfolio(text);
      else if (kind === "trades") trades.push(...parseTrades(text));
      else {
        const r = parseIngCsv(text);
        ing.push(r);
        skipped += r.skipped;
      }
    } catch (err) {
      const known = err instanceof IngFormatError || err instanceof DegiroFormatError;
      const why = known ? (err as Error).message.replace("an ING export", "an ING or DEGIRO export") : "It couldn’t be read.";
      return { ok: false, message: `${f.name}: ${why}` };
    }
  }
  const ingCount = ing.reduce((n, p) => n + p.rows.length, 0);
  if (!ingCount && !portfolio && !trades.length) {
    return { ok: false, message: "No transactions or holdings found in these files." };
  }

  if (!hasDatabase()) {
    const parts = [
      ingCount ? plural(ingCount, "ING transaction") : null,
      portfolio ? plural(portfolio.length, "DEGIRO position") : null,
      trades.length ? plural(trades.length, "DEGIRO trade") : null,
    ].filter(Boolean);
    return { ok: true, message: `Read ${parts.join(", ")}. Sample mode: nothing was saved.` };
  }

  const messages: string[] = [];
  try {
    if (ingCount) messages.push(await saveIng(ing, skipped));
    if (portfolio || trades.length) messages.push(await saveDegiro(portfolio, trades));
  } catch (err) {
    console.error("importExports:", err);
    return { ok: false, message: "Saving failed. Import the files again: anything already saved is skipped." };
  }
  revalidatePath("/finance");
  return { ok: true, message: messages.join(" ") };
}

async function saveIng(parsed: IngFile[], skipped: number): Promise<string> {
  // 1. Accounts (one per IBAN / savings number).
  const kinds = new Map<string, { kind: "current" | "savings"; name?: string }>();
  for (const p of parsed) for (const r of p.rows) kinds.set(r.account, { kind: p.kind, name: r.accountName });

  const { data: existing, error: accErr } = await db()
    .from("finance_accounts")
    .select("id,external_id,balance_as_of")
    .eq("provider", "ing");
  if (accErr) throw new Error(`accounts: ${accErr.message}`);

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
    if (error) throw new Error(`create accounts: ${error.message}`);
    for (const a of created ?? []) ids.set(a.external_id, a);
  }

  // 2. Transactions, skipping ones already imported. Your own shop rules win over the built-in ones.
  const own = new Set(ids.keys());
  const { data: ruleRows } = await db().from("category_rules").select("counterparty,category");
  const rules = new Map((ruleRows ?? []).map((r) => [r.counterparty as string, r.category as string]));
  const rows = parsed.flatMap((p) => p.rows);
  const records = rows.map((r) => ({
    account_id: ids.get(r.account)!.id,
    booked_at: r.bookedAt,
    amount: r.amount,
    currency: r.currency,
    counterparty: r.name || null,
    description: r.notes ?? null,
    category: rules.get(r.name.toLowerCase()) ?? categorize(r, own),
    external_id: createHash("sha256").update(r.key).digest("hex"),
  }));

  let added = 0;
  for (let i = 0; i < records.length; i += 500) {
    const { data, error } = await db()
      .from("transactions")
      .upsert(records.slice(i, i + 500), { onConflict: "account_id,external_id", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`save transactions: ${error.message}`);
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
  const touched = [...kinds.keys()].map((acc) => ids.get(acc)!.id);
  await db().from("finance_accounts").update({ synced_at: new Date().toISOString() }).in("id", touched);

  // 4. Link Tikkie paybacks to the payments they reimburse.
  const earliest = rows.reduce((d, r) => (r.bookedAt < d ? r.bookedAt : d), rows[0].bookedAt);
  const linked = await runPaybackMatching(earliest);

  const already = records.length - added;
  return (
    `ING: added ${plural(added, "transaction")} across ${plural(kinds.size, "account")}.` +
    (already ? ` ${plural(already, "transaction")} were already here.` : "") +
    (linked ? ` Matched ${plural(linked, "Tikkie payback")} to what they paid for.` : "") +
    (skipped ? ` ${plural(skipped, "row")} couldn’t be read and were skipped.` : "")
  );
}

/** DEGIRO: the Portfolio export replaces current holdings; trades are added without duplicates. */
async function saveDegiro(portfolio: DegiroHolding[] | null, trades: DegiroTrade[]): Promise<string> {
  const accountId = await ensureAccount("degiro", "DEGIRO", "brokerage");
  const now = new Date().toISOString();
  const parts: string[] = [];

  if (portfolio) {
    await db().from("holdings").delete().eq("account_id", accountId);
    if (portfolio.length) {
      const { error } = await db()
        .from("holdings")
        .insert(
          portfolio.map((h) => ({
            account_id: accountId,
            symbol: h.symbol,
            name: h.name,
            quantity: h.quantity,
            price: h.price,
            value_eur: h.valueEur,
            as_of: now,
          })),
        );
      if (error) throw new Error(`degiro holdings: ${error.message}`);
    }
    const total = portfolio.reduce((s, h) => s + h.valueEur, 0);
    await db()
      .from("finance_accounts")
      .update({ balance: Math.round(total * 100) / 100, balance_as_of: now.slice(0, 10) })
      .eq("id", accountId);
    parts.push(`${plural(portfolio.length, "position")} worth ${eurText(total)}`);
  }

  if (trades.length) {
    let added = 0;
    for (let i = 0; i < trades.length; i += 500) {
      const { data, error } = await db()
        .from("portfolio_trades")
        .upsert(
          trades.slice(i, i + 500).map((t) => ({
            account_id: accountId,
            traded_at: t.tradedAt,
            isin: t.isin,
            product: t.product,
            quantity: t.quantity,
            price: t.price,
            currency: t.currency,
            total_eur: t.totalEur,
            fees_eur: t.feesEur,
            external_id: t.externalId,
          })),
          { onConflict: "account_id,external_id", ignoreDuplicates: true },
        )
        .select("id");
      if (error) throw new Error(`degiro trades: ${error.message}`);
      added += data?.length ?? 0;
    }
    const dupes = trades.length - added;
    parts.push(`${plural(added, "new trade")}${dupes ? ` (${dupes} already here)` : ""}`);
  }

  await db().from("finance_accounts").update({ synced_at: now }).eq("id", accountId);
  return `DEGIRO: ${parts.join(", ")}.`;
}

/** Fetch Bitvavo balances now (read-only key). */
export async function refreshBitvavo(): Promise<ImportResult> {
  if (!(await isSignedIn())) return { ok: false, message: "Sign in again." };
  if (!hasDatabase() || !hasBitvavo()) {
    return { ok: false, message: "Bitvavo isn’t connected yet: add the read-only API key first." };
  }
  try {
    const total = await syncBitvavo();
    revalidatePath("/finance");
    return { ok: true, message: `Bitvavo updated: ${eurText(total)}.` };
  } catch (err) {
    console.error("refreshBitvavo:", err);
    return { ok: false, message: "Bitvavo didn’t answer. Check that the key still exists and has only View permission." };
  }
}

/* ---------- Fixing categories and Tikkie links by hand -------------------- */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result = { ok: true } | { ok: false; error: string };

/**
 * Set one transaction's category. With `always`, remember it for this shop:
 * future imports use it, and earlier transactions from the same shop follow
 * (except ones you fixed by hand).
 */
export async function setCategory(txnId: string, category: string, always: boolean): Promise<Result> {
  if (!(await isSignedIn())) return { ok: false, error: "Sign in again." };
  if (!hasDatabase()) return { ok: true };
  if (!UUID.test(txnId) || !(CATEGORIES as readonly string[]).includes(category) || typeof always !== "boolean") {
    return { ok: false, error: "That change isn’t possible." };
  }
  const { data: txn, error } = await db()
    .from("transactions")
    .update({ category, category_source: "manual" })
    .eq("id", txnId)
    .select("counterparty")
    .single();
  if (error) return { ok: false, error: "Couldn’t save. Try again." };

  const shop = (txn.counterparty ?? "").trim();
  if (always && shop) {
    await db().from("category_rules").upsert({ counterparty: shop.toLowerCase(), category });
    // ilike without wildcards = case-insensitive exact match; escape any % _ \ in the shop name.
    const pattern = shop.replace(/[\\%_]/g, (c: string) => "\\" + c);
    await db().from("transactions").update({ category }).ilike("counterparty", pattern).neq("category_source", "manual");
  }
  revalidatePath("/finance");
  return { ok: true };
}

/** Link a payback to a payment (originalId), or mark it as "not a match" (null). */
export async function linkPayback(paybackId: string, originalId: string | null): Promise<Result> {
  if (!(await isSignedIn())) return { ok: false, error: "Sign in again." };
  if (!hasDatabase()) return { ok: true };
  if (!UUID.test(paybackId) || (originalId !== null && !UUID.test(originalId))) {
    return { ok: false, error: "That change isn’t possible." };
  }
  if (originalId) {
    const { data: pair } = await db().from("transactions").select("id,amount").in("id", [paybackId, originalId]);
    const pb = pair?.find((t) => t.id === paybackId);
    const orig = pair?.find((t) => t.id === originalId);
    if (!pb || !orig || Number(pb.amount) <= 0 || Number(orig.amount) >= 0) {
      return { ok: false, error: "A payback can only be linked to a payment." };
    }
  }
  const { error } = await db()
    .from("transactions")
    .update({ offsets_id: originalId, offsets_source: "manual" })
    .eq("id", paybackId)
    .gt("amount", 0);
  if (error) return { ok: false, error: "Couldn’t save. Try again." };
  revalidatePath("/finance");
  return { ok: true };
}

/** Payments a payback could belong to, best first (for the "link to…" picker). */
export async function paybackCandidates(paybackId: string): Promise<{ id: string; label: string }[]> {
  if (!(await isSignedIn()) || !hasDatabase() || !UUID.test(paybackId)) return [];
  const { data: pb } = await db().from("transactions").select("booked_at").eq("id", paybackId).single();
  if (!pb) return [];
  const all = await loadMatchTxns(addDaysYmd(pb.booked_at, -30), addDaysYmd(pb.booked_at, 1));
  const payback = all.find((t) => t.id === paybackId);
  if (!payback) return [];
  const offsetSum = new Map<string, number>();
  for (const t of all) {
    if (t.offsetsId && t.id !== paybackId) offsetSum.set(t.offsetsId, (offsetSum.get(t.offsetsId) ?? 0) + t.amount);
  }
  return candidatesFor(payback, all, offsetSum)
    .slice(0, 6)
    .map((c) => ({ id: c.txn.id, label: `${c.txn.counterparty} · ${c.txn.bookedAt} · ${eurText(-c.txn.amount, 2)}` }));
}

/**
 * Re-run the category rules (yours first, then the built-in ones) on every
 * transaction that a rule categorised. Your manual fixes and the coach's fixes
 * stay. Transfers and paybacks stay too: they were detected from account
 * numbers and texts that only the import sees.
 */
export async function reapplyRules(): Promise<ImportResult> {
  if (!(await isSignedIn())) return { ok: false, message: "Sign in again." };
  if (!hasDatabase()) return { ok: true, message: "Sample mode: nothing to update." };

  const { data: ruleRows } = await db().from("category_rules").select("counterparty,category");
  const rules = new Map((ruleRows ?? []).map((r) => [r.counterparty as string, r.category as string]));
  const moves = new Map<string, string[]>();
  for (let page = 0; ; page++) {
    const { data, error } = await db()
      .from("transactions")
      .select("id,amount,counterparty,description,category")
      .eq("category_source", "rule")
      .order("id")
      .range(page * 1000, page * 1000 + 999);
    if (error) return { ok: false, message: "Couldn’t read your transactions. Try again." };
    for (const t of data) {
      if (t.category === "Transfers" || t.category === "Paybacks") continue;
      const name = t.counterparty ?? "";
      const next =
        rules.get(name.toLowerCase()) ??
        categorize({ name, notes: t.description ?? undefined, amount: Number(t.amount), type: undefined, counterIban: undefined }, new Set());
      if (next !== t.category) moves.set(next, [...(moves.get(next) ?? []), t.id]);
    }
    if (data.length < 1000) break;
  }
  let changed = 0;
  for (const [category, ids] of moves) {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await db().from("transactions").update({ category }).in("id", ids.slice(i, i + 200)).eq("category_source", "rule");
      if (!error) changed += Math.min(200, ids.length - i);
    }
  }
  // Newly recognised paybacks may belong to a payment.
  const linked = await runPaybackMatching("2000-01-01");
  revalidatePath("/finance");
  const parts = [
    changed ? `Updated the category of ${plural(changed, "transaction")}.` : "Categories were already up to date.",
    linked ? `Matched ${plural(linked, "payback")} to what they paid for.` : "",
  ];
  return { ok: true, message: parts.filter(Boolean).join(" ") };
}
