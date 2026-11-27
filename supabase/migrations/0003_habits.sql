-- Habit streaks (requirement H4). One row per habit, one row per habit per day it was done.
create table habits (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) between 1 and 60),
  sort         integer not null default 0,
  created_at   timestamptz not null default now(),
  archived_at  timestamptz
);

create table habit_checks (
  habit_id  uuid not null references habits(id) on delete cascade,
  day       date not null,               -- Amsterdam calendar date
  primary key (habit_id, day)
);

alter table habits enable row level security;
alter table habit_checks enable row level security;

grant select, insert, update, delete on habits, habit_checks to service_role;

-- Supabase gives anon/authenticated TRUNCATE, TRIGGER and REFERENCES by default; LifeOS keeps them out entirely.
revoke all on habits, habit_checks from anon, authenticated;
