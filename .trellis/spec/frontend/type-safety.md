# Desktop executable contracts

## Scope / trigger
Applies to the Electron renderer/main/SDK/storage boundary.

## Signatures
window.library exposes overview, search, onSearch, cancelSearch, detail, getSettings, saveSettings, testConnection, copy, openLink and refresh. See desktop/preload.cjs and the task design for exact payloads. Main resolves the local record for detail/copy/openLink.

## Contracts

`timeoutMs` is a per-SDK-request integer in 1000–120000 ms. DEFAULT_REQUEST_TIMEOUT_MS in desktop/settings.mjs is 90000 for new configuration; explicitly saved values survive reload and unrelated saves. The collapsed advanced control displays seconds with millisecond precision, validates locally, and sends timeoutMs to the existing settings API. Intent, ranking, repair and connection probe each use this setting; it is not a whole-search deadline.

Public/credential settings also contain maxOutputTokens:null|integer(1–1048576), maxOutputParameter:'max_tokens'|'max_completion_tokens' (default max_tokens), and reasoningEffort:null|'none'|'high'|'max'. Missing legacy fields use null/default without resetting explicit existing fields. Blank output control saves null. Null cap omits both SDK cap fields; otherwise only the selected parameter is sent. Reasoning null omits reasoning_effort; the explicit three modes send their exact value. Do not derive cap parameter from the thinking level: DeepSeek uses max_tokens. Validate before disk/memory mutation; preserve fields on unrelated saves and restore on reopen. No model context-capacity configuration is added.
Search input: {query,requestId,answer?,clarificationHistory?,skipQuestion?,allowTechniqueOnly?}; optional scope/skip are booleans. clarificationHistory is a maximum-two ordered array of {question:string(1–240),answer:string(1–1000)}, validated and copied at IPC and Agent boundaries before any SDK call or cancellation. Original query remains unchanged; old answer remains compatible. Events: {requestId,stage,results?,intent?,question?,clarificationRound?,maxClarificationRounds?,message?}; stages preliminary/progress/agent/clarification/error/cancelled. Intent carries summary and validated searchPlan. Results contain templates/cases/totalTemplates/totalCases/elapsedMs, plus broadReference/uncertainty when information is insufficient; Agent cards retain evidence/gap/relevanceTier (see semantic-search.md). Public settings contain baseURL/model/timeoutMs/headers/hasApiKey/persistence, never apiKey. Blank key preserves; clearApiKey:true clears. DESKTOP_SMOKE=1 hides test windows; DESKTOP_USER_DATA isolates test settings. Production settings use app.getPath('userData').

## Validation & error matrix
Custom headers: settings accept/expose headers as rows {name,value,valueType:'fixed'|'session',enabled,remember}. At most 20 rows; new rows default to fixed/enabled/not remembered. Shared desktop/headers.mjs validates HTTP token names, printable ASCII nonblank fixed values, enabled duplicates ignoring case, and reserved auth/transport names. Disabled drafts skip content checks but retain type/size checks. Invalid saves leave memory/disk unchanged. Row errors never echo values.

Only remember:true rows persist, explicitly in plaintext. Unremembered rows stay in memory. Automatic values are generated once per settings runtime and reused by probe/search/repair, regenerated after restart, never persisted or projected publicly. credentials().requestHeaders resolves only enabled rows for SDK defaultHeaders; API Key encryption remains unchanged. publicSettings and credentials return copies so consumers cannot mutate stored state.

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
Successful matching/clarification responses also carry localResults: all original-query keyword matches, independently of the Agent's bounded candidate list. The renderer can recover the full local view from the final response alone.

Good: genuine model matches project IDs and quotes candidate text. Base: no credentials returns local candidates explicitly unjudged. Bad: fabricated ID/URL/content must never become a result or copied prompt.

Prompt maintenance: AGENT_ROLE_PROMPT, stage prompts and REPAIR_PROMPT live in desktop/agent.mjs. The fixed role is injected each time; Agent phrase groups control dedicated plan retrieval. See semantic-search.md for result gate and source-bound evidence. Truncated evidence is not proof of absence. Empty evidence skips ranking. SDK fixtures verify contracts; compare real-provider output separately.

## Tests required
Assert exact original clipboard text, all 27/670 records, six null assignments, unknown query empty, shared one-repair budget, timeout/abort, stale events, key omission/encrypted roundtrip/session fallback and package launch outside checkout.

## Wrong vs correct
Wrong: expose ipcRenderer or shell.openExternal(rendererURL). Correct: preload exposes named methods and main maps {kind,id,type,retestIndex?} to a stored HTTP(S) URL. Wrong: trust model-generated prompt. Correct: model ranks IDs; main reads the unchanged local prompt.
