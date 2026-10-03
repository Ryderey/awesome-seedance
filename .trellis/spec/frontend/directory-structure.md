# Directory structure

- desktop/catalog.mjs: loadLibrary/buildTemplateIndex from scripts/lib; full local search and immutable detail projection.
- desktop/agent.mjs: official OpenAI SDK Chat Completions and validated evidence ranking.
- desktop/settings.mjs: configuration and encrypted credentials; safeStorage injected for plain Node tests.
- desktop/main.mjs: Electron lifecycle, allowed IPC, clipboard and record-derived external links.
- desktop/preload.cjs: sandbox-compatible isolated bridge. Never expose raw ipcRenderer.
- desktop/ui/: plain HTML/CSS/JavaScript; no Node access.
- desktop/*.test.mjs, benchmark.mjs, ui-smoke.mjs: tests and measurements.
- desktop/package.mjs: checked staging paths and portable Windows build.

Do not duplicate template merging/taxonomy logic or mutate data exports from UI. .tmp contains generated packages, test settings and screenshots and remains ignored.
