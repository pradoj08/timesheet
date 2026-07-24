# Mori UP Mismatch Download

This Edge helper uses the official **Export to Excel** control on the already
signed-in UP Mismatches page. It supports:

- **Export Now** for a manual download.
- An optional automatic export every 15 minutes while Edge is running.

The helper does not inspect or change filters. It selects one matching
Mismatches tab, refreshes it, waits for the equipment table, prevents
overlapping exports, and then clicks the official export.
Before exporting, it verifies that the refreshed page footer timestamp is
current. YardMate Agent rejects any Excel file that predates that verified
refresh, so an older download cannot be reused for a new preview or push alert.
If the tab is closed, it can reopen the last Mismatches URL using the existing
Edge login session.

It does not parse rows, store Pushover credentials, create alerts, or send
table data. YardMate Agent handles those actions after the `.xls` file arrives
in Downloads.
