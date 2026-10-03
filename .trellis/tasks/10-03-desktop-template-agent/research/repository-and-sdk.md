# Repository and SDK evidence

- Existing loadLibrary() merges style-library.json with templates-local.json. buildTemplateIndex() owns taxonomy and example-case relationships; template case order is heat-based rather than theme relevance.
- Dataset: 27 templates, 670 cases, 664 assigned / six intentional null; 670 source video/poster URLs, 286 cases with 295 available retest artifact URLs. URL availability is not playback verification.
- Source prompts total 1,811,598 characters; do not send the entire corpus per query.
- Existing route('赛博朋克猫咪广告') mostly extracts animal subject and returns broad compatible templates; theme retrieval must inspect actual case text.
- Official SDK supports Node.js: https://developers.openai.com/api/docs/libraries
- Chat Completions basic messages and response content: https://developers.openai.com/api/docs/guides/migrate-to-responses
- Electron main is Node.js, renderer is Chromium and uses an isolated preload bridge: https://www.electronjs.org/docs/latest/tutorial/process-model
- Third-party protocol support must be checked using configured endpoint; no real provider credential is supplied in this session.
- Repo uses ES modules, node:test, Python unittest and native filesystem/process libraries. Frontend Trellis specs are initial placeholders, not an existing framework mandate.
