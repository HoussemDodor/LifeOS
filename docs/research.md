# LifeOS: research and recommendations

*Research done 2026-11-26. This is the base for the interview and the architecture decision.*

## 1. Existing systems: what others built

| Project | Stack | What it covers | What to take from it |
|---|---|---|---|
| [Edi Life OS](https://noted.lol/lifeos/) | PHP + MySQL, self-hosted | 10 workspaces (finance, calendar, habits…) plus a **26-tool MCP server** so an AI can read and write your life data | Give the dashboard its **own MCP server** so Claude can query it later |
| [ControlHub](https://github.com/dszurek/controlhub) | Next.js 16, runs on a Raspberry Pi | Unified Outlook + Gmail inbox, calendar via CalDAV | Same stack that fits here; a unified inbox is doable |
| [LifeForge](https://github.com/melvinchia3636/lifeforge) | Modular, self-hosted | Many "life modules" | **Module/plugin architecture**: every area is a separate module |
| [Oikos](https://ulsklyc.github.io/oikos/) | Self-hosted, MIT | Tasks, calendar, budget | Shows budget and calendar side by side |
| Firefly III / Actual Budget | Self-hosted finance | Budgets, transactions, CSV/bank import | A strong option for the finance engine instead of building one |
| Ghostfolio | Self-hosted, open source | Investment portfolio (stocks, ETFs, crypto), performance, allocation | Strong option for **portfolio** tracking (DEGIRO etc. via CSV import) |

**Conclusion:** no single product does email + agenda + finance well. Every serious setup is a **shell app (a dashboard) with modules** that pulls data from specialised sources. That is the approach to take.

## 2. Connectors (MCP): status for your account

| Need | Connector | Status |
|---|---|---|
| Email + agenda (Outlook) | **Microsoft 365** | ✅ Already connected (mail, calendar, Teams, SharePoint) |
| To-do list | **Notion** (`mcp.notion.com`) | ❌ Not connected yet: connect it via Claude → Settings → Connectors |
| Alternative to-do list | Todoist | Available, not connected |
| Scheduling | `scheduled-tasks` (local) and `/schedule` (cloud routines) | ✅ Available |
| Gmail / Google Calendar | Google connectors | Only needed if you also use Google |

**Finance has no good official connector for Dutch banks.** Options:
- **Enable Banking** or **Tink**: PSD2 open banking APIs that cover ING, ABN AMRO, Rabobank and bunq. Community MCP servers exist, for example [bank-mcp](https://github.com/elcukro/bank-mcp), which is read-only and supports Tink and Enable Banking.
- **GoCardless Bank Account Data (Nordigen)** has [closed new signups](https://dev.to/johnfrandsen/gocardless-bank-account-data-alternatives-what-to-use-when-signups-are-disabled-326d), so it is **no longer an option**.
- **bunq** has its own free API, which is easy if you bank there.
- **Brokers (DEGIRO, Trade Republic, etc.)**: no official API. Use CSV export into Ghostfolio, or enter positions by hand plus price data from a market API.
- Fallback that always works: **CSV/CAMT.053 import** from your bank's app.

## 3. Skills: recommendation

| Skill | Why | Install |
|---|---|---|
| **frontend-design** (Anthropic, official) | Gives Claude a design process before it writes UI code, so the result looks distinctive instead of generic AI output. This is "make it beautiful". | In Claude Code: `/plugin marketplace add anthropics/claude-code` then `/plugin install frontend-design@claude-code-plugins` |
| **dataviz** | Charts, KPI tiles and sparklines for the finance tab | ✅ Already installed |
| **webapp-testing** (Anthropic skills repo) | Claude tests the dashboard in a real browser (Playwright) | `/plugin marketplace add anthropics/skills` |
| **claude-api** | For summarising mail inside the app itself, with the right models and prompt caching | ✅ Already installed |
| **schedule** | Cloud routines for the morning job | ✅ Already installed |
| **security-review** | For the password protection and the bank tokens | ✅ Already installed |

Not recommended: community forks of frontend-design (`impeccable`, `antigravity`…). They are unofficial and overlap with the official skill.

## 4. The morning job: two ways to run it

| | Local scheduled task | Cloud routine (`/schedule`) |
|---|---|---|
| Runs when | Your PC is on and the Claude app is open | Always, in Anthropic's cloud |
| Connectors | Microsoft 365, Notion | Same, through your claude.ai connectors |
| Recommendation | Fine for testing | **Use this in production** |

Flow every morning (e.g. 07:00):
1. Read Outlook mail from the last 24 hours plus today's and tomorrow's agenda (Microsoft 365).
2. Summarise it: what needs action, deadlines, which meeting each mail belongs to.
3. Create or update to-dos in the Notion database, deduplicated so tasks are not added twice.
4. Write the briefing to the dashboard (and/or a Notion page).

## 5. Proposed architecture (to confirm in the interview)

- **Frontend/backend:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui. The most common combination, a huge ecosystem, and Claude builds it well.
- **Database:** Postgres (Supabase or Neon, free tier), or SQLite on your own VPS.
- **Modules:** `modules/<name>/` with its own routes, widgets, data sync and settings. A new tab = a new folder.
- **Protection:** Cloudflare Access in front of the subdomain (a login gate before the app is even reached, free, with email OTP or passkey) **plus** login inside the app (Auth.js with a passkey/password), so it is protected twice. Necessary, because financial data is involved.
- **Hosting:** Vercel (easiest) or a small VPS / your own server via a Cloudflare Tunnel.
- **AI layer:** the morning routine writes into the database; later, a dashboard MCP server so Claude can ask things like "what did I spend on groceries this month?".
