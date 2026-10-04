import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matchCatalog, testConnection, validateSearchPlan, validateClarificationHistory, AGENT_ROLE_PROMPT } from './agent.mjs';
import { loadCatalog } from './catalog.mjs';
import { SEMANTIC_VOCABULARY } from './search-semantics.mjs';
import { fileURLToPath } from 'node:url';
import { createSettings } from './settings.mjs';

const intent = { summary: '猫咪主题', goal: 'general', primaryKeywords: [{ concept: 'cat', terms: ['猫咪', 'cat'], role: 'primary' }], relatedKeywords: [], required: ['猫咪'], optionalKeywords: [], excludeKeywords: [], allowTechniqueOnly: false, question: null };
const sportsIntent = { ...intent, summary: '运动饮料广告', goal: 'product_ad', primaryKeywords: [{ concept: 'beverage.sports_drink', terms: ['运动饮料', 'sports drink'], role: 'primary_product' }], relatedKeywords: [{ concept: 'beverage', terms: ['饮料', 'beverage'], scope: 'related_product' }], required: ['运动饮料产品', '广告用途'] };
const ranked = { templates: [{ id: 't1', reason: '猫咪主题', evidence: 'cat advertisement', matchType: 'full', relevanceTier: 'topic' }], cases: [{ id: 'c1', reason: '猫咪广告案例', evidence: 'cat advertisement', matchType: 'full', relevanceTier: 'topic' }] };
const local = { templates: [{ id: 't1', title: 'original template' }], cases: [{ id: 'c1', title: 'original case' }], totalTemplates: 1, totalCases: 1, elapsedMs: 2 };
const catalog = { searchPlan: () => structuredClone(local), evidence: () => [{ kind: 'template', id: 't1', content: 'cat advertisement', relevanceTier: 'topic', matchType: 'full', gap: '' }, { kind: 'case', id: 'c1', content: 'cat advertisement', relevanceTier: 'topic', matchType: 'full', gap: '' }], get: () => ({ prompt: 'original' }) };
async function mock(t, outputs, delay = 0) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push({ url: req.url, auth: req.headers.authorization, headers: req.headers, body: JSON.parse(body) });
    const output = outputs.shift();
    const value = typeof output === 'function' ? output(requests.at(-1).body) : output;
    const send = () => {
      if (res.destroyed) return;
      if (value?.status) { res.writeHead(value.status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'secret-test-key raw vendor error', type: 'error' } })); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'test', choices: [{ finish_reason: value?.finishReason ?? 'stop', message: { role: 'assistant', content: value?.finishReason ? value.content : typeof value === 'string' ? value : JSON.stringify(value) } }] }));
    };
    const wait = Array.isArray(delay) ? delay.shift() : delay;
    if (wait) setTimeout(send, wait); else send();
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

test('no candidate evidence skips the ranking request', async t => {
  const { settings, requests } = await mock(t, [intent]);
  const result = await matchCatalog({ query: 'cat', catalog: { ...catalog, evidence: () => [] }, settings });
  assert.equal(requests.length, 1);
  assert.equal(result.stage, 'agent');
  assert.deepEqual(result.results.templates, []); assert.deepEqual(result.results.cases, []);
  assert.equal(result.results.totalTemplates, 0); assert.equal(result.results.totalCases, 0);
});

test('validated Agent plan controls search without merging raw query words', async t => {
  const query = '运动饮料广告，不要汽车', answer = '更偏向产品特写';
  const refined = { ...sportsIntent, excludeKeywords: [{ concept: 'vehicle', terms: ['汽车', 'car'] }] };
  const { settings, requests } = await mock(t, [refined, { templates: [], cases: [] }]);
  let searchInput;
  await matchCatalog({ query, answer, catalog: { ...catalog, searchPlan: (...args) => { searchInput = args; return structuredClone(local); } }, settings });
  assert.deepEqual(searchInput[0], refined);
  assert.equal(typeof searchInput[0], 'object');
  assert.equal(searchInput[0].primaryKeywords[0].terms[1], 'sports drink');
  const input = JSON.parse(requests[1].body.messages[1].content);
  assert.equal(input.query, query); assert.equal(input.answer, answer); assert.deepEqual(input.searchPlan, refined);
  assert.equal(input.stage, 'ranking');
  for (const request of requests) assert.ok(request.body.messages[0].content.startsWith(AGENT_ROLE_PROMPT));
});

test('unsupported evidence and duplicate IDs never become recommendations', async t => {
  for (const bad of [{ ...ranked, cases: [{ ...ranked.cases[0], evidence: 'spaceship' }] }, { ...ranked, templates: [...ranked.templates, ...ranked.templates] }]) {
    const { settings } = await mock(t, [intent, bad, bad]);
    await assert.rejects(matchCatalog({ query: 'cat', catalog, settings }), /无法验证/);
  }
});
test('legacy answer consumes one round; skip suppresses questions and marks broad results', async t => {
  const asking = { ...intent, question: { text: '需要哪种风格？', options: ['写实', '动画'] } };
  const a = await mock(t, [asking]);
  assert.equal((await matchCatalog({ query: 'cat', catalog, settings: a.settings })).stage, 'clarification');
  const b = await mock(t, [asking]);
  assert.equal((await matchCatalog({ query: 'cat', catalog, settings: b.settings, answer: '动画' })).clarificationRound, 2);
  const c = await mock(t, [asking, { templates: [], cases: [] }]);
  const skipped = await matchCatalog({ query: 'cat', catalog: { ...catalog, vocabulary: SEMANTIC_VOCABULARY }, settings: c.settings, skipQuestion: true });
  assert.equal(skipped.stage, 'agent'); assert.equal(skipped.results.broadReference, true); assert.equal(c.requests.length, 2);
});

