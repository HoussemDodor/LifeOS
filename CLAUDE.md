# LifeOS: how to work on this project

Houssem changes LifeOS **only through chat**. He doesn't edit files himself.
Every request ("add X", "change the colour of Y", "the brief should also…")
goes through the loop below, from idea to live site, and ends with a short
plain-language report of what changed and where to see it.

## The change loop (always all steps)

1. **Understand.** Restate the change in one line. If it's ambiguous or touches
   money, auth or data deletion, ask first. Otherwise just do it.
2. **Edit** the code in this repo (`C:\dev\LifeOS\app`).
3. **Build**: `npm run build` must pass (type check + lint included).
4. **Preview** UI changes: start the `lifeos-dev` launch config
   (http://localhost:3000, login skipped locally via `AUTH_DEV_BYPASS`). Check
   desktop **and** phone width (375px), take a screenshot, fix what looks off.
5. **Commit and push** to `main` (git author `houssem@dodor.nl`; Vercel blocks
   other authors). Pushing to `main` **deploys production automatically**.
6. **Verify live**: `npx vercel@65.15.0 ls lifeos` until the newest deployment
   is `● Ready`, then check https://houssem.dodor.nl. The local shell may cache
   an old DNS answer; use `curl --resolve houssem.dodor.nl:443:216.198.79.1 …`.
7. **Update** `docs/REQUIREMENTS.md` (status column) when a requirement moves.
8. **Report**: what changed, live link, anything Houssem must do or check.

Bigger features: propose a short plan first, build in small deployable steps.

## Map

| Where | What |
|---|---|
| `src/modules/registry.ts` | List of modules → sidebar. New area = new entry here |
| `src/modules/<id>/` | A module's types, data access, components |
| `src/app/(app)/<id>/page.tsx` | A module's screen (signed-in area) |
| `src/app/login/`, `src/app/api/auth/` | Passkey login, magic-link recovery |
| `src/middleware.ts` | Login gate for every route except `/login` and `/api/auth/*` |
| `src/lib/notion.ts`, `src/modules/today/data.ts` | Reads briefing + tasks from Notion |
| `src/lib/supabase.ts` | Server-only Supabase client (secret key) |
| `supabase/migrations/` | Database schema history |
| `routines/morning-brief.md` | Instructions for the 07:00 cloud routine |
| `docs/REQUIREMENTS.md` | Requirements checklist: the definition of done |
| `docs/research.md`, `docs/decisions.md` | Original research and interview decisions |

## Design rules (keep the app coherent)

- Tokens live in `src/app/globals.css` (`--ink`, `--surface`, `--line`,
  `--text`, `--muted`, `--faint`, `--dawn` accent, `--gain`, `--loss`). Use the
  Tailwind names (`bg-surface`, `text-muted`, `text-dawn`…). No new hex colours
  in components.
- Type: Schibsted Grotesk (UI) + Newsreader serif (only for written prose like
  the brief). Sentence case; no all-caps labels; no "→" in buttons.
- One accent (`dawn`) used sparingly: "now", today's items, primary buttons.
- Avoid identical card grids; use hairlines (`border-line`) and spacing.
- Every screen must work at 375px wide. Keyboard focus stays visible.
- Navigation: modules come from `registry.ts` (desktop sidebar, phone bottom tab
  bar). Pages inside a module are listed in its `sections` and shown as tabs by
  a `layout.tsx` with `<SectionTabs>` (see `finance/layout.tsx`). No "back"
  links and no link lists to sub-pages inside page content.
- For new screens, load the **frontend-design** skill first (installed as a
  plugin; the file is also at `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/frontend-design/skills/frontend-design/SKILL.md`); for charts the
  **dataviz** skill.

## Data and services

- **Notion** (read by the app with `NOTION_TOKEN`; written by the routine via
  the Notion connector):
  - LifeOS Briefings data source `4245cbad-13bf-81ba-be97-000b9e090693`
  - Tasks (MyLife OS) data source `1d85cbad-13bf-801d-a422-000b4a8d0294`:
    `Task`, `Due Date`, `Project`, `Email ID`, unnamed checkbox = done
- **Supabase** project `ujadkakhgsimuaxsuwgr` (EU). Schema changes: apply with
  the Supabase MCP (`apply_migration`) **and** save the same SQL as the next
  numbered file in `supabase/migrations/`. RLS on, no policies; grant new
  tables to `service_role` only. Run `get_advisors` after DDL.
- **Vercel** project `lifeos` (team `houssems-projects-50aed272`). Use
  `npx vercel@65.15.0` (older CLIs misreport status). In the PowerShell
  terminal panel call `npx.cmd` (script execution is blocked).
- **Morning routine**: cloud routine `trig_01W2fjukTdrkesjs2kb1pFKM`
  (claude.ai/code/routines), fires 05:00 + 06:00 UTC, acts only at 07:00
  Amsterdam. To change its behaviour, edit `routines/morning-brief.md` and push.

## Secrets and settings

- Never put secrets in chat, code, commits or logs. Never ask Houssem to paste
  one into the chat.
- **Non-secret** setting: `printf '%s' value | npx vercel@65.15.0 env add NAME production`.
- **Secret** setting: Houssem pastes it into `.env.production.local`
  (gitignored), then runs `node scripts/push-secrets.mjs NAME` himself.
- Env changes only apply after a redeploy (`npx vercel@65.15.0 deploy --prod --yes`
  or any push). Removing a variable needs Houssem's interactive confirmation.

## Guardrails

- Don't weaken the login gate, middleware matcher, passkey verification or
  session cookie flags. `AUTH_DEV_BYPASS` must stay ignored in production.
- Outlook stays read-only for the routine. LifeOS never moves money or places
  trades.
- Finance and portfolio features are analysis against Houssem's own rules, not
  licensed advice (see REQUIREMENTS F6).
