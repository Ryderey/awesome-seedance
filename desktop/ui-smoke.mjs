import { launchTest } from './test-runtime.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

const root = process.cwd();
await mkdir(path.join(root, '.tmp'), { recursive: true });
const env = { ...process.env, DESKTOP_SMOKE: '1', DESKTOP_USER_DATA: path.join(root, `.tmp/renderer-qa-${process.pid}`) };
delete env.ELECTRON_RUN_AS_NODE;
const runtime = await launchTest({ args: [root], env });
const app = runtime.application;
try {
  const page = await app.firstWindow({ timeout: 15000 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForSelector('.case-card');
  assert.equal(await page.locator('.case-card').count(), 12);
  assert.match(await page.locator('#library-info').textContent(), /27.*670/);
  await page.click('.brand');
  assert.equal((await page.evaluate(() => window.library.overview())).stats.caseCount, 670);
  assert.equal(await page.locator('.template-card').count(), 3);
  await page.click('#more-templates');
  assert.equal(await page.locator('.template-card').count(), 6);
  await page.click('#load-more');
  assert.equal(await page.locator('.case-card').count(), 24);

  await page.fill('#query', '猫咪');
  await page.click('#search-button');
  await page.waitForSelector('#retry:not([hidden])');
  assert.match(await page.locator('#status').textContent(), /尚未经 Agent 判断/);
  assert.ok(await page.locator('.case-card').count() > 0);
  const status = await page.locator('#status').textContent();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('library:search-event', { requestId: 'stale', stage: 'agent', message: 'stale overwrite' }));
  assert.equal(await page.locator('#status').textContent(), status);

  await page.locator('.case-card').first().click();
  await page.waitForSelector('.prompt-text');
  async function assertSingleDetailScroll() {
    const scroll = await page.evaluate(() => ({
      background: getComputedStyle(document.documentElement).overflowY,
      nested: [...document.querySelectorAll('#detail-dialog .prompt-text')].some(element => ['auto', 'scroll'].includes(getComputedStyle(element).overflowY)),
      panel: getComputedStyle(document.getElementById('detail-dialog')).overflowY,
    }));
    assert.equal(scroll.background, 'hidden', 'Modal must hide the background scrollbar');
    assert.equal(scroll.nested, false, 'Full prompts must use the detail panel scroll');
    assert.equal(scroll.panel, 'auto');
  }
  await assertSingleDetailScroll();
  const prompt = await page.locator('.prompt-text').textContent();
  assert.ok(prompt.length > 30);
  await page.locator('.detail-actions .primary').click();
  assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), prompt);
  const video = page.locator('video');
  if (await video.count()) {
    await video.evaluate(element => element.dispatchEvent(new Event('error')));
    assert.match(await page.locator('.media-message').textContent(), /无法直接播放/);
  }
  assert.ok(await page.getByRole('button', { name: '来源作品 ↗', exact: true }).count());
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#detail-dialog').evaluate(element => element.open), false);
  await page.waitForFunction(() => [...document.querySelectorAll('video')].every(element => element.paused && !element.getAttribute('src')));
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY), 'hidden');

  await page.click('#settings-open');
  await page.waitForSelector('#settings-dialog[open]');
  await page.fill('#base-url', 'https://example.com/v1');
  await page.fill('#model', 'ui-smoke');
  await page.click('#settings-save');
  await page.waitForFunction(() => document.getElementById('settings-status').textContent === '配置已保存。');
  const settings = await page.evaluate(() => window.library.getSettings());
  assert.equal(settings.model, 'ui-smoke');
  assert.equal(Object.hasOwn(settings, 'apiKey'), false);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'query');
  await page.setViewportSize({ width: 900, height: 750 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.click('#browse');
  await page.waitForSelector('.case-card');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(root, '.tmp/desktop-qa.png') });
  await page.fill('#query', '第一人称一镜到底');
  await page.click('#search-button');
  await page.waitForSelector('#retry:not([hidden])');
  const template = page.locator('.template-card').filter({ has: page.getByRole('heading', { name: '第一人称一镜到底', exact: true }) });
  await template.scrollIntoViewIfNeeded();
  const backgroundPosition = await page.evaluate(() => window.scrollY);
  await template.click();
  await page.waitForSelector('#detail-content .prompt-text');
  await assertSingleDetailScroll();
  await page.locator('#detail-dialog').evaluate(element => { element.scrollTop = 180; });
  await page.screenshot({ path: path.join(root, '.tmp/desktop-detail-qa.png') });
  await page.setViewportSize({ width: 900, height: 750 });
  await assertSingleDetailScroll();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('detail-dialog').open);
  assert.equal(await page.evaluate(() => window.scrollY), backgroundPosition);
  assert.deepEqual(errors, []);
  console.log('Electron UI smoke passed: full library, pagination, preliminary fallback, stale events, exact copy, failed video, settings, Escape, keyboard and 900px layout.');
} finally {
  await runtime.close();
}
