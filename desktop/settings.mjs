import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

function config(input, previous = {}) {
  const baseURL = (input.baseURL ?? previous.baseURL ?? 'https://api.openai.com/v1').trim();
  let url;
  try { url = new URL(baseURL); } catch { throw new Error('服务地址必须是有效的 HTTP(S) URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('服务地址不能包含凭据、查询参数或片段');
  const model = (input.model ?? previous.model ?? '').trim();
  const timeoutMs = input.timeoutMs ?? previous.timeoutMs ?? 30000;
  if (model.length > 200 || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw new Error('模型名称或超时设置无效');
  return { baseURL: baseURL.replace(/\/$/, ''), model, timeoutMs };
}

// Only this main-process object can expose credentials. Public projections never contain keys.
export async function createSettings({ file, safeStorage }) {
  let state = config({});
  let apiKey = '';
  let persistence = 'session';
  const canEncrypt = () => {
    try { return !!safeStorage?.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== 'basic_text'; } catch { return false; }
  };
  try {
    const saved = JSON.parse(await readFile(file, 'utf8'));
    state = config(saved);
    if (saved.encryptedKey && canEncrypt()) {
      apiKey = await safeStorage.decryptString(Buffer.from(saved.encryptedKey, 'base64'));
      persistence = 'encrypted';
    }
  } catch (error) {
    if (error.code !== 'ENOENT') persistence = 'session';
  }
  return {
    publicSettings: () => ({ ...state, hasApiKey: !!apiKey, persistence }),
    credentials: () => ({ ...state, apiKey }),
    async save(input) {
      if (!input || typeof input !== 'object') throw new Error('设置无效');
      const next = config(input, state);
      if (input.apiKey !== undefined && (typeof input.apiKey !== 'string' || input.apiKey.length > 8192 || /[\r\n]/.test(input.apiKey))) throw new Error('API Key 格式无效');
      const nextKey = input.clearApiKey === true ? '' : input.apiKey?.trim() || apiKey;
      let encryptedKey;
      let nextPersistence = 'session';
      if (nextKey && canEncrypt()) {
        try {
          encryptedKey = Buffer.from(await safeStorage.encryptString(nextKey)).toString('base64');
          nextPersistence = 'encrypted';
        } catch { /* Encryption unavailable: retain credentials in this process only. */ }
      }
      await mkdir(dirname(file), { recursive: true });
      await writeFile(`${file}.tmp`, JSON.stringify({ ...next, ...(encryptedKey ? { encryptedKey } : {}) }, null, 2), { mode: 0o600 });
      await rename(`${file}.tmp`, file);
      state = next;
      apiKey = nextKey;
      persistence = nextPersistence;
      return this.publicSettings();
    },
  };
}
