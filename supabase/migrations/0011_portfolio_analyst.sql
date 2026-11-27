-- Portfolio analyst (spec: docs/finance-agents.md, step 4b).
-- Reports live in finance_checkins with agent = 'analyst'.

-- Fund facts found by web search (TER, index, top holdings, regions), kept
-- for a while so they aren't searched again every month.
create table instrument_facts (
  isin        text primary key,
  name        text not null,
  facts       jsonb not null,
  sources     jsonb not null default '[]'::jsonb,
  fetched_at  timestamptz not null default now()
);

-- The core make-up: proposed by the analyst, approved (or not) by Houssem.
create table portfolio_core_plan (
  id          uuid primary key default gen_random_uuid(),
  plan        jsonb not null,                -- [{ name, isin?, share_of_core_pct, why }]
  reasoning   text,
  status      text not null check (status in ('proposed', 'active', 'replaced', 'declined')),
  checkin_id  uuid references finance_checkins(id) on delete set null,
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);

alter table instrument_facts    enable row level security;
alter table portfolio_core_plan enable row level security;
grant select, insert, update, delete on instrument_facts, portfolio_core_plan to service_role;
revoke all on instrument_facts, portfolio_core_plan from anon, authenticated;
