# Scoped two-round clarification review

Review scope: the approved clarification chapter of design.md, checked through Agent validation/request sequencing, IPC, semantic retrieval, renderer continuation and fixture evaluation. Existing unrelated branch work is preserved.

## Findings (fixed)

- File: `.trellis/spec/frontend/semantic-search.md`. The signature omitted the new `clarificationHistory` argument while the implementation and prose described it. Reviewer added it to the documented signature.
- Files: `desktop/agent.mjs`, `desktop/agent.test.mjs`. Root's native integration exposed a bare second answer `运动饮料` being counted as both beverage and sports-drink mentions. The implementer collapses ancestor aliases before checking product ambiguity. Reviewer independently verified the new regression: parent-to-child refinement uses exactly two SDK requests, while weakening the requested product is rejected and unrelated products still permit clarification.
- Files: `desktop/agent.mjs`, `desktop/agent.test.mjs`. Reviewer reproduced original query `运动饮料广告，但用途要纪录片`, latest purpose answer `纪录片`, and a documentary plan being rejected with MODEL_OUTPUT. The implementer now recognizes latest explicit purpose answers, preserves product specificity, and separates purpose from style/quality references. Direct validation and SDK regressions pass. The implementer also handles direct `不是运动饮料，是咖啡` product corrections; the original product cannot defeat that explicit answer.
- Files: `desktop/agent.mjs`, `desktop/agent.test.mjs`. Reviewer reproduced an invented sports-drink primary for skipped `做个广告` being accepted. The implementer now requires every broad primary concept to have a canonical alias in the original query/answer data, or the first literal term for unknown concepts. The check applies regardless of primary role and excludes model questions/options as user facts. Broad purpose must likewise be supplied or explicitly authorized technique scope. This closes the concrete known-product and unknown-brand-primary cases without changing normal complete-query retrieval.
- Files: `desktop/search-semantics.mjs`, `desktop/semantic-search.test.mjs`. A reviewed sports-drink documentary was rejected while an advertisement was accepted for a documentary plan with primary_product role. The implementer now gates explicit documentary/vlog/story product requests by their own purpose, and prevents commercial-only templates from satisfying them. Independent controlled fixtures cover both primary_product and primary roles, positive matching-purpose cases and negative advertisements/templates. Existing commercial subject/role/related-product tests still pass.

## Findings (not fixed)

No outstanding concrete implementation issue in the reviewed scope. Guard precision has a deliberate boundary: it grounds canonical concepts or unknown first terms, rather than proving every alternate translated alias or every word in free-text summary/reason. Those text fields remain under the fixed prompt and candidate quote/tier validation; this review does not claim universal brand or natural-language grounding.

Root explicitly accepted product-concept detection regardless of the model's primary role label: known product concepts tagged primary cannot bypass product-subject guards. For general product queries without an explicit purpose, commercial product references remain the default. The new dimension detection also applies to general/primary plans; the reviewer raised that scope consequence and root chose to retain it. Explicit documentary/vlog/story overrides that default. This does not establish arbitrary-purpose matching for every natural-language query.

## Verified behavior

- Legitimate questions with no primary subject return before semantic retrieval/evidence/ranking. Waiting does not schedule requests.
- Ordered history is validated/copied at IPC and Agent boundaries, with at most two bounded question/answer pairs. A third model question is suppressed programmatically.
- Skipped or unresolved exhausted intent produces broad uncertain/partial candidates; ranking cannot upgrade them. Explicit purpose, primary product and exclusions remain constrained by source evidence.
- Renderer appends the pending question once on explicit answer, synchronously locks duplicate answer/skip clicks, retains submitted history on retry, and resets it for new input/local category navigation. Stale request events remain ignored.
- Evaluation now only skips when the query row explicitly requests it; ordinary complete queries are not all forced into broad fallback. It forwards ordered history, counts request diagnostics even when a search stops at clarification, and separately reports attempts/completed Agent searches/waiting clarifications. The evaluator regression has three completed searches plus three waiting clarification runs, using nine requests without auto-answering.

## Verification

- `node --test --test-reporter=dot desktop/*.test.mjs`: reviewer independently reran 92/92 successfully on the final semantic-purpose fix, including commercial preservation, controlled documentary/vlog/story product fixtures, local SDK fixtures, evaluator reporting, and the shared repair budget for invented broad subjects; no live provider/configuration was read.
- `node desktop/check.mjs`: passed JavaScript syntax. No separate ESLint or TypeScript checker is configured in this plain JavaScript package.
- `git diff --check`: passed; CRLF normalization warnings are informational.
- Root subsequently verified the final source in development process 46160 and outside-checkout portable process 35652, both exiting normally; rebuilt portable ASAR matches 11 critical source/data files. All SDK requests use isolated local fixtures. Base UI smoke process 18072 passed before the last pure semantic fix, which did not change UI.
