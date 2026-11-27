-- Coach chat with memory (spec: docs/finance-agents.md, step 3).

-- One row per conversation. `memory` is what the coach knew when the chat
-- started (recent check-ins, target, promises, earlier chats); it is frozen so
-- the prompt stays the same for the whole chat and caches well.
create table coach_chats (
  id          uuid primary key default gen_random_uuid(),
  agent       text not null default 'coach' check (agent in ('coach', 'analyst')),
  title       text not null,
  memory      text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index coach_chats_recent on coach_chats (agent, updated_at desc);

-- One row per turn. `text` is what the screen shows; `api` holds the exact
-- Messages API entries of that turn (tool calls, tool results, thinking), so
-- the conversation can be replayed unchanged.
create table coach_messages (
  id          uuid primary key default gen_random_uuid(),
  chat_id     uuid not null references coach_chats(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  text        text not null,
  api         jsonb not null,
  created_at  timestamptz not null default now()
);
create index coach_messages_chat on coach_messages (chat_id, created_at);

alter table coach_chats    enable row level security;
alter table coach_messages enable row level security;
grant select, insert, update, delete on coach_chats, coach_messages to service_role;
revoke all on coach_chats, coach_messages from anon, authenticated;
