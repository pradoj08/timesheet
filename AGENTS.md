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
- `GITHUB UPLOAD - ONE FILE/index.html` is a separate single-file distribution copy.
- Supabase-related database files and migrations live under `supabase/`.

## Current source-of-truth rule

- Treat the root `index.html` as the protected runtime baseline unless the user explicitly selects another file or the page sources have been reconciled with it.
- The current baseline was adopted from a newer user-supplied combined workbook and may contain features that are not present in the individual page source files.
- Do not run `build-combined.js` over the active workbook merely because a page source changed.
- Before rebuilding, compare the active combined workbook with the relevant page source and confirm that newer combined-only features will be preserved.
- When a task changes only `index.html`, clearly report that the change has not yet been backported to the corresponding page source.
- When the page sources become authoritative again, update this section as part of that reconciliation.

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

## Build and synchronization

- Use `node build-combined.js <page-id>` only after confirming that rebuilding is safe for the current baseline.
- After a build, inspect the generated diff instead of assuming the output is correct.
- If both combined workbook copies are expected to match, verify them explicitly.
- Do not overwrite a newer imported workbook with older page-source content.
- Record any intentional source/generated divergence in the final handoff.

## Validation

- Run `git diff --check` after source changes.
- Check modified JavaScript for syntax errors when it can be extracted or checked safely.
- Validate the affected control, page, or workflow in a browser when the environment supports it.
- Local `file://` pages may block automated browser control; report that limitation and provide a focused manual refresh or test instruction.
- For generated-workbook changes, verify that the expected marker, handler, or style appears exactly once unless multiple occurrences are intentional.
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

