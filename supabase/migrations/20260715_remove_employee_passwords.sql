-- Permanently remove legacy employee passwords and cached copies.
-- Run this migration in every Supabase project used by the workbook.

begin;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'employees'
      and column_name = 'password'
  ) then
    execute 'alter table public.employees drop column password';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'employee_audit_log'
      and column_name = 'field_name'
  ) then
    execute $cleanup_audit$
      delete from public.employee_audit_log
      where lower(coalesce(field_name, '')) like '%password%'
    $cleanup_audit$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ppe_compliance_state'
      and column_name = 'state'
      and data_type = 'jsonb'
  ) then
    execute $cleanup_roster$
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
        and jsonb_typeof(state -> 'employees') = 'array'
    $cleanup_roster$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conglobal_workbook_state'
      and column_name = 'state'
      and data_type = 'jsonb'
  ) then
    execute $cleanup_workbook$
      update public.conglobal_workbook_state
      set state = state
        - 'eit_emp_cache_v1'
        - 'eit_hist_v1'
        - 'eit_v1'
        - 'eit_employee_audit_log_v1'
    $cleanup_workbook$;
  end if;
end
$$;

commit;
