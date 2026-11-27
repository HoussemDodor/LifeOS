import "server-only";
import { createHmac } from "node:crypto";
import { db } from "@/lib/supabase";

/**
 * Bitvavo, read-only. Needs BITVAVO_API_KEY and BITVAVO_API_SECRET for a key
 * with only the "View" permission (no trading, no withdrawals). LifeOS only
 * ever calls GET /balance (signed) and the public price ticker.
 */
const API = "https://api.bitvavo.com/v2";

export const hasBitvavo = () => Boolean(process.env.BITVAVO_API_KEY && process.env.BITVAVO_API_SECRET);

async function signedGet<T>(path: string): Promise<T> {
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", process.env.BITVAVO_API_SECRET!)
    .update(`${timestamp}GET/v2${path}`)
    .digest("hex");
  const res = await fetch(`${API}${path}`, {
    headers: {
      "Bitvavo-Access-Key": process.env.BITVAVO_API_KEY!,
      "Bitvavo-Access-Signature": signature,
      "Bitvavo-Access-Timestamp": timestamp,
      "Bitvavo-Access-Window": "10000",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Bitvavo ${path} returned ${res.status}`);
  return res.json() as Promise<T>;
}

interface Balance {
  symbol: string;
  available: string;
  inOrder: string;
}

/** Read balances and EUR prices, and replace the Bitvavo holdings. Returns the total in EUR. */
export async function syncBitvavo(): Promise<number> {
  const balances = await signedGet<Balance[]>("/balance");
  const priceRes = await fetch(`${API}/ticker/price`, { cache: "no-store" });
  if (!priceRes.ok) throw new Error(`Bitvavo prices returned ${priceRes.status}`);
  const prices = new Map(
    ((await priceRes.json()) as { market: string; price: string }[]).map((p) => [p.market, Number(p.price)]),
  );

  const now = new Date().toISOString();
  const holdings = balances
    .map((b) => {
      const quantity = Number(b.available) + Number(b.inOrder);
      const price = b.symbol === "EUR" ? 1 : (prices.get(`${b.symbol}-EUR`) ?? null);
      return {
        symbol: b.symbol === "EUR" ? "CASH" : b.symbol,
        name: b.symbol === "EUR" ? "Cash" : b.symbol,
        quantity,
        price,
        value_eur: price === null ? null : Math.round(quantity * price * 100) / 100,
        as_of: now,
      };
    })
    // Skip dust below one cent.
    .filter((h) => h.quantity > 0 && (h.value_eur ?? 0) >= 0.01);

  const accountId = await ensureAccount("bitvavo", "Bitvavo", "crypto");
  await db().from("holdings").delete().eq("account_id", accountId);
  if (holdings.length) {
    const { error } = await db().from("holdings").insert(holdings.map((h) => ({ ...h, account_id: accountId })));
    if (error) throw new Error(`Bitvavo holdings: ${error.message}`);
  }
  const total = holdings.reduce((s, h) => s + (h.value_eur ?? 0), 0);
  await db()
    .from("finance_accounts")
    .update({ balance: Math.round(total * 100) / 100, balance_as_of: now.slice(0, 10), synced_at: now })
    .eq("id", accountId);
  return total;
}

/** The single account row for a provider (DEGIRO, Bitvavo), created on first use. */
export async function ensureAccount(provider: "degiro" | "bitvavo", name: string, kind: "brokerage" | "crypto") {
  const { data } = await db().from("finance_accounts").select("id").eq("provider", provider).eq("external_id", provider).maybeSingle();
  if (data) return data.id as string;
  const { data: created, error } = await db()
    .from("finance_accounts")
    .insert({ provider, external_id: provider, name, kind })
    .select("id")
    .single();
  if (error) throw new Error(`create ${provider} account: ${error.message}`);
  return created.id as string;
}
