import { launchTest } from './test-runtime.mjs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';

const root = process.cwd();
let calls = 0;
const server = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  const payload = JSON.parse(body); calls++;
  const content = JSON.parse(payload.messages.at(-1).content);
  let result;
  if (payload.messages[0].content.startsWith('Understand')) {
    if (content.query.includes('慢')) await new Promise(resolve => setTimeout(resolve, 400));
    result = { summary: '猫咪主题', terms: ['猫咪', 'cat'], excludeTerms: [], question: content.query.includes('模糊') && !content.skipQuestion && !content.answer ? { text: '哪种风格？', options: ['写实', '动画'] } : null };
  } else {
    const choose = kind => content.records.filter(record => record.kind === kind).slice(0, 1).map(record => ({ id: record.id, reason: '提供的记录含有真实主题证据', evidence: record.title, matchType: 'partial' }));
    result = { templates: choose('template'), cases: choose('case') };
  }
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ id: 'mock', object: 'chat.completion', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(result) } }] }));
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const env = { ...process.env, DESKTOP_SMOKE: '1', DESKTOP_USER_DATA: path.join(root, `.tmp/integration-qa-${process.pid}`) };
delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.DESKTOP_EXECUTABLE;
const runtime = await launchTest({ ...(executablePath ? { executablePath, args: [], cwd: os.tmpdir() } : { args: [root] }), env });
const app = runtime.application;
try {
  const page = await app.firstWindow({ timeout: 15000 });
  await page.waitForSelector('.case-card');
  assert.match(await page.locator('#library-info').textContent(), /27.*670/);
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  const preliminary = await page.evaluate(() => window.library.search({ query: '狗', requestId: 'single-han' }));
  assert.equal(preliminary.stage, 'error');
  assert.ok(preliminary.results.totalCases > 0);
  await page.evaluate(config => window.library.saveSettings(config), { baseURL: `http://127.0.0.1:${server.address().port}/v1`, model: 'mock', apiKey: 'test-fixture-only', timeoutMs: 2000 });
  const publicConfig = await page.evaluate(() => window.library.getSettings());
  assert.equal(Object.hasOwn(publicConfig, 'apiKey'), false);
  await page.fill('#query', '猫咪'); await page.click('#search-button');
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('已由 Agent'));
  assert.equal(await page.locator('.case-card').count(), 1);
  assert.equal(calls, 2);
  await page.fill('#query', '模糊猫咪'); await page.click('#search-button');
  await page.waitForSelector('#clarification:not([hidden])'); await page.click('#skip');
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('已由 Agent'));
  assert.equal(calls, 5);
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
  console.log(`${executablePath ? 'Packaged outside-checkout' : 'Development'} Electron integration passed: full data, SDK → main → renderer ranking, clarification skip, superseded request, cancellation, credential projection and isolated renderer.`);
} finally { await runtime.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
