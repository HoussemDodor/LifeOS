-- Visual answer cards (bar charts, month charts, cost lists) the coach attaches to a chat answer.
alter table coach_messages add column cards jsonb not null default '[]'::jsonb;
