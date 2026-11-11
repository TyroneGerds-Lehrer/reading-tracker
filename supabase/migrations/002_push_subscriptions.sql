create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique, p256dh text not null, auth text not null,
  remind_time text not null default '19:00' check (remind_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  timezone text not null default 'Europe/Berlin', last_sent date,
  created_at timestamptz not null default now());
create index on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy push_sel on public.push_subscriptions for select using (auth.uid() = user_id);
create policy push_ins on public.push_subscriptions for insert with check (auth.uid() = user_id);
create policy push_upd on public.push_subscriptions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy push_del on public.push_subscriptions for delete using (auth.uid() = user_id);
