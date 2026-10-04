# Scoped package output review

Scope: `desktop/package.mjs`, `.gitignore`, the packaging section of `DESKTOP-USAGE.md`, and directory/quality specs, against the latest approved implement.md section. Application behavior and unrelated branch changes were not re-reviewed. Reviewer only writes this report; root owns packaging, native integration and authorized temporary cleanup.

## Findings (fixed)

No reviewer fix required.

## Findings (not fixed)

No concrete issue found in the scoped changes.

## Verified code paths

- Final output is `dist/desktop`; staging remains `.tmp/desktop-stage`. Both paths are fixed children of the repository root derived from the script's location, independently of the launch working directory.
- Every recursive removal first resolves its target/base and rejects the base itself, parent traversal and an absolute relative result. Staging uses the `.tmp` base, output uses `dist`. The script removes only the named stage/output targets, not either parent or other sibling contents under dist. Current `.tmp`, dist and cache directories are ordinary directories, not junctions/symlinks.
- Production dependency installation still uses offline `npm ci`, with existing `.tmp/npm-cache` when present. Matching Electron archive discovery still uses `.tmp/electron-cache`. Package cleanup does not target either cache.
- Staging is removed after packager resolves successfully. Copy/install/package failures stop before that cleanup, preserving the stage for diagnosis. Starting the next build intentionally replaces the previous stage and desktop output.
- Ignoring dist, the documented executable path, the requirement to copy the complete application folder, staging lifetime and cache ownership all match the implementation and two updated specs.

## Verification

- `node --check desktop/package.mjs`: passed.
- `git diff --check`: passed; a CRLF normalization warning is informational.
- TypeCheck: no separate TypeScript checker configured; no types changed.
- The 92 application tests were not rerun for this layout-only review, as requested.
- Actual build, repository-external integration, ASAR comparison and temporary cleanup remain root-owned; this review does not claim their outcomes or delete any temporary files.

Root subsequently verified the new dist/desktop build: 11 critical source/data files match; production metadata/version match; staging removed; outside-checkout integration process 60808 exited normally. Root cleaned 92 disposable .tmp entries after validating absolute targets, retained the two offline caches and confirmed the final exe remains. These are root verification results, not reviewer reruns.
