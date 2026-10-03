# Event subscriptions

No framework hooks are used. window.library.onSearch(callback) installs one ipcRenderer listener internally and returns an unsubscribe function. app.js retains it and calls it at beforeunload. Events must first match state.requestId. Actions return promises and report safe messages to the notice/status elements; no provider body or credential is displayed.

Use listeners on native elements rather than introducing a framework/state dependency for these screens.
