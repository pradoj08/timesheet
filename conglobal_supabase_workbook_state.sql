-- Conglobal all-in-one workbook Supabase backing table.
-- Run this entire file once in the Supabase SQL Editor.
-- The workbook uses the anon/publishable key plus x-conglobal-sync-pin.

create extension if not exists pgcrypto;

create or replace function public.conglobal_request_header(header_name text)
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.headers', true), '')::jsonb ->> lower(header_name),
    ''
  );
$$;

create or replace function public.conglobal_request_pin_hash()
returns text
language sql
stable
as $$
  select encode(
    digest(public.conglobal_request_header('x-conglobal-sync-pin'), 'sha256'),
    'hex'
  );
$$;

create table if not exists public.conglobal_workbook_state (
  id uuid primary key default gen_random_uuid(),
  project_id text not null default 'settegast-main',
  state_key text not null default 'all-in-one',
  state jsonb not null default '{}'::jsonb,
  client_updated_at timestamptz,
  sync_pin_hash text not null default public.conglobal_request_pin_hash(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conglobal_workbook_state_project_key unique (project_id, state_key)
);

create index if not exists conglobal_workbook_state_lookup_idx
  on public.conglobal_workbook_state (project_id, state_key);

create or replace function public.conglobal_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists conglobal_workbook_state_set_updated_at
  on public.conglobal_workbook_state;

create trigger conglobal_workbook_state_set_updated_at
before update on public.conglobal_workbook_state
for each row
execute function public.conglobal_set_updated_at();

alter table public.conglobal_workbook_state enable row level security;

drop policy if exists "conglobal workbook select by sync pin"
  on public.conglobal_workbook_state;

create policy "conglobal workbook select by sync pin"
on public.conglobal_workbook_state
for select
to anon, authenticated
using (
  public.conglobal_request_header('x-conglobal-sync-pin') <> ''
  and sync_pin_hash = public.conglobal_request_pin_hash()
);

drop policy if exists "conglobal workbook insert by sync pin"
  on public.conglobal_workbook_state;

create policy "conglobal workbook insert by sync pin"
on public.conglobal_workbook_state
for insert
to anon, authenticated
with check (
  public.conglobal_request_header('x-conglobal-sync-pin') <> ''
  and sync_pin_hash = public.conglobal_request_pin_hash()
);

drop policy if exists "conglobal workbook update by sync pin"
  on public.conglobal_workbook_state;

create policy "conglobal workbook update by sync pin"
on public.conglobal_workbook_state
for update
to anon, authenticated
using (
  public.conglobal_request_header('x-conglobal-sync-pin') <> ''
  and sync_pin_hash = public.conglobal_request_pin_hash()
)
with check (
  public.conglobal_request_header('x-conglobal-sync-pin') <> ''
  and sync_pin_hash = public.conglobal_request_pin_hash()
);

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.conglobal_workbook_state to anon, authenticated;

-- Optional PIN rotation for one existing workbook row:
-- update public.conglobal_workbook_state
-- set sync_pin_hash = encode(digest('NEW PIN HERE', 'sha256'), 'hex')
-- where project_id = 'settegast-main' and state_key = 'all-in-one';
