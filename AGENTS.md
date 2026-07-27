# TIMESHEET CONGLOBAL - Codex Instructions

## Scope

- These instructions apply to the entire repository.
- Keep this file accurate and operationally useful. Update it when workbook architecture, shared state, companion-agent behavior, validation, or release procedures change.
- Follow explicit user instructions when they intentionally override a repository convention.

## Quick start for a new Codex chat

1. Read this file and the point-in-time `HANDOFF.md`.
2. Run `git status -sb`, `git log -5 --oneline --decorate`, and `git diff --stat`.
3. Treat every existing modification as user work. Do not reset, replace, rebuild, stage, or commit it until its scope is understood.
4. Confirm the active branch and whether it tracks `origin`.
5. Locate the requested behavior in both the protected root `index.html` runtime and its likely `*-page.html` source.
6. Decide explicitly whether to change the runtime only, the page source only, or both. Prefer both when they can be kept aligned without overwriting combined-only behavior.
7. Make a targeted patch, run the relevant validation matrix below, and report any intentional source/runtime divergence.
8. Commit and push only when the user explicitly asks. A request to edit or test does not authorize publishing.

## Project overview

- This project is a multi-page operational workbook delivered primarily as a self-contained HTML file.
- `index.html` is the active workbook the user opens in the browser.
- Page-level implementations are stored in root files such as `excel-view-page.html`, `am-report-page.html`, `lph-tracker-page.html`, and the other `*-page.html` files.
- `build-combined.js` assembles page sources into combined workbook outputs.
- `sync-workbook-pages.cjs` and `adopt-workbook-baseline.cjs` support controlled source/baseline reconciliation; inspect their effects before running them.
- `GITHUB UPLOAD - ONE FILE/index.html` is a separate single-file distribution copy.
- Supabase-related database files and migrations live under `supabase/`.
- `yardmate-agent/` is a separate Electron companion application. Its `edge-extension/` helper refreshes the signed-in UP Mismatches page and invokes the official Excel export; the desktop agent watches Downloads, parses the workbook, renders the equipment-status image, and can send Pushover alerts.

## Runtime architecture

### Protected combined workbook

- The browser opens root `index.html`. It contains the application shell, navigation, bridge code, a large embedded `pages` object, page-specific transformation functions, and iframe orchestration.
- Embedded page IDs currently include:
  - `amReport`
  - `chassisStatus`
  - `excelView`
  - `timeMd`
  - `billing`
  - `lphTracker`
  - `matrixWide`
  - `obsidian`
  - `pearl`
  - `audits`
  - `checklist`
  - `performance`
  - `roster`
  - `archive`
  - `timeOff`
  - `time`
- `bridgedHtmlForPage(id)` is the important runtime composition boundary. It takes the embedded page HTML, applies page-specific `with...` transformations, injects shared workbook synchronization, and returns the document loaded into the iframe.
- Many user-facing fixes exist as `with...` functions in `index.html` rather than in the corresponding page source. Examples include AM roster/SCW behavior, Excel persistence and Yard/Pierce parity, Chassis shortage allocation, LPH controls, and Pearl/AlertMeter controls.
- Do not blindly replace the embedded page string or transformer chain. A syntactically valid replacement can still silently remove later transformation behavior.
- When adding a new transformer:
  - Give it a unique marker so repeat application is harmless.
  - Return unchanged HTML when the marker is already present.
  - Insert controls only when their IDs are absent.
  - Apply it in the correct order inside `bridgedHtmlForPage`.
  - Verify every expected ID and marker occurs exactly once in the transformed result.

### Page source files

- Root page files are readable/editable sources and references, but they are not automatically authoritative for the combined workbook.
- Important mappings:

| Runtime page | Likely source file | Notes |
| --- | --- | --- |
| AM Report | `am-report-page.html` | Runtime has substantial combined-only roster, SCW, weather, import, and performance patches. |
| Chassis Status | `chassis-status-page.html` | Forecast allocation and floating editor behavior are regression-sensitive. |
| Excel View | `excel-view-page.html` | Inbounds, archives, Yard/Pierce, dwell, meeting boards, and fourth table are tightly coupled. |
| Timesheet | `timesheet-md-page.html` | Schedule, Archive, Full View, and Quick Actions share state and styles. |
| LPH Tracker | `lph-tracker-page.html` | Inputs, work-plan ordering, profiles, and inbound selection interact. |
| Billing | `billing-page.html` | Monthly header is intentionally removed at runtime. |
| Matrix | `matrix-wide-page.html` / `matrix-page.html` | Top navigation presents Matrix variants as a dropdown. |
| Checklist | `checklist-page.html` | Must render above SCW when opened from AM Report. |
| Pearl.io | `pearl-page.html` | Mori controls, schedules, AlertMeter preview, cloud/browser navigation. |
| Audits | `audits-page.html` | Large embedded operational page. |
| Roster | `roster-page.html` | Shared schedule persistence behavior. |
| Archive | `archive-page.html` | Mass import is patched at runtime. |
| Time Off | `time-off-page.html` | Shares roster snapshot and status behavior. |

