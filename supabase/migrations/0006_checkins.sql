-- Monthly check-in + spending coach (spec: docs/finance-agents.md, step 2).

-- One row per check-in run. The coach's structured report lives in `report`.
create table finance_checkins (
  id           uuid primary key default gen_random_uuid(),
  month        text not null check (month ~ '^\d{4}-\d{2}$'),   -- the month being reviewed
  agent        text not null default 'coach' check (agent in ('coach', 'analyst')),
  status       text not null default 'running' check (status in ('running', 'done', 'failed')),
  report       jsonb,
  facts        jsonb,                                            -- the numbers LifeOS computed and sent
  model        text,
  usage        jsonb,
  error        text,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create index finance_checkins_month on finance_checkins (agent, month desc, created_at desc);

-- Savings target: proposed by the coach, confirmed (or changed) by Houssem.
create table finance_targets (
  id                 uuid primary key default gen_random_uuid(),
  monthly_savings    numeric(12,2) not null,
  status             text not null check (status in ('proposed', 'active', 'replaced', 'declined')),
  reasoning          text,
  checkin_id         uuid references finance_checkins(id) on delete set null,
  created_at         timestamptz not null default now(),
  decided_at         timestamptz
);

-- The 1–3 actions per check-in that Houssem accepts; the next check-in scores them.
create table finance_promises (
  id           uuid primary key default gen_random_uuid(),
  checkin_id   uuid not null references finance_checkins(id) on delete cascade,
  month        text not null,                 -- the month the promise was made for (the next one)
  text         text not null,
  measure      text not null,                 -- how it will be checked
  status       text not null default 'proposed' check (status in ('proposed', 'accepted', 'declined')),
  result       text check (result in ('hit', 'partly', 'missed')),
  evidence     text,
  scored_in    uuid references finance_checkins(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- Category changes the coach made, so each can be reviewed and undone.
create table finance_agent_changes (
  id              uuid primary key default gen_random_uuid(),
  checkin_id      uuid not null references finance_checkins(id) on delete cascade,
  transaction_id  uuid not null references transactions(id) on delete cascade,
  from_category   text,
  to_category     text not null,
  reason          text,
  undone          boolean not null default false
);

alter table finance_checkins      enable row level security;
alter table finance_targets       enable row level security;
alter table finance_promises      enable row level security;
alter table finance_agent_changes enable row level security;
grant select, insert, update, delete on finance_checkins, finance_targets, finance_promises, finance_agent_changes to service_role;
revoke all on finance_checkins, finance_targets, finance_promises, finance_agent_changes from anon, authenticated;