test('missing subject asks before retrieval, supports a second round, and waits without ranking', async t => {
  const asking = { ...intent, primaryKeywords: [], question: { text: '想拍什么主体？', options: ['产品', '人物'] } };
  for (const clarificationHistory of [[], [{ question: '用途是什么？', answer: '广告' }]]) {
    const { settings, requests } = await mock(t, [asking]);
    const result = await matchCatalog({ query: '做个广告', clarificationHistory, settings, catalog: { ...catalog, searchPlan: () => assert.fail('question must not retrieve') } });
    assert.equal(result.stage, 'clarification'); assert.equal(result.clarificationRound, clarificationHistory.length + 1);
    assert.equal(result.maxClarificationRounds, 2); assert.equal(requests.length, 1);
    assert.deepEqual(JSON.parse(requests[0].body.messages[1].content).clarificationHistory, clarificationHistory);
  }
});

test('malformed clarification histories fail before any SDK call', async t => {
  const { settings, requests } = await mock(t, [intent]);
  const valid = { question: '用途？', answer: '广告' };
  for (const history of [null, {}, [valid, valid, valid], [null], [{ ...valid, answer: 1 }], [{ ...valid, question: ' ' }], [{ ...valid, answer: 'a'.repeat(1001) }], [{ ...valid, question: 'q'.repeat(241) }]]) {
    assert.throws(() => validateClarificationHistory(history), /历史无效/);
    await assert.rejects(matchCatalog({ query: '广告', catalog, settings, clarificationHistory: history }), /历史无效/);
  }
  assert.equal(requests.length, 0);
  const clean = validateClarificationHistory([{ question: ' 用途？ ', answer: ' 广告 ' }]);
  assert.deepEqual(clean, [valid]);
  clean[0].answer = '另一个'; assert.equal(valid.answer, '广告');
});

test('ordered two-round history reaches ranking; latest product overrides without deleting earlier constraints', async t => {
  const clarificationHistory = [{ question: '产品与条件？', answer: '运动饮料广告，不要汽车' }, { question: '产品确定吗？', answer: '改成咖啡广告' }];
  const refined = { ...sportsIntent, primaryKeywords: [{ concept: 'beverage.coffee', terms: ['咖啡', 'coffee'], role: 'primary_product' }], relatedKeywords: [], required: ['广告用途'], excludeKeywords: [{ concept: 'vehicle', terms: ['汽车', 'car'] }] };
  const { settings, requests } = await mock(t, [refined, { templates: [], cases: [] }]);
  const result = await matchCatalog({ query: '做个广告', clarificationHistory, catalog: { ...catalog, vocabulary: SEMANTIC_VOCABULARY }, settings });
  assert.equal(result.stage, 'agent'); assert.equal(result.results.broadReference, undefined);
  for (const request of requests) {
    const body = JSON.parse(request.body.messages[1].content);
    assert.equal(body.query, '做个广告'); assert.deepEqual(body.clarificationHistory, clarificationHistory);
  }
  assert.equal(JSON.parse(requests[0].body.messages[1].content).remainingClarificationRounds, 0);
  assert.equal(result.intent.searchPlan.excludeKeywords[0].concept, 'vehicle');
  assert.throws(() => validateSearchPlan(sportsIntent, { query: '做个广告', clarificationHistory, vocabulary: SEMANTIC_VOCABULARY }), /invalid output/);
});

test('a bare specific product answer refines its earlier parent without triggering an intent repair', async t => {
  const clarificationHistory = [{ question: '什么产品？', answer: '饮料' }, { question: '哪种饮料？', answer: '运动饮料' }];
  const { settings, requests } = await mock(t, [sportsIntent, { templates: [], cases: [] }]);
  const result = await matchCatalog({ query: '做个广告', clarificationHistory, catalog: { ...catalog, vocabulary: SEMANTIC_VOCABULARY }, settings });
  assert.equal(result.stage, 'agent'); assert.equal(result.results.broadReference, undefined); assert.equal(requests.length, 2);
  assert.equal(result.intent.searchPlan.primaryKeywords[0].concept, 'beverage.sports_drink');
  const weakened = { ...sportsIntent, primaryKeywords: [{ concept: 'beverage', terms: ['饮料'], role: 'primary_product' }] };
  assert.throws(() => validateSearchPlan(weakened, { query: '做个广告', clarificationHistory, vocabulary: SEMANTIC_VOCABULARY }), /invalid output/);
  const unrelatedHistory = [{ question: '商品？', answer: '咖啡和运动饮料' }];
  const asking = { ...sportsIntent, primaryKeywords: [], relatedKeywords: [], question: { text: '哪个是主要商品？', options: ['咖啡', '运动饮料'] } };
  assert.ok(validateSearchPlan(asking, { query: '做个广告', clarificationHistory: unrelatedHistory, vocabulary: SEMANTIC_VOCABULARY }).question);
});

