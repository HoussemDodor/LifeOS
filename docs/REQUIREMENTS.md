# LifeOS requirements

The checklist to measure LifeOS against. Tick an item only when it works in
production at houssem.dodor.nl, not just locally.
Status key: ✅ done · 🟡 built, not live/verified · ⬜ not started.
Items marked *(suggested)* were added by Claude as improvements on the original ask.

Last updated: 2026-11-26

## 1. Platform

| # | Requirement | Status |
|---|---|---|
| P1 | Web app on my own subdomain **houssem.dodor.nl** | 🟡 code ready, not deployed |
| P2 | Password protected: **passkey login only**, email magic link to recover a lost device | 🟡 built, untested with a real passkey |
| P3 | Beautiful: dark, calm, minimal design (frontend-design skill) | ✅ |
| P4 | Expandable: every area is a module (folder + route + one line in `src/modules/registry.ts`) | ✅ |
| P5 | English interface and briefings | ✅ |
| P6 | Works on phone as well as desktop | ✅ |
| P7 | *(suggested)* Installable as a home-screen app on iPhone (PWA manifest + icon) | ⬜ |

## 2. Inbox, agenda and to-dos

| # | Requirement | Status |
|---|---|---|
| I1 | Summarise my Outlook email (last 24h, Inbox, newsletters skipped) | ✅ routine live |
| I2 | Link emails to agenda items | ✅ routine live |
| I3 | Add action items to my Notion **Tasks** database (MyLife OS), automatically, without duplicates | ✅ routine live |
| I4 | Runs every morning at **07:00** Amsterdam time so my to-do list is current | ✅ routine scheduled |
| I5 | Show the briefing, agenda and open tasks on the dashboard | 🟡 needs Notion key + deploy |
| I6 | *(suggested)* Tick off a Notion task from the dashboard | ⬜ |

## 3. Finance

| # | Requirement | Status |
|---|---|---|
| F1 | ING current and savings accounts and transactions | ⬜ (Enable Banking PSD2, or CAMT/CSV import) |
| F2 | DEGIRO portfolio | ⬜ (CSV export + daily prices) |
| F3 | Bitvavo crypto | ⬜ (read-only API key) |
| F4 | Net worth over time, spending by category, savings | ⬜ |
| F5 | Subscriptions and recurring costs detected from transactions | ⬜ |
| F6 | **Monthly portfolio review**, see below | ⬜ needs F1–F3 first |

### F6: Monthly portfolio review

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
| H1 | Fixed gym schedule built into my routines (below) | ⬜ |
| H2 | Hevy workouts synced (Hevy API, needs Hevy Pro) | ⬜ |
| H3 | Apple Health (sleep, steps) via Health Auto Export → LifeOS webhook | ⬜ |
| H4 | Habit streaks | ⬜ |

### H1: Gym schedule

| Day | Session |
|---|---|
| Monday | Rest |
| Tuesday | Push |
| Wednesday | Pull |
| Thursday | Legs |
| Friday | Rest |
| Saturday | Upper body |
| Sunday | Legs |

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
