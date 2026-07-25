# TIMESHEET CONGLOBAL — Chat Handoff

**Prepared:** July 25, 2026 (America/Chicago)

**Repository:** `C:\Users\Jacob\Documents\TIMESHEET`

**Remote:** `https://github.com/pradoj08/timesheet.git`

**Active branch:** `codex/am-report-workbook-updates`

**Current HEAD:** `da71ad6` — `checkpoint workbook and agent updates`

**Tracking state at handoff:** HEAD is pushed to `origin/codex/am-report-workbook-updates`.

## Resume prompt for the next chat

Use this as the opening instruction:

> Continue work in `C:\Users\Jacob\Documents\TIMESHEET`. Read `AGENTS.md` and `HANDOFF.md` first. Preserve the existing uncommitted changes in `AGENTS.md`, `HANDOFF.md`, `index.html`, and `pearl-page.html`; they contain the detailed continuation documentation, AM Report performance work, and the Pearl control-bar cleanup. Run `git status -sb` and inspect the diff before editing. Treat root `index.html` as the protected runtime baseline and do not run `build-combined.js` unless the page sources have first been reconciled.

## Current working-tree state

At the time of this handoff:

```text
## codex/am-report-workbook-updates...origin/codex/am-report-workbook-updates
 M AGENTS.md
 M index.html
 M pearl-page.html
?? HANDOFF.md
```

Do not reset or overwrite these files.

### Uncommitted documentation

- `AGENTS.md` was expanded into the durable repository operating guide.
- `HANDOFF.md` is this point-in-time continuation report.

### Uncommitted `index.html` work

The active workbook contains two groups of uncommitted changes.

#### 1. AM Report startup/performance cleanup

- Debounced AM Quick Actions iframe connection work.
- Ensured iframe load listeners are attached only once.
- Deferred initial roster setup with `requestIdleCallback` when available.
- Replaced repeated full scans with scheduled/debounced roster and frame hooks.
- Limited the floating-roster open loop and reduced retry duration.
- Bounded/disconnected weather-card observers after successful installation or timeout.
- Removed the inbound-concern five-second polling loop and narrowed its observer.
- Deferred detailed NWS forecast installation instead of doing all frame work immediately.
- Added `withAmReportPerformance(html)` with marker `am-report-performance-v1`.
- The performance transformer:
  - loads the visible/current day first;
  - staggers yesterday;
  - defers tomorrow/third-day loading until idle or until it becomes visible;
  - throttles resize calculations through `requestAnimationFrame`;
  - replaces multiple fit timers with one bounded follow-up;
  - adds a loading shimmer;
  - responds to `conglobal-am-third-day-visibility`.
- Root SCW startup now shows cached content immediately and schedules the live refresh during idle time.
- This AM performance work currently exists only in root `index.html`; it has **not** been backported to `am-report-page.html`.

#### 2. Pearl/Mori control-bar cleanup

- Added `withPearlToolbarGroups(html)`.
- Pearl controls are grouped into:
  - Automation
  - Mismatch Alert
  - AlertMeter
  - Tools
- Labels were shortened while preserving the existing IDs and handlers:
  - `watchToggle`
  - `previewLatest`
  - `sendLatest`
  - `openAlertMeter`
  - `previewAlertMeter`
  - `testPush`
  - `openSettings`
  - `refreshStatus`
- Layout is a four-column grid on wide screens, two columns below 980 px, and one column below 560 px.
- Transformer order is:

```text
withPearlScheduleDashboard(
  withPearlToolbarGroups(
    withPearlAlertMeterControl(pageHtml)
  )
)
```

### Uncommitted `pearl-page.html` work

- The same grouped toolbar was added directly to the Pearl page source.
- Button IDs and existing event listeners were preserved.
- The source and active runtime are aligned for this toolbar cleanup.

## Validation already completed for the dirty changes

- `git diff --check` passed.
- Executable outer scripts compiled:
  - `index.html`: 3 executable scripts
  - `pearl-page.html`: 1 executable script
- The root embedded Pearl page was extracted and passed through:
  - `withPearlAlertMeterControl`
  - `withPearlToolbarGroups`
  - `withPearlScheduleDashboard`
- Four toolbar groups were present after transformation.
- All eight Pearl control IDs occurred exactly once.
- Earlier AM performance extraction checks confirmed:
  - performance marker present once;
  - deferred loader present once;
  - third-day visibility hook present;
  - old five-second inbound scan removed;
  - duplicate direct roster observers removed;
  - root scripts compiled.
- Automated navigation to `file:///C:/Users/Jacob/Documents/TIMESHEET/index.html` was blocked by browser-control URL policy. Do not work around that restriction. A manual workbook refresh remains the final visual check.
- Git reported only LF/CRLF normalization warnings; no whitespace errors.

## Recommended next steps

1. Run `git status -sb` and confirm only the expected files are dirty.
2. Open or refresh `index.html#pearl`.
3. Visually confirm:
   - four grouped control cards;
   - no clipped labels;
   - wide layout remains on one row when space allows;
   - responsive wrapping at narrower widths;
   - buttons still invoke their original actions.
4. Open or refresh `index.html#amReport`.
5. Confirm:
   - the current-day roster opens automatically;
   - current report appears before hidden reports finish loading;
   - SCW cached content appears without a long blank state;
   - Show Third Day loads the deferred third report;
   - Quick Actions, Reset, Checklist stacking, and SCW still work.
