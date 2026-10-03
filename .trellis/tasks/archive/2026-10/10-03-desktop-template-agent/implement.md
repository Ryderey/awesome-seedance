# Execution plan

User authorization: create Trellis task and start the already-reviewed plan on 2026-10-03. Use this branch; unrelated newly-installed Trellis scaffolding is not automatically part of work commits.

- [x] Import approved requirements, design, research and context; activate task.
- [x] Stage 1: catalog, full-library theme retrieval, details and retrieval regressions/benchmark.
- [x] Stage 2: settings and SDK-based Agent flow, bounded evidence, ID validation, abort, optional question and mock-server checks.
- [x] Stage 3: Electron main/preload bridge and polished renderer; verify stale-query handling, media fallback and copying.
- [x] Stage 4: Windows standalone package, outside-checkout smoke, README sources/regeneration and compatibility checks.
- [x] Final full-scope Trellis check and concrete spec updates; record verified outcomes and remaining live-provider validation.
- [x] Initial visual review: user approved the first desktop version on 2026-10-04.
- [x] Real-provider integration: user confirmed completion on 2026-10-04; recorded as user validation, not an agent-run paid test.
- [x] Final user acceptance: all first-version checks passed, including relevance and live media, confirmed on 2026-10-04. See verification.md for provenance.

## Checks

- node --test desktop/*.test.mjs
- node desktop/check.mjs (syntax and asset contracts, no fabricated TypeScript gate)
- desktop retrieval benchmark on real data
- Electron interaction smoke with a local compatible SDK mock and real catalog
- desktop packaging and outside-checkout launch smoke
- node router/build.mjs --write --out .tmp/router-package then --check after source changes
- git diff --check on authored changes; source prompt whitespace is preserved

## Review and rollback

Delegate non-overlapping implementation modules under this task and integrate at the defined contracts. Delegate a full-scope Trellis check after integration. Fix concrete findings and rerun affected checks. Revert only this task's authored files if rollback is required; preserve user-installed AGENTS/.trellis/.codex files and prior router implementation.