### Build and reconciliation utilities

- `build-combined.js` assembles page sources, but using it against the current baseline can overwrite newer combined-only work.
- `sync-workbook-pages.cjs` and `adopt-workbook-baseline.cjs` are controlled reconciliation tools, not routine edit commands.
- Before running any of them:
  1. inspect their arguments and output targets;
  2. compare the relevant embedded page with the page source;
  3. create a recoverable checkpoint if the user authorizes it;
  4. inspect the complete generated diff;
  5. re-run the regression matrix.
- `GITHUB UPLOAD - ONE FILE/index.html` is a separate release artifact. Do not assume it should match root `index.html` unless the user requests a release synchronization.

## Current runtime feature map

- The top workbook navigation uses grouped dropdowns for AM Report/Chassis Status, Matrix variants, and Pearl.io/Cloud/Web Browser destinations.
- AM Report is a three-column workspace. The default presentation uses the floating current-day roster on the left, the current report in the middle, and the floating Space City Weather latest-post panel over the third column.
- The AM current-day roster must mirror the Timesheet Full View TODAY roster. It uses the same current-day status, role, schedule, time-off, and punch data; default off-schedule employees are hidden, active assignments are ordered consistently, and totals count visible working employees.
- AM roster rows open the shared Quick Actions workflow. The roster Reset control uses inline two-click confirmation and clears only current-day Quick Action overrides before rebuilding from schedule defaults.
- Space City Weather supports refresh and push-alert actions. Keep article content separate from advertising and comments. The Checklist contained popup must stack above the SCW panel.
- Timesheet Schedule, Archive, Sign-Off, Full View, Timesheet, and Old View are interdependent. Treat Schedule/Archive styling and Full View roster behavior as regression-sensitive whenever shared Timesheet HTML or CSS changes.
- Excel View includes persistent inbound records and archive records, archive export/import save points, editable/restorable archived inbounds, a fourth optional table, block glow/assignment controls, and future-dwell calculations.
- Excel Yard/Pierce classifies `06-xxx` tracks as Yard and `03-xxx` tracks as Pierce. Both views consolidate compatible adjacent/like blocks using the table logic, retain normal block proportions, and display dwell/SS details. Do not allow Pierce parsing changes to break Table 1 population.
- Chassis Forecast shortage flags allocate available supply to mismatches first and then to inbound demand. Do not flag TOTAL rows; mismatch demand participates in allocation, and shortage markers must not disturb centered values.
- Pearl.io contains Mori equipment-status controls, Cloud access, and an in-app four-window browser. Browser iframe previews remain subject to external sites' framing policies.

## Cross-page messaging and synchronization

- The shell and embedded pages communicate through `postMessage`, storage events, and shared browser storage.
- Preserve message names and payload shapes. Treat them as APIs even when they are not documented elsewhere.
- Important AM messages include roster-opening/synchronization and third-column visibility signals. The current runtime uses `conglobal-am-third-day-visibility` to load the third report frame only when it becomes visible.
- Page navigation often destroys and recreates iframes. Features that must survive page changes need persistent state plus rehydration hooks; keeping only in-memory variables is insufficient.
- Mutation observers must be bounded to the smallest useful container and debounced. Avoid full-document observers that repeatedly rescan every iframe or large report table.
- Prefer one scheduled refresh or one active render loop per feature. Guard iframe `load` listeners and observers with markers or stored references so reopening a page does not multiply handlers.

## Current source-of-truth rule

- Treat the root `index.html` as the protected runtime baseline unless the user explicitly selects another file or the page sources have been reconciled with it.
- The current baseline was adopted from a newer user-supplied combined workbook and may contain features that are not present in the individual page source files.
- The active baseline currently has combined-only patches for AM roster/SCW behavior, Checklist stacking, Excel inbound archive save points, Yard/Pierce presentation, Pearl navigation/browser behavior, and related fixes. Do not assume the matching `*-page.html` files contain these changes.
- Do not run `build-combined.js` over the active workbook merely because a page source changed.
- Before rebuilding, compare the active combined workbook with the relevant page source and confirm that newer combined-only features will be preserved.
- When a task changes only `index.html`, clearly report that the change has not yet been backported to the corresponding page source.
- When the page sources become authoritative again, update this section as part of that reconciliation.

