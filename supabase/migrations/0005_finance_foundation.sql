-- Finance data foundation (spec: docs/finance-agents.md, step 1).

-- Category rules: "always put this shop in this category". Matched on the
-- lower-cased counterparty name; they win over the built-in rules.
create table category_rules (
  counterparty  text primary key,
  category      text not null,
  created_at    timestamptz not null default now()
);

-- Where a transaction's category came from, so a re-run never overwrites a manual fix.
alter table transactions
  add column category_source text not null default 'rule'
    check (category_source in ('rule', 'manual', 'agent')),
  -- A Tikkie (or other) payback points at the payment it reimburses.
  add column offsets_id uuid references transactions(id) on delete set null,
  add column offsets_source text check (offsets_source in ('auto', 'manual'));
create index transactions_offsets on transactions (offsets_id) where offsets_id is not null;

-- DEGIRO buys and sells (Transactions.csv): cost basis, fees, monthly investing.
create table portfolio_trades (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references finance_accounts(id) on delete cascade,
  traded_at   date not null,
  isin        text not null,
  product     text,
  quantity    numeric(20,8) not null,       -- negative = sell
  price       numeric(14,4),
  currency    text,
  total_eur   numeric(14,2),                -- incl. fees, negative = money out
  fees_eur    numeric(14,2),
  external_id text not null,                -- DEGIRO order id, or a hash
  unique (account_id, external_id)
);
create index portfolio_trades_date on portfolio_trades (traded_at desc);

-- When each source last delivered data (ING import, DEGIRO import, Bitvavo sync).
alter table finance_accounts add column synced_at timestamptz;

alter table category_rules   enable row level security;
alter table portfolio_trades enable row level security;
grant select, insert, update, delete on category_rules, portfolio_trades to service_role;
revoke all on category_rules, portfolio_trades from anon, authenticated;
