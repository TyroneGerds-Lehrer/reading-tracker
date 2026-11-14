-- Spielelemente: Ereignisse für Abzeichen-Daten, Level, Streak-Schutz (Schilde, Pausenmodus) und Überraschungen.
-- Im Supabase-SQL-Editor einmal komplett ausführen (New query -> einfügen -> Run).
create table public.game_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('start','badge','reward','freeze','pause','level')),
  key text not null,
  event_date date not null,
  end_date date,
  amount int not null default 0,
  data jsonb,
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= event_date));
create index on public.game_events (user_id, kind);
alter table public.game_events enable row level security;
create policy game_events_sel on public.game_events for select using (auth.uid() = user_id);
create policy game_events_ins on public.game_events for insert with check (auth.uid() = user_id);
create policy game_events_upd on public.game_events for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy game_events_del on public.game_events for delete using (auth.uid() = user_id);