## Shared state contracts

- Schedule and AM roster features intentionally share these `localStorage` contracts:
  - `conglobal-time-off-calendar-v1`
  - `conglobal-time-off-day-status-v1`
  - `conglobal-dayforce-punches-v1`
  - `conglobal-three-day-yard-crew-v1`
  - `conglobal-current-day-roster-snapshot-v1`
- Current-day roster Reset may delete today's entries from the shared status, punch, and role contracts, plus Quick Action-created `List Status` time-off entries. It must preserve unrelated dates and manually imported operational data.
- Excel inbound records, archived inbounds, table state, block assignments, and visual preferences are persistent operational state. Preserve their existing keys and shapes, including when adding export/import formats.
- Supabase and workbook messaging bridge data across embedded page iframes. Preserve message names, storage events, and iframe synchronization unless a coordinated migration is explicitly requested.

## Operational page invariants

### AM Report

- Default layout expectations:
  - current-day roster visible/floating on the left;
  - current report in the middle;
  - Space City Weather floating over the third column;
  - Show Third Day restores/loads the third report when selected.
- The roster is not an independent hard-coded list. It must derive from the Timesheet Full View TODAY state and keep Quick Actions functional.
- Clicking Today’s Roster must not replace fresh three-day data with an older snapshot.
- Roster Reset is scoped: clear current-day Quick Action overrides, then rebuild from schedule defaults. It must not clear unrelated dates.
- Middle-report Copy must continue to copy `A1:B71`.
- SCW should show the latest article body and useful images, excluding ads and comments. Push output should not overlap title/category text.
- Checklist, audits, imports, and Quick Actions are overlays. Their stacking order must remain above SCW when active.
- Performance work should prioritize the visible current report, defer hidden day frames, use cached SCW content immediately, and avoid repeated full-document scans.

### Timesheet

- Schedule, Archive, Sign-Off, Full View, Timesheet, and Old View share HTML, data, and styles.
- The current-day roster in Full View is the reference presentation for the AM floating roster.
- Quick Actions changes must persist across refreshes and page swaps.
- Timesheet Archive snapshots are stored in IndexedDB database `conglobal-timesheet-archive-db-v1`; the legacy `conglobal-timesheet-archive-v1` localStorage value is a migration source and is removed only after a successful IndexedDB save.
- CSS accidentally emitted as text is a known catastrophic regression pattern. After changing shared Timesheet markup or style insertion, visually verify Schedule, Archive, and Full View.

### Excel View

- Table 1 population is foundational. Parsing or Yard/Pierce changes must not cause it to become empty.
- Yard/Pierce classification:
  - `06-xxx` is Yard;
  - `03-xxx` is Pierce;
  - source columns may arrive as separate Yard and Track numbers such as `3` and `24`, which must normalize to a Pierce track.
- Compatible like blocks should consolidate using the same logic as the primary tables; row height should match actual one-line/two-line block content.
- Inbound records and archived inbounds must survive iframe recreation and browser refresh.
- Gold inbound highlighting applies only to the intended inbound blocks added through the designated workflow.
- Future dwell at 20:30 always means 20:30 today. Preserve the special SS calculation and optional breakdown display.
- Morning and Afternoon Meeting boards are separate persistent boards. Push-alert/export behavior must capture the intended popup, not a blank or hidden clone.

### Chassis Status

- Shortage allocation order is: current inventory covers mismatch demand first, then inbound demand in operational order.
- Red shortage X markers belong on affected demand values, not TOTAL rows, and must not move the numeric value off center.
- Chassis Forecast uses a white canvas; keep surrounding navigation and settings readable.
- Floating chassis editors should confirm saves and remain movable without obscuring live updates.

### LPH Tracker

- Inbound count controls must show the requested number of train cards and work when Excel View has no inbound records.
- Carry-over work begins at 03:00.
- Shift work-plan Reset uses inline confirmation and resets values to blank when that is the active specification.
- Profiles belong at the end of the input flow and default collapsed.
- Avoid old-display flashes: initialize current state before revealing expensive cards and do not start duplicate render loops.

### Pearl.io, Mori, and AlertMeter

- Pearl’s main control surface groups actions by purpose: Automation, Mismatch Alert, AlertMeter, and Tools.
- Keep button IDs and the local-agent API behavior stable when changing labels/layout.
- The schedule dashboard reports whether retrieval is active and shows countdowns for the next mismatch and AlertMeter checks.
- AlertMeter flow refreshes the signed-in page, reads participation, and:
  - uses a green success result when participation is 100%;
  - when participation is below 100%, selects the No Test Taken slice/filter, captures the filtered names, and pushes the cropped result;
  - runs its configured automatic checks without requiring one manual extension run first, provided the signed-in target page and extension are available.
