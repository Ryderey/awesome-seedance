import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { matchCatalog, testConnection } from './agent.mjs';

const intent = { summary: '猫咪广告', terms: ['cat', '猫咪'], excludeTerms: [], question: null };
const ranked = { templates: [{ id: 't1', reason: '猫咪主题', evidence: 'cat advertisement', matchType: 'full' }], cases: [{ id: 'c1', reason: '猫咪广告案例', evidence: 'cat advertisement', matchType: 'full' }] };
const local = { templates: [{ id: 't1', title: 'original template' }], cases: [{ id: 'c1', title: 'original case' }], totalTemplates: 1, totalCases: 1, elapsedMs: 2 };
const catalog = { search: () => structuredClone(local), evidence: () => [{ kind: 'template', id: 't1', content: 'cat advertisement' }, { kind: 'case', id: 'c1', content: 'cat advertisement' }], get: () => ({ prompt: 'original' }) };
async function mock(t, outputs, delay = 0) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
    const value = outputs.shift();
    const send = () => {
      if (res.destroyed) return;
      if (value?.status) { res.writeHead(value.status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'secret-test-key raw vendor error', type: 'error' } })); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'test', choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: typeof value === 'string' ? value : JSON.stringify(value) } }] }));
    };
    if (delay) setTimeout(send, delay); else send();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { requests, settings: { baseURL: `http://127.0.0.1:${server.address().port}/v1`, model: 'compatible-model', apiKey: 'secret-test-key', timeoutMs: 30000 } };
}
test('real SDK performs two basic requests and returns only local content', async t => {
  const { settings, requests } = await mock(t, [intent, ranked]);
  const result = await matchCatalog({ query: '猫咪广告', catalog, settings });
  assert.equal(result.stage, 'agent'); assert.equal(result.results.cases[0].title, 'original case');
  assert.equal(requests.length, 2); assert.equal(requests[0].url, '/v1/chat/completions');
  assert.equal(requests[0].auth, 'Bearer secret-test-key'); assert.equal(requests[0].body.model, 'compatible-model');
  assert.equal(requests[0].body.tools, undefined); assert.equal(requests[0].body.response_format, undefined);
});
test('one malformed output repairs once across both stages', async t => {
  const { settings, requests } = await mock(t, ['not JSON', intent, ranked]);
  assert.equal((await matchCatalog({ query: 'cat', catalog, settings })).stage, 'agent'); assert.equal(requests.length, 3);
});
test('invented IDs and repeated invalid output are rejected after one repair', async t => {
  const bad = { ...ranked, cases: [{ ...ranked.cases[0], id: 'invented' }] };
  const { settings, requests } = await mock(t, [intent, bad, bad]);
  await assert.rejects(matchCatalog({ query: 'cat', catalog, settings }), /无法验证/); assert.equal(requests.length, 3);
});
test('repair budget is shared across intent and ranking rather than renewed', async t => {
  const { settings, requests } = await mock(t, ['bad intent', intent, 'bad ranking', ranked]);
  await assert.rejects(matchCatalog({ query: 'cat', catalog, settings }), /无法验证/);
  assert.equal(requests.length, 3);
});
test('no-match model result retains no arbitrary records', async t => {
  const { settings } = await mock(t, [intent, { templates: [], cases: [] }]);
  const result = await matchCatalog({ query: 'spaceship', catalog, settings });
  assert.deepEqual(result.results.templates, []); assert.deepEqual(result.results.cases, []);
  assert.equal(result.results.totalCases, 0);
});
test('unsupported evidence and duplicate IDs never become recommendations', async t => {
  for (const bad of [{ ...ranked, cases: [{ ...ranked.cases[0], evidence: 'spaceship' }] }, { ...ranked, templates: [...ranked.templates, ...ranked.templates] }]) {
    const { settings } = await mock(t, [intent, bad, bad]);
    await assert.rejects(matchCatalog({ query: 'cat', catalog, settings }), /无法验证/);
  }
});
test('one optional question; answer and skip suppress repeated questions', async t => {
  const asking = { ...intent, question: { text: '需要哪种风格？', options: ['写实', '动画'] } };
  const a = await mock(t, [asking]);
  assert.equal((await matchCatalog({ query: 'cat', catalog, settings: a.settings })).stage, 'clarification');
  for (const extra of [{ answer: '动画' }, { skipQuestion: true }]) {
    const b = await mock(t, [asking, ranked]);
    assert.equal((await matchCatalog({ query: 'cat', catalog, settings: b.settings, ...extra })).stage, 'agent'); assert.equal(b.requests.length, 2);
  }
});
test('authentication error is safe and SDK does not retry', async t => {
  const { settings, requests } = await mock(t, [{ status: 401 }]);
  await assert.rejects(testConnection(settings), error => /认证失败/.test(error.message) && !error.message.includes('secret')); assert.equal(requests.length, 1);
});
test('timeouts and cancellation propagate to actual SDK requests', async t => {
  const a = await mock(t, ['OK'], 500);
  await assert.rejects(testConnection({ ...a.settings, timeoutMs: 100 }), /超时/);
  const b = await mock(t, ['OK'], 500);
  const controller = new AbortController(); setTimeout(() => controller.abort(), 100);
  await assert.rejects(testConnection(b.settings, { signal: controller.signal }), /取消/);
});
test('connection test uses one compatible chat request', async t => {
  const { settings, requests } = await mock(t, ['OK']);
  assert.equal((await testConnection(settings)).ok, true); assert.equal(requests.length, 1);
});
