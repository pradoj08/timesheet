# TIMESHEET CONGLOBAL — Continuation Handoff

**Prepared:** 2026-07-27 (America/Chicago)

## Resume prompt

Continue in `C:\Users\prado\OneDrive\Documentos\TIMESHEET CONGLOBAL`. Read `AGENTS.md` and this `HANDOFF.md` first. Run `git status -sb`, inspect the diff, and preserve all existing user changes. The active runtime is the root `index.html`; do not run `build-combined.js` unless the embedded page and source files have been reconciled first.

## Repository state

- Branch: `codex/am-report-workbook-updates`
- Remote tracking: `origin/codex/am-report-workbook-updates`
- Last pushed commit: `4947d41 Improve billing shift grid and chassis refresh`
- Current working-tree changes (not committed or pushed):
  - `audits-page.html`
  - `index.html`
  - `test-assistant-foundation.cjs`
- Existing untracked local/debug artifacts (do not stage):
  - `.codex-tmp-timesheet-debug/`
  - `.codex-tracklist-server.js`

## Latest completed fix

User report: clearing Audits monthly-training data switched the visible training panel to the Timesheet view. The requested behavior is to remain on the current view; when opened normally, that means remaining on the default Course Board.

Changes made:

- `audits-page.html`: removed the `window.monthlyTrainingViewMode = 'timesheet';` assignment from `clearAllMonthlyTrainings()`.
- `index.html`: added the idempotent runtime transformer `withAuditsClearKeepsView(html)` and applied it for the `audits` page in `bridgedHtmlForPage()`. This protects the combined workbook runtime even if the embedded Audits HTML still contains the old assignment.
- The transformer uses marker `audits-clear-keeps-view-v1`, scopes the replacement to `clearAllMonthlyTrainings`, and leaves the explicit Timesheet toggle/print controls unchanged.

Expected result: click Clear All, confirm the action, and the data clears without changing the Audits presentation mode. The default Course Board remains the default after a fresh Audits page load.

## Latest active-workbook removal

The embedded YardMate operations assistant panel was removed from the active root `index.html`, including its styles, mount/knowledge payload, runtime, navigation hooks, and child-page context bridge. The standalone assistant source files and the separate `yardmate-agent/` desktop/extension remain available but are no longer injected into the active workbook. The assistant foundation test now verifies both source integrity and an assistant-free active workbook.

## Validation already run

- `git diff --check` passed.
- Active workbook assistant markers/references are absent; the executable outer script compiled successfully.
- `node test-assistant-foundation.cjs` passed with the active workbook assistant-free.
- `audits-page.html` executable scripts compiled successfully (13 scripts checked).
- The new root transformer compiled successfully.
- Extracted the embedded `pages.audits.html` from `index.html` and exercised the transformer:
  - marker inserted;
  - clear function no longer contains the forced Timesheet assignment;
  - explicit `toggleMonthlyTrainingTimesheet()` remains available.

Browser visual validation was not automated because local `file://` navigation/control is restricted. Manually refresh the workbook, open Audits, use Clear All twice (confirmation flow), and verify the view stays Course Board/current mode.

## Important project conventions

- Root `index.html` is the protected combined workbook and the file users normally open.
- Page sources such as `audits-page.html`, `billing-page.html`, `excel-view-page.html`, `lph-tracker-page.html`, and `pearl-page.html` are readable/editable sources but are not automatically authoritative for the combined runtime.
- Runtime `with...` transformers are intentionally used for combined-only behavior. Keep new transformers uniquely marked, idempotent, narrowly scoped, and applied in the correct `bridgedHtmlForPage()` branch.
- Preserve storage keys, postMessage payloads, Supabase bridges, iframe synchronization, and existing persistence behavior.
- Do not stage debug artifacts, downloaded workbooks, credentials, cookies, or generated installers.
- Commit/push only after the user explicitly requests it; before publishing, inspect the staged diff and confirm the branch/remote.

## Focused regression checks for the next contributor

1. Audits: default Course Board loads; Clear All uses inline confirmation and does not change view; explicit Timesheet/Matrix/Course Board controls still work.
2. AM Report: roster, SCW, Checklist stacking, and deferred third-day loading remain intact.
3. Billing: shift grid and 8-person day selector still render.
4. Excel/Chassis/LPH: do not rebuild or synchronize page sources broadly; run only targeted checks for any requested change.
5. Run `git diff --check` and the relevant JavaScript extraction/syntax checks before handoff.