- An iframe cannot bypass a website’s `X-Frame-Options` or CSP. Use the extension/desktop agent for authenticated external pages rather than attempting to force them into Pearl’s in-app browser.

## Before editing

- Run `git status -sb` and inspect the relevant diff or files.
- Preserve unrelated user changes and untracked files.
- Determine whether the requested behavior belongs in a page source, the combined workbook, or both.
- When the user supplies a replacement HTML workbook, compare it with the active `index.html` before adopting it.
- Do not assume `index.html` and `GITHUB UPLOAD - ONE FILE/index.html` should be synchronized unless the user requests a release copy or the current workflow requires it.

## Editing rules

- Use patch-style edits for deliberate source changes.
- Make the smallest safe change that satisfies the request.
- Preserve the existing visual language and operational behavior unless redesign is requested.
- Avoid rewriting large generated or embedded sections when a targeted patch is possible.
- Do not introduce containers, frameworks, package managers, or dependencies unless requested or clearly necessary.
- Never add secrets, private credentials, access tokens, or operational PINs to tracked files.

## UI behavior

- Destructive UI actions should use an inline two-click confirmation when practical.
- On the first click, change the button text and appearance to communicate the pending destructive action.
- Require a second click to execute the action and expire the confirmation automatically after a short interval.
- Do not use a browser-native `confirm()` dialog when the established inline confirmation pattern is available.
- Preserve keyboard accessibility, visible focus behavior, and meaningful button labels.

## Data and persistence safety

- Preserve existing `localStorage`, IndexedDB, workbook synchronization, and Supabase data contracts unless the user explicitly requests a migration.
- Avoid silently renaming storage keys or changing stored object shapes.
- Treat production or shared remote data as read-only unless the user explicitly requests a write operation.
- Inspect and preview remote changes when supported before performing destructive or irreversible operations.
- Do not clear operational data as part of testing.
- Never use live operational storage as disposable test data. Prefer static fixtures, isolated temporary profiles, or read-only inspection.
- Never commit Pushover user keys, application tokens, Supabase PINs, authenticated cookies, downloaded operational reports, or other credentials. YardMate secrets belong in its local settings, not tracked source.

## YardMate and Mori workflow

- YardMate Agent supports Windows and macOS from the same Electron source. Windows releases use the NSIS target for `x64` and `arm64`; macOS releases produce DMG and ZIP artifacts for both Apple Silicon (`arm64`) and Intel (`x64`).
- Build platform installers from `yardmate-agent/` with `npm run dist:win` or `npm run dist:mac`. Run `npm run check` before packaging.
- Pearl connects only to an agent running on the same computer at `127.0.0.1:43127`; an agent on another computer is not reachable through that loopback address.
- The Edge extension and YardMate desktop agent have separate responsibilities. The extension only locates and refreshes the signed-in Mismatches page, verifies its footer timestamp, and starts the official Excel download. It does not parse rows or send alerts.
- The desktop agent accepts only a downloaded Excel that is fresh relative to the verified page refresh, parses no-mates and pool mismatches, and creates the light-theme status image.
- No Mates are sorted by Location then Container and show Location, Container, Chassis/No Mate, Required Pool, Size, and Duration in minutes. Pool Mismatches are sorted by Required Pool, then Location and Container and include Chassis Pool.
- Alert titles use `Settegast Inbound Equipment Status [current time]`. Do not weaken freshness verification merely to make an old export pass.
- Validate YardMate source with `npm run check` from `yardmate-agent/`. Do not edit or stage `yardmate-agent/node_modules/` or generated installers.

### Companion components and boundaries

- `yardmate-agent/main.js`: Electron main process, local HTTP API, download monitoring, Excel parsing, image rendering, scheduling, Pushover sending, and agent/extension state.
- `yardmate-agent/preload.js`: narrow renderer bridge.
- `yardmate-agent/renderer.js` and `settings.html`: desktop controls/settings.
- `yardmate-agent/edge-extension/manifest.json`: permissions, supported hosts, service worker, and content scripts.
- `yardmate-agent/edge-extension/background.js`: scheduled/manual browser automation coordination.
- `yardmate-agent/edge-extension/content.js`: signed-in UP Mismatches page interaction and official Excel export.
- `yardmate-agent/edge-extension/alertmeter-content.js`: AlertMeter refresh/filter/capture support.
- `yardmate-agent/edge-extension/popup.*`: compact manual controls and visible status.
- The extension may need to be reloaded after source changes. Edge shows a reload control only for unpacked/developer-loaded extensions; select the directory containing `manifest.json`, not the parent `yardmate-agent/` folder.
- Minimized/background tabs may be throttled by the browser. Scheduled automation must use extension alarms/background coordination rather than relying on a visible page timer.

