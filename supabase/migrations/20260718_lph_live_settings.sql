-- Durable, cross-device LPH Tracker settings for the unified ConGlobal project.
-- Run after 20260717_supabase_compatibility.sql. This migration is idempotent
-- and preserves existing workbook, profile, report, and LPH data.

begin;

create table if not exists public.lph_live_settings (
  terminal_id text primary key,
  payload jsonb not null default '{}'::jsonb,
  client_updated_at timestamptz,
  updated_at timestamptz not null default now()
);

-- These two tables were used by the LPH page before the unified schema was
-- introduced. Track them here so saved profiles and trend reports use the same
-- protected Supabase project instead of an untracked legacy project.
create table if not exists public.rampiq_profiles (
  id text primary key,
  terminal_id text not null,
  name text not null default 'Unnamed profile',
  is_default boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.rampiq_reports (
  id text primary key,
  terminal_id text not null,
  saved_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Bring legacy/partially-created LPH tables up to the current contract without
-- deleting their existing rows.
alter table public.lph_live_settings add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.lph_live_settings add column if not exists client_updated_at timestamptz;
alter table public.lph_live_settings add column if not exists updated_at timestamptz not null default now();

alter table public.rampiq_profiles add column if not exists terminal_id text not null default 'settegast';
alter table public.rampiq_profiles add column if not exists name text not null default 'Unnamed profile';
alter table public.rampiq_profiles add column if not exists is_default boolean not null default false;
alter table public.rampiq_profiles add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.rampiq_profiles add column if not exists updated_at timestamptz not null default now();

alter table public.rampiq_reports add column if not exists terminal_id text not null default 'settegast';
alter table public.rampiq_reports add column if not exists saved_at timestamptz not null default now();
alter table public.rampiq_reports add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.rampiq_reports add column if not exists updated_at timestamptz not null default now();

create unique index if not exists lph_live_settings_terminal_idx
  on public.lph_live_settings (terminal_id);
create unique index if not exists rampiq_profiles_id_idx
  on public.rampiq_profiles (id);
create index if not exists rampiq_profiles_terminal_updated_idx
  on public.rampiq_profiles (terminal_id, updated_at desc);
create unique index if not exists rampiq_reports_id_idx
  on public.rampiq_reports (id);
create index if not exists rampiq_reports_terminal_saved_idx
  on public.rampiq_reports (terminal_id, saved_at desc);

do $$
declare
  table_name text;
  trigger_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'lph_live_settings', 'rampiq_profiles', 'rampiq_reports'
  ]
  loop
    trigger_name := table_name || '_touch_updated_at';
    execute format('drop trigger if exists %I on public.%I', trigger_name, table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.conglobal_touch_updated_at()',
      trigger_name, table_name
    );

    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', table_name);

    for policy_name in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy %I on public.%I', policy_name, table_name);
    end loop;

    execute format(
      'create policy "ConGlobal PIN read" on public.%I for select to anon, authenticated using ((select private.valid_conglobal_app_pin()))',
      table_name
    );
    execute format(
      'create policy "ConGlobal PIN insert" on public.%I for insert to anon, authenticated with check ((select private.valid_conglobal_app_pin()))',
      table_name
    );
    execute format(
      'create policy "ConGlobal PIN update" on public.%I for update to anon, authenticated using ((select private.valid_conglobal_app_pin())) with check ((select private.valid_conglobal_app_pin()))',
      table_name
    );
    execute format(
      'create policy "ConGlobal PIN delete" on public.%I for delete to anon, authenticated using ((select private.valid_conglobal_app_pin()))',
      table_name
    );
  end loop;
end
$$;

alter table public.conglobal_app_config
  alter column schema_version set default 3;

update public.conglobal_app_config
set schema_version = greatest(schema_version, 3),
    updated_at = now()
where id;

create or replace function public.conglobal_schema_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.valid_conglobal_app_pin() then
    raise insufficient_privilege using message = 'Invalid or missing ConGlobal sync PIN.';
  end if;
  return jsonb_build_object(
    'compatible', true,
    'schema_version', coalesce((
      select config.schema_version
      from public.conglobal_app_config config
      where config.id
      limit 1
    ), 3),
    'project', 'unified-conglobal',
    'lph_live_settings', true,
    'checked_at', now()
  );
end;
$$;

revoke all on function public.conglobal_schema_status() from public;
grant execute on function public.conglobal_schema_status() to anon, authenticated;

commit;
