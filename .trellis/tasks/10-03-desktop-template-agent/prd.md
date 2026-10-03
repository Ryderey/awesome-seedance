# Desktop template library with Agent matching

Status: approved for implementation by the user on 2026-10-03, following the reviewed [plan](../../../PLAN-frontend-template-search-2026-10-03.md). This task imports the completed interview; no product decisions are reopened.

## Outcome

A Windows desktop application lets a user enter a Chinese or English video theme and find relevant reusable templates and actual cases, with video playback, full prompt inspection, copying and source links. A configurable OpenAI-compatible model participates in understanding and judging matches.

## Requirements

- Local desktop application; provider calls run in the local Node.js process.
- Search all 27 templates and 670 cases, including the six deliberately unassigned cases.
- Display templates and cases independently by relevance; link a case to its existing template when present.
- Settings configure Base URL, model and API key through the generic OpenAI SDK; provide connection testing and local credential storage.
- Immediately display explicitly marked preliminary local results. Replace them with validated Agent matches; retain preliminary results with retry on model failure.
- The Agent understands intent, searches actual records and judges bounded candidates. Never invent IDs, media URLs or case text.
- At most one optional clarification. Answering or skipping proceeds without repeated questions.
- Search can be cancelled. Superseded queries cannot overwrite the current view.
- Beautiful, uncluttered Chinese UI; complete details are revealed on demand.
- Show a source video when available. Media failure or absent video exposes available media/source URLs. Label retests separately.
- Copy templates and original case prompts separately and exactly.
- Use the existing local snapshot and manual generation process. Show the data version.
- Maintain feat/video-prompt-router independently; do not merge main or add CI.

## Acceptance

- All assets are indexed; unassigned cases remain reachable.
- Warm local search P95 target <=200ms on this machine, measured separately from startup and model latency.
- Fixed theme regressions cover Chinese/English, combined themes, exclusions, ambiguous and no-match input; returned records and evidence are auditable.
- Invalid model IDs and malformed outputs cannot become recommendations; retry and cancellation behave correctly.
- SDK requests and errors are validated with a local compatible mock server. Live provider validation is conditional on user configuration and is reported separately.
- Video, failed-media fallback, details, copy, settings and keyboard interaction work in the desktop window.
- A Windows package starts and searches from outside the checkout.
- Existing local router build checks continue to pass.

## Scope

First version performs search and copying; prompt rewriting and video generation are deferred. No account system, public deployment, hosted Agent service, automatic upstream fetch or unbounded model loop.
