# Mori UP Mismatch Download

This Edge helper uses the official **Export to Excel** control on the already
signed-in UP Mismatches page. It supports:

- **Export Now** for a manual download.
- Scheduled mismatch, AlertMeter, and Yard Check runs are configured in Pearl.io; the extension only executes the authenticated browser step.

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

The manual **Send Yard Check Now** action uses the signed-in UP Yard Check
route. It enters yard `B 372`, selects Container, Trailer, Arrivals, Other
Movement, and Yard Check, clears Chassis, applies a `>= 12 hours` lookback, and sends a cropped
visible-page screenshot through YardMate. The extension requires its declared all-sites
capture permission because Pearl-triggered and scheduled screenshots do not receive Edge's
temporary `activeTab` permission.
