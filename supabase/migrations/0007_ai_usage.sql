-- AI usage and costs (requirement P11): one row per Claude API call LifeOS makes.
create table ai_usage (
  id                           uuid primary key default gen_random_uuid(),
  created_at                   timestamptz not null default now(),
  feature                      text not null check (feature in ('coach', 'analyst', 'coach_chat', 'analyst_chat')),
  model                        text not null,
  input_tokens                 integer not null default 0,
  output_tokens                integer not null default 0,
  cache_creation_input_tokens  integer not null default 0,
  cache_read_input_tokens      integer not null default 0,
  web_searches                 integer not null default 0,
  cost_usd                     numeric(10,4) not null,
  ref_id                       uuid
);
create index ai_usage_created on ai_usage (created_at desc);

alter table ai_usage enable row level security;
grant select, insert, update, delete on ai_usage to service_role;
revoke all on ai_usage from anon, authenticated;
