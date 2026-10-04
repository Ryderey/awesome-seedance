import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSettings } from './settings.mjs';
import { validateHeaders } from './headers.mjs';
const encrypted = { isEncryptionAvailable: () => true, encryptString: text => Buffer.from(text.split('').reverse().join('')), decryptString: data => data.toString().split('').reverse().join('') };
async function location(t) { const dir = await mkdtemp(join(tmpdir(), 'desktop-settings-')); t.after(() => rm(dir, { recursive: true, force: true })); return join(dir, 'settings.json'); }

test('new settings use 90 seconds per request while explicit saved deadlines survive edits and restart', async t => {
  const file = await location(t);
  let store = await createSettings({ file, safeStorage: encrypted });
  assert.equal(store.publicSettings().timeoutMs, 90000);
  await store.save({ model: 'test', timeoutMs: 10000 });
  store = await createSettings({ file, safeStorage: encrypted });
  assert.equal(store.publicSettings().timeoutMs, 10000);
  await store.save({ model: 'updated' });
  assert.equal(store.publicSettings().timeoutMs, 10000);
  for (const timeoutMs of [1000, 1500, 120000]) {
    await store.save({ timeoutMs });
    assert.equal((await createSettings({ file, safeStorage: encrypted })).publicSettings().timeoutMs, timeoutMs);
  }
  for (const timeoutMs of [999, 120001, 1000.5, '1000']) await assert.rejects(store.save({ timeoutMs }));
  assert.equal(store.publicSettings().timeoutMs, 120000);
});

test('output cap defaults to null and optional integer limits survive unrelated saves, reload and explicit clearing', async t => {
  const file = await location(t);
  let store = await createSettings({ file, safeStorage: encrypted });
  assert.equal(store.publicSettings().maxOutputTokens, null);
  assert.equal(store.credentials().maxOutputTokens, null);
  for (const maxOutputTokens of [1, 4096, 8192, 16384, 32768, 128000, 393216, 1048576]) {
    await store.save({ model: 'test', maxOutputTokens });
    store = await createSettings({ file, safeStorage: encrypted });
    assert.equal(store.publicSettings().maxOutputTokens, maxOutputTokens);
    assert.equal(store.credentials().maxOutputTokens, maxOutputTokens);
    await store.save({ model: 'updated' });
    assert.equal(store.publicSettings().maxOutputTokens, maxOutputTokens);
  }
  const before = await readFile(file, 'utf8');
  for (const maxOutputTokens of [0, -1, 1048577, 4096.5, '4096', false, {}, []]) await assert.rejects(store.save({ maxOutputTokens }));
  assert.equal(await readFile(file, 'utf8'), before);
  assert.equal(store.publicSettings().maxOutputTokens, 1048576);
  await store.save({ maxOutputTokens: null });
  assert.equal(store.publicSettings().maxOutputTokens, null);
  assert.equal((await createSettings({ file, safeStorage: encrypted })).credentials().maxOutputTokens, null);
  await writeFile(file, JSON.stringify({ model: 'legacy', timeoutMs: 30000 }));
  store = await createSettings({ file, safeStorage: encrypted });
  assert.equal(store.publicSettings().maxOutputTokens, null);
  assert.equal(store.publicSettings().timeoutMs, 30000);
});

test('reasoning defaults to model inheritance, persists three grades and clears without changing the output cap', async t => {
  const file = await location(t);
  let store = await createSettings({ file, safeStorage: encrypted });
  assert.equal(store.publicSettings().reasoningEffort, null);
  assert.equal(store.credentials().reasoningEffort, null);
  await store.save({ maxOutputTokens: 4096 });
  for (const reasoningEffort of ['none', 'high', 'max']) {
    await store.save({ reasoningEffort });
    store = await createSettings({ file, safeStorage: encrypted });
    assert.equal(store.publicSettings().reasoningEffort, reasoningEffort);
    assert.equal(store.credentials().reasoningEffort, reasoningEffort);
    await store.save({ model: 'test' });
    assert.equal(store.publicSettings().reasoningEffort, reasoningEffort);
    assert.equal(store.publicSettings().maxOutputTokens, 4096);
  }
  const before = await readFile(file, 'utf8');
  for (const reasoningEffort of ['', 'medium', 'low', 'minimal', 'xhigh', false, 1, {}, []]) await assert.rejects(store.save({ reasoningEffort }));
  assert.equal(await readFile(file, 'utf8'), before);
  await store.save({ reasoningEffort: null });
  assert.equal(store.publicSettings().reasoningEffort, null);
  assert.equal(store.credentials().maxOutputTokens, 4096);
  await writeFile(file, JSON.stringify({ model: 'legacy' }));
  store = await createSettings({ file, safeStorage: encrypted });
  assert.equal(store.publicSettings().reasoningEffort, null);
});