test('explicit purpose clarification overrides conflicting ad purpose without weakening the product', () => {
  const options = { query: '运动饮料广告，但用途要纪录片', clarificationHistory: [{ question: '最终用途是广告还是纪录片？', answer: '纪录片' }], vocabulary: SEMANTIC_VOCABULARY };
  const documentary = { ...sportsIntent, goal: 'documentary', primaryKeywords: [{ concept: 'beverage.sports_drink', terms: ['运动饮料'], role: 'primary' }], relatedKeywords: [], required: ['纪录片用途'] };
  assert.equal(validateSearchPlan(documentary, options).goal, 'documentary');
  assert.throws(() => validateSearchPlan({ ...documentary, primaryKeywords: [{ concept: 'beverage', terms: ['饮料'], role: 'primary' }] }, options), /invalid output/);
  assert.throws(() => validateSearchPlan(sportsIntent, options), /invalid output/);
  assert.throws(() => validateSearchPlan({ ...sportsIntent, primaryKeywords: [{ ...sportsIntent.primaryKeywords[0], role: 'primary' }] }, options), /invalid output/);
  for (const answer of ['蓝色调', '纪录片风格', '加入纪录片质感']) {
    assert.throws(() => validateSearchPlan(documentary, { ...options, query: '运动饮料广告', clarificationHistory: [{ question: '什么风格？', answer }] }), /invalid output/);
  }
  assert.throws(() => validateSearchPlan(documentary, { ...options, query: '运动饮料广告', clarificationHistory: [{ question: '什么风格？', answer: '纪录片' }] }), /invalid output/);
  assert.throws(() => validateSearchPlan({ ...documentary, goal: 'story' }, { ...options, query: '想拍运动饮料视频' }), /invalid output/);
  assert.equal(validateSearchPlan(documentary, { ...options, clarificationHistory: [...options.clarificationHistory, { question: '画面色调？', answer: '蓝色调' }] }).goal, 'documentary');
});

test('SDK intent and ranking honor the clarified documentary purpose in the original conflicting query', async t => {
  const clarificationHistory = [{ question: '最终用途是广告还是纪录片？', answer: '改成纪录片' }];
  const documentary = { ...sportsIntent, goal: 'documentary', primaryKeywords: [{ concept: 'beverage.sports_drink', terms: ['运动饮料'], role: 'primary' }], relatedKeywords: [], required: ['纪录片用途'] };
  const { settings, requests } = await mock(t, [documentary, { templates: [], cases: [] }]);
  const result = await matchCatalog({ query: '运动饮料广告，但用途要纪录片', clarificationHistory, settings, catalog: { ...catalog, vocabulary: SEMANTIC_VOCABULARY } });
  assert.equal(result.stage, 'agent'); assert.equal(result.intent.searchPlan.goal, 'documentary'); assert.equal(requests.length, 2);
  assert.deepEqual(JSON.parse(requests[1].body.messages[1].content).clarificationHistory, clarificationHistory);
});

test('a directly negated previous product does not defeat the latest coffee correction', () => {
  const clarificationHistory = [{ question: '商品？', answer: '运动饮料' }, { question: '商品确定吗？', answer: '不是运动饮料，是咖啡' }];
  const coffee = { ...sportsIntent, primaryKeywords: [{ concept: 'beverage.coffee', terms: ['咖啡'], role: 'primary_product' }], relatedKeywords: [], required: ['广告用途'] };
  const options = { query: '做个广告', clarificationHistory, vocabulary: SEMANTIC_VOCABULARY };
  assert.equal(validateSearchPlan(coffee, options).primaryKeywords[0].concept, 'beverage.coffee');
  assert.throws(() => validateSearchPlan(sportsIntent, options), /invalid output/);
});

test('skip and exhausted rounds suppress a third question and cap every candidate at uncertain partial', async t => {
  const asking = { ...intent, primaryKeywords: [], question: { text: '主体是什么？', options: ['商品', '人物'] } };
  const history = [{ question: '用途？', answer: '参考' }, { question: '主体？', answer: '还没想好' }];
  for (const extra of [{ skipQuestion: true }, { clarificationHistory: history }]) {
    const uncertain = { templates: [], cases: [{ ...ranked.cases[0], relevanceTier: 'uncertain', matchType: 'partial' }] };
    const { settings, requests } = await mock(t, [asking, uncertain]);
    const result = await matchCatalog({ query: '高级感', catalog, settings, ...extra });
    assert.equal(result.stage, 'agent'); assert.equal(requests.length, 2);
    assert.equal(result.intent.broadReference, true); assert.equal(result.results.broadReference, true);
    assert.ok(result.results.uncertainty); assert.equal(result.intent.searchPlan.question, null);
    for (const record of JSON.parse(requests[1].body.messages[1].content).records) {
      assert.equal(record.relevanceTier, 'uncertain'); assert.equal(record.matchType, 'partial');
    }
    assert.equal(result.results.cases[0].matchType, 'partial'); assert.equal(result.results.cases[0].relevanceTier, 'uncertain');
  }
  const { settings, requests } = await mock(t, [asking, ranked, ranked]);
  await assert.rejects(matchCatalog({ query: '高级感', catalog, settings, skipQuestion: true }), /无法验证/);
  assert.equal(requests.length, 3, 'dishonest broad upgrades get only one shared repair');
});

test('skip is broad even when the model forgets uncertainty, while missing subject cannot silently skip a permitted question', async t => {
  const forgotten = { ...intent, primaryKeywords: [] };
  const { settings, requests } = await mock(t, [forgotten, { templates: [], cases: [] }]);
  const result = await matchCatalog({ query: '参考', catalog, settings, skipQuestion: true });
  assert.equal(result.results.broadReference, true); assert.equal(requests.length, 2);
  assert.throws(() => validateSearchPlan(forgotten), /invalid output/);
  assert.equal(validateSearchPlan(intent, { query: '猫咪', skipQuestion: true }).broadReference, true);
  assert.throws(() => validateSearchPlan({ ...forgotten, relatedKeywords: [{ concept: 'beverage', terms: ['饮料'], scope: 'related_product' }] }, { skipQuestion: true }), /invalid output/);
  const completedHistory = [{ question: '主体？', answer: '猫咪' }, { question: '用途？', answer: '广告' }];
  for (const uncertainty of ['', ' ']) {
    assert.equal(validateSearchPlan({ ...intent, goal: 'product_ad', uncertainty }, { clarificationHistory: completedHistory }).broadReference, undefined);
  }
  assert.throws(() => validateSearchPlan({ ...intent, uncertainty: 1 }), /invalid output/);
  assert.throws(() => validateSearchPlan({ ...intent, uncertainty: 'x'.repeat(501) }), /invalid output/);
});

