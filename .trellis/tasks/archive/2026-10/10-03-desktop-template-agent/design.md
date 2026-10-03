# Desktop design

The user approved Electron + local Node.js + OpenAI SDK. The UI is a lightweight HTML/CSS/JavaScript renderer. Existing ESM data loaders remain the source of template merging and taxonomy. Only Electron, OpenAI SDK and desktop packaging/verification tools are added where required.

## Change boundary

The current repository has CLI/Markdown access but no desktop entry point or theme search. Add desktop modules and npm commands, and update README source plus generated artifacts. Preserve case exports and taxonomy. No speculative database, vector service, UI framework or generic agent platform is needed for this dataset.

## Ownership and contracts

`desktop/catalog.mjs` exports `loadCatalog(root)`, returning an object with `overview()`, `search(query, options)`, `get(kind,id)`, `evidence(results, budget)` and `dataVersion`. Reuse `loadLibrary` and `buildTemplateIndex`.

`overview()` returns `{stats:{templateCount,caseCount,unassignedCount},dataVersion,categories,featured:SearchResults}`.

`SearchResults` is `{templates:TemplateCard[],cases:CaseCard[],totalTemplates,totalCases,elapsedMs}`. TemplateCard: `{id,title,description,category,tags,corpusCount,reason?,matchType?}`. CaseCard: `{id,title,summary,posterUrl,creator,models,templateId,templateTitle,reason?,matchType?}`. `search(query,{terms?:string[],excludeTerms?:string[],limitCases?:number,limitTemplates?:number})` uses all local searchable fields and never fills a no-match query with arbitrary heat-ranked results. Empty query may browse featured records.

`get('template',id)` returns local detail `{kind,id,title,description,useWhen,structure,guidance,pitfalls,copyText,bodyText,relatedCases}`. `get('case',id)` returns `{kind,id,title,summary,prompt,mediaUrl,posterUrl,sourceUrl,goodcaseUrl,creator,models,templateId,templateTitle,retests:[{url,model,verdict,testedAt}]}`. Display and copying always use this local content.

`evidence(results,budget=18000)` returns bounded plain records for the Agent including kind/id, title, summary, matched content excerpt and template context. No credentials. Agent ranking is confined to provided IDs.

`desktop/agent.mjs` exports `matchCatalog({query,catalog,settings,signal,answer,skipQuestion,onProgress})` and `testConnection(settings, {signal}={})`. Settings are `{baseURL,model,apiKey,timeoutMs}`. Match returns `{stage:'agent'|'clarification',results:SearchResults,intent:{summary},question?:{text,options:string[]},message?:string}`. Normal flow is two SDK Chat Completions requests; at most one total repair request. Do not depend on native tools, JSON mode, provider model listing or Responses support. Timeout/abort propagates to SDK. Reject invalid IDs, duplicate results, oversized output or unsupported matching evidence. Optional questions are skipped if answer/skip supplied. Model failure throws a safe error; main retains preliminary results.

`desktop/settings.mjs` owns validated config and key persistence, receives Electron safeStorage rather than importing Electron into plain tests. API key blank means preserve; clearApiKey explicitly clears. UI only receives `{baseURL,model,hasApiKey,persistence,timeoutMs}`. Prefer OS-encrypted disk storage; when unavailable keep key in memory only.

## Renderer bridge

`window.library` exposes only:

- `overview()`
- `search({query,requestId,answer?,skipQuestion?})` -> Promise resolving final SearchEvent
- `onSearch(callback)` -> unsubscribe function; emits preliminary and progress/final SearchEvent
- `cancelSearch({requestId})`
- `detail({kind,id})`
- `getSettings()`, `saveSettings({baseURL,model,apiKey?,clearApiKey?,timeoutMs?})`, `testConnection()`
- `copy({kind,id})`
- `openLink({kind,id,type:'source'|'media'|'retest'|'goodcase',retestIndex?})`
- `refresh()` re-loads local data, returning overview

SearchEvent is `{requestId,stage:'preliminary'|'agent'|'clarification'|'error'|'progress'|'cancelled',results?,intent?,question?,message?}`. Main owns AbortControllers; new searches cancel old ones. Renderer ignores events for stale IDs. Main IPC validates user input, keys, link type and sender; only local record HTTP(S) links may open externally. Node integration disabled, contextIsolation and sandbox enabled. No raw IPC access or filesystem API is exposed.

## UI

Warm light background, charcoal text, restrained teal accent, system Chinese typography. Compact sidebar/navigation and a generous search area, independent template strip and video grid. Native dialog for settings and a wide side detail panel, with keyboard close, focus return, reduced motion and readable long prompts. Real local case poster URLs; no synthetic content or decorative hero. Video loads only in detail; no mass autoplay.

## Packaging

Root package.json supplies main/commands. Packaging stages only application modules, data, shared library modules, router/adapters needed by imports, SDK dependencies and notices. Exclude .git, Trellis runtime, .tmp, API keys and developer files. Output under ignored .tmp/desktop-dist. Use checked workspace-contained cleanup paths. Validate packaged data loading and launch outside checkout. Keep live provider checks separate from SDK mock checks.

## Evidence

See research/repository-and-sdk.md and the reviewed root plan. The initial frontend placeholders have been replaced with source-backed desktop conventions in .trellis/spec/frontend/. Implementation follows the existing Node ESM/stdlib patterns.