test('output parameter defaults to max_tokens and survives blank caps, unrelated edits and restart independently of reasoning', async t => {
  const file = await location(t);
  let store = await createSettings({ file, safeStorage: encrypted });
  assert.equal(store.publicSettings().maxOutputParameter, 'max_tokens');
  for (const maxOutputParameter of ['max_completion_tokens', 'max_tokens']) {
    await store.save({ maxOutputParameter, maxOutputTokens: 4096 });
    await store.save({ maxOutputTokens: null, reasoningEffort: 'max' });
    store = await createSettings({ file, safeStorage: encrypted });
    assert.equal(store.publicSettings().maxOutputParameter, maxOutputParameter);
    assert.equal(store.credentials().maxOutputTokens, null);
    await store.save({ model: 'updated', maxOutputTokens: 8192 });
    assert.equal(store.credentials().maxOutputParameter, maxOutputParameter);
    assert.equal(store.publicSettings().reasoningEffort, 'max');
  }
  const before = await readFile(file, 'utf8');
  for (const maxOutputParameter of [null, '', 'tokens', false, 1, {}, []]) await assert.rejects(store.save({ maxOutputParameter }));
  assert.equal(await readFile(file, 'utf8'), before);
});
test('encrypted credentials round trip, blank preserves, explicit clear removes', async t => {
  const file = await location(t);
  let store = await createSettings({ file, safeStorage: encrypted });
  await store.save({ model: 'test', apiKey: 'private-secret' });
  assert.equal(store.publicSettings().persistence, 'encrypted'); assert.equal(store.publicSettings().apiKey, undefined);
  assert.ok(!(await readFile(file, 'utf8')).includes('private-secret'));
  store = await createSettings({ file, safeStorage: encrypted }); assert.equal(store.credentials().apiKey, 'private-secret');
  await store.save({ apiKey: '', model: 'updated' }); assert.equal(store.credentials().apiKey, 'private-secret');
  await store.save({ clearApiKey: true }); assert.equal(store.credentials().apiKey, '');
  assert.equal((await createSettings({ file, safeStorage: encrypted })).publicSettings().hasApiKey, false);
});
test('unavailable or basic_text encryption persists only non-secret config', async t => {
  for (const safeStorage of [{ isEncryptionAvailable: () => false }, { ...encrypted, getSelectedStorageBackend: () => 'basic_text' }, { ...encrypted, encryptString: () => { throw new Error('unavailable'); } }]) {
    const file = await location(t); const store = await createSettings({ file, safeStorage });
    await store.save({ model: 'test', apiKey: 'private-secret' }); assert.equal(store.credentials().apiKey, 'private-secret');
    assert.equal(store.publicSettings().persistence, 'session'); assert.ok(!(await readFile(file, 'utf8')).includes('private-secret'));
    const reopened = await createSettings({ file, safeStorage }); assert.equal(reopened.credentials().model, 'test'); assert.equal(reopened.publicSettings().hasApiKey, false);
  }
});
test('invalid config leaves existing state unchanged', async t => {
  const store = await createSettings({ file: await location(t), safeStorage: encrypted });
  await store.save({ model: 'test', apiKey: 'old' });
  for (const bad of [{ baseURL: 'file:///tmp/key' }, { baseURL: 'https://user:password@host/v1' }, { timeoutMs: 0 }, { apiKey: 'key\nheader' }]) await assert.rejects(store.save(bad));
  assert.equal(store.credentials().apiKey, 'old'); assert.equal(store.credentials().model, 'test');
});

test('header validation rejects ambiguous and unsafe enabled headers without exposing values', () => {
  const fixed = { name: 'x-provider', value: 'sensitive-value' };
  for (const patch of [
    { name: '' }, { name: 'bad name' }, { name: 'x-name\r\n' }, { name: '名' },
    { name: 'a'.repeat(129) }, { value: '' }, { value: ' ' }, { value: 'secret\r\ninjected' },
    { value: 'secret\tvalue' }, { value: '中文' }, { value: 'a'.repeat(8193) },
    { value: 1 }, { name: 1 }, { valueType: 'other' }, { enabled: 1 }, { remember: 'true' },
  ]) {
    const result = validateHeaders([{ ...fixed, ...patch }]);
    assert.ok(result.errors[0]); assert.ok(!result.errors[0].includes('sensitive-value'));
  }
  for (const name of ['Authorization', 'Proxy-Authorization', 'Host', 'Content-Length', 'Content-Type', 'Connection', 'Keep-Alive', 'Proxy-Authenticate', 'TE', 'Trailer', 'Transfer-Encoding', 'Upgrade']) assert.ok(validateHeaders([{ ...fixed, name }]).errors[0], name);
  for (const value of [null, {}, Array.from({ length: 21 }, () => fixed)]) assert.ok(validateHeaders(value).message);
  const duplicates = validateHeaders([fixed, { ...fixed, name: 'X-PROVIDER' }]);
  assert.ok(duplicates.errors.every(Boolean));
  const disabled = validateHeaders([{ ...fixed, enabled: false }, { ...fixed, name: 'X-PROVIDER' }, { name: '', value: '\r\n', enabled: false }]);
  assert.deepEqual(disabled.errors, ['', '', '']);
  assert.ok(validateHeaders([{ ...fixed, enabled: false, remember: 1 }]).errors[0]);
  assert.ok(validateHeaders([{ ...fixed, enabled: false, value: 'a'.repeat(8193) }]).errors[0]);
  assert.deepEqual(validateHeaders([{ name: ' x-opencode-session ', valueType: 'session', value: 'ignored' }]).rows, [{ name: 'x-opencode-session', value: '', valueType: 'session', enabled: true, remember: false }]);
});

