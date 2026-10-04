import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const script = fileURLToPath(new URL('./evaluate-agent.mjs', import.meta.url));
const run = args => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [script, ...args], { cwd: tmpdir(), windowsHide: true });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  child.once('error', reject);
  child.once('exit', code => resolve({ code, output }));
});

test('evaluation prepare is a provider-free budget report for the frozen query matrix', async () => {
  const result = await run(['--prepare']);
  assert.equal(result.code, 0);
  const report = JSON.parse(result.output);
  assert.equal(report.status, 'prepared_only');
  assert.ok(report.queries >= 30);
  assert.equal(report.searches, report.queries * 3);
  assert.match(report.note, /No provider called/);
});

test('malformed explicit config does not print a JSON excerpt containing credentials', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'desktop-eval-bad-config-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'config.json');
  await writeFile(file, 'private-api-key-that-must-not-appear');
  const result = await run(['--config', file]);
  assert.notEqual(result.code, 0);
  assert.match(result.output, /测试配置无法读取或解析/);
  assert.ok(!result.output.includes('private-api-key-that-must-not-appear'));
});

test('explicit evaluation configuration produces qualified metrics without copying credentials into reports', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'desktop-eval-fixture-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const expected = ['mountain-dew-spark-b16d4e23caef', 'ugc-80d503f66caa'];
  const sessions = [];
  let requests = 0;
  const server = createServer(async (request, response) => {
    let text = ''; for await (const chunk of request) text += chunk;
    requests++; sessions.push(request.headers['x-opencode-session']);
    const payload = JSON.parse(text), input = JSON.parse(payload.messages.at(-1).content);
    const plan = { summary: '运动饮料产品广告', goal: 'product_ad', primaryKeywords: [{ concept: 'beverage.sports_drink', terms: ['运动饮料', 'sports drink'], role: 'primary_product' }], relatedKeywords: [{ concept: 'beverage', terms: ['饮料', 'beverage'], scope: 'related_product' }], required: [], optionalKeywords: [], excludeKeywords: [], allowTechniqueOnly: false, question: null };
    const missingSubject = { ...plan, summary: '产品待补充', primaryKeywords: [], relatedKeywords: [], uncertainty: '产品尚未明确', question: { text: '广告想展示什么产品？', options: ['饮料', '汽车'] } };
    const result = input.stage === 'intent' ? input.query === '做个广告' ? missingSubject : plan : { templates: [], cases: input.records.filter(record => record.kind === 'case' && expected.includes(record.id)).map(record => ({ id: record.id, reason: '仅作相关饮料产品参考', evidence: record.evidenceQuotes[0].quote, matchType: 'partial', relevanceTier: 'related_product' })) };
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ id: 'fixture', choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(result) } }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const config = path.join(dir, 'config.json'), queries = path.join(dir, 'queries.json'), output = path.join(dir, 'report.json');
  await writeFile(config, JSON.stringify({ baseURL: `http://127.0.0.1:${server.address().port}/v1`, model: 'mock-eval', apiKey: 'fixture-private-api-key', headers: [{ name: 'x-opencode-session', valueType: 'session' }, { name: 'x-private-fixture', value: 'fixture-private-header' }] }));
  await writeFile(queries, JSON.stringify({ version: 'fixture', queries: [{ id: 'fixture', query: '运动饮料广告', expected: expected.map(id => ({ id, tier: 'related_product' })), forbidden: ['seedance-2-5-f3651857750b'] }, { id: 'clarification', query: '做个广告', expected: [], forbidden: [] }] }));
  const execution = await run(['--config', config, '--queries', queries, '--out', output]);
  assert.equal(execution.code, 0, execution.output);
  const contents = await readFile(output, 'utf8'), report = JSON.parse(contents);
  assert.equal(report.kind, 'configured_provider');
  assert.equal(report.completedSearches, 3); assert.equal(requests, 9);
  assert.equal(report.attemptedSearches, 6); assert.equal(report.clarificationSearches, 3);
  assert.equal(report.summary.modelCalls, 9);
  const clarificationRuns = report.records.filter(row => row.stage === 'clarification');
  assert.equal(clarificationRuns.length, 3);
  assert.ok(clarificationRuns.every(row => row.modelCalls === 1 && row.cases.length === 0 && row.searchPlan.primaryKeywords.length === 0));
  assert.equal(report.summary.expectedHits, 6); assert.equal(report.summary.reviewedRecall, 1);
  assert.equal(report.summary.forbiddenHits, 0);
  assert.equal(report.summary.reviewedCandidateRecall, 1);
  assert.match(report.summary.note, /may be a mock/);
  assert.equal(new Set(sessions).size, 1); assert.match(sessions[0], /^[\da-f-]{36}$/i);
  for (const privateValue of ['fixture-private-api-key', 'fixture-private-header', sessions[0]]) assert.ok(!contents.includes(privateValue) && !execution.output.includes(privateValue));
  assert.match(report.agentVersion, /^[a-f\d]{64}$/);
});
