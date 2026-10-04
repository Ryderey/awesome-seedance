import { launchTest } from './test-runtime.mjs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { loadCatalog } from './catalog.mjs';
import { readFile } from 'node:fs/promises';

const root = process.cwd();
let calls = 0;
let releaseCategoryIntent;
let clarificationRetryUsed = false;
const receivedHeaders = [];
const receivedBodies = [];
const server = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  const payload = JSON.parse(body); calls++;
  receivedBodies.push(payload);
  receivedHeaders.push(request.headers);
  if (!request.headers['x-opencode-session']?.trim()) {
    response.writeHead(400, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'x-opencode-session required' } })); return;
  }
  const probe = payload.messages.at(-1).content === 'Reply briefly with OK.';
  const content = probe ? { query: '' } : JSON.parse(payload.messages.find(message => message.role === 'user' && message.content.startsWith('{')).content);
  if (!probe && !payload.messages.at(-1).content.startsWith('{')) {
    console.error(`Unexpected fixture repair: ${content.stage}, ${content.query}, history ${content.clarificationHistory?.length || 0}`);
    response.writeHead(400, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'unexpected fixture repair' } })); return;
  }
  if (content.query.includes('重试：做个广告') && content.stage === 'intent' && content.clarificationHistory?.length === 1 && !clarificationRetryUsed) {
    clarificationRetryUsed = true;
    response.writeHead(429, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'rate limited' } })); return;
  }
  if (content.query.includes('限流')) {
    response.writeHead(429, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'rate limited' } })); return;
  }
  let result;
  if (probe) result = 'OK';
  else if (content.stage === 'intent') {
    if (content.query.includes('分类取消')) await new Promise(resolve => { releaseCategoryIntent = resolve; });
    else if (content.query.includes('慢')) await new Promise(resolve => setTimeout(resolve, 400));
    const product = content.query.includes('饮料');
    result = { summary: product ? '寻找运动饮料产品广告；其他饮品只作为相关产品' : '猫咪主题', goal: product ? 'product_ad' : 'general',
      primaryKeywords: product ? [{ concept: 'beverage.sports_drink', terms: ['运动饮料', 'sports drink'], role: 'primary_product' }] : [{ concept: 'cat', terms: ['猫咪', 'cat'], role: 'primary' }],
      relatedKeywords: product ? [{ concept: 'beverage', terms: ['饮料', 'beverage'], scope: 'related_product' }] : [],
      required: product ? ['产品为运动饮料', '广告用途'] : [], optionalKeywords: [], excludeKeywords: [], allowTechniqueOnly: content.allowTechniqueOnly === true,
      question: content.query.includes('模糊') && !content.skipQuestion && !content.answer ? { text: '哪种风格？', options: ['写实', '动画'] } : null };
  } else {
    const choose = kind => content.records.filter(record => record.kind === kind).slice(0, 1).map(record => ({ id: record.id, reason: '提供的记录含有真实主题证据', evidence: record.evidenceQuotes?.[0]?.quote || record.title, matchType: record.matchType === 'full' ? 'full' : 'partial', relevanceTier: record.relevanceTier || 'uncertain' }));
    result = { templates: choose('template'), cases: choose('case') };
    if (content.query.includes('无推荐')) result = { templates: [], cases: [] };
  }
  if (content.stage === 'intent' && content.query.includes('做个广告')) {
    const history = content.clarificationHistory || [];
    const missingSubject = history.length === 0;
    const stillUnclear = history.length < 2 || content.query.includes('不确定：');
    result = { summary: missingSubject ? '广告用途已明确，产品主体待补充' : stillUnclear ? '饮料广告，产品细类待补充' : '运动饮料广告', goal: 'product_ad',
      primaryKeywords: missingSubject ? [] : stillUnclear ? [{ concept: 'beverage', terms: ['饮料', 'beverage'], role: 'primary_product' }] : [{ concept: 'beverage.sports_drink', terms: ['运动饮料', 'sports drink'], role: 'primary_product' }],
      relatedKeywords: stillUnclear ? [] : [{ concept: 'beverage', terms: ['饮料', 'beverage'], scope: 'related_product' }],
      required: ['广告用途'], optionalKeywords: [], excludeKeywords: [], allowTechniqueOnly: false,
      uncertainty: stillUnclear ? missingSubject ? '尚未明确产品主体。' : '产品细类仍未明确。' : '',
      // Deliberately ask beyond the limit as well: application code must enforce it.
      question: stillUnclear && !content.skipQuestion ? { text: missingSubject ? '你想展示什么产品？' : '想展示哪一类饮料？', options: missingSubject ? ['饮料', '汽车'] : ['运动饮料', '汽水'] } : null };
  }
  if (content.stage === 'intent' && content.query === '饮料广告，但用途要纪录片') {
    const answered = content.clarificationHistory?.length > 0;
    result = { summary: answered ? '以饮料为主体的纪录片' : '需要确认广告与纪录片用途冲突', goal: answered ? 'documentary' : 'product_ad',
      primaryKeywords: [{ concept: 'beverage', terms: ['饮料', 'beverage'], role: 'primary_product' }],
      relatedKeywords: [], required: [], optionalKeywords: [], excludeKeywords: [], allowTechniqueOnly: false,
      question: answered ? null : { text: '最终用途是广告还是纪录片？', options: ['广告', '纪录片'] } };
  }
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ id: 'mock', object: 'chat.completion', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: typeof result === 'string' ? result : JSON.stringify(result) } }] }));
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const env = { ...process.env, DESKTOP_SMOKE: '1', DESKTOP_USER_DATA: path.join(root, `.tmp/integration-qa-${process.pid}`) };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.DESKTOP_EXECUTABLE;
const runtime = await launchTest({ ...(executablePath ? { executablePath, args: [], cwd: os.tmpdir() } : { args: [root] }), env });
const app = runtime.application;
try {
  const page = await app.firstWindow({ timeout: 15000 });
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(15000);
  // UI/wire verification is deterministic; external poster availability is not a test input.
  await page.route('https://**/*', route => route.abort());
  await page.waitForSelector('.case-card');
  assert.match(await page.locator('#library-info').textContent(), /27.*670/);
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.equal((await page.evaluate(() => window.library.getSettings())).timeoutMs, 90000);
  assert.equal((await page.evaluate(() => window.library.getSettings())).maxOutputTokens, null);
  assert.equal((await page.evaluate(() => window.library.getSettings())).reasoningEffort, null);
  assert.equal((await page.evaluate(() => window.library.getSettings())).maxOutputParameter, 'max_tokens');
  const preliminary = await page.evaluate(() => window.library.search({ query: '狗', requestId: 'single-han' }));
  assert.equal(preliminary.stage, 'error');
  assert.ok(preliminary.results.totalCases > 0);
  await page.evaluate(config => window.library.saveSettings(config), { baseURL: `http://127.0.0.1:${server.address().port}/v1`, model: 'mock', apiKey: 'test-fixture-only', timeoutMs: 2000 });
  const publicConfig = await page.evaluate(() => window.library.getSettings());
  assert.equal(Object.hasOwn(publicConfig, 'apiKey'), false);
  assert.match(await page.evaluate(async () => { try { await window.library.testConnection(); } catch (error) { return error.message; } }), /HTTP 400/);
  await page.click('#settings-open');
  assert.equal(await page.locator('#advanced-settings').evaluate(element => element.open), false);
  await page.click('#advanced-settings summary');
  assert.equal(await page.locator('#request-timeout').inputValue(), '2');
  assert.equal(await page.locator('#max-output-tokens').inputValue(), '');
  assert.equal(await page.locator('#reasoning-effort').inputValue(), '');
  assert.equal(await page.locator('#output-parameter-field').isVisible(), false);
  assert.deepEqual(await page.locator('#reasoning-effort option').evaluateAll(options => options.map(option => option.value)), ['', 'none', 'high', 'max']);
  assert.deepEqual(await page.locator('#output-token-suggestions option').evaluateAll(options => options.map(option => option.value)), ['4096', '8192', '16384', '32768']);
  const callsBeforeInvalidTimeout = calls;
  for (const value of ['0', '121', '']) {
    await page.fill('#request-timeout', value);
    assert.equal(await page.locator('#settings-save').isDisabled(), true);
    assert.equal(await page.locator('#connection-test').isDisabled(), true);
    assert.match(await page.locator('#timeout-error').textContent(), /1–120/);
    await page.locator('#settings-form').evaluate(element => element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.equal((await page.evaluate(() => window.library.getSettings())).timeoutMs, 2000);
  }
  assert.equal(calls, callsBeforeInvalidTimeout);
  await page.fill('#request-timeout', '7.5');
  assert.equal(await page.locator('#timeout-error').textContent(), '');
  for (const value of ['0', '1048577', '4.5']) {
    await page.fill('#max-output-tokens', value);
    assert.equal(await page.locator('#settings-save').isDisabled(), true);
    assert.equal(await page.locator('#connection-test').isDisabled(), true);
    assert.match(await page.locator('#output-tokens-error').textContent(), /1–1048576/);
    await page.locator('#settings-form').evaluate(element => element.requestSubmit());
    assert.equal((await page.evaluate(() => window.library.getSettings())).maxOutputTokens, null);
  }
  assert.equal(calls, callsBeforeInvalidTimeout);
  await page.fill('#max-output-tokens', '');
  for (const inputId of ['request-timeout', 'max-output-tokens']) {
    await page.locator(`#${inputId}`).evaluate(element => { element.value = '0'; });
    await page.click('#advanced-settings summary');
    assert.equal(await page.locator('#advanced-settings').evaluate(element => element.open), false);
    await page.locator('#settings-form').evaluate(element => element.requestSubmit());
    assert.equal(await page.locator('#advanced-settings').evaluate(element => element.open), true, 'Submitting an invalid collapsed advanced field must reopen it');
    assert.equal((await page.evaluate(() => window.library.getSettings())).timeoutMs, 2000);
    await page.fill(`#${inputId}`, inputId === 'request-timeout' ? '7.5' : '');
  }
  assert.equal(calls, callsBeforeInvalidTimeout);
  await page.fill('#max-output-tokens', '8192');
  assert.equal(await page.locator('#output-parameter-field').isVisible(), true);
  await page.selectOption('#reasoning-effort', 'max');
  await page.click('#add-header');
  const rows = page.locator('.header-row');
  assert.equal(await rows.first().getByRole('checkbox', { name: '本地记住（明文）' }).isChecked(), false);
  await rows.first().getByLabel('名称', { exact: true }).fill('bad name');
  assert.ok((await rows.first().locator('.header-error').textContent()).length > 0);
  assert.equal(await page.locator('#settings-save').isDisabled(), true);
  assert.equal(await page.locator('#connection-test').isDisabled(), true);
  const callsBeforeInvalid = calls;
  await page.locator('#settings-form').evaluate(element => element.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  assert.deepEqual((await page.evaluate(() => window.library.getSettings())).headers, []);
  assert.equal(calls, callsBeforeInvalid);
  await rows.first().getByLabel('名称', { exact: true }).fill('x-opencode-session');
  await rows.first().getByLabel('值类型', { exact: true }).selectOption('session');
  assert.equal(await rows.first().getByLabel('值', { exact: true }).isDisabled(), true);
  await page.click('#add-header');
  await rows.nth(1).getByLabel('名称', { exact: true }).fill('X-OpenCode-Session');
  await rows.nth(1).getByLabel('值', { exact: true }).fill('duplicate');
  assert.equal(await page.locator('#settings-save').isDisabled(), true);
  await rows.nth(1).getByLabel('名称', { exact: true }).fill('x-fixture-label');
  await rows.nth(1).getByLabel('值', { exact: true }).fill('fixture-only');
  await rows.nth(1).getByRole('checkbox', { name: '本地记住（明文）' }).check();
  await page.click('#add-header');
  await rows.nth(2).getByRole('button', { name: '删除' }).click();
  assert.equal(await rows.count(), 2);
  await page.click('#add-header');
  await rows.nth(2).getByLabel('名称', { exact: true }).fill('x-disabled');
  await rows.nth(2).getByLabel('值', { exact: true }).fill('must-not-send');
  await rows.nth(2).getByRole('checkbox', { name: '启用', exact: true }).uncheck();
  assert.equal(await page.locator('#connection-test').isDisabled(), false);
  await page.click('#connection-test');
  await page.waitForFunction(() => document.getElementById('settings-status').textContent.includes('连接成功'));
  const runtimeHeaders = receivedHeaders.at(-1);
  assert.match(runtimeHeaders['x-opencode-session'], /^[\da-f-]{36}$/i);
  assert.equal(runtimeHeaders['x-fixture-label'], 'fixture-only');
  assert.equal(runtimeHeaders['x-disabled'], undefined);
  assert.equal(receivedBodies.at(-1).max_tokens, 8192);
  assert.equal(receivedBodies.at(-1).reasoning_effort, 'max');
  assert.equal(Object.hasOwn(receivedBodies.at(-1), 'max_completion_tokens'), false);
  const disk = JSON.parse(await readFile(path.join(env.DESKTOP_USER_DATA, 'settings.json'), 'utf8'));
  assert.equal(disk.timeoutMs, 7500);
  assert.equal(disk.maxOutputTokens, 8192);
  assert.equal(disk.reasoningEffort, 'max');
  assert.equal(disk.maxOutputParameter, 'max_tokens');
  assert.deepEqual(disk.headers.map(row => row.name), ['x-fixture-label']);
  assert.equal(JSON.stringify(disk).includes(runtimeHeaders['x-opencode-session']), false);
  if (!executablePath) await page.screenshot({ path: path.join(root, '.tmp/desktop-headers-qa.png') });
  await page.keyboard.press('Escape');
  await page.click('#settings-open');
  assert.equal(await page.locator('#request-timeout').inputValue(), '7.5');
  assert.equal(await page.locator('#max-output-tokens').inputValue(), '8192');
  assert.equal(await page.locator('#reasoning-effort').inputValue(), 'max');
  assert.equal(await page.locator('#advanced-settings').evaluate(element => element.open), false);
  await page.click('#advanced-settings summary');
  await page.selectOption('#max-output-parameter', 'max_completion_tokens');
  await page.fill('#max-output-tokens', '');
  assert.equal(await page.locator('#output-parameter-field').isVisible(), false);
  await page.selectOption('#reasoning-effort', '');
  await page.click('#settings-save');
  await page.waitForFunction(() => document.getElementById('settings-status').textContent.includes('配置已保存'));
  assert.equal((await page.evaluate(() => window.library.getSettings())).maxOutputTokens, null);
  assert.equal((await page.evaluate(() => window.library.getSettings())).reasoningEffort, null);
  assert.equal((await page.evaluate(() => window.library.getSettings())).maxOutputParameter, 'max_completion_tokens');
  assert.equal(JSON.parse(await readFile(path.join(env.DESKTOP_USER_DATA, 'settings.json'), 'utf8')).maxOutputTokens, null);
  await page.keyboard.press('Escape');
  await page.click('#settings-open');
  assert.equal(await page.locator('#max-output-tokens').inputValue(), '');
  assert.equal(await page.locator('#reasoning-effort').inputValue(), '');
  await page.click('#advanced-settings summary');
  await page.fill('#max-output-tokens', '16384');
  assert.equal(await page.locator('#max-output-parameter').inputValue(), 'max_completion_tokens');
  await page.fill('#max-output-tokens', '');
  await page.keyboard.press('Escape');
  // Missing subject can be asked about without invented search keywords.
  const waitQuestion = round => page.waitForFunction(expected => !document.getElementById('clarification').hidden && document.getElementById('question-progress').textContent.startsWith(`第 ${expected} / 2 问`), round);
  const submitQuery = async query => { await page.fill('#query', query); await page.locator('#search-form').evaluate(form => form.requestSubmit()); };
  const submitAnswer = async answer => { await page.fill('#answer', answer); await page.locator('#answer-form').evaluate(form => form.requestSubmit()); };
  const intentInputs = () => receivedBodies.filter(body => body.messages.at(-1).content.startsWith('{')).map(body => JSON.parse(body.messages.at(-1).content)).filter(input => input.stage === 'intent');
  const beforeClarification = calls;
  await submitQuery('做个广告');
  await waitQuestion(1);
  await page.evaluate(() => window.library.getSettings());
  assert.equal(calls, beforeClarification + 1, 'Waiting for an answer must not retrieve/rank or call the model again');
  assert.match(await page.locator('#status').textContent(), /不会请求模型/);
  if (!executablePath) await page.screenshot({ path: path.join(root, '.tmp/desktop-clarification-round1.png') });
  await page.locator('#question-options button').first().evaluate(button => { button.click(); button.click(); });
  await waitQuestion(2);
  assert.equal(calls, beforeClarification + 2, 'Double clicking an answer only submits it once');
  assert.match(await page.locator('#clarification-history').textContent(), /你想展示什么产品.*饮料/);
  if (!executablePath) await page.screenshot({ path: path.join(root, '.tmp/desktop-clarification-round2.png') });
  await page.evaluate(() => window.library.getSettings());
  assert.equal(calls, beforeClarification + 2);
  await submitAnswer('运动饮料');
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('已由 Agent'));
  assert.equal(calls, beforeClarification + 4, 'Two answered questions are followed by one intent and one ranking request');
  const completedHistory = intentInputs().at(-1).clarificationHistory;
  assert.deepEqual(completedHistory, [{ question: '你想展示什么产品？', answer: '饮料' }, { question: '想展示哪一类饮料？', answer: '运动饮料' }]);
  assert.equal(intentInputs().at(-1).query, '做个广告');
  assert.match(await page.locator('#view-agent').textContent(), /Agent 推荐/);
  const rankingHistory = JSON.parse(receivedBodies.at(-1).messages.at(-1).content).clarificationHistory;
  assert.deepEqual(rankingHistory, completedHistory);
  // Retry retains history without consuming another question or duplicating the answer.
  await submitQuery('重试：做个广告'); await waitQuestion(1);
  await submitAnswer('饮料'); await page.waitForSelector('#retry:not([hidden])');
  const failedHistory = intentInputs().at(-1).clarificationHistory;
  await page.click('#retry'); await waitQuestion(2);
  assert.deepEqual(intentInputs().at(-1).clarificationHistory, failedHistory);
  await submitAnswer('运动饮料');
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('已由 Agent'));
  // Skip and the two-round limit both yield partial, explicitly broad references.
  await submitQuery('做个广告'); await waitQuestion(1);
  const beforeSkip = calls;
  await page.click('#skip');
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('已由 Agent'));
  assert.equal(calls, beforeSkip + 2);
  assert.match(await page.locator('#results-note').textContent(), /信息不足.*宽泛参考/);
  assert.equal(await page.locator('.case-tier[data-tier="topic"]').count(), 0);
  await submitQuery('不确定：做个广告'); await waitQuestion(1);
  await submitAnswer('饮料'); await waitQuestion(2);
  const beforeLimit = calls;
  await submitAnswer('不确定');
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('已由 Agent'));
  assert.equal(await page.locator('#clarification').isVisible(), false);
  assert.equal(calls, beforeLimit + 2, 'A model asking a third question cannot trigger a third UI round');
  assert.match(await page.locator('#view-agent').textContent(), /宽泛参考/);
  assert.equal(await page.locator('.case-tier[data-tier="topic"]').count(), 0);
  const beforeInvalidHistory = calls;
  const invalidHistory = await page.evaluate(async () => {
    try { await window.library.search({ query: '做个广告', requestId: 'invalid-history', clarificationHistory: Array.from({ length: 3 }, () => ({ question: '主体？', answer: '饮料' })) }); return false; } catch { return true; }
  });
  assert.equal(invalidHistory, true); assert.equal(calls, beforeInvalidHistory);
  await submitQuery('做个广告'); await waitQuestion(1);
  await page.locator('#categories button').first().click();
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('浏览拍法分类'));
  assert.equal(await page.locator('#clarification').isVisible(), false);
  await submitQuery('做个广告'); await waitQuestion(1);
  assert.deepEqual(intentInputs().at(-1).clarificationHistory || [], [], 'Category navigation resets prior clarification history');
  await page.click('#browse');
  const purposeConflict = await page.evaluate(async () => {
    const query = '饮料广告，但用途要纪录片';
    const first = await window.library.search({ query, requestId: 'purpose-question' });
    const final = await window.library.search({ query, requestId: 'purpose-answer', clarificationHistory: [{ question: first.question.text, answer: '纪录片' }] });
    return { firstStage: first.stage, finalStage: final.stage, goal: final.intent?.searchPlan.goal, product: final.intent?.searchPlan.primaryKeywords[0].concept, caseIds: final.results?.cases.map(item => item.id) };
  });
  assert.deepEqual({ ...purposeConflict, caseIds: undefined }, { firstStage: 'clarification', finalStage: 'agent', goal: 'documentary', product: 'beverage', caseIds: undefined }, 'Latest explicit purpose answer overrides the original conflict without losing its product');
  const purposePlan = { goal: 'documentary', primaryKeywords: [{ concept: 'beverage', terms: ['饮料', 'beverage'], role: 'primary' }], relatedKeywords: [], required: [], optionalKeywords: [], excludeKeywords: [], allowTechniqueOnly: false };
  const documentaryCases = new Set(loadCatalog(root).searchPlan(purposePlan, { limitCases: 670 }).cases.map(item => item.id));
  assert.ok(loadCatalog(root).searchPlan({ ...purposePlan, goal: 'product_ad', primaryKeywords: [{ ...purposePlan.primaryKeywords[0], role: 'primary_product' }] }).cases.length > 0, 'Real catalog contains beverage advertisements that would leak through the wrong purpose gate');
  assert.ok(purposeConflict.caseIds.every(id => documentaryCases.has(id)), 'A documentary answer cannot turn beverage advertisements into full documentary matches');
  // Sidebar navigation is local taxonomy browsing, even with a working model configured.
  const categoryCalls = calls;
  const overview = loadCatalog(root).overview();
  for (const category of overview.categories) {
    await page.locator('#categories button').filter({ hasText: category.title }).click();
    await page.evaluate(() => window.library.getSettings());
    assert.equal(await page.locator('#query').inputValue(), '', 'Category clicks must not submit a model search');
    const templates = overview.featured.templates.filter(item => item.category === category.id);
    const ids = new Set(templates.map(item => item.id));
    const cases = overview.featured.cases.filter(item => ids.has(item.templateId));
    await page.waitForFunction(expected => document.getElementById('case-count').textContent === `${expected} 条`, cases.length);
    if (await page.locator('#load-more').isVisible()) await page.click('#load-more');
    // Exercise every remaining pagination handler without repeated long-page mouse scrolling.
    await page.evaluate(() => {
      for (const id of ['load-more', 'more-templates']) {
        const element = document.getElementById(id);
        for (let page = 0; !element.hidden && page < 100; page++) element.click();
        if (!element.hidden) throw new Error(`Pagination did not finish: ${id}`);
      }
    });
    assert.deepEqual(await page.locator('.template-card h3').allTextContents(), templates.map(item => item.title));
    assert.deepEqual(await page.locator('.case-card h3').allTextContents(), cases.map(item => item.title));
    assert.equal(await page.locator('#categories button[aria-pressed="true"]').textContent(), category.title);
    assert.equal(await page.locator('#result-views').isVisible(), false);
    assert.equal(calls, categoryCalls, 'Categories and local pagination must never call the model');
  }
  await page.click('#browse');
  await page.waitForFunction(() => document.getElementById('case-count').textContent === '670 条');
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('#categories button')];
    buttons[0].click(); buttons[1].click(); buttons.at(-1).click();
  });
  const lastCategory = overview.categories.at(-1);
  const lastIds = new Set(overview.featured.templates.filter(item => item.category === lastCategory.id).map(item => item.id));
  const lastCount = overview.featured.cases.filter(item => lastIds.has(item.templateId)).length;
  await page.waitForFunction(expected => document.getElementById('case-count').textContent === `${expected} 条`, lastCount);
  assert.equal(await page.locator('#categories button[aria-pressed="true"]').textContent(), lastCategory.title);
  await page.click('#refresh');
  await page.waitForFunction(() => document.getElementById('case-count').textContent === '670 条');
  assert.equal(calls, categoryCalls);
  const probeCalls = calls;
  await page.evaluate(() => window.library.onSearch(event => { window.testSearchId = event.requestId; }));
  await page.fill('#query', '运动饮料广告'); await page.click('#search-button');
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('已由 Agent'));
  assert.equal(await page.locator('.case-card').count(), 1);
  assert.equal(calls, probeCalls + 2);
  for (const body of receivedBodies.slice(-2)) {
    assert.equal(Object.hasOwn(body, 'max_tokens'), false);
    assert.equal(Object.hasOwn(body, 'max_completion_tokens'), false);
    assert.equal(Object.hasOwn(body, 'reasoning_effort'), false);
  }
  assert.equal(receivedHeaders.at(-1)['x-opencode-session'], runtimeHeaders['x-opencode-session']);
  assert.ok(await page.locator('.case-tier[data-tier="related_product"]').count(), 'Beverage ads must be displayed separately from the requested sports drink');
  assert.equal(await page.locator('.case-tier[data-tier="technique"]').count(), 0, 'Technique-only cases are absent by default');
  assert.match(await page.locator('.template-card .template-gap').first().textContent(), /替换.*目标产品/, 'Reusable templates must show the verified adaptation requirement');
  if (!executablePath) await page.screenshot({ path: path.join(root, '.tmp/desktop-semantic-tiers-qa.png') });
  await page.click('#expand-techniques');
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('已由 Agent') && document.getElementById('expand-techniques').hidden);
  assert.equal(calls, probeCalls + 4);
  await page.click('#view-local');
  assert.equal(await page.locator('.template-gap').count(), 0, 'Local cards must not acquire Agent qualification labels');
  const local = loadCatalog(root).search('运动饮料广告', { limitCases: 670, limitTemplates: 27 });
  assert.equal(await page.locator('#case-count').textContent(), `${local.totalCases} 条`);
  assert.equal(await page.locator('#template-count').textContent(), `${local.totalTemplates} 个`);
  if (!executablePath) await page.screenshot({ path: path.join(root, '.tmp/desktop-result-views-qa.png') });
  await page.setViewportSize({ width: 900, height: 750 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  while (await page.locator('#load-more').isVisible()) await page.click('#load-more');
  assert.deepEqual(await page.locator('.case-card h3').allTextContents(), local.cases.map(item => item.title));
  while (await page.locator('#more-templates').isVisible()) await page.click('#more-templates');
  assert.deepEqual(await page.locator('.template-card h3').allTextContents(), local.templates.map(item => item.title));
  assert.match(await page.locator('#results-note').textContent(), /尚未经 Agent/);
  await page.click('#view-agent');
  assert.equal(await page.locator('.case-card').count(), 1);
  assert.equal(calls, probeCalls + 4, 'Switching views must not call the model again');
  const completedStatus = await page.locator('#status').textContent();
  await app.evaluate(({ BrowserWindow }, requestId) => BrowserWindow.getAllWindows()[0].webContents.send('library:search-event', { requestId, stage: 'preliminary', results: { templates: [], cases: [] } }), await page.evaluate(() => window.testSearchId));
  // Round trip through the renderer after the deliberately late event.
  await page.evaluate(() => window.library.getSettings());
  assert.equal(await page.locator('#status').textContent(), completedStatus);
  assert.equal(await page.locator('.case-card').count(), 1);
  await page.fill('#query', '模糊猫咪'); await page.click('#search-button');
  await page.waitForSelector('#clarification:not([hidden])'); await page.click('#skip');
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('已由 Agent'));
  assert.equal(calls, probeCalls + 7);
  const result = await page.evaluate(async () => {
    const slow = window.library.search({ query: '慢猫咪', requestId: 'slow' });
    await new Promise(resolve => setTimeout(resolve, 50));
    const fast = await window.library.search({ query: '猫咪', requestId: 'fast' });
    return { slow: await slow, fast };
  });
  assert.equal(result.slow.stage, 'cancelled'); assert.equal(result.fast.stage, 'agent');
  const cancelled = await page.evaluate(async () => {
    const pending = window.library.search({ query: '慢猫咪', requestId: 'cancel' });
    await window.library.cancelSearch({ requestId: 'cancel' }); return pending;
  });
  assert.equal(cancelled.stage, 'cancelled');
  await page.fill('#query', '无推荐猫咪'); await page.click('#search-button');
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('Agent 暂无依据充分'));
  assert.equal(await page.locator('#view-agent').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.case-card').count(), 0);
  await page.click('#view-agent');
  assert.equal(await page.locator('.case-card').count(), 0);
  await page.click('#view-local');
  assert.ok(await page.locator('.case-card').count() > 0);
  // Switching category aborts an in-flight Agent request and ignores delayed results.
  const beforeCategoryCancel = calls;
  await page.fill('#query', '分类取消慢猫咪'); await page.click('#search-button');
  const deadline = Date.now() + 5000;
  while (calls === beforeCategoryCancel && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(calls, beforeCategoryCancel + 1, 'The slow intent request must be in flight before navigation');
  const cancelledRequest = await page.evaluate(() => window.testSearchId);
  await page.locator('#categories button').first().click();
  const firstIds = new Set(overview.featured.templates.filter(item => item.category === overview.categories[0].id).map(item => item.id));
  const firstCount = overview.featured.cases.filter(item => firstIds.has(item.templateId)).length;
  await page.waitForFunction(expected => document.getElementById('case-count').textContent === `${expected} 条`, firstCount);
  assert.equal(typeof releaseCategoryIntent, 'function');
  releaseCategoryIntent();
  await new Promise(resolve => setTimeout(resolve, 500));
  await app.evaluate(({ BrowserWindow }, requestId) => BrowserWindow.getAllWindows()[0].webContents.send('library:search-event', { requestId, stage: 'agent', results: { templates: [], cases: [] } }), cancelledRequest);
  await page.evaluate(() => window.library.getSettings());
  assert.equal(await page.locator('#case-count').textContent(), `${firstCount} 条`);
  assert.equal(await page.locator('#result-views').isVisible(), false);
  assert.equal(await page.locator('#query').inputValue(), '');
  assert.equal(calls, beforeCategoryCancel + 1, 'Category navigation aborts intent and prevents follow-up ranking');
  // A newer explicit search wins over a pending local browse response.
  await page.evaluate(() => {
    document.querySelector('#categories button').click();
    document.getElementById('query').value = '猫咪';
    document.getElementById('search-form').requestSubmit();
  });
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('已由 Agent'));
  assert.equal(await page.locator('#query').inputValue(), '猫咪');
  assert.equal(await page.locator('#view-agent').getAttribute('aria-pressed'), 'true');
  assert.equal(calls, beforeCategoryCancel + 3, 'Only the explicitly submitted search performs intent and ranking');
  await page.fill('#query', '限流运动饮料广告'); await page.click('#search-button');
  await page.waitForSelector('#retry:not([hidden])');
  assert.match(await page.locator('#status').textContent(), /限流.*本地搜索结果/);
  assert.equal(await page.locator('#result-views').isVisible(), false);
  assert.ok(await page.locator('.case-card').count() > 0);
  if (!executablePath) await page.screenshot({ path: path.join(root, '.tmp/desktop-agent-fallback-qa.png') });
  console.log(`${executablePath ? 'Packaged outside-checkout' : 'Development'} Electron integration passed: grounded result tiers, explicit technique expansion, advanced headers, full local data and pagination, SDK ranking, empty recommendations, rate-limit fallback, clarification, cancellation and isolated renderer.`);
} finally { await runtime.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