6. If those checks pass and the user asks to publish, stage only:
   - `index.html`
   - `pearl-page.html`
   - documentation files intentionally changed for this handoff
7. Commit with a user-visible message such as:

```text
Improve AM startup and organize Pearl controls
```

8. Push the current branch only after verifying remote/authentication and the staged diff.

## Protected architecture and known divergence

- Root `index.html` is approximately 13 MB and is the protected active runtime.
- The embedded `pages` object begins around the middle of the file and contains escaped full-page HTML strings.
- Runtime `with...` transformations are applied after an embedded page is selected. Removing or reordering a transformer can break unrelated features.
- Do not run `build-combined.js` simply because a page source changed.
- Known intentional divergence:
  - AM performance changes: root runtime only.
  - Pearl toolbar cleanup: root runtime transformer and `pearl-page.html`.
- `GITHUB UPLOAD - ONE FILE/index.html` has not been synchronized as part of the current dirty work.

## Major user-facing feature state

### AM Report

- Three-column report workspace.
- Floating current-day roster sourced from Timesheet Full View TODAY.
- Roster rows open shared Quick Actions.
- Scoped two-click Reset.
- Floating SCW latest article with refresh and push.
- Checklist must stack over SCW.
- Show Third Day restores the third report.
- Import Report and Mass Export controls.
- Middle report Copy targets `A1:B71`.

### Timesheet

- Schedule, Archive, Sign-Off, Full View, Timesheet, and Old View.
- Full View TODAY is the roster reference for AM.
- Schedule/Quick Actions persistence is operationally important.
- Shared Timesheet styling is fragile; check for CSS text leaking into the rendered page after modifications.

### Excel View

- Persistent inbound records and archive.
- Archive save-point export/import.
- Optional fourth table.
- Add-inbound parsing and highlighting.
- Block Glow settings plus IHOSA/MHOAS assignments.
- Yard/Pierce popup:
  - `06-xxx` Yard
  - `03-xxx` Pierce
  - compatible blocks consolidated
  - dwell and SS information shown
- Future dwell calculation projects to 20:30 today.
- Morning and Afternoon Meeting boards with push/export behavior.

### Chassis Status

- Forecast and 24/72-hour calculators.
- Mismatch demand consumes available chassis supply before inbound demand.
- True shortages receive red X markers.
- TOTAL rows remain unflagged and numeric values remain centered.
- Forecast canvas is white.

### LPH Tracker

- Inbound count selector.
- Carry-over starts at 03:00.
- Configurable order-of-operations/work plan.
- Inline-confirmed resets.
- Profiles section last and collapsed.

### Pearl.io / Mori

- Desktop YardMate Agent plus Edge extension.
- Mismatch schedules and AlertMeter 30-minute checks are shown with countdowns.
- Excel mismatch export, preview, process/send, test, settings, and refresh controls.
- AlertMeter capture/send and preview.
- Agent and extension connection badges.
- Cloud and in-app browser destinations are grouped under Pearl navigation.

## YardMate/extension operating model

- The Edge extension handles authenticated browser interaction.
- UP Mismatches:
  - refresh the correct signed-in page;
  - verify the page footer timestamp;
  - use the official Excel export.
- YardMate Agent:
  - watches Downloads;
  - rejects stale/unverified Excel results;
  - parses no mates and pool mismatches;
  - renders the light-theme equipment-status image;
  - sends Pushover alerts.
- AlertMeter:
  - refreshes the signed-in dashboard;
  - reads participation;
  - if below 100%, selects No Test Taken, captures the filtered names, and sends a cropped screenshot;
  - if 100%, reports success.
- Edge extension directory to load unpacked:

```text
C:\Users\Jacob\Documents\TIMESHEET\yardmate-agent\edge-extension
```

- Do not select `yardmate-agent` itself; the selected folder must contain `manifest.json`.
- Never commit Pushover keys, authenticated cookies, downloaded operational workbooks, or other secrets.

## Important data contracts

Do not rename or clear these without an explicit migration:

```text
conglobal-time-off-calendar-v1
conglobal-time-off-day-status-v1
conglobal-dayforce-punches-v1
conglobal-three-day-yard-crew-v1
conglobal-current-day-roster-snapshot-v1
```

Excel inbound/archive/table state, block assignments, glow preferences, Timesheet Quick Actions, meeting boards, and Supabase bridge data must remain compatible with existing stored values.

## Recent pushed history

```text
da71ad6 checkpoint workbook and agent updates
33c1419 Add operational alerts and workbook refinements
3d83263 Color YardMate refresh verification status
6620b06 Improve operational views and YardMate alerts
7b4c90b Prioritize mismatch chassis demand
4cda544 Improve AM report alerts and roster startup
460e263 Improve workbook views and YardMate alerts
36b669e Add Mori export automation and YardMate alerts
27d1542 Add employee sign-off sheet
f084188 Update workbook forecast and dwell projection
```

## Final cautions

- Preserve the current dirty work.
- Avoid broad rewrites of `index.html`.
- Avoid full-document mutation observers and repeated polling loops.
- Do not test destructive controls against live operational data.
- Do not silently synchronize the release copy.
- Do not commit or push unless the user explicitly asks.
- When handing off after future work, replace the point-in-time sections of this file rather than appending an endless activity log.
