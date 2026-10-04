import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateHeaders } from './headers.mjs';

export const DEFAULT_REQUEST_TIMEOUT_MS = 90000;

function config(input, previous = {}) {
  const baseURL = (input.baseURL ?? previous.baseURL ?? 'https://api.openai.com/v1').trim();
  let url;
  try { url = new URL(baseURL); } catch { throw new Error('服务地址必须是有效的 HTTP(S) URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('服务地址不能包含凭据、查询参数或片段');
  const model = (input.model ?? previous.model ?? '').trim();
  const timeoutMs = input.timeoutMs ?? previous.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (model.length > 200 || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw new Error('模型名称或超时设置无效');
  const maxOutputTokens = input.maxOutputTokens === undefined ? previous.maxOutputTokens ?? null : input.maxOutputTokens;
  if (maxOutputTokens !== null && (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 1048576)) throw new Error('最大输出 token 必须留空或为 1–1048576 的整数');
  const maxOutputParameter = input.maxOutputParameter === undefined ? previous.maxOutputParameter ?? 'max_tokens' : input.maxOutputParameter;
  if (!['max_tokens', 'max_completion_tokens'].includes(maxOutputParameter)) throw new Error('输出上限参数无效');
  const reasoningEffort = input.reasoningEffort === undefined ? previous.reasoningEffort ?? null : input.reasoningEffort;
  if (reasoningEffort !== null && !['none', 'high', 'max'].includes(reasoningEffort)) throw new Error('思考档位无效');
  const checked = validateHeaders(input.headers === undefined ? previous.headers ?? [] : input.headers);
  if (checked.message || checked.errors.some(Boolean)) throw new Error(checked.message || '自定义请求头无效，请检查对应行');
  return { baseURL: baseURL.replace(/\/$/, ''), model, timeoutMs, maxOutputTokens, maxOutputParameter, reasoningEffort, headers: checked.rows };
}

// Only this main-process object can expose credentials. Public projections never contain keys.
export async function createSettings({ file, safeStorage }) {
  let state = config({});
  let apiKey = '';
  let persistence = 'session';
  const sessionId = randomUUID();
  const canEncrypt = () => {
    try { return !!safeStorage?.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== 'basic_text'; } catch { return false; }
  };
  try {
    const saved = JSON.parse(await readFile(file, 'utf8'));
    const loaded = config(saved);
    state = { ...loaded, headers: loaded.headers.filter(row => row.remember) };
    if (saved.encryptedKey && canEncrypt()) {
      apiKey = await safeStorage.decryptString(Buffer.from(saved.encryptedKey, 'base64'));
      persistence = 'encrypted';
    }
  } catch (error) {
    if (error.code !== 'ENOENT') persistence = 'session';
  }
  return {
    publicSettings: () => ({ ...structuredClone(state), hasApiKey: !!apiKey, persistence }),
    credentials: () => ({ ...structuredClone(state), apiKey, requestHeaders: Object.fromEntries(state.headers.filter(row => row.enabled).map(row => [row.name, row.valueType === 'session' ? sessionId : row.value])) }),
    async save(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('设置无效');
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
      await writeFile(`${file}.tmp`, JSON.stringify({ ...next, headers: next.headers.filter(row => row.remember), ...(encryptedKey ? { encryptedKey } : {}) }, null, 2), { mode: 0o600 });
      await rename(`${file}.tmp`, file);
      state = next;
      apiKey = nextKey;
      persistence = nextPersistence;
      return this.publicSettings();
    },
  };
}
