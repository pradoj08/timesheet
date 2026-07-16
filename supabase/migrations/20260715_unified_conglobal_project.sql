-- Unified ConGlobal Supabase schema.
-- Target project: epthcamzzwegsdggrjgh
--
-- The shared app PIN is stored below only as a one-way bcrypt hash.
-- Enter the plain-text PIN in the workbook Cloud Setup screen.

begin;

create schema if not exists extensions;
create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.conglobal_app_config (
  id boolean primary key default true check (id),
  pin_hash text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.conglobal_workbook_state (
  project_id text not null,
  state_key text not null,
  state jsonb not null default '{}'::jsonb,
  client_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (project_id, state_key)
);

create table if not exists public.chassis_reconciliation_state (
  state_key text primary key,
  state_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.employees (
  id text primary key,
  employee_id text,
  first_name text not null default '',
  last_name text not null default '',
  up_id text not null default '',
  email text not null default '',
  shift text not null default 'Day',
  phone text not null default '',
  days_off text not null default '',
  status text not null default 'active',
  notes text not null default '',
  notes_edited_at timestamptz,
  notes_edited_by text not null default '',
  updated_at timestamptz not null default now(),
  last_edited_by text not null default ''
);

create table if not exists public.equipment (
  id text primary key,
  type text not null default 'Hostler',
  unit text not null default '',
  name text not null default '',
  tablet_assigned text not null default '',
  tablet text not null default '',
  assigned_to text not null default '',
  stays_charged text not null default 'pending',
  charged text not null default 'pending',
  status text not null default 'operational',
  notes text not null default '',
  updated_at timestamptz not null default now(),
  status_changed_at timestamptz,
  status_changed_day text
);

create table if not exists public.activity_log (
  id text primary key,
  category text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_edited_by text not null default ''
);

create table if not exists public.callouts (
  id text primary key default gen_random_uuid()::text,
  subject text not null,
  message text not null,
  priority text not null default 'normal',
  author text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.audit_roster_lists (
  id text primary key,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);

create table if not exists public.training_roster_lists (
  id text primary key,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);

create table if not exists public.ppe_compliance_state (
  id text primary key,
  state jsonb not null default '{}'::jsonb,
  history jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  last_edited_by text not null default ''
);

create table if not exists public.employee_audit_log (
  id text primary key default gen_random_uuid()::text,
  employee_id text,
  employee_name text,
  action text not null,
  field_name text,
  field_label text,
  old_value text,
  new_value text,
  changed_by text,
  changed_at timestamptz not null default now(),
  source text not null default 'supabase'
);

-- Bring partially-created tables up to the current column set without deleting data.
alter table public.conglobal_workbook_state add column if not exists state jsonb not null default '{}'::jsonb;
alter table public.conglobal_workbook_state add column if not exists client_updated_at timestamptz;
alter table public.conglobal_workbook_state add column if not exists updated_at timestamptz not null default now();
alter table public.chassis_reconciliation_state add column if not exists state_value jsonb not null default '{}'::jsonb;
alter table public.chassis_reconciliation_state add column if not exists updated_at timestamptz not null default now();

alter table public.employees add column if not exists employee_id text;
alter table public.employees add column if not exists first_name text not null default '';
alter table public.employees add column if not exists last_name text not null default '';
alter table public.employees add column if not exists up_id text not null default '';
alter table public.employees add column if not exists email text not null default '';
alter table public.employees add column if not exists shift text not null default 'Day';
alter table public.employees add column if not exists phone text not null default '';
alter table public.employees add column if not exists days_off text not null default '';
alter table public.employees add column if not exists status text not null default 'active';
alter table public.employees add column if not exists notes text not null default '';
alter table public.employees add column if not exists notes_edited_at timestamptz;
alter table public.employees add column if not exists notes_edited_by text not null default '';
alter table public.employees add column if not exists updated_at timestamptz not null default now();
alter table public.employees add column if not exists last_edited_by text not null default '';

alter table public.equipment add column if not exists type text not null default 'Hostler';
alter table public.equipment add column if not exists unit text not null default '';
alter table public.equipment add column if not exists name text not null default '';
alter table public.equipment add column if not exists tablet_assigned text not null default '';
alter table public.equipment add column if not exists tablet text not null default '';
alter table public.equipment add column if not exists assigned_to text not null default '';
alter table public.equipment add column if not exists stays_charged text not null default 'pending';
alter table public.equipment add column if not exists charged text not null default 'pending';
alter table public.equipment add column if not exists status text not null default 'operational';
alter table public.equipment add column if not exists notes text not null default '';
alter table public.equipment add column if not exists updated_at timestamptz not null default now();
alter table public.equipment add column if not exists status_changed_at timestamptz;
alter table public.equipment add column if not exists status_changed_day text;

create unique index if not exists conglobal_workbook_state_identity_idx
  on public.conglobal_workbook_state (project_id, state_key);
create unique index if not exists chassis_reconciliation_state_key_idx
  on public.chassis_reconciliation_state (state_key);
create unique index if not exists employees_id_idx on public.employees (id);
create unique index if not exists equipment_id_idx on public.equipment (id);
create unique index if not exists activity_log_id_idx on public.activity_log (id);
create unique index if not exists audit_roster_lists_id_idx on public.audit_roster_lists (id);
create unique index if not exists training_roster_lists_id_idx on public.training_roster_lists (id);
create unique index if not exists ppe_compliance_state_id_idx on public.ppe_compliance_state (id);
create index if not exists employees_name_idx on public.employees (last_name, first_name);
create index if not exists equipment_updated_at_idx on public.equipment (updated_at);
create index if not exists activity_log_created_at_idx on public.activity_log (created_at desc);
create index if not exists employee_audit_log_changed_at_idx on public.employee_audit_log (changed_at desc);

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
create trigger conglobal_workbook_touch_updated_at
before update on public.conglobal_workbook_state
for each row execute function public.conglobal_touch_updated_at();

create or replace function private.valid_conglobal_app_pin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conglobal_app_config config
    where config.id
      and config.enabled
      and extensions.crypt(
        coalesce(
          coalesce(
            nullif(current_setting('request.headers', true), ''),
            '{}'
          )::jsonb ->> 'x-conglobal-sync-pin',
          ''
        ),
        config.pin_hash
      ) = config.pin_hash
  );
$$;

revoke all on public.conglobal_app_config from anon, authenticated;
alter table public.conglobal_app_config enable row level security;
grant usage on schema private to anon, authenticated;
revoke all on function private.valid_conglobal_app_pin() from public;
grant execute on function private.valid_conglobal_app_pin() to anon, authenticated;

-- Replace every prior API policy on the unified tables with the shared-PIN policy.
do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'conglobal_workbook_state',
    'chassis_reconciliation_state',
    'employees',
    'equipment',
    'activity_log',
    'callouts',
    'audit_roster_lists',
    'training_roster_lists',
    'ppe_compliance_state',
    'employee_audit_log'
  ]
  loop
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

-- Populate the formal employee audit table without storing password fields.
create or replace function private.audit_employee_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  field_name text;
  old_row jsonb;
  new_row jsonb;
  editor text;
  employee_name text;
begin
  if tg_op = 'DELETE' then
    insert into public.employee_audit_log (
      employee_id, employee_name, action, changed_by, source
    ) values (
      old.employee_id,
      trim(concat_ws(' ', old.first_name, old.last_name)),
      'employee_deleted',
      coalesce(nullif(old.last_edited_by, ''), 'CONGLOBAL'),
      'employees_trigger'
    );
    return old;
  end if;

  editor := coalesce(nullif(new.last_edited_by, ''), 'CONGLOBAL');
  employee_name := trim(concat_ws(' ', new.first_name, new.last_name));

  if tg_op = 'INSERT' then
    insert into public.employee_audit_log (
      employee_id, employee_name, action, new_value, changed_by, source
    ) values (
      new.employee_id, employee_name, 'employee_created', employee_name, editor, 'employees_trigger'
    );
    return new;
  end if;

  old_row := to_jsonb(old);
  new_row := to_jsonb(new);
  foreach field_name in array array[
    'employee_id', 'first_name', 'last_name', 'up_id', 'email', 'shift',
    'phone', 'days_off', 'status', 'notes'
  ]
  loop
    if (old_row -> field_name) is distinct from (new_row -> field_name) then
      insert into public.employee_audit_log (
        employee_id, employee_name, action, field_name, field_label,
        old_value, new_value, changed_by, source
      ) values (
        new.employee_id,
        employee_name,
        'employee_updated',
        field_name,
        initcap(replace(field_name, '_', ' ')),
        old_row ->> field_name,
        new_row ->> field_name,
        editor,
        'employees_trigger'
      );
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists employee_audit_change_trigger on public.employees;
create trigger employee_audit_change_trigger
after insert or update or delete on public.employees
for each row execute function private.audit_employee_change();

-- Permanently remove the obsolete employee password column and cached password snapshots.
alter table public.employees drop column if exists password;
delete from public.employee_audit_log
where lower(coalesce(field_name, '')) like '%password%';

update public.ppe_compliance_state
set state = jsonb_set(
  state,
  '{employees}',
  coalesce(
    (
      select jsonb_agg(employee - 'password' - 'userPassword' - 'user_password')
      from jsonb_array_elements(state -> 'employees') as employee
    ),
    '[]'::jsonb
  )
)
where id = 'employee_roster'
  and jsonb_typeof(state -> 'employees') = 'array';

update public.conglobal_workbook_state
set state = state
  - 'eit_emp_cache_v1'
  - 'eit_hist_v1'
  - 'eit_v1'
  - 'eit_employee_audit_log_v1';

-- Bcrypt hash of the configured shared app PIN. The plaintext PIN is not committed.
do $$
declare
  app_pin_hash text := '$2a$12$JA1tL6fGNQ0kj.gfJTMrg.lv.pJ0vnWgWjqfVy/wIcFuOMIUouMku';
begin
  insert into public.conglobal_app_config (id, pin_hash, enabled, updated_at)
  values (true, app_pin_hash, true, now())
  on conflict (id) do update
  set pin_hash = excluded.pin_hash,
      enabled = true,
      updated_at = now();
end
$$;

-- Equipment uses Supabase Realtime in the Audits page.
do $$
begin
  alter publication supabase_realtime add table public.equipment;
exception
  when duplicate_object then null;
end
$$;

commit;
