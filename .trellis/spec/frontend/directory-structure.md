# Directory structure

- desktop/catalog.mjs: loadLibrary/buildTemplateIndex from scripts/lib; full local search and immutable detail projection.
- desktop/agent.mjs: official OpenAI SDK Chat Completions and validated evidence ranking.
- desktop/search-semantics.mjs: independent source-bound labels and shared relevance gate. data/search-semantics.json is generated; search-semantic-overrides.json contains reviewed corrections, separate from case-taxonomy.
- scripts/build-search-semantics.mjs and validate-search-semantics.mjs: incremental ID coverage, source hashes and quote validation. desktop/evaluate-agent.mjs uses only explicit test configuration for live-provider reports.
- desktop/settings.mjs: configuration and encrypted credentials; safeStorage injected for plain Node tests.
- desktop/headers.mjs: browser-safe shared header row validation, used by both settings storage and the renderer module.
- desktop/main.mjs: Electron lifecycle, allowed IPC, clipboard and record-derived external links.
- desktop/preload.cjs: sandbox-compatible isolated bridge. Never expose raw ipcRenderer.
- desktop/ui/: plain HTML/CSS/JavaScript; no Node access.
- desktop/*.test.mjs, benchmark.mjs, ui-smoke.mjs: tests and measurements.
- desktop/package.mjs: checked staging paths and portable Windows build in dist/desktop; staging is .tmp/desktop-stage and is removed on successful packaging.

Do not duplicate template merging/taxonomy logic or mutate data exports from UI. dist/desktop contains final desktop packages and remains ignored. .tmp contains staging, download caches, other generated test packages, test settings and screenshots and remains ignored; final desktop output must survive clearing disposable .tmp files.
