# Finance: monthly check-in, spending coach and portfolio analyst

Agreed with Houssem on 2026-11-27 (interview round "grill me"). This is the
definition of done for requirements F2–F3 and F6–F9.

## The monthly routine

1. Houssem uploads ING CSV exports (current + savings) and the DEGIRO exports
   (Portfolio and Transactions CSV). Bitvavo syncs on its own through a
   read-only API key.
2. The Finance screen shows what's fresh ("ING up to 30 Nov · DEGIRO 1 Dec ·
   Bitvavo live") and a **Run monthly check-in** button. Nothing runs
   automatically: the button only makes sense on complete data.
3. One press runs **two agents**, each producing its own saved report with its
   own chat: the **spending coach** and the **portfolio analyst**.
4. Reports are kept per month, so later check-ins compare against earlier ones.

First check-in: 12 months of ING history, so yearly costs and seasons show up.

## Agent 1: spending coach

- **Voice:** Gen Z but blunt and specific. Real numbers and real shops, no
  sugar-coating. ("You hit Thuisbezorgd 14 times for € 212. Halve that and
  that's € 1.270 a year back.")
- **Goal:** none yet. The first check-in proposes a realistic savings target
  from the history; Houssem confirms or adjusts it. Later check-ins measure
  against it.
- **Each report:** where the money went (top categories and shops, month over
  month), what grew, subscriptions and recurring costs, concrete savings ideas
  with a euro amount per year, and the target: hit or missed.
- **Accountability:** each report ends with 1–3 actions Houssem accepts. The
  next check-in scores them ("14 → 11 orders: missed").
- **Tikkie:** paybacks are matched automatically to the original payment
  (amount, date, description), so only Houssem's share counts as spending.
  Matches can be corrected.
- **Categories:** the agent recategorises "Other" and unclear items during the
  check-in and shows what it changed (undo possible). Houssem can also fix any
  transaction by hand; a fix becomes a rule for that shop.
- **Chat:** answers questions over the transaction data and remembers past
  conversations. Read-only: it doesn't change goals or data from chat.
- **Data:** transactions go to the Anthropic API as-is (shop names, amounts,
  descriptions). IBANs and account numbers are stripped.
- Not linked to the analyst: the coach doesn't decide the investment amount.

## Agent 2: portfolio analyst

Houssem's profile: long term (10+ years), buys more in a dip. Holds index ETFs
and individual stocks on DEGIRO, and crypto on Bitvavo. No pension or other
pots in scope.

**Core–satellite policy**

| Part | Share | What's in it | Analyst's role |
|---|---|---|---|
| Core | 75% | Broad, boring index funds. Composition: the analyst proposes one in the first check-in from current holdings; Houssem approves | Mix vs target, costs (TER, DEGIRO fees), overlap between ETFs, currency exposure. No stock opinions |
| Satellite | 25% | Individual stocks + crypto | **Full opinions**: per position a critical thesis check (earnings, valuation, news, position size), hold/add/trim views |
| Crypto cap | max **5% of total** | Bitvavo, inside the satellite | Flag when above 5% |

- **Drift:** let winners run. Only report drift, *except* when the satellite
  goes **above 50%** of the portfolio: then recommend trimming back toward 25%.
- **Market data:** web search during each check-in for recent results and news
  on every holding; every claim gets a source link and a date. Prices and fund
  facts are dated on the report.
- **Benchmark:** performance vs a global all-world index fund.
- **Chat:** its own chat with memory ("why is my ASML thesis weakening?").
- **Guardrails:** LifeOS never places trades. Every trade is done by Houssem in
  DEGIRO or Bitvavo. Each report states it is analysis against Houssem's own
  rules, not licensed financial advice. The Bitvavo key has the View
  permission only (no trading, no withdrawals).

## What Houssem sets up

- An **Anthropic API key** with a monthly spend cap (console.anthropic.com),
  added through `scripts/push-secrets.mjs`. Paid per use, separate from the
  Claude subscription.
- A **Bitvavo API key** with View permission only, also through push-secrets.
- Never paste either key into chat.

## Build order (each step deploys on its own)

1. **Data foundation:** fix categories by hand (+ shop rules), Tikkie
   matching, DEGIRO CSV import (holdings + transactions), Bitvavo read-only
   sync, data freshness overview.
2. **Check-in + spending coach:** Run button, coach agent with read tools over
   the data, saved monthly reports, target proposal, promises and scoring.
3. **Coach chat** with memory.
4. **Portfolio analyst:** policy screen (core proposal, 75/25, crypto 5%, trim
   above 50%), web-search analysis, report.
5. **Analyst chat** with memory.
