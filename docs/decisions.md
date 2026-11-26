# LifeOS: decisions log

## Interview round 1 (2026-11-26)

| Topic | Decision |
|---|---|
| Mail + agenda | Microsoft 365 / Outlook only (already connected to Claude) |
| Hosting | **Vercel + Supabase**. The domain stays at Hostnet, and a CNAME record points the subdomain to Vercel. (Hostnet can run Node.js and already hosts a Next.js app, but the user prefers the easier route.) |
| Finance | **ING** (current/savings) via PSD2 (Enable Banking/Tink) or CSV import. **DEGIRO** via CSV export plus live prices. **Crypto** via exchange API or wallet addresses. |
| To-do | An existing **Notion to-do database**. The morning job **adds tasks automatically**, deduplicated, with a link to the email and a due date. |
| Schedule | **07:00 every day**, including weekends, as a cloud routine |

## Interview round 2 (2026-11-26)

| Topic | Decision |
|---|---|
| Login | **Passkey only**, inside the app (no Cloudflare Access layer). Recovery is an **email magic link** to the Outlook address. Every route and API is protected server-side, with rate limiting on the magic link. |
| Look | **Dark, calm, minimal** (Linear/Raycast feel), built with the frontend-design skill |
| Language | **English** UI and briefings |
| Modules | v1: **Today (home)**, **Inbox & Agenda**, **Finance**. Later: **Health & habits**, **Goals & journal**, **Subscriptions & bills** (recurring costs detected from ING transactions) |
| Crypto | **Bitvavo**, through a read-only API key |
| Mail scope | Last 24h of the **Inbox only**. Newsletters, promotions and notifications are counted but never turned into to-dos. |
| Health sources | **Hevy** (workouts; has an official API with Hevy Pro) and **Apple Health** (no web API; an iOS app such as Health Auto Export pushes the data to a LifeOS webhook) |

## Round 3 (2026-11-26)

| Topic | Decision |
|---|---|
| Subdomain | **houssem.dodor.nl** (CNAME at Hostnet → Vercel) |
| Notion to-do DB | **Tasks** in *MyLife OS → Database & Pages → Databases* (`collection://1d85cbad-13bf-801d-a422-000b4a8d0294`). Fields: `Task` (title), `Due Date` (date), `Project` (relation), plus an unnamed checkbox (done). No source field, so deduplication runs through `tasks_cache.source_email_id` in Supabase. |
| Recovery email | Sent through Resend to `OWNER_EMAIL` only |
| Design | The frontend-design skill was applied: graphite-indigo base, a dawn-amber accent, Schibsted Grotesk + Newsreader, and a "day ribbon" as the one bold element |

## Still open
- GitHub: no connector or CLI is available in this session yet. The code is committed locally in `app/`.
- How the cloud routine writes to Supabase: a token-protected `POST /api/ingest/briefing` endpoint (next step)
