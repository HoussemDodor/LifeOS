-- Core–satellite grouping (spec: docs/finance-agents.md, step 4a).
-- Only holdings Houssem moved by hand are stored; the rest use LifeOS's first guess.
create table portfolio_buckets (
  symbol      text primary key,              -- ISIN (DEGIRO)
  bucket      text not null check (bucket in ('core', 'satellite')),
  updated_at  timestamptz not null default now()
);
alter table portfolio_buckets enable row level security;
grant select, insert, update, delete on portfolio_buckets to service_role;
revoke all on portfolio_buckets from anon, authenticated;
