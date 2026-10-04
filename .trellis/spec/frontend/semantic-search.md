# Grounded Agent search

## Scope / trigger

Applies to desktop Agent intent, retrieval, annotations and result tiers. Template taxonomy describes shot structures; it is not proof of a case's product subject.

## Signatures

- `matchCatalog({query,catalog,settings,signal,answer,clarificationHistory,skipQuestion,allowTechniqueOnly,onProgress,onDiagnostics})`
- `catalog.search(query, options)` retains local keyword exploration.
- `catalog.searchPlan(searchPlan, options)` uses validated Agent phrase groups.
- `loadSearchSemantics(root, {library,cases})` validates source-bound annotations.
- `node scripts/build-search-semantics.mjs [--check]`
- `node scripts/validate-search-semantics.mjs`
- `node desktop/evaluate-agent.mjs --prepare` or `--config <test JSON> [--out <report>] [--runs 3]`

## Contracts

The fixed AGENT_ROLE_PROMPT accompanies both stages. Intent JSON contains summary, goal, primaryKeywords, relatedKeywords, required, optionalKeywords, excludeKeywords, allowTechniqueOnly and question. Primary groups have concept/terms/role; related groups have concept/terms/scope. Preserve phrases and deduplicate translations of one concept. Never append raw query tokens to plan scoring.

Both stages receive original query and ordered clarificationHistory (at most two question/answer pairs). The Agent may ask for missing subject/product, missing material purpose or conflicting constraints, but must not demand optional creative details for an already searchable theme. Empty primaryKeywords are allowed in a legitimate question response or justified broad fallback, so the model need not invent a subject merely to ask. Return the clarification before semantic retrieval/evidence/ranking; programmatically enforce skip and the two-round limit. Optional uncertainty explains missing information. Skipping always makes references broad; reaching two rounds only does so when intent remains unclear. Broad candidates and evidence are uncertain/partial and cannot be upgraded; preserve explicit purpose, exclusions and current source-evidence gates, without assuming an unstated product/brand/use. Normal complete-query gating remains unchanged.

Broad-mode primary concepts must have an actual original-query/answer basis: known concepts use canonical vocabulary aliases, unknown groups require their first literal phrase in that input. Questions and options are not user facts. Broad purpose must be a supplied purpose; absent purpose allows general or explicitly authorized technique. Latest explicit purpose answers override conflicts; documentary style is not documentary use. Collapse parent/child product aliases before deciding that several distinct products are ambiguous; a bare sports-drink answer must refine an earlier beverage answer without format repair. Direct product negation (不是运动饮料，是咖啡) excludes the denied product. These checks establish concept/literal grounding, not a universal proof for free-text summaries/reasons or all translated aliases; prompts and source quotes still govern those fields. No extra network retry is introduced.

Ranking receives original query, answer, validated searchPlan, bounded metadata and exact quotes. Cards retain reason/evidence/gap and relevanceTier topic|related_product|technique|uncertain, plus full/partial matchType. A model cannot upgrade a denied tier. Empty arrays are valid; both stages share one repair allowance.

Each actual SDK call emits a safe request diagnostic: requestStage (intent/ranking/repair), sourceStage, call, timeoutMs, elapsedMs, outcome and optional HTTP status. Errors include the actual request stage and measured wait separately from its configured limit. A missing HTTP response may time out locally; HTTP 429 and HTTP 408/504 stay HTTP failures. No automatic network retries are added. Never log raw errors, credentials or header values. Diagnostic live testing requires the user's model/data-transfer authorization and is separate from repeated semantic quality evaluation.

Generation and thinking parameters are explicit settings, never a fixed 2500-token cap. Unset cap/effort fields are omitted. Set cap uses exactly maxOutputParameter, independent of reasoningEffort none/high/max. finish_reason:length becomes MODEL_TRUNCATED/truncated_output before any content JSON decoding, even for an empty body; never consume the format-repair allowance or turn truncated recommendations into valid results. Safe diagnostics may include the configured cap, selected cap parameter and effort, but not raw response bodies or hidden reasoning. Prompt brevity recommendations cannot weaken quote, tier or full-match gates.

Annotations have kind/id/schemaVersion/annotationVersion/sourceHash/reviewStatus, subjects with role, contentType/productCategory/activities/scenes/capabilities, and evidence axis/concept/field/quote. The derived index covers every live ID. Manual overrides are separate and source-bound; removal revokes their reviewed derived projection immediately at load/refresh, without waiting for a rebuild. Only reviewed, current, valid evidence supports full; stale or missing facts become unknown rather than false.

Product main subject and advertising purpose need evidence; background drink trays and advertising aesthetic do not satisfy them. Other beverage types are related_product with a gap. Extra required constraints need evidence before full; negated quotes and substrings inside unrelated English words do not prove presence. Plan exclusions ignore directly negated source mentions such as "No cars" but still reject positive mentions elsewhere; reviewed roles remain authoritative. Templates may provide product structures with adaptation gaps shown independently of the model reason. Explicit scope allows technique references; local browsing remains independently unjudged.

## Validation & error matrix

| Condition | Behavior |
|---|---|
| Source changes, schema mismatch or quote invalid | Invalidate annotation, unknown, no full |
| Deleted / new ID | Omit deleted; new unknown pending review |
| Null template assignment | Independently searchable |
| Invented/duplicate ID, wrong kind, invented quote | Shared repair then safe output error |
| Cycling/gym for default sports-drink ad | Reject main recommendation |
| Related soda/fruit drink | Partial related_product, never full sports-drink |
| Empty candidates | Empty Agent result after intent call |
| Provider failure | Retain all original local matches labelled unjudged |

## Good/base/bad cases

Good: sports-drink query returns soda advertisement under related products with subtype gap. Base: unknown remains locally searchable. Bad: cyclist with a background tray of drinks enters the product tier.

## Tests required

Use independent reviewed quotes for positives and hard negatives. Assert atomic aliases, roles, purpose/style distinction, invalidation, 27/670 IDs, six null assignments, original content, dishonest upgrades, request budget, scope, pagination and stale/cancel behavior. Benchmark local and plan retrieval separately. Test portable executable outside checkout. Report fixtures separately from real-provider quality; diagnostics never contain credentials or headers.

## Wrong vs correct

Wrong: split sports drink, merge all raw words, accept any substring as proof. Correct: Agent provides one product concept with grouped aliases; retrieval uses grounded roles; shared gate enforces scope; model returns supplied IDs and supporting quotes.
