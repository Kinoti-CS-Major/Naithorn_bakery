-- Naithorn Bakery — run in Supabase SQL editor (adjust RLS for your org).
-- Core tables the React app expects:

-- Migration: Add new columns to existing production_logs table
alter table public.production_logs 
add column if not exists shift text not null default 'day' check (shift in ('day','night')),
add column if not exists note text;

create table if not exists public.delivery_trips (
  id bigint generated always as identity primary key,
  total_crates int not null,
  product_breakdown jsonb,
  collected_at timestamptz,
  collected_crates int,
  departed_at timestamptz,
  arrived_at timestamptz,
  received_at timestamptz,
  received_crates int,
  receipt_confirmed_at timestamptz,
  broken_cakes int default 0,
  return_prepared_at timestamptz,
  empty_crates_planned int default 0,
  unsold_crates_planned int default 0,
  return_confirmed_at timestamptz,
  empty_crates_confirmed int default 0,
  mismatch_flag boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending','collected','in_transit','arrived','receipt_confirmed','return_prepared','completed')),
  created_at timestamptz not null default now()
);

create table if not exists public.broken_returns (
  id bigint generated always as identity primary key,
  trip_id bigint references public.delivery_trips(id) on delete set null,
  cakes int not null,
  noted_by text,
  noted_at timestamptz not null default now()
);

create table if not exists public.inventory (
  id bigint generated always as identity primary key,
  product text not null,
  quantity int not null default 0,
  location text not null check (location in ('store','transit','market')),
  unique (product, location)
);

create table if not exists public.customers (
  id bigint generated always as identity primary key,
  name text not null,
  mpesa_balance numeric(12,2) not null default 0
);

create table if not exists public.sales (
  id bigint generated always as identity primary key,
  customer_name text not null,
  product text not null,
  quantity int not null,
  price_type text not null,
  unit_price numeric(12,2) not null,
  total numeric(12,2) not null,
  sold_at timestamptz not null default now()
);

create table if not exists public.customer_exchanges (
  id bigint generated always as identity primary key,
  customer_name text not null,
  return_product text not null,
  return_qty int not null,
  issue_product text not null,
  issue_qty int not null,
  created_at timestamptz not null default now()
);

create table if not exists public.flour_inventory (
  id int primary key default 1,
  sacks_remaining numeric(12,2) not null default 50
);

insert into public.flour_inventory (id, sacks_remaining)
values (1, 50)
on conflict (id) do nothing;

create table if not exists public.staff_sessions (
  id bigint generated always as identity primary key,
  staff_id text not null,
  staff_name text not null,
  role text not null check (role in ('worker','delivery','sales','admin')),
  shift text not null check (shift in ('day','night')),
  login_at timestamptz not null default now(),
  logout_at timestamptz
);

create table if not exists public.mpesa_payments (
  id bigint generated always as identity primary key,
  customer_name text not null,
  amount numeric(12,2) not null,
  transaction_id text,
  recorded_at timestamptz not null default now(),
  recorded_by text
);

create table if not exists public.daily_crate_stock (
  id bigint generated always as identity primary key,
  date date not null unique,
  opening_cakes int not null default 0,
  opening_empty_crates int not null default 0,
  closing_cakes int not null default 0,
  closing_empty_crates int not null default 0
);

-- RLS Policies (disable for demo, enable for production)
alter table public.staff_sessions enable row level security;
create policy "Enable all for staff_sessions" on public.staff_sessions for all using (true) with check (true);

alter table public.mpesa_payments enable row level security;
create policy "Enable all for mpesa_payments" on public.mpesa_payments for all using (true) with check (true);

alter table public.daily_crate_stock enable row level security;
create policy "Enable all for daily_crate_stock" on public.daily_crate_stock for all using (true) with check (true);

-- In Supabase Dashboard → Database → Replication: enable these tables for
-- postgres_changes if you want live updates on all phones.
