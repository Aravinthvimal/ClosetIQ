-- ClosetIQ — Supabase Schema
-- Run this in Supabase Dashboard → SQL Editor → New Query → Run

-- Items table
create table if not exists items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  category text not null check (category in ('shirt','tshirt','dress','pants','shoes','watch','accessory')),
  occasions text[] default '{}',
  notes text default '',
  img text default null,
  created_at timestamp with time zone default now()
);

-- Combinations (outfits) table
create table if not exists combos (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  items uuid[] default '{}',
  occasion text not null,
  pinned boolean default false,
  created_at timestamp with time zone default now()
);

-- Daily journal table
create table if not exists journal (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  date date not null default current_date,
  combo_id uuid references combos(id) on delete set null,
  combo_name text,
  occasion text,
  items uuid[] default '{}',
  created_at timestamp with time zone default now()
);

-- Row Level Security (users see only their own data)
alter table items   enable row level security;
alter table combos  enable row level security;
alter table journal enable row level security;

create policy "Users see own items"   on items   for all using (auth.uid() = user_id);
create policy "Users see own combos"  on combos  for all using (auth.uid() = user_id);
create policy "Users see own journal" on journal for all using (auth.uid() = user_id);

-- For testing WITHOUT auth (anon access) — remove these if you add auth:
create policy "Anon read items"   on items   for select using (true);
create policy "Anon write items"  on items   for all    using (true) with check (true);
create policy "Anon read combos"  on combos  for select using (true);
create policy "Anon write combos" on combos  for all    using (true) with check (true);
create policy "Anon read journal" on journal for select using (true);
create policy "Anon write journal"on journal for all    using (true) with check (true);