## Build and synchronization

- Use `node build-combined.js <page-id>` only after confirming that rebuilding is safe for the current baseline.
- After a build, inspect the generated diff instead of assuming the output is correct.
- If both combined workbook copies are expected to match, verify them explicitly.
- Do not overwrite a newer imported workbook with older page-source content.
- Record any intentional source/generated divergence in the final handoff.

## Validation

- Run `git diff --check` after source changes.
- Check modified JavaScript for syntax errors when it can be extracted or checked safely.
- For `index.html`, syntax-check every executable outer `<script>` while skipping `type="application/json"` payloads. When changing code injected into embedded pages, also verify the generated inner script or its unique marker when practical.
- Validate the affected control, page, or workflow in a browser when the environment supports it.
- Local `file://` pages may block automated browser control; report that limitation and provide a focused manual refresh or test instruction.
- For generated-workbook changes, verify that the expected marker, handler, or style appears exactly once unless multiple occurrences are intentional.
- For AM changes, regression-check roster default opening, row Quick Actions, Reset behavior, SCW visibility, Checklist-over-SCW stacking, and Timesheet Schedule/Archive/Full View rendering.
- For Excel changes, regression-check Table 1 population, `03-xxx` Pierce routing, `06-xxx` Yard routing, consolidated block widths/heights, archive persistence, and refresh survival.
- Use tests already present in the repository when they cover the changed behavior; do not invent unrelated infrastructure solely to satisfy a generic test requirement.

### Minimum validation commands

- Repository hygiene:
  - `git status -sb`
  - `git diff --check`
  - `git diff --stat`
- YardMate:
  - from `yardmate-agent/`, run `npm run check`
- Combined workbook:
  - compile executable outer `<script>` blocks while skipping `type="application/json"`;
  - when changing an embedded-page transformer, evaluate the relevant embedded page through the same transformer order and assert unique control IDs/markers;
  - do not treat outer-script compilation alone as proof that injected inner scripts work.
- Browser:
  - refresh the affected page;
  - navigate away and back;
  - refresh the whole workbook;
  - confirm persistence and overlay behavior;
  - exercise at least one representative action rather than checking appearance only.
- Local `file://` navigation may be blocked by automated browser-control policy. Do not evade that restriction. Use static/runtime extraction checks and give the user a precise manual refresh/test when necessary.

### Focused regression matrix

| Area changed | Required checks |
| --- | --- |
| AM roster | Opens by default, stays floating, matches Full View TODAY, rows open Quick Actions, Reset is scoped, page scroll does not move it. |
| AM weather/SCW | Cached content appears, latest refresh works, Show Third Day loads the deferred frame, SCW push works, Checklist stacks above SCW. |
| Timesheet | Schedule styled, Archive opens, Full View renders, Quick Actions persist, no CSS text leaks into the page. |
| Excel import/parser | Table 1 populated, `03-xxx` routes to Pierce, `06-xxx` routes to Yard, like blocks consolidate, refresh preserves inbounds/archive. |
| Chassis forecast | Mismatches consume supply first, only true shortages get red X, totals unflagged, numbers centered. |
| LPH | Page loads without old-state flash, inbound count 1/2/3 works, carry-over begins 03:00, reset clears intended inputs. |
| Pearl/Mori | Agent and extension statuses update, schedule/countdown visible, each control ID unique, Excel preview/send and AlertMeter capture/preview still work. |

## Git workflow

- Stage only files that belong to the requested change.
- Do not stage `.codex-tmp-*`, `.codex-tracklist-server.js`, local server helpers, logs, caches, or other debugging artifacts.
- Do not commit or push unless the user explicitly asks.
- Before committing a mixed worktree, confirm the intended file scope.
- Before pushing, verify the current branch, remote, authentication, and staged diff.
- Use concise commit messages that describe the user-visible change.

## Documentation and handoff

- Update documentation only when architecture, setup, data format, release procedures, or user-facing behavior materially changes.
- Do not maintain a per-turn continuity log or modify repository documentation for routine questions.
- `HANDOFF.md` is an explicitly requested point-in-time continuation document. Update or replace it only for a deliberate chat handoff; it is not a running diary.
- In the final handoff, state what changed, where it changed, what validation ran, and any intentional work left unsynchronized.
