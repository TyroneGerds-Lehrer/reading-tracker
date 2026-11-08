create extension if not exists pgcrypto;
create or replace function public.touch() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text, preferred_theme text not null default 'light' check (preferred_theme in ('light','dark')),
  preferred_language text not null default 'de', timezone text not null default 'Europe/Berlin',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table public.books (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, author text not null default '', cover_url text, genre text, isbn text,
  total_pages int not null default 0 check (total_pages >= 0), current_page int not null default 0 check (current_page >= 0),
  publication_year int, start_date date, finish_date date,
  status text not null default 'wishlist' check (status in ('wishlist','reading','paused','abandoned','finished')),
  rating int check (rating between 1 and 5), notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (total_pages = 0 or current_page <= total_pages));

create table public.reading_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  session_date date not null, start_time timestamptz, end_time timestamptz,
  duration_minutes numeric not null check (duration_minutes >= 0),
  start_page int not null check (start_page >= 0), end_page int not null,
  pages_read int generated always as (end_page - start_page) stored, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (end_page >= start_page), check (end_time is null or start_time is null or end_time >= start_time));

create table public.reading_goals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  goal_type text not null check (goal_type in ('books_year','pages_year','pages_month','minutes_week','minutes_day','days_month')),
  target_value numeric not null check (target_value > 0), period text, start_date date, end_date date,
  created_at timestamptz not null default now());

create table public.notes (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid references public.books(id) on delete cascade, content text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create index on public.books (user_id, status);
create index on public.reading_sessions (user_id, session_date);
create index on public.reading_sessions (book_id);
create index on public.reading_goals (user_id);
create index on public.notes (user_id, book_id);

do $$ declare t text; c text; begin
  foreach t in array array['profiles','books','reading_sessions','reading_goals','notes'] loop
    c := case when t = 'profiles' then 'id' else 'user_id' end;
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (auth.uid() = %I)', t||'_sel', t, c);
    execute format('create policy %I on public.%I for insert with check (auth.uid() = %I)', t||'_ins', t, c);
    execute format('create policy %I on public.%I for update using (auth.uid() = %I) with check (auth.uid() = %I)', t||'_upd', t, c, c);
    execute format('create policy %I on public.%I for delete using (auth.uid() = %I)', t||'_del', t, c);
  end loop;
  foreach t in array array['profiles','books','reading_sessions','notes'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.touch()', t||'_touch', t);
  end loop;
end $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles (id, display_name) values (new.id, split_part(new.email,'@',1)) on conflict do nothing; return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.delete_my_account() returns void language plpgsql security definer set search_path = public, auth as $$
begin delete from auth.users where id = auth.uid(); end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