test('headers are session-only by default, remembered per row, and revocable on save', async t => {
  const file = await location(t), store = await createSettings({ file, safeStorage: encrypted });
  await store.save({ model: 'test', headers: [
    { name: 'x-temporary', value: 'only-in-memory' },
    { name: 'x-remembered', value: 'plaintext-choice', remember: true },
    { name: 'x-disabled', value: 'never-sent', enabled: false, remember: true },
    { name: 'x-opencode-session', valueType: 'session', value: 'do-not-store', remember: true },
  ] });
  const resolved = store.credentials().requestHeaders;
  assert.equal(resolved['x-temporary'], 'only-in-memory');
  assert.equal(resolved['x-remembered'], 'plaintext-choice'); assert.equal(resolved['x-disabled'], undefined);
  assert.match(resolved['x-opencode-session'], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(store.credentials().requestHeaders['x-opencode-session'], resolved['x-opencode-session']);
  const raw = await readFile(file, 'utf8');
  assert.ok(!raw.includes('only-in-memory')); assert.ok(raw.includes('plaintext-choice'));
  assert.ok(!raw.includes(resolved['x-opencode-session'])); assert.ok(!raw.includes('do-not-store')); assert.ok(!raw.includes('requestHeaders'));
  const publicConfig = store.publicSettings();
  assert.equal(publicConfig.requestHeaders, undefined); assert.ok(!JSON.stringify(publicConfig).includes(resolved['x-opencode-session']));
  publicConfig.headers[0].value = 'mutated'; store.credentials().headers[0].value = 'mutated';
  assert.equal(store.credentials().requestHeaders['x-temporary'], 'only-in-memory');
  const reopened = await createSettings({ file, safeStorage: encrypted });
  assert.equal(reopened.publicSettings().headers.length, 3);
  assert.equal(reopened.credentials().requestHeaders['x-temporary'], undefined);
  assert.equal(reopened.credentials().requestHeaders['x-remembered'], 'plaintext-choice');
  assert.notEqual(reopened.credentials().requestHeaders['x-opencode-session'], resolved['x-opencode-session']);
  await store.save({ headers: store.publicSettings().headers.map(row => ({ ...row, remember: false })) });
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).headers, []);
  assert.equal(store.credentials().requestHeaders['x-remembered'], 'plaintext-choice');
  assert.deepEqual((await createSettings({ file, safeStorage: encrypted })).publicSettings().headers, []);
});

test('invalid header saves and disk failures preserve existing file and memory', async t => {
  const file = await location(t), store = await createSettings({ file, safeStorage: encrypted });
  await store.save({ model: 'test', apiKey: 'old-key', headers: [{ name: 'x-provider', value: 'old-value', remember: true }] });
  const before = await readFile(file, 'utf8'), credentials = store.credentials();
  for (const headers of [null, [{ name: 'authorization', value: 'private-key' }], [{ name: 'x-provider', value: 'private\nvalue' }]]) await assert.rejects(store.save({ headers, apiKey: 'new-key' }));
  await mkdir(`${file}.tmp`);
  await assert.rejects(store.save({ model: 'changed', apiKey: 'new-key', headers: [] }));
  assert.equal(await readFile(file, 'utf8'), before); assert.deepEqual(store.credentials(), credentials);
});

test('legacy settings load without headers and extra fields cannot reach disk or public settings', async t => {
  const file = await location(t);
  await writeFile(file, JSON.stringify({ baseURL: 'https://example.com/v1', model: 'legacy', timeoutMs: 30000, requestHeaders: { secret: 'discard' }, sessionId: 'discard' }));
  const store = await createSettings({ file, safeStorage: encrypted });
  assert.equal(store.publicSettings().model, 'legacy'); assert.deepEqual(store.publicSettings().headers, []);
  await store.save({ sessionId: 'discard', requestHeaders: { secret: 'discard' }, headers: [{ name: 'x-test', value: 'ok', remember: true, injected: 'discard' }] });
  assert.ok(!JSON.stringify(store.publicSettings()).includes('discard'));
  assert.ok(!(await readFile(file, 'utf8')).includes('discard'));
});
