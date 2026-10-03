# Desktop executable contracts

## Scope / trigger
Applies to the Electron renderer/main/SDK/storage boundary.

## Signatures
window.library exposes overview, search, onSearch, cancelSearch, detail, getSettings, saveSettings, testConnection, copy, openLink and refresh. See desktop/preload.cjs and the task design for exact payloads. Main resolves the local record for detail/copy/openLink.

## Contracts
Search input: {query,requestId,answer?,skipQuestion?}. Events: {requestId,stage,results?,intent?,question?,message?}; stages preliminary/progress/agent/clarification/error/cancelled. Results independently contain templates/cases/totalTemplates/totalCases/elapsedMs. Public settings contain baseURL/model/timeoutMs/hasApiKey/persistence, never apiKey. Blank key preserves; clearApiKey:true clears. DESKTOP_SMOKE=1 hides test windows; DESKTOP_USER_DATA isolates test settings. Production settings use app.getPath('userData').

## Validation & error matrix
| Boundary | Validation | Failure |
|---|---|---|
| IPC sender | current webContents + exact local page URL | reject |
| Query | nonempty string <=1000 chars; bounded request ID | reject |
| Record | case/template + existing ID | reject |
| External link | derived from record; HTTP(S), no userinfo | reject |
| Config | HTTP(S) Base URL without credentials/query/hash; bounded model/timeout | unchanged state |
| SDK ranking | supplied IDs, no duplicate, exact record quote, full/partial | one shared repair then safe failure |
| Credential storage | OS encryption available and not basic_text | key stays in session |

## Good/base/bad cases
Good: genuine model matches project IDs and quotes candidate text. Base: no credentials returns local candidates explicitly unjudged. Bad: fabricated ID/URL/content must never become a result or copied prompt.

## Tests required
Assert exact original clipboard text, all 27/670 records, six null assignments, unknown query empty, shared one-repair budget, timeout/abort, stale events, key omission/encrypted roundtrip/session fallback and package launch outside checkout.

## Wrong vs correct
Wrong: expose ipcRenderer or shell.openExternal(rendererURL). Correct: preload exposes named methods and main maps {kind,id,type,retestIndex?} to a stored HTTP(S) URL. Wrong: trust model-generated prompt. Correct: model ranks IDs; main reads the unchanged local prompt.
