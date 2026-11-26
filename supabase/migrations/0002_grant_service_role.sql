-- New Supabase projects no longer auto-grant table access. LifeOS only talks to the
-- database from its server with the secret (service_role) key, so grant that role
-- and nothing else: anon/authenticated keep no access at all.
-- Also required: Dashboard → Integrations → Data API → "Enable Data API" on.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public grant usage, select on sequences to service_role;
