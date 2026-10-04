# Focused timeout and generation-settings review

Date: 2026-10-04. Scope: `desktop/agent.mjs`, `desktop/settings.mjs`, their tests, renderer settings controls and `desktop/integration-smoke.mjs`. Existing semantic/custom-header work was preserved. The reviewer made no runtime or test edits in this final pass.

## Findings (fixed)

- File: `desktop/ui/index.html`, `desktop/ui/app.js`, `desktop/integration-smoke.mjs`
- Issue: Native form validation could stop submission before the application revealed an invalid numeric field inside collapsed advanced settings; the browser could attempt to focus a hidden invalid input.
- Fix: Reported during the first focused pass and fixed by the implementation worker. The form uses `novalidate`; `settingsSave` checks advanced controls and opens the details element before explicit `reportValidity`. Integration assertions use native `requestSubmit` with both invalid advanced numeric fields while collapsed, require reopening, and confirm no settings mutation or SDK request.

## Findings (not fixed)

No outstanding code/spec violations were found in the focused final scope. Native development/portable execution and packaging are owned by the main session and are not claimed as reviewer-run verification here.

The three authorized real-provider diagnostic searches reproduced two separate failures: a request ending at its configured wait limit without an HTTP response, and HTTP 200 with `finish_reason:length` and an empty result under the prior fixed 2500-token cap. The third run with a larger cap still reached its 90-second wait limit. These diagnostic facts do not establish that the final default-cap/optional-reasoning configuration succeeds with that provider, nor substitute for the pending repeated semantic-quality evaluation. The reviewer did not read saved credentials or issue real-provider requests.

## Reviewed contracts

- Default/legacy missing output cap and reasoning effort remain null; both output-limit parameters and `reasoning_effort` are omitted unless explicitly configured.
- Manual integer cap is bounded by application validation at 1–1048576, with one independent selected field (`max_tokens` or `max_completion_tokens`); reasoning never silently changes that choice or imposes a token quota.
- Explicit thinking levels are exactly `none`, `high`, `max`. Probe, intent, ranking and the shared repair use identical settings; an unsupported HTTP 400 does not trigger downgrade or retry.
- Settings reject invalid cap/parameter/effort values before disk or memory mutation, preserve explicit values across unrelated saves/reloads, and support explicit null clearing.
- `finish_reason:length` is classified as `MODEL_TRUNCATED` / `truncated_output` before content validation, including empty content and otherwise parseable content. It does not trigger another call or consume a new format-repair allowance.
- Error timing identifies the actual intent/ranking/repair stage and measured elapsed time separately from the per-request limit. SDK transport timeouts may occur before that limit; HTTP 429 and HTTP 408/504 retain HTTP classifications. Cancellation remains cancellation.
- Diagnostics contain safe settings and stage metadata without API keys, resolved header values, raw provider errors, response bodies or hidden reasoning. Semantic quote/tier/full-match gates and local fallback are retained.
- The renderer restores output/effort/parameter values, hides the parameter selector when the cap is blank, disables fields while saving/probing, and maintains explicit advanced-field validation. No context-capacity setting was added.

## Verification

- Lint: no standalone lint command exists; `git diff --check` passed.
- TypeCheck: plain JavaScript repository, no TypeScript check; `node desktop/check.mjs` syntax check passed.
- Tests: `npm run desktop:test` passed **74/74** using normal host permissions and local HTTP fixtures only. This includes the full semantic/custom-header/evaluation regressions, per-request waiting and cancellation, output/effort persistence, mutually exclusive request parameters, stage-specific truncation and HTTP error separation.
- Native UI/portable integration: main-session gate; not rerun by this reviewer.
- Real-provider final configuration: not verified by this reviewer; no further authorized live requests consumed.