test('a repaired missing-subject question stops after the shared repair without retrieving', async t => {
  const asking = { ...intent, primaryKeywords: [], question: { text: '主体是什么？', options: ['商品', '人物'] } };
  const { settings, requests } = await mock(t, ['malformed', asking]);
  const result = await matchCatalog({ query: '广告', settings, catalog: { ...catalog, searchPlan: () => assert.fail('question does not retrieve') } });
  assert.equal(result.stage, 'clarification'); assert.equal(requests.length, 2);
});

test('broad fallback retains explicit product guard instead of weakening sports drink to arbitrary ads', () => {
  const empty = { ...sportsIntent, primaryKeywords: [], question: null, uncertainty: '用途细节不足' };
  for (const options of [{ skipQuestion: true }, { clarificationHistory: [{ question: '用途？', answer: '广告' }, { question: '风格？', answer: '还没想好' }] }]) {
    assert.throws(() => validateSearchPlan(empty, { ...options, query: '运动饮料广告', vocabulary: SEMANTIC_VOCABULARY }), /invalid output/);
  }
});

test('broad primary keywords must be grounded in query or answers, never question options', () => {
  const options = { query: '做个广告', skipQuestion: true, vocabulary: SEMANTIC_VOCABULARY };
  assert.throws(() => validateSearchPlan(sportsIntent, options), /invalid output/);
  assert.equal(validateSearchPlan({ ...sportsIntent, primaryKeywords: [], relatedKeywords: [], required: [] }, options).broadReference, true);
  assert.equal(validateSearchPlan(sportsIntent, { ...options, clarificationHistory: [{ question: '产品？', answer: '运动饮料' }] }).primaryKeywords[0].concept, 'beverage.sports_drink');
  const fakeBrand = { ...sportsIntent, primaryKeywords: [{ concept: 'unknown', terms: ['耐克', 'Nike'], role: 'primary_product' }], relatedKeywords: [], required: [] };
  assert.throws(() => validateSearchPlan(fakeBrand, options), /invalid output/);
  assert.equal(validateSearchPlan(fakeBrand, { ...options, clarificationHistory: [{ question: '哪种产品？', answer: '耐克' }] }).primaryKeywords[0].terms[0], '耐克');
  assert.throws(() => validateSearchPlan(sportsIntent, { ...options, clarificationHistory: [{ question: '运动饮料还是咖啡？', answer: '没想好' }] }), /invalid output/);
  const disguised = { ...fakeBrand, primaryKeywords: [{ concept: 'unknown', terms: ['耐克', '饮料'], role: 'primary_product' }] };
  assert.throws(() => validateSearchPlan(disguised, { ...options, query: '饮料广告' }), /invalid output/);
});

test('broad fallback cannot invent a purpose, while explicitly supplied conflicting purposes remain available', () => {
  const broad = { ...intent, primaryKeywords: [], relatedKeywords: [], required: [] };
  const options = { query: '高级感', skipQuestion: true, vocabulary: SEMANTIC_VOCABULARY };
  assert.equal(validateSearchPlan(broad, options).goal, 'general');
  for (const goal of ['product_ad', 'ugc_review', 'documentary', 'vlog', 'story', 'technique']) assert.throws(() => validateSearchPlan({ ...broad, goal }, options), /invalid output/);
  assert.equal(validateSearchPlan({ ...broad, goal: 'product_ad' }, { ...options, query: '做个广告' }).goal, 'product_ad');
  assert.throws(() => validateSearchPlan(broad, { ...options, query: '做个广告' }), /invalid output/);
  assert.equal(validateSearchPlan({ ...broad, goal: 'technique' }, { ...options, query: '找镜头拍法参考' }).goal, 'technique');
  for (const goal of ['product_ad', 'documentary']) assert.equal(validateSearchPlan({ ...broad, goal }, { ...options, query: '做个广告，但用途要纪录片' }).goal, goal);
  assert.throws(() => validateSearchPlan({ ...broad, goal: 'documentary' }, { ...options, clarificationHistory: [{ question: '画面风格？', answer: '纪录片' }] }), /invalid output/);
});

