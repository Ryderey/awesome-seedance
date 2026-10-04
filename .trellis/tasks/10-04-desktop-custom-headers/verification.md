# Verification — 2026-10-04

- Node tests: 28/28 passed. Actual OpenAI SDK requests to a local HTTP fixture cover probe, intent, ranking and repair headers, session UUID reuse/rotation, disabled omission, plaintext opt-in/revocation, cloned projections, invalid-save rollback and legacy settings.
- JavaScript syntax passed. Local catalog benchmark: 27 templates, 670 cases, 200 samples, P95 21.01 ms (target 200 ms).
- Development Electron integration passed with normal exit 0. Missing x-opencode-session produced HTTP 400; advanced configuration restored successful probing and ranking. Default collapse, add/delete/disable/type switches, duplicate/invalid row errors, blocked invalid submission and independent persistence were exercised.
- Existing Electron UI smoke passed with normal exit 0: full library, pagination, basic settings, detail copy/media fallback, stale events, keyboard, 900px layout and single dialog scroll.
- Portable app rebuilt with desktop/headers.mjs explicitly staged. First portable run passed the advanced configuration and wire assertions, then timed out taking an optional screenshot; process exited normally. Portable verification now excludes screenshots/external poster loading, since development visual QA is separate. Full outside-checkout rerun passed with normal exit 0, including headers, persistence, ranking, local result switching, rate limits, clarification and cancellation.
- Main-agent code review checked shared validation, memory/disk boundaries, request-header projection, renderer state and packaging registration. The delegated check was interrupted by its model quota; no independent-agent review pass is claimed.
- No real provider credentials were accessed or live OpenCode Go request made. Live-provider acceptance remains for the user's configured service.

## OpenCode Go configuration

Open 模型设置 → 高级配置 → 新增请求头. Name: x-opencode-session; value type: 自动会话 ID; 启用 checked. Leave 本地记住 unchecked for this run only, or check it to retain the row configuration after restart. The generated ID is never stored; a new ID is generated on application restart. Remembered fixed text values are explicitly stored in plaintext.

Code remains local on feat/video-prompt-router; prior prompt/scroll/result changes are preserved, and v1.0.0 is unchanged. Task remains open for review/commit.

## 2026-10-04 v1.0.1 发布授权

用户授权提交、推送及 v1.0.1 标签，并将 feat/video-prompt-router 改名为 master。应用与 lockfile 版本同步为 1.0.1，三语 README 及源文档的分支说明/克隆命令同步 master；路由重新生成与全套检查通过。此次发布不合并 main，不移动 v1.0.0。尚未执行的真实供应商质量评测/验收继续保留，不因发布归档未完成任务。

最终 1.0.1 便携版：进程 7092 仓库外集成通过并正常退出，11 个关键 ASAR 文件与源码/数据一致，打包 package.json 为 1.0.1。远端分支已通过 gh API 改名为 master，默认分支同步；发布提交/标签推送单独记录。
