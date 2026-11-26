-- LifeOS initial schema. Run in the Supabase SQL editor (or `supabase db push`).
-- The app talks to these tables with the service-role key from the server only,
-- so RLS is enabled with no policies: the anon key can read nothing.

-- Auth ---------------------------------------------------------------------
create table passkeys (
  id            text primary key,          -- base64url credential id
  public_key    text not null,             -- base64url COSE key
  counter       bigint not null default 0,
  transports    text[],
  label         text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create table magic_links (
  token_hash  text primary key,            -- sha256 of the emailed token
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);

-- Today / morning routine --------------------------------------------------
create table briefings (
  date          date primary key,
  generated_at  timestamptz not null default now(),
  payload       jsonb not null             -- matches the Briefing type in src/modules/today/types.ts
);

-- One row per Notion task the routine created or mirrored. Also the dedupe key:
-- the routine never creates a second task for the same source_email_id.
create table tasks_cache (
  notion_page_id   text primary key,
  title            text not null,
  due              date,
  done             boolean not null default false,
  source_email_id  text unique,
  url              text,
  updated_at       timestamptz not null default now()
);

-- Finance --------------------------------------------------------------------
create table finance_accounts (
  id          uuid primary key default gen_random_uuid(),
  provider    text not null check (provider in ('ing', 'degiro', 'bitvavo', 'manual')),
  name        text not null,
  kind        text not null check (kind in ('current', 'savings', 'brokerage', 'crypto')),
  currency    text not null default 'EUR',
  external_id text,
  created_at  timestamptz not null default now(),
  unique (provider, external_id)
);

create table transactions (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references finance_accounts(id) on delete cascade,
  booked_at    date not null,
  amount       numeric(14,2) not null,     -- negative = money out
  currency     text not null default 'EUR',
  counterparty text,
  description  text,
  category     text,
  external_id  text,
  unique (account_id, external_id)
);
create index transactions_account_date on transactions (account_id, booked_at desc);

create table holdings (
  account_id  uuid not null references finance_accounts(id) on delete cascade,
  symbol      text not null,               -- ISIN or ticker
  name        text,
  quantity    numeric(20,8) not null,
  price       numeric(14,4),
  value_eur   numeric(14,2),
  as_of       timestamptz not null default now(),
  primary key (account_id, symbol)
);

create table net_worth_daily (
  date   date primary key,
  total  numeric(14,2) not null
);

alter table passkeys          enable row level security;
alter table magic_links       enable row level security;
alter table briefings         enable row level security;
alter table tasks_cache       enable row level security;
alter table finance_accounts  enable row level security;
alter table transactions      enable row level security;
alter table holdings          enable row level security;
alter table net_worth_daily   enable row level security;
