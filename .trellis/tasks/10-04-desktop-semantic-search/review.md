# Semantic search review — 2026-10-04

Reviewed the approved plan, PRD/design/checklist, research, frontend specs and executable paths from annotation loading through Agent intent, plan retrieval, evidence selection, ranking, IPC, renderer and packaging. Preserved prior custom-header and dialog-scroll changes. No CI, credential extraction, commit or archive was performed.

## Findings (fixed)

- **P1 — `desktop/search-semantics.mjs`: removed manual reviews remained authoritative at refresh.** The loader accepted the old reviewed projection from the generated index after deleting its manual override. Reviewed facts now require the authoritative override to remain present; removal immediately becomes unknown/missing before rebuild. Added a temporary-manifest regression that exercises load directly without running the builder.
- **P1 — `desktop/search-semantics.mjs`: negative quotes could satisfy positive required conditions.** The reviewed VHS source says “不是广告，不是电影，不是高质感大片”, but required `电影` previously became a full match through substring lookup. Negated quoted occurrences no longer prove positive requirements. English whole-word checks also prevent `car` from being supported by `cartoon`. Added independent real-source regressions.
- **P1 — `desktop/agent.mjs`: denied technique references opened the scope.** The scope recognizer treated “不要拍法参考” and “不需要拍法参考” as permission. It now evaluates non-negated input, keeps model self-authorization disabled, and accepts natural explicit requests such as “借鉴一下骑行的拍法”. Added Chinese/English positive and negative regressions.
- **P2 — `desktop/agent.mjs`: one background product could override the actual request.** A valid fitness-ad intent was rejected for “健身广告，背景有咖啡” and “背景有咖啡杯的健身广告”. The recognized-product guard now avoids forcing a background/prop mention into the main-product role. An explicitly requested technique-only plan is also allowed when an advertisement is contextual. Added Chinese/English intent regressions.
- **P2 — `desktop/ui/app.js`, `styles.css`: template qualification was invisible.** Agent template cards now show the trusted adaptation gap independently of the model reason. The integration smoke asserts that target-product substitution is visible in the Agent view and absent from unjudged local cards.
- **P2 — `desktop/catalog.mjs`: literal exclusions rejected explicit absence.** The actual `sci-fi-mystery-message-from-2100` source says `No cars.`; a literal car/cars exclusion previously removed it. Plan retrieval now ignores bounded direct negation while still rejecting positive occurrences. The real-source regression also verifies that excluding its present `flying vehicles` still removes it. Local keyword browsing retains its prior behavior.

Frontend semantic-search specs were synchronized with review-removal, negated evidence, exclusion and template qualification contracts.

## Findings (not fixed)

- **Real-provider acceptance remains pending:** no explicit test-provider configuration was provided to this review. The runnable evaluation covers 31 queries × 3 repetitions and records qualified reviewed precision/recall, candidate recall, calls and latency. Passing HTTP fixtures does not establish live-provider intent/ranking accuracy. This is an external verification gap, not a code fix; do not claim that phase as passed.
- Reviewed strict product matching intentionally covers the 30 source-reviewed pilot cases; the remaining index entries are draft/unknown and remain searchable locally. The full 697-ID index is not a claim that every case has confirmed product semantics. Unknown concepts and unresolved constraints remain partial/uncertain rather than fabricated full matches, as approved.

## Verification

- Lint: no dedicated lint configuration exists; `node desktop/check.mjs` JavaScript syntax gate passes.
- TypeCheck: no TypeScript gate applies; runtime schema/IPC contracts are covered by tests.
- Tests: **57/57 pass**, including catalog, actual SDK HTTP requests, header persistence/session IDs, semantic lifecycle/gates and evaluation subprocess/privacy tests.
- `node scripts/build-search-semantics.mjs --check`: pass; unchanged draft reuse is incremental.
- `node scripts/validate-search-semantics.mjs`: pass; **27 templates + 670 cases**, 57 reviewed / 165 draft / 475 unknown; 0 stale, invalid or missing. Six deliberate null taxonomy assignments remain accessible.
- Benchmark: 200 local searches P95 **21.89 ms**; 120 plan searches P95 **7.66 ms**; target 200 ms, pass.
- `git diff --check`: pass.
- Native Electron and portable outside-checkout integration: delegated to the main session under normal host permissions; this reviewer did not launch Electron in the restricted process sandbox. Rebuild the portable executable from the final reviewed sources and execute the updated integration assertions before recording final application acceptance.
