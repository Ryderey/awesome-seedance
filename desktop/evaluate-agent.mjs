// Explicit provider evaluation. Never read the desktop application's saved credentials.
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { loadCatalog } from './catalog.mjs';
import { matchCatalog } from './agent.mjs';
import { createSettings } from './settings.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { values } = parseArgs({ options: {
  config: { type: 'string' }, out: { type: 'string' }, queries: { type: 'string' },
  runs: { type: 'string', default: '3' }, prepare: { type: 'boolean' },
} });
const runs = Number(values.runs);
if (!Number.isInteger(runs) || runs < 1 || runs > 10) throw new Error('--runs must be 1–10');
const dataset = JSON.parse(await readFile(values.queries ? path.resolve(values.queries) : path.join(root, 'desktop/agent-evaluation-queries.json'), 'utf8'));
if (!Array.isArray(dataset.queries) || !dataset.queries.length || dataset.queries.some(row => typeof row.id !== 'string' || typeof row.query !== 'string' || !Array.isArray(row.expected) || !Array.isArray(row.forbidden))) throw new Error('Invalid evaluation query dataset');
const catalog = loadCatalog(root);
const sourceFiles = await Promise.all(['agent.mjs', 'catalog.mjs', 'search-semantics.mjs'].map(file => readFile(new URL(file, import.meta.url))));
const implementationHash = createHash('sha256');
for (const source of sourceFiles) implementationHash.update(source);
const agentVersion = implementationHash.digest('hex');
if (values.prepare) {
  console.log(JSON.stringify({ status: 'prepared_only', queries: dataset.queries.length, runs, searches: dataset.queries.length * runs, normalRequests: dataset.queries.length * runs * 2, maxRequestsWithRepair: dataset.queries.length * runs * 3, dataVersion: catalog.dataVersion, note: 'No provider called. Request budgets are upper bounds; empty candidates use one call. This is not an accuracy result.' }, null, 2));
} else {
  if (!values.config) throw new Error('Provide --config <explicit test JSON file> or use --prepare. Do not put API keys on the command line.');
  let config;
  try { config = JSON.parse((await readFile(path.resolve(values.config), 'utf8')).replace(/^\uFEFF/, '')); }
  catch { throw new Error('测试配置无法读取或解析，请检查指定的 JSON 文件。'); }
  const temporaryRoot = path.join(root, '.tmp');
  await mkdir(temporaryRoot, { recursive: true });
  const settingsDir = await mkdtemp(path.join(temporaryRoot, 'agent-eval-settings-'));
  const relative = path.relative(temporaryRoot, settingsDir);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe evaluation settings path');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  try {
    const store = await createSettings({ file: path.join(settingsDir, 'settings.json') });
    await store.save({ ...config, headers: (config.headers || []).map(row => ({ ...row, remember: false })) });
    const settings = store.credentials();
    const records = [];
    for (const row of dataset.queries) for (let run = 1; run <= runs; run++) {
      if (controller.signal.aborted) break;
      const started = performance.now(), diagnostics = [];
      let result, error;
      try {
        result = await matchCatalog({ query: row.query, answer: row.answer, clarificationHistory: row.clarificationHistory, skipQuestion: row.skipQuestion === true, allowTechniqueOnly: row.allowTechniqueOnly === true, catalog, settings, signal: controller.signal,
          onDiagnostics: event => diagnostics.push(event),
        });
      } catch (failure) { error = failure.message; }
      const cases = (result?.results?.cases || []).map(item => ({ id: item.id, title: item.title, relevanceTier: item.relevanceTier, matchType: item.matchType, reason: item.reason, gap: item.gap, evidence: item.evidence }));
      const forbiddenHits = cases.filter(item => row.forbidden.includes(item.id));
      const expectedHits = row.expected.filter(expected => cases.some(item => item.id === expected.id && item.relevanceTier === expected.tier));
      const tierErrors = cases.filter(item => row.expected.some(expected => expected.id === item.id && expected.tier !== item.relevanceTier));
      const candidates = diagnostics.find(event => event.stage === 'candidates')?.records || [];
      const finalDiagnostic = diagnostics.findLast(event => ['complete', 'error'].includes(event.stage));
      records.push({ queryId: row.id, query: row.query, run, stage: result?.stage || 'error', error, elapsedMs: performance.now() - started, searchPlan: result?.intent?.searchPlan,
        modelCalls: finalDiagnostic?.calls ?? diagnostics.filter(event => event.stage === 'request').length, candidateCounts: finalDiagnostic?.candidateCounts,
        cases, templates: (result?.results?.templates || []).map(item => ({ id: item.id, title: item.title, reason: item.reason, relevanceTier: item.relevanceTier, gap: item.gap, evidence: item.evidence })), diagnostics,
        reviewed: { expected: row.expected.length, expectedHits: expectedHits.length, expectedCandidateHits: row.expected.filter(expected => candidates.some(item => item.kind === 'case' && item.id === expected.id && item.relevanceTier === expected.tier)).length, forbiddenHits: forbiddenHits.map(item => item.id), tierErrors: tierErrors.map(item => item.id), techniqueLeaks: row.allowTechniqueOnly ? [] : cases.filter(item => item.relevanceTier === 'technique').map(item => item.id), unjudged: cases.filter(item => !row.expected.some(expected => expected.id === item.id) && !row.forbidden.includes(item.id)).length },
      });
      console.log(`${row.id} ${run}/${runs}: ${error ? 'error' : `${cases.length} cases`}, ${Math.round(performance.now() - started)}ms`);
    }
    const total = records.reduce((sum, item) => ({ expected: sum.expected + item.reviewed.expected, expectedHits: sum.expectedHits + item.reviewed.expectedHits, expectedCandidateHits: sum.expectedCandidateHits + item.reviewed.expectedCandidateHits, forbiddenHits: sum.forbiddenHits + item.reviewed.forbiddenHits.length, tierErrors: sum.tierErrors + item.reviewed.tierErrors.length, techniqueLeaks: sum.techniqueLeaks + item.reviewed.techniqueLeaks.length, unjudged: sum.unjudged + item.reviewed.unjudged, judgedReturned: sum.judgedReturned + item.cases.length - item.reviewed.unjudged, modelCalls: sum.modelCalls + (item.modelCalls || 0) }), { expected: 0, expectedHits: 0, expectedCandidateHits: 0, forbiddenHits: 0, tierErrors: 0, techniqueLeaks: 0, unjudged: 0, judgedReturned: 0, modelCalls: 0 });
    const latencies = records.map(item => item.elapsedMs).sort((a, b) => a - b);
    const report = { kind: 'configured_provider', model: settings.model, agentVersion, dataVersion: catalog.dataVersion, datasetVersion: dataset.version, createdAt: new Date().toISOString(), requestedSearches: dataset.queries.length * runs, attemptedSearches: records.length, completedSearches: records.filter(item => item.stage === 'agent').length, clarificationSearches: records.filter(item => item.stage === 'clarification').length,
      summary: { ...total, reviewedPrecision: total.judgedReturned ? total.expectedHits / total.judgedReturned : null, reviewedRecall: total.expected ? total.expectedHits / total.expected : null, reviewedCandidateRecall: total.expected ? total.expectedCandidateHits / total.expected : null, failures: records.filter(item => item.error).length, p95Ms: latencies[Math.max(0, Math.ceil(latencies.length * .95) - 1)], note: 'Metrics cover explicitly reviewed IDs only. Unjudged recommendations need human review. The configured provider may be a mock; identify it when reporting accuracy.' }, records };
    const output = values.out ? path.resolve(values.out) : path.join(temporaryRoot, 'desktop-agent-evaluation.json');
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Evaluation saved: ${output}`);
    if (controller.signal.aborted || report.summary.failures || total.forbiddenHits || total.tierErrors || total.techniqueLeaks) process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', cancel);
    await rm(settingsDir, { recursive: true, force: true });
  }
}
