import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSettings } from './settings.mjs';
const encrypted = { isEncryptionAvailable: () => true, encryptString: text => Buffer.from(text.split('').reverse().join('')), decryptString: data => data.toString().split('').reverse().join('') };
async function location(t) { const dir = await mkdtemp(join(tmpdir(), 'desktop-settings-')); t.after(() => rm(dir, { recursive: true, force: true })); return join(dir, 'settings.json'); }
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