test('invented broad product consumes only the existing single format repair', async t => {
  const realVocabularyCatalog = { ...catalog, vocabulary: SEMANTIC_VOCABULARY };
  const honest = { ...sportsIntent, primaryKeywords: [], relatedKeywords: [], required: [], uncertainty: '产品未指定，仅按广告用途提供参考' };
  const corrected = await mock(t, [sportsIntent, honest, { templates: [], cases: [] }]);
  const result = await matchCatalog({ query: '做个广告', skipQuestion: true, catalog: realVocabularyCatalog, settings: corrected.settings });
  assert.equal(result.stage, 'agent'); assert.equal(result.results.broadReference, true); assert.equal(corrected.requests.length, 3);
  const repeated = await mock(t, [sportsIntent, sportsIntent]);
  await assert.rejects(matchCatalog({ query: '做个广告', skipQuestion: true, catalog: realVocabularyCatalog, settings: repeated.settings }), /无法验证/);
  assert.equal(repeated.requests.length, 2);
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

test('custom headers and one runtime session ID reach probe, intent, ranking and repair requests', async t => {
  const { settings, requests } = await mock(t, ['OK', intent, 'invalid ranking', ranked, 'OK']);
  const dir = await mkdtemp(join(tmpdir(), 'desktop-header-wire-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'settings.json');
  const store = await createSettings({ file });
  await store.save({ ...settings, headers: [
    { name: 'X-Opencode-Session', valueType: 'session', remember: true },
    { name: 'X-Provider-Option', value: 'fixture-fixed', remember: true },
    { name: 'X-Disabled', value: 'not-sent', enabled: false },
  ] });
  await testConnection(store.credentials());
  await matchCatalog({ query: 'cat', catalog, settings: store.credentials() });
  assert.equal(requests.length, 4);
  const session = store.credentials().requestHeaders['X-Opencode-Session'];
  for (const request of requests) {
    assert.equal(request.headers['x-opencode-session'], session);
    assert.equal(request.headers['x-provider-option'], 'fixture-fixed'); assert.equal(request.headers['x-disabled'], undefined);
    assert.equal(request.auth, 'Bearer secret-test-key'); assert.equal(request.headers['content-type'], 'application/json');
  }
  const restarted = await createSettings({ file });
  await restarted.save({ apiKey: settings.apiKey });
  await testConnection(restarted.credentials());
  assert.notEqual(requests[4].headers['x-opencode-session'], session);
  assert.equal(requests[4].headers['x-provider-option'], 'fixture-fixed');
});

test('slow ranking times out with measured stage diagnostics and no HTTP rate-limit error', async t => {
  const { settings, requests } = await mock(t, [intent, ranked], [0, 500]);
  const diagnostics = [];
  await assert.rejects(matchCatalog({ query: 'cat', catalog, settings: { ...settings, timeoutMs: 100 }, onDiagnostics: event => diagnostics.push(event) }), error => {
    assert.match(error.message, /超时.*排序/);
    assert.match(error.message, /已等待.+秒.*单次请求上限 0\.1 秒/);
    assert.doesNotMatch(error.message, /限流|secret|raw vendor/);
    return true;
  });
  assert.equal(requests.length, 2, 'Timeout must not retry the network request');
  const request = diagnostics.find(event => event.stage === 'request' && event.requestStage === 'ranking');
  assert.equal(request.outcome, 'timeout');
  assert.equal(request.sourceStage, 'ranking');
  assert.equal(request.timeoutMs, 100);
  assert.ok(request.elapsedMs >= 70);
  assert.equal(request.httpStatus, undefined);
  assert.equal(diagnostics.at(-1).outcome, 'timeout');
  assert.equal(diagnostics.at(-1).requestStage, 'ranking');
});

test('slow ranking repair has its own timeout and a distinct repair stage', async t => {
  const { settings, requests } = await mock(t, [intent, 'invalid ranking', ranked], [0, 0, 500]);
  const diagnostics = [];
  await assert.rejects(matchCatalog({ query: 'cat', catalog, settings: { ...settings, timeoutMs: 100 }, onDiagnostics: event => diagnostics.push(event) }), /超时.*排序结果修复/);
  assert.equal(requests.length, 3);
  const request = diagnostics.find(event => event.stage === 'request' && event.requestStage === 'repair');
  assert.equal(request.sourceStage, 'ranking');
  assert.equal(request.outcome, 'timeout');
  assert.equal(request.timeoutMs, 100);
  assert.ok(request.elapsedMs >= 70);
});

test('slow intent and intent repair identify the correct request rather than a ranking timeout', async t => {
  for (const scenario of [
    { outputs: [intent], delays: [500], requestStage: 'intent', calls: 1, label: /超时.*意图分析/ },
    { outputs: ['invalid intent', intent], delays: [0, 500], requestStage: 'repair', calls: 2, label: /超时.*意图分析结果修复/ },
  ]) {
    const { settings, requests } = await mock(t, scenario.outputs, scenario.delays), diagnostics = [];
    await assert.rejects(matchCatalog({ query: 'cat', catalog, settings: { ...settings, timeoutMs: 100 }, onDiagnostics: event => diagnostics.push(event) }), scenario.label);
    assert.equal(requests.length, scenario.calls);
    const request = diagnostics.filter(event => event.stage === 'request').at(-1);
    assert.equal(request.requestStage, scenario.requestStage);
    assert.equal(request.sourceStage, 'intent');
    assert.equal(request.outcome, 'timeout');
    assert.ok(request.elapsedMs >= 70);
  }
});

test('the SDK fallback and settings default both use a 90-second request deadline', async t => {
  const { settings } = await mock(t, [intent]), diagnostics = [];
  delete settings.timeoutMs;
  await matchCatalog({ query: 'cat', catalog: { ...catalog, evidence: () => [] }, settings, onDiagnostics: event => diagnostics.push(event) });
  assert.equal(diagnostics.find(event => event.stage === 'request').timeoutMs, 90000);
});

test('missing or null output cap omits max_tokens for probe, intent and ranking', async t => {
  for (const maxOutputTokens of [undefined, null]) {
    const { settings, requests } = await mock(t, ['OK', intent, ranked]), diagnostics = [];
    const configured = { ...settings, maxOutputTokens };
    await testConnection(configured, { onDiagnostics: event => diagnostics.push(event) });
    await matchCatalog({ query: 'cat', catalog, settings: configured, onDiagnostics: event => diagnostics.push(event) });
    assert.equal(requests.length, 3);
    for (const request of requests) assert.equal(Object.hasOwn(request.body, 'max_tokens'), false);
    const timings = diagnostics.filter(event => event.stage === 'request');
    assert.deepEqual(timings.map(event => event.requestStage), ['probe', 'intent', 'ranking']);
    for (const request of timings) assert.equal(request.maxOutputTokens, null);
  }
});

test('configured output cap reaches probe, intent, ranking and the shared format repair', async t => {
  const { settings, requests } = await mock(t, ['OK', intent, 'invalid ranking', ranked]), diagnostics = [];
  const configured = { ...settings, maxOutputTokens: 8192 };
  await testConnection(configured, { onDiagnostics: event => diagnostics.push(event) });
  const result = await matchCatalog({ query: 'cat', catalog, settings: configured, onDiagnostics: event => diagnostics.push(event) });
  assert.equal(result.stage, 'agent');
  assert.equal(requests.length, 4);
  for (const request of requests) assert.equal(request.body.max_tokens, 8192);
  for (const request of diagnostics.filter(event => event.stage === 'request')) assert.equal(request.maxOutputTokens, 8192);
});

test('all explicit reasoning grades reach every request with independent output parameters and no hidden grade caps', async t => {
  for (const reasoningEffort of ['none', 'high', 'max']) {
    for (const maxOutputTokens of [null, 8192]) {
      for (const maxOutputParameter of ['max_tokens', 'max_completion_tokens']) {
      const { settings, requests } = await mock(t, ['OK', intent, 'invalid ranking', ranked]), diagnostics = [];
      const configured = { ...settings, reasoningEffort, maxOutputTokens, maxOutputParameter };
      await testConnection(configured, { onDiagnostics: event => diagnostics.push(event) });
      await matchCatalog({ query: 'cat', catalog, settings: configured, onDiagnostics: event => diagnostics.push(event) });
      assert.equal(requests.length, 4);
      for (const request of requests) {
        assert.equal(request.body.reasoning_effort, reasoningEffort);
        const otherParameter = maxOutputParameter === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens';
        assert.equal(Object.hasOwn(request.body, otherParameter), false);
        if (maxOutputTokens === null) assert.equal(Object.hasOwn(request.body, maxOutputParameter), false);
        else assert.equal(request.body[maxOutputParameter], maxOutputTokens);
      }
      for (const request of diagnostics.filter(event => event.stage === 'request')) {
        assert.equal(request.reasoningEffort, reasoningEffort);
        assert.equal(request.limitParameter, maxOutputTokens === null ? null : maxOutputParameter);
      }
      }
    }
  }
});

test('default reasoning is omitted and an explicit reasoning HTTP 400 does not silently downgrade or retry', async t => {
  for (const reasoningEffort of [undefined, null]) {
    const { settings, requests } = await mock(t, [intent, ranked]), diagnostics = [];
    await matchCatalog({ query: 'cat', catalog, settings: { ...settings, reasoningEffort, maxOutputTokens: 4096 }, onDiagnostics: event => diagnostics.push(event) });
    for (const request of requests) {
      assert.equal(Object.hasOwn(request.body, 'reasoning_effort'), false);
      assert.equal(Object.hasOwn(request.body, 'max_completion_tokens'), false);
      assert.equal(request.body.max_tokens, 4096);
    }
    for (const request of diagnostics.filter(event => event.stage === 'request')) {
      assert.equal(request.reasoningEffort, null);
      assert.equal(request.limitParameter, 'max_tokens');
    }
  }
  const { settings, requests } = await mock(t, [{ status: 400 }, intent, ranked]);
  await assert.rejects(matchCatalog({ query: 'cat', catalog, settings: { ...settings, reasoningEffort: 'none', maxOutputTokens: 8192, maxOutputParameter: 'max_completion_tokens' } }), /HTTP 400/);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.reasoning_effort, 'none');
  assert.equal(requests[0].body.max_completion_tokens, 8192);
});

test('HTTP 200 length in intent, ranking or repair is a distinct truncation and never triggers another call', async t => {
  const emptyTruncated = { finishReason: 'length', content: '' };
  for (const scenario of [
    { outputs: [emptyTruncated], requestStage: 'intent', sourceStage: 'intent', calls: 1 },
    { outputs: [intent, emptyTruncated], requestStage: 'ranking', sourceStage: 'ranking', calls: 2 },
    { outputs: ['invalid intent', emptyTruncated], requestStage: 'repair', sourceStage: 'intent', calls: 2 },
    { outputs: [intent, 'invalid ranking', emptyTruncated], requestStage: 'repair', sourceStage: 'ranking', calls: 3 },
    { outputs: [intent, { finishReason: 'length', content: JSON.stringify(ranked) }], requestStage: 'ranking', sourceStage: 'ranking', calls: 2 },
  ]) {
    const { settings, requests } = await mock(t, scenario.outputs), diagnostics = [];
    await assert.rejects(matchCatalog({ query: 'cat', catalog, settings: { ...settings, maxOutputTokens: 4096 }, onDiagnostics: event => diagnostics.push(event) }), error => {
      assert.equal(error.code, 'MODEL_TRUNCATED');
      assert.match(error.message, /输出被截断/);
      assert.match(error.message, /4096/);
      assert.match(error.message, scenario.sourceStage === 'intent' ? /意图分析/ : /候选排序/);
      if (scenario.requestStage === 'repair') assert.match(error.message, /结果修复/);
      assert.doesNotMatch(error.message, /超时|限流|secret|raw vendor/);
      return true;
    });
    assert.equal(requests.length, scenario.calls);
    const request = diagnostics.filter(event => event.stage === 'request').at(-1);
    assert.equal(request.requestStage, scenario.requestStage);
    assert.equal(request.sourceStage, scenario.sourceStage);
    assert.equal(request.outcome, 'truncated_output');
    assert.equal(request.maxOutputTokens, 4096);
    assert.equal(diagnostics.at(-1).outcome, 'truncated_output');
    assert.equal(diagnostics.at(-1).maxOutputTokens, 4096);
  }
});

test('truncated probe reports the model default cap safely and HTTP 408/504 remain HTTP failures', async t => {
  const probe = await mock(t, [{ finishReason: 'length', content: '' }]), diagnostics = [];
  await assert.rejects(testConnection(probe.settings, { onDiagnostics: event => diagnostics.push(event) }), error => {
    assert.equal(error.code, 'MODEL_TRUNCATED');
    assert.match(error.message, /连接测试.*模型默认/);
    return true;
  });
  assert.equal(probe.requests.length, 1);
  assert.equal(diagnostics[0].outcome, 'truncated_output');
  assert.equal(diagnostics[0].maxOutputTokens, null);
  for (const status of [408, 504]) {
    const { settings, requests } = await mock(t, [intent, { status }]), events = [];
    await assert.rejects(matchCatalog({ query: 'cat', catalog, settings, onDiagnostics: event => events.push(event) }), error => {
      assert.match(error.message, new RegExp(`HTTP ${status}`));
      assert.doesNotMatch(error.message, /已等待|调整等待|限流|截断|secret/);
      return true;
    });
    assert.equal(requests.length, 2);
    assert.equal(events.at(-1).outcome, 'http_error');
    assert.equal(events.at(-1).httpStatus, status);
  }
});

test('each SDK request gets a fresh timeout even when total search exceeds one deadline', async t => {
  const { settings, requests } = await mock(t, [intent, 'invalid ranking', ranked], [300, 300, 300]);
  const diagnostics = [];
  const result = await matchCatalog({ query: 'cat', catalog, settings: { ...settings, timeoutMs: 600 }, onDiagnostics: event => diagnostics.push(event) });
  assert.equal(result.stage, 'agent');
  assert.equal(requests.length, 3);
  const timings = diagnostics.filter(event => event.stage === 'request');
  assert.deepEqual(timings.map(event => event.requestStage), ['intent', 'ranking', 'repair']);
  assert.deepEqual(timings.map(event => event.call), [1, 2, 3]);
  for (const request of timings) {
    assert.equal(request.outcome, 'success');
    assert.equal(request.timeoutMs, 600);
    assert.ok(request.elapsedMs >= 250 && request.elapsedMs < 600);
  }
  assert.ok(diagnostics.at(-1).elapsedMs > 600);
});

test('ranking HTTP 429 remains distinct from timeout with safe per-request timings', async t => {
  const { settings, requests } = await mock(t, [intent, { status: 429 }]);
  const diagnostics = [];
  await assert.rejects(matchCatalog({ query: 'cat', catalog, settings: { ...settings, requestHeaders: { 'X-Private': 'private-header-value' } }, onDiagnostics: event => diagnostics.push(event) }), error => {
    assert.match(error.message, /限流/);
    assert.doesNotMatch(error.message, /超时|secret|raw vendor/);
    return true;
  });
  assert.equal(requests.length, 2);
  const request = diagnostics.find(event => event.stage === 'request' && event.requestStage === 'ranking');
  assert.equal(request.outcome, 'http_error');
  assert.equal(request.httpStatus, 429);
  assert.ok(request.elapsedMs >= 0);
  assert.doesNotMatch(JSON.stringify(diagnostics), /secret-test-key|private-header-value|apiKey|requestHeaders|raw vendor/);
});

test('cancelling a slow ranking stays cancellation rather than timeout', async t => {
  const { settings, requests } = await mock(t, [intent, ranked], [0, 500]);
  const controller = new AbortController(), diagnostics = [];
  await assert.rejects(matchCatalog({ query: 'cat', catalog, settings: { ...settings, timeoutMs: 300 }, signal: controller.signal,
    onProgress: event => { if (event.message.includes('核对')) setTimeout(() => controller.abort(), 50); },
    onDiagnostics: event => diagnostics.push(event),
  }), /取消/);
  assert.equal(requests.length, 2);
  assert.equal(diagnostics.find(event => event.stage === 'request' && event.requestStage === 'ranking').outcome, 'cancelled');
});

test('search plan keeps concepts atomic, constrains extensions and guards explicit products', () => {
  const options = { query: '我想拍一个运动饮料广告，不要汽车', vocabulary: SEMANTIC_VOCABULARY };
  const plan = validateSearchPlan({ ...sportsIntent, primaryKeywords: [...sportsIntent.primaryKeywords, sportsIntent.primaryKeywords[0]], allowTechniqueOnly: true }, options);
  assert.equal(plan.primaryKeywords.length, 1);
  assert.deepEqual(plan.primaryKeywords[0].terms, ['运动饮料', 'sports drink']);
  assert.equal(plan.allowTechniqueOnly, false, 'model cannot authorize its own broader scope');
  assert.equal(validateSearchPlan(sportsIntent, { ...options, allowTechniqueOnly: true }).allowTechniqueOnly, true);
  assert.equal(validateSearchPlan(sportsIntent, { ...options, query: '运动饮料广告，找拍法参考' }).allowTechniqueOnly, true);
  assert.equal(validateSearchPlan(sportsIntent, { ...options, query: '运动饮料广告，借鉴一下骑行的拍法' }).allowTechniqueOnly, true);
  assert.equal(validateSearchPlan(sportsIntent, { ...options, query: '运动饮料广告，不要拍法参考' }).allowTechniqueOnly, false);
  assert.equal(validateSearchPlan(sportsIntent, { ...options, query: '运动饮料广告，不需要拍法参考' }).allowTechniqueOnly, false);
  assert.equal(validateSearchPlan(sportsIntent, { ...options, query: 'sports drink advertisement; no camera technique references' }).allowTechniqueOnly, false);
  assert.equal(validateSearchPlan(sportsIntent, { ...options, query: 'sports drink advertisement; shot references' }).allowTechniqueOnly, true);
  assert.throws(() => validateSearchPlan({ ...sportsIntent, goal: 'general' }, options));
  assert.throws(() => validateSearchPlan({ ...sportsIntent, primaryKeywords: [{ concept: 'beverage', terms: ['运动饮料'], role: 'primary_product' }] }, options));
  assert.throws(() => validateSearchPlan({ ...sportsIntent, relatedKeywords: [{ concept: 'vehicle', terms: ['汽车'], scope: 'related_product' }] }, options));
  assert.throws(() => validateSearchPlan({ ...sportsIntent, primaryKeywords: [{ concept: 'invented.product', terms: ['运动饮料'], role: 'primary_product' }] }, options));
  const unknown = validateSearchPlan({ ...intent, primaryKeywords: [{ concept: 'unknown', terms: ['鹧鸪税务审计'], role: 'primary' }] }, { vocabulary: SEMANTIC_VOCABULARY });
  assert.equal(unknown.primaryKeywords[0].terms[0], '鹧鸪税务审计');
  const answered = { ...sportsIntent, primaryKeywords: [{ concept: 'vehicle', terms: ['汽车', 'car'], role: 'primary_product' }], relatedKeywords: [] };
  assert.equal(validateSearchPlan(answered, { ...options, answer: '改成汽车广告' }).primaryKeywords[0].concept, 'vehicle');
  for (const query of ['运动饮料广告，背景有汽车', '汽车作为背景拍运动饮料广告', 'sports drink advertisement with cars in the background']) {
    const withBackground = { ...sportsIntent, optionalKeywords: [{ concept: 'vehicle', terms: ['汽车', 'car'] }] };
    assert.equal(validateSearchPlan(withBackground, { ...options, query }).primaryKeywords.length, 1, `background is not a primary product: ${query}`);
  }
  const fitnessAd = { ...sportsIntent, primaryKeywords: [{ concept: 'fitness', terms: ['健身'], role: 'activity' }], relatedKeywords: [], required: [], optionalKeywords: [{ concept: 'beverage.coffee', terms: ['咖啡'] }] };
  for (const query of ['健身广告，背景有咖啡', '健身广告，咖啡作为背景道具', '背景有咖啡杯的健身广告', 'fitness commercial with coffee as a background prop', 'background coffee in a fitness commercial']) {
    assert.equal(validateSearchPlan(fitnessAd, { ...options, query }).primaryKeywords[0].concept, 'fitness', `a lone background product cannot override intent: ${query}`);
  }
  const technique = { ...fitnessAd, goal: 'technique', primaryKeywords: [{ concept: 'tracking', terms: ['跟拍'], role: 'capability' }] };
  assert.equal(validateSearchPlan(technique, { ...options, query: '只要运动镜头参考，给运动饮料广告用' }).goal, 'technique', 'a contextual product does not override a request for techniques only');
});

test('semantic ceilings reject tier upgrades and full claims even with a real quote', async t => {
  const restrictedCatalog = { ...catalog, evidence: () => [{ kind: 'case', id: 'c1', content: 'cat advertisement', relevanceTier: 'related_product', matchType: 'partial', gap: '产品类型不同' }] };
  for (const bad of [
    { templates: [], cases: [{ ...ranked.cases[0], relevanceTier: 'topic' }] },
    { templates: [], cases: [{ ...ranked.cases[0], relevanceTier: 'related_product' }] },
  ]) {
    const { settings } = await mock(t, [intent, bad, bad]);
    await assert.rejects(matchCatalog({ query: '猫咪', catalog: restrictedCatalog, settings }), /无法验证/);
  }
});

test('safe diagnostics report grounded plan and calls without settings or headers', async t => {
  const { settings } = await mock(t, [intent, ranked]);
  const diagnostics = [];
  const result = await matchCatalog({ query: '猫咪', catalog, settings: { ...settings, requestHeaders: { 'X-Private': 'private-header-value' } }, onDiagnostics: event => diagnostics.push(event) });
  assert.deepEqual(result.intent.searchPlan.primaryKeywords, intent.primaryKeywords);
  assert.equal(diagnostics.at(-1).calls, 2);
  assert.equal(diagnostics.at(-1).recommendationCounts.cases, 1);
  assert.ok(diagnostics.at(-1).elapsedMs >= 0);
  assert.doesNotMatch(JSON.stringify(diagnostics), /secret-test-key|private-header-value|apiKey|requestHeaders/);
});

test('real catalog excludes cycling and fitness before ranking a sports drink advertisement', async t => {
  const realCatalog = loadCatalog(fileURLToPath(new URL('../', import.meta.url)));
  const rider = 'seedance-2-5-f3651857750b';
  const bad = { templates: [], cases: [{ id: rider, reason: '骑行节奏适合饮料广告', evidence: 'riding a simple white beach bicycle at casual pace', matchType: 'full', relevanceTier: 'topic' }] };
  const { settings, requests } = await mock(t, [sportsIntent, bad, bad]);
  await assert.rejects(matchCatalog({ query: '我想拍一个运动饮料广告', catalog: realCatalog, settings }), /无法验证/);
  const candidateInput = JSON.parse(requests[1].body.messages[1].content);
  assert.ok(candidateInput.records.some(record => record.id === 'mountain-dew-spark-b16d4e23caef'));
  for (const id of [rider, 'johnagi168-seedance-ai-556a7495c74b', '90-vhs-vlog-ae90c46cb606']) assert.ok(!candidateInput.records.some(record => record.id === id));
  for (const record of candidateInput.records.filter(record => record.kind === 'case')) assert.equal(record.relevanceTier, 'related_product');
});
