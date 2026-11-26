# LifeOS

Personal dashboard at **houssem.dodor.nl**. Next.js 15 (App Router) + Tailwind 4 + Supabase, deployed on Vercel.

## Run locally

```powershell
npm install
copy .env.example .env.local   # then fill in; AUTH_DEV_BYPASS=true skips login in dev
npm run dev
```

Without Supabase settings the screens show labelled sample data.

## Structure

```
src/
  app/
    (app)/            signed-in screens: Today (/), /inbox, /finance
    login/            passkey sign-in, setup, magic-link confirm page
    api/auth/         WebAuthn register/login, magic link, logout
  modules/
    registry.ts       list of modules → sidebar; add new areas here
    today/            types, data access, sample data, DayRibbon
  lib/                session (JWT cookie), passkeys, magic link, Supabase, formatting
  middleware.ts       blocks every route except /login and /api/auth/* without a session
supabase/migrations/  database schema
```

**Adding a module:** create `src/modules/<id>/`, add `src/app/(app)/<id>/page.tsx`, register it in `registry.ts`.

## Auth

- Passkeys only (WebAuthn, user verification required). Sessions are a signed HttpOnly cookie, valid 30 days.
- The first passkey is registered with `SETUP_TOKEN`. Rotate or remove that variable afterwards.
- Recovery: "Email me a sign-in link" sends a single-use 15-minute link to `OWNER_EMAIL` only (max 3 per hour). The link opens a confirm page and signs in on POST, so Outlook Safe Links pre-scanning can't use it up.
- `AUTH_DEV_BYPASS` is ignored when `NODE_ENV=production`.

## Deploy

1. Supabase: new project (EU region) → SQL editor → run `supabase/migrations/0001_init.sql`.
2. Vercel: import the GitHub repo, set env vars from `.env.example` (`RP_ID=houssem.dodor.nl`, `APP_ORIGIN=https://houssem.dodor.nl`).
3. Vercel → Domains → add `houssem.dodor.nl`. At Hostnet DNS add `CNAME houssem → cname.vercel-dns.com`.
4. Open the site → "First time here? Set up a passkey" → enter `SETUP_TOKEN`. Add a second passkey from your phone.
