import { app, BrowserWindow, ipcMain, clipboard, shell, safeStorage, Menu } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCatalog } from './catalog.mjs';
import { createSettings } from './settings.mjs';
import { matchCatalog, testConnection } from './agent.mjs';

app.setName('Video Prompt Library');
if (process.env.DESKTOP_USER_DATA) app.setPath('userData', path.resolve(process.env.DESKTOP_USER_DATA));
let window, catalog, settings, active;
const root = app.getAppPath();
const page = path.join(root, 'desktop/ui/index.html');
function record(input) {
  if (!input || !['template', 'case'].includes(input.kind) || typeof input.id !== 'string') throw new Error('无效的条目');
  const value = catalog.get(input.kind, input.id);
  if (!value) throw new Error('条目不存在');
  return value;
}
function emit(event) {
  if (active?.requestId === event.requestId && !window.isDestroyed()) window.webContents.send('library:search-event', event);
  return event;
}
function handle(name, callback) {
  ipcMain.handle(`library:${name}`, async (event, input) => {
    const senderURL = new URL(event.senderFrame?.url || 'about:blank');
    senderURL.hash = '';
    if (event.sender !== window.webContents || senderURL.href !== pathToFileURL(page).href) throw new Error('拒绝访问');
    try { return await callback(input); }
    catch (error) {
      const key = settings.credentials().apiKey;
      throw new Error(key ? String(error.message).split(key).join('[redacted]') : error.message);
    }
  });
}
app.whenReady().then(async () => {
catalog = await loadCatalog(root);
settings = await createSettings({ file: path.join(app.getPath('userData'), 'settings.json'), safeStorage });
window = new BrowserWindow({ width: 1440, height: 1000, minWidth: 900, minHeight: 650, show: process.env.DESKTOP_SMOKE !== '1', backgroundColor: '#f7f6f2', webPreferences: { preload: path.join(root, 'desktop/preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
Menu.setApplicationMenu(null);
window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
window.webContents.on('will-navigate', event => event.preventDefault());
handle('overview', () => catalog.overview());
handle('detail', record);
handle('getSettings', () => settings.publicSettings());
handle('saveSettings', input => settings.save(input));
handle('testConnection', () => testConnection(settings.credentials()));
handle('copy', input => {
  const value = record(input);
  const text = input.kind === 'template' ? value.copyText : value.prompt;
  if (!text) throw new Error('此条目没有可复制的提示词');
  clipboard.writeText(text);
  return { ok: true };
});
handle('openLink', async input => {
  const value = record(input);
  const links = { source: value.sourceUrl, media: value.mediaUrl, goodcase: value.goodcaseUrl, retest: Number.isInteger(input.retestIndex) ? value.retests?.[input.retestIndex]?.url : null };
  if (!Object.hasOwn(links, input.type) || !links[input.type]) throw new Error('链接不可用');
  const url = new URL(links[input.type]);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('无效链接');
  await shell.openExternal(url.href);
  return { ok: true };
});
handle('cancelSearch', input => {
  if (input?.requestId === active?.requestId) { active.controller.abort(); emit({ requestId: active.requestId, stage: 'cancelled' }); }
  return { ok: true };
});
handle('refresh', async () => { active?.controller.abort(); active = null; catalog = await loadCatalog(root); return catalog.overview(); });
handle('search', async input => {
  if (!input || typeof input.query !== 'string' || !input.query.trim() || input.query.length > 1000 || typeof input.requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.requestId) || (input.answer !== undefined && (typeof input.answer !== 'string' || input.answer.length > 1000))) throw new Error('搜索输入无效');
  active?.controller.abort();
  const current = { requestId: input.requestId, controller: new AbortController() };
  active = current;
  const results = catalog.search(input.query, { limitCases: 670, limitTemplates: 27 });
  emit({ requestId: current.requestId, stage: 'preliminary', results });
  try {
    const config = settings.credentials();
    if (!config.apiKey || !config.model) throw new Error('请在模型设置中配置模型与 API Key；当前结果尚未经 Agent 判断。');
    const matched = await matchCatalog({ query: input.query, catalog, settings: config, signal: current.controller.signal, answer: input.answer, skipQuestion: input.skipQuestion === true, onProgress: progress => emit({ ...progress, requestId: current.requestId }) });
    if (current.controller.signal.aborted) return { requestId: current.requestId, stage: 'cancelled' };
    return emit({ ...matched, requestId: current.requestId });
  } catch (error) {
    if (current.controller.signal.aborted) return { requestId: current.requestId, stage: 'cancelled' };
    return emit({ requestId: current.requestId, stage: 'error', results, message: error.message });
  }
});
await window.loadFile(page);
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => active?.controller.abort());
}).catch(error => { console.error('Desktop startup failed:', error.message); app.exit(1); });
