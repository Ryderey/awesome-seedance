# Search state

Main owns one AbortController per active request. Starting a new search aborts the previous one; main only emits events for its active request. Renderer owns requestId/query/results/visibleCases/detailId/busy and ignores every stale requestId. Cancelling invalidates the renderer request ID immediately. Browse also invalidates the current search.

Preliminary results arrive before the Agent request; errors retain those results and expose retry. Clarification is at most one skippable question; retry keeps answer/skipQuestion. Final Agent results are separately labelled. The renderer never treats keyword results as model judgments.

Details use detailId to reject late responses. Local card arrays are not the authoritative prompt source: detail/copy resolve the record in main.
