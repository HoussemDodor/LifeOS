-- ING CSV import (requirement F1): keep each account's latest known balance,
-- taken from "Saldo na mutatie" in the newest imported row.
alter table finance_accounts
  add column balance        numeric(14,2),
  add column balance_as_of  date;

create index transactions_booked_at on transactions (booked_at desc);

-- Supabase gives anon/authenticated TRUNCATE, TRIGGER and REFERENCES by default; keep finance tables fully closed.
revoke all on finance_accounts, transactions, holdings, net_worth_daily from anon, authenticated;
