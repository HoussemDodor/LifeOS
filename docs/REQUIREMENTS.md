# LifeOS requirements

The checklist to measure LifeOS against. Tick an item only when it works in
production at houssem.dodor.nl, not just locally.
Status key: ✅ done · 🟡 built, not live/verified · ⬜ not started.
Items marked *(suggested)* were added by Claude as improvements on the original ask.

Last updated: 2026-11-27

## 1. Platform

| # | Requirement | Status |
|---|---|---|
| P1 | Web app on my own subdomain **houssem.dodor.nl** | ✅ live on Vercel + Supabase, HTTPS |
| P2 | Password protected: **passkey login only**, email magic link to recover a lost device | ✅ passkeys (Windows + iPhone), setup code removed, email recovery via Resend tested end-to-end |
| P9 | *(suggested)* Send recovery mail from my own domain instead of `onboarding@resend.dev` (Resend domain + DNS records) | ⬜ optional |
| P8 | *(suggested)* Auto-deploy on every push (connect Vercel's GitHub app to the repo) | ✅ push to `main` = production |
| P10 | Change the app entirely through chat (no manual file edits) | ✅ change loop in `CLAUDE.md`, local preview with real Notion data |
| P3 | Beautiful: dark, calm, minimal design (frontend-design skill) | ✅ |
| P4 | Expandable: every area is a module (folder + route + one line in `src/modules/registry.ts`) | ✅ |
| P5 | English interface and briefings | ✅ |
| P6 | Works on phone as well as desktop | ✅ |
| P7 | *(suggested)* Installable as a home-screen app on iPhone (PWA manifest + icon) | ⬜ |
| P11 | AI usage and costs tracker in the bottom-left of the sidebar: token use and spend of the LifeOS AI agents (spending coach, portfolio analyst, chats), e.g. this month vs the API spend cap | 🟡 live: every Claude call logged in `ai_usage`; sidebar shows this month in US$ vs `AI_SPEND_CAP_USD` ($10); fills once the coach runs |

## 2. Inbox, agenda and to-dos

| # | Requirement | Status |
|---|---|---|
| I1 | Summarise my Outlook email (last 24h, Inbox, newsletters skipped) | ✅ routine live |
| I2 | Link emails to agenda items | ✅ routine live |
| I3 | Add action items to my Notion **Tasks** database (MyLife OS), automatically, without duplicates | ✅ routine live |
| I4 | Runs every morning at **07:00** Amsterdam time so my to-do list is current | ✅ routine scheduled |
| I5 | Show the briefing, agenda and open tasks on the dashboard | 🟡 live and Notion connected; confirm after the first 07:00 brief |
| I6 | *(suggested)* Tick off a Notion task from the dashboard | 🟡 live (checkbox + undo on Today); confirm one tick on the live site |

## 3. Finance

| # | Requirement | Status |
|---|---|---|
| F1 | ING current and savings accounts and transactions | 🟡 live via CSV upload on Finance (accounts, balances, categories, no duplicates); confirm with your first real export. Live sync via Enable Banking possible later |
| F2 | DEGIRO portfolio | 🟡 live: Portfolio + Transactions CSV in the same upload as ING; confirm with your first real export |
| F3 | Bitvavo crypto | 🟡 built: read-only sync, refreshes when Finance opens; needs your View-only API key (push-secrets) |
| F4 | Net worth over time, spending by category, savings | ⬜ |
| F5 | Subscriptions and recurring costs detected from transactions | ⬜ |
| F6 | **Monthly portfolio review**, see below and [finance-agents.md](finance-agents.md) | ⬜ needs F1–F3 first |
| F7 | Monthly check-in: upload, see data freshness, press one button that runs both agents; reports saved per month | 🟡 live at /finance/checkin for the coach; needs your Anthropic API key; analyst joins in step 4 |
| F8 | **Spending coach** agent: blunt Gen Z briefing, proposes a savings target, Tikkie netting, category fixes, tracks 1–3 promises per month, chat with memory ([spec](finance-agents.md)) | ✅ report live (target proposal, promises + scoring, category fixes with undo); chat live at /finance/coach (read-only tools over your data, saved chats, memory of check-ins and earlier chats, stops at the monthly AI cap) |
| F9 | **Portfolio analyst** agent: core–satellite 75/25, crypto max 5%, trim advice only above 50% satellite, web-sourced stock checks, chat with memory ([spec](finance-agents.md)) | ⬜ |

### F6: Monthly portfolio review

> Superseded in detail by [finance-agents.md](finance-agents.md) (2026-11-27): core–satellite policy and the portfolio analyst agent.

**Ask:** once bank and broker are connected, add a skill that analyses my
portfolio, integrated in the dashboard, with a monthly report on whether to
change my positions and which trades or ETFs to consider.

**How it should work** *(suggested refinement)*:

- **I set the rules first.** A short *investment policy* in LifeOS: target
  allocation (e.g. % global equity / emerging markets / bonds / crypto / cash),
  monthly investment amount, risk limits (max % in one stock, max % crypto),
  ETFs I'm willing to hold, and an emergency-fund floor on ING savings.
- **Monthly report (1st of the month, cloud routine)**, saved in LifeOS and
  linked from the Finance tab:
  - allocation now vs my targets, and the drift
  - the buys/sells that would bring me back to my own targets with this
    month's investment amount (buy-only rebalancing first, to avoid selling)
  - concentration and overlap between ETFs, total costs (TER, DEGIRO fees),
    currency exposure
  - performance vs a simple benchmark (e.g. a global all-world ETF)
  - ETFs from my allowed list that fit a gap, with cost and index facts
  - Box 3 (Dutch wealth tax) reminder around the January 1 reference date
- **Guardrails:**
  - LifeOS **never places trades**. Every trade is done by me in DEGIRO, Bitvavo or ING.
  - The report is analysis against my own rules, not licensed financial advice. Big
    decisions can go to a licensed adviser.
  - Price and fund data comes from a named source with a date on every report.
- Skill: look for or build a `portfolio-review` skill at that time (skill-creator),
  fed by LifeOS's holdings data.

## 4. Health and training

| # | Requirement | Status |
|---|---|---|
| H1 | Fixed gym schedule built into my routines (below) | ✅ Today ribbon + clash warning, Health & training screen, morning brief (schedule in `src/modules/health/schedule.json`) |
| H2 | Hevy workouts synced (Hevy API, needs Hevy Pro) | ⬜ |
| H3 | Apple Health (sleep, steps) via Health Auto Export → LifeOS webhook | ⬜ |
| H4 | Habit streaks | 🟡 live: Habits screen (tick last 7 days, current/best streak, 12-week history) + Today block, Supabase `habits`/`habit_checks`; confirm by adding your habits |

### H1: Gym schedule

| Day | Session |
|---|---|
| Monday | Rest |
| Tuesday | Push, 18:30–19:45 |
| Wednesday | Pull, 18:30–19:45 |
| Thursday | Legs, 18:30–19:45 |
| Friday | Rest |
| Saturday | Upper body, 11:00–12:15 |
| Sunday | Legs, 11:00–12:15 |

**Integration** *(suggested)*:

- The 07:00 briefing names today's session ("Push day: chest, shoulders,
  triceps") and warns if a meeting overlaps my usual gym time.
- The Today screen shows the session on the day ribbon.
- With Hevy connected: did I train yesterday as planned, weekly adherence (5/5),
  streak, and progressive-overload hints (last time's top set for the main lifts).
- A missed session shows up in the next morning's brief, but never as a Notion task.
- *(Optional)* Add the sessions to my Outlook calendar as recurring blocks.
  This needs my go-ahead and a usual training time.

## 5. Later modules (from the interview)

| # | Requirement | Status |
|---|---|---|
| G1 | Goals and journal: yearly/quarterly goals, daily notes, reflections | ⬜ |
| M1 | Claude can query LifeOS data (own MCP server, as in Edi Life OS) | ⬜ |
