-- Idempotent compatibility upgrade for existing unified ConGlobal projects.
-- Run this after 20260715_unified_conglobal_project.sql. It preserves data.

begin;

create schema if not exists extensions;
create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;

alter table public.conglobal_app_config add column if not exists schema_version integer not null default 2;

alter table public.activity_log add column if not exists category text not null default 'general';
alter table public.activity_log add column if not exists message text not null default '';
alter table public.activity_log add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.activity_log add column if not exists created_at timestamptz not null default now();
alter table public.activity_log add column if not exists last_edited_by text not null default '';

alter table public.callouts add column if not exists subject text not null default '';
alter table public.callouts add column if not exists message text not null default '';
alter table public.callouts add column if not exists priority text not null default 'normal';
alter table public.callouts add column if not exists author text not null default '';
alter table public.callouts add column if not exists created_at timestamptz not null default now();
alter table public.callouts alter column id set default extensions.gen_random_uuid()::text;

alter table public.audit_roster_lists add column if not exists items jsonb not null default '[]'::jsonb;
alter table public.audit_roster_lists add column if not exists updated_at timestamptz not null default now();
alter table public.audit_roster_lists add column if not exists updated_by text not null default '';

alter table public.training_roster_lists add column if not exists items jsonb not null default '[]'::jsonb;
alter table public.training_roster_lists add column if not exists updated_at timestamptz not null default now();
alter table public.training_roster_lists add column if not exists updated_by text not null default '';

alter table public.ppe_compliance_state add column if not exists state jsonb not null default '{}'::jsonb;
alter table public.ppe_compliance_state add column if not exists history jsonb not null default '{}'::jsonb;
alter table public.ppe_compliance_state add column if not exists updated_at timestamptz not null default now();
alter table public.ppe_compliance_state add column if not exists last_edited_by text not null default '';

alter table public.employee_audit_log add column if not exists employee_id text;
alter table public.employee_audit_log add column if not exists employee_name text;
alter table public.employee_audit_log add column if not exists action text not null default '';
alter table public.employee_audit_log add column if not exists field_name text;
alter table public.employee_audit_log add column if not exists field_label text;
alter table public.employee_audit_log add column if not exists old_value text;
alter table public.employee_audit_log add column if not exists new_value text;
alter table public.employee_audit_log add column if not exists changed_by text;
alter table public.employee_audit_log add column if not exists changed_at timestamptz not null default now();
alter table public.employee_audit_log add column if not exists source text not null default 'supabase';
alter table public.employee_audit_log alter column id set default extensions.gen_random_uuid()::text;

create or replace function public.conglobal_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists conglobal_workbook_touch_updated_at on public.conglobal_workbook_state;

do $$
declare
  table_name text;
  trigger_name text;
begin
  foreach table_name in array array[
    'conglobal_workbook_state', 'chassis_reconciliation_state', 'employees', 'equipment',
    'audit_roster_lists', 'training_roster_lists', 'ppe_compliance_state'
  ]
  loop
    trigger_name := table_name || '_touch_updated_at';
    execute format('drop trigger if exists %I on public.%I', trigger_name, table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.conglobal_touch_updated_at()',
      trigger_name, table_name
    );
  end loop;
end
$$;

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
    'schema_version', 2,
    'project', 'unified-conglobal',
    'checked_at', now()
  );
end;
$$;

revoke all on function public.conglobal_schema_status() from public;
grant execute on function public.conglobal_schema_status() to anon, authenticated;

create or replace function public.replace_conglobal_equipment(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_count integer;
begin
  if not private.valid_conglobal_app_pin() then
    raise insufficient_privilege using message = 'Invalid or missing ConGlobal sync PIN.';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Equipment replacement requires a non-empty JSON array.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) item
    where nullif(btrim(item ->> 'id'), '') is null
  ) then
    raise exception 'Every equipment row requires a non-empty id.';
  end if;

  insert into public.equipment (
    id, type, unit, name, tablet_assigned, tablet, assigned_to,
    stays_charged, charged, status, notes, updated_at,
    status_changed_at, status_changed_day
  )
  select
    id, coalesce(type, 'Hostler'), coalesce(unit, ''), coalesce(name, ''),
    coalesce(tablet_assigned, ''), coalesce(tablet, ''), coalesce(assigned_to, ''),
    coalesce(stays_charged, 'pending'), coalesce(charged, 'pending'),
    coalesce(status, 'operational'), coalesce(notes, ''), coalesce(updated_at, now()),
    status_changed_at, status_changed_day
  from jsonb_to_recordset(p_rows) as incoming(
    id text, type text, unit text, name text, tablet_assigned text, tablet text,
    assigned_to text, stays_charged text, charged text, status text, notes text,
    updated_at timestamptz, status_changed_at timestamptz, status_changed_day text
  )
  on conflict (id) do update set
    type = excluded.type, unit = excluded.unit, name = excluded.name,
    tablet_assigned = excluded.tablet_assigned, tablet = excluded.tablet,
    assigned_to = excluded.assigned_to, stays_charged = excluded.stays_charged,
    charged = excluded.charged, status = excluded.status, notes = excluded.notes,
    updated_at = excluded.updated_at, status_changed_at = excluded.status_changed_at,
    status_changed_day = excluded.status_changed_day;

  delete from public.equipment existing
  where not exists (
    select 1 from jsonb_array_elements(p_rows) item
    where item ->> 'id' = existing.id
  );
  select count(*)::integer into row_count from public.equipment;
  return row_count;
end;
$$;

revoke all on function public.replace_conglobal_equipment(jsonb) from public;
grant execute on function public.replace_conglobal_equipment(jsonb) to anon, authenticated;

update public.conglobal_app_config
set schema_version = 2,
    updated_at = now()
where id;

do $$
begin
  alter publication supabase_realtime add table public.equipment;
exception
  when duplicate_object then null;
end
$$;

commit;
