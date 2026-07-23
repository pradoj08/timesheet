# Mori UP Mismatch Download

This Edge helper uses the official **Export to Excel** control on the already
signed-in UP Mismatches page. It supports:

- **Export Now** for a manual download.
- An optional automatic export every 15 minutes while Edge is running.

The helper does not inspect or change filters. It selects one matching
Mismatches tab, refreshes it, waits for the equipment table, prevents
overlapping exports, and then clicks the official export.
If the tab is closed, it can reopen the last Mismatches URL using the existing
Edge login session.

It does not parse rows, store Pushover credentials, create alerts, or send
table data. YardMate Agent handles those actions after the `.xls` file arrives
in Downloads.
