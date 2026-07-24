# TIMESHEET CONGLOBAL - Codex Instructions

## Scope

- These instructions apply to the entire repository.
- Keep this file concise and update it when the workbook architecture or release process changes.
- Follow explicit user instructions when they intentionally override a repository convention.

## Project overview

- This project is a multi-page operational workbook delivered primarily as a self-contained HTML file.
- `index.html` is the active workbook the user opens in the browser.
- Page-level implementations are stored in root files such as `excel-view-page.html`, `am-report-page.html`, `lph-tracker-page.html`, and the other `*-page.html` files.
- `build-combined.js` assembles page sources into combined workbook outputs.
- `sync-workbook-pages.cjs` and `adopt-workbook-baseline.cjs` support controlled source/baseline reconciliation; inspect their effects before running them.
- `GITHUB UPLOAD - ONE FILE/index.html` is a separate single-file distribution copy.
- Supabase-related database files and migrations live under `supabase/`.
- `yardmate-agent/` is a separate Electron companion application. Its `edge-extension/` helper refreshes the signed-in UP Mismatches page and invokes the official Excel export; the desktop agent watches Downloads, parses the workbook, renders the equipment-status image, and can send Pushover alerts.

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

- The Edge extension and YardMate desktop agent have separate responsibilities. The extension only locates and refreshes the signed-in Mismatches page, verifies its footer timestamp, and starts the official Excel download. It does not parse rows or send alerts.
- The desktop agent accepts only a downloaded Excel that is fresh relative to the verified page refresh, parses no-mates and pool mismatches, and creates the light-theme status image.
- No Mates are sorted by Location then Container and show Location, Container, Chassis/No Mate, Required Pool, Size, and Duration in minutes. Pool Mismatches are sorted by Required Pool, then Location and Container and include Chassis Pool.
- Alert titles use `Settegast Inbound Equipment Status [current time]`. Do not weaken freshness verification merely to make an old export pass.
- Validate YardMate source with `npm run check` from `yardmate-agent/`. Do not edit or stage `yardmate-agent/node_modules/` or generated installers.

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
- In the final handoff, state what changed, where it changed, what validation ran, and any intentional work left unsynchronized.

