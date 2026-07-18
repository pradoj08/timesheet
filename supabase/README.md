# ConGlobal Supabase setup

This workbook uses one Supabase project for workbook snapshots, Chassis Status, Audits, employees, equipment, rosters, callouts, PPE state, and audit history.

## Existing project

Run these files in the Supabase SQL Editor in order:

1. `migrations/20260715_unified_conglobal_project.sql` if the unified schema has never been installed.
2. `migrations/20260715_remove_employee_passwords.sql` if an older employee table may still contain password data.
3. `migrations/20260717_supabase_compatibility.sql` for the current schema-version check, atomic equipment replacement, timestamp triggers, and drift corrections.

All migrations are designed to be rerunnable. The compatibility migration preserves existing rows and does not reset tables.

## Browser setup

Open **Cloud Setup**, enter the shared PIN, and save. The workbook, Chassis Status, and Audits clients all read the same browser key: `conglobal-supabase-sync-pin`.

The browser uses the public project key plus the PIN-protected RLS policies. Never put a Supabase secret/service-role key in the HTML.

## Compatibility test

The workbook and Chassis Status call `conglobal_schema_status()`. A project is compatible when it reports schema version `2`. If the UI says to run the compatibility SQL, run the newest migration above before retrying.

Equipment replacement uses `replace_conglobal_equipment(jsonb)` so an import is committed atomically. The Audits equipment view uses 15-second polling when no Supabase Auth session exists; the custom PIN header only applies to HTTP requests and is not treated as a Realtime JWT.
