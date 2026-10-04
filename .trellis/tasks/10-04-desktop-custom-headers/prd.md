# Advanced model request headers

The user requests custom headers for compatible providers such as OpenCode Go, which they report requires a nonempty x-opencode-session. Preserve existing base URL/model/API Key settings.

Acceptance: Advanced configuration is collapsed by default. Header rows support add/remove, enable/disable, fixed text or automatic session ID, and independent opt-in local remember (default false). Explain plaintext storage beside the remember control. Show validation failures on their rows and prevent invalid saves/connection tests/model requests. All model calls share the configured headers. Existing settings remain compatible. No CI, no main merge or release tag changes.

Session ID means one generated ID per running application, shared by connection tests and search/repair calls, regenerated on restart. Remembering an automatic row saves its configuration, never its generated value. Unremembered rows stay only in memory. No new rewrite feature is in scope; validation covers all existing model entry points.
