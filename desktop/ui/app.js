/* Isolated renderer: all library content comes through the narrow preload bridge. */
const api = window.library;
const $ = (id) => document.getElementById(id);
const state = { requestId: null, query: '', results: null, visibleCases: 12, visibleTemplates: 3, detailId: 0, busy: false, detail: null, unsubscribe: null, continuation: {} };
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text ?? '');
  return element;
}
function button(text, action, className = '') {
  const element = node('button', className, text);
  element.type = 'button';
  element.addEventListener('click', () => Promise.resolve().then(action).catch(report));
  return element;
}
function report(error) { $('notice').textContent = error?.message || '操作未完成，请重试。'; }
function display(value) { return Array.isArray(value) ? value.join(' · ') : String(value ?? ''); }
function safeURL(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
function setBusy(busy) { state.busy = busy; $('cancel').hidden = !busy; $('search-button').textContent = busy ? '重新搜索 →' : '搜索参考 →'; }
function showResults(results) {
  state.results = results;
  state.visibleCases = 12;
  state.visibleTemplates = 3;
  $('template-count').textContent = `${results.totalTemplates ?? results.templates.length} 个`;
  $('case-count').textContent = `${results.totalCases ?? results.cases.length} 条`;
  renderTemplates();
  renderCases();
}
function renderTemplates() {
  const results = state.results;
  const templates = $('templates'); templates.replaceChildren();
  for (const item of results.templates.slice(0, state.visibleTemplates)) {
    const card = button('', () => openDetail('template', item.id), 'template-card');
    card.append(node('span', 'category', display(item.category) || '提示词结构'), node('h3', '', item.title), node('p', '', item.reason || item.description), node('span', 'card-footer', `${item.corpusCount ?? 0} 条关联案例 · 查看模板 ↗`));
    templates.append(card);
  }
  if (!results.templates.length) templates.append(node('p', 'empty', '暂无匹配模板。可以从案例提示词继续探索。'));
  $('more-templates').hidden = state.visibleTemplates >= results.templates.length;
  $('more-templates').textContent = `更多模板（还有 ${Math.max(0, results.templates.length - state.visibleTemplates)} 个） ↓`;
}
function renderCases() {
  const container = $('cases'); container.replaceChildren();
  const cases = state.results?.cases || [];
  for (const item of cases.slice(0, state.visibleCases)) {
    const card = button('', () => openDetail('case', item.id), 'case-card');
    const poster = node('div', 'poster');
    const url = safeURL(item.posterUrl);
    if (url) {
      const fallback = node('span', '', '正在加载封面');
      poster.append(fallback);
      const img = node('img'); img.src = url; img.alt = item.title || '案例封面'; img.loading = 'lazy'; img.decoding = 'async';
      img.addEventListener('load', () => fallback.remove(), { once: true });
      img.addEventListener('error', () => { img.remove(); fallback.textContent = '封面暂不可用'; }, { once: true });
      poster.append(img);
    } else poster.append(node('span', '', '查看案例'));
    poster.append(node('span', 'poster-hint', '查看参考 ↗'));
    card.append(poster, node('h3', '', item.title), node('p', '', [display(item.creator), display(item.models)].filter(Boolean).join(' · ')));
    if (item.reason) card.append(node('p', 'reason', item.reason));
    else card.append(node('p', '', item.templateTitle || '暂无对应模板'));
    container.append(card);
  }
  if (!cases.length) container.append(node('p', 'empty', '没有找到相关案例。试试补充场景、主体或拍摄方式。'));
  $('load-more').hidden = state.visibleCases >= cases.length;
  $('load-more').textContent = `查看更多案例（还有 ${Math.max(0, cases.length - state.visibleCases)} 条）`;
}
function consume(event) {
  if (!event || event.requestId !== state.requestId) return;
  if (event.results) showResults(event.results);
  if (event.intent?.summary) { $('intent').textContent = `理解你的方向：${event.intent.summary}`; $('intent').hidden = false; }
  $('clarification').hidden = event.stage !== 'clarification';
  if (event.stage === 'preliminary') $('status').textContent = '本地初步候选 · Agent 正在理解你的方向';
  if (event.stage === 'progress') $('status').textContent = event.message || 'Agent 正在检索并判断相关性…';
  if (event.stage === 'agent') { $('status').textContent = event.message || '已由 Agent 判断相关性 · 点击查看匹配依据与全文'; setBusy(false); }
  if (event.stage === 'error') { $('status').textContent = event.message || 'Agent 匹配失败，保留本地初步候选'; $('retry').hidden = false; setBusy(false); }
  if (event.stage === 'cancelled') { $('status').textContent = '已取消 · 当前结果尚未经 Agent 判断'; setBusy(false); }
  if (event.stage === 'clarification') {
    setBusy(false); $('status').textContent = '补充一个细节，帮助匹配；也可以直接跳过';
    $('question').textContent = event.question?.text || '你更倾向哪种方向？';
    $('question-options').replaceChildren(...(event.question?.options || []).map((option) => button(option, () => runSearch({ answer: option }))));
    $('answer').value = '';
  }
}
async function runSearch(extra = {}) {
  const query = $('query').value.trim();
  if (!query) return browse();
  const requestId = crypto.randomUUID(); state.requestId = requestId; state.query = query;
  state.continuation = extra;
  $('notice').textContent = ''; $('retry').hidden = true; $('clarification').hidden = true; $('intent').hidden = true;
  $('status').textContent = '正在搜索本地库…'; setBusy(true);
  try { consume(await api.search({ query, requestId, ...extra })); }
  catch (error) { consume({ requestId, stage: 'error', message: error?.message || '搜索失败，请重试。' }); }
}
async function browse(refresh = false) {
  const previous = state.requestId; state.requestId = null; setBusy(false);
  if (previous) await api.cancelSearch({ requestId: previous });
  $('query').value = ''; $('retry').hidden = true; $('clarification').hidden = true; $('intent').hidden = true;
  const overview = await (refresh ? api.refresh() : api.overview());
  showResults(overview.featured);
  $('library-info').textContent = `${overview.stats.templateCount} 个模板 / ${overview.stats.caseCount} 条案例`;
  $('data-version').textContent = `数据版本 ${(overview.dataVersion || '').slice(0, 12)}`;
  $('status').textContent = `浏览本地库 · ${overview.stats.unassignedCount ?? 0} 条案例暂无对应模板，仍可搜索`;
  $('categories').replaceChildren(...(overview.categories || []).map((category) => {
    const label = typeof category === 'string' ? category : category.title || category.label || category.name || category.id;
    return button(label, () => { $('query').value = label; return runSearch(); });
  }));
}
function closeDialog(dialog) { dialog.close(); }
function addSection(parent, title, text) {
  if (!text || (Array.isArray(text) && !text.length)) return;
  const section = node('section', 'detail-section'); section.append(node('h3', '', title));
  const content = Array.isArray(text) ? text.map((value) => typeof value === 'object' ? JSON.stringify(value) : value).join('\n') : typeof text === 'object' ? JSON.stringify(text, null, 2) : text;
  section.append(node('div', 'prompt-text', content)); parent.append(section);
}
function linkAction(detail, type, label, retestIndex) {
  return button(label, () => api.openLink({ kind: detail.kind, id: detail.id, type, ...(retestIndex === undefined ? {} : { retestIndex }) }));
}
function mediaSection(detail, parent) {
  const section = node('section', 'detail-section'); section.append(node('h3', '', '视频参考'));
  const options = [{ url: detail.mediaUrl, title: '来源作品', type: 'media' }, ...(detail.retests || []).map((retest, index) => ({ url: retest.url, title: `复测 · ${retest.model || '模型未注明'}${retest.verdict ? ` · ${retest.verdict}` : ''}`, type: 'retest', index }))];
  const select = node('select', 'media-select'); select.setAttribute('aria-label', '选择来源或复测视频');
  options.forEach((item, index) => { const option = node('option', '', item.title); option.value = String(index); select.append(option); });
  const area = node('div');
  function show(index) {
    const oldVideo = area.querySelector('video'); if (oldVideo) { oldVideo.pause(); oldVideo.removeAttribute('src'); oldVideo.load(); }
    area.replaceChildren(); const current = options[index]; const url = safeURL(current.url);
    const message = node('p', 'media-message', url ? '视频由原始链接加载。无法播放时，请在浏览器打开。' : `没有可播放视频链接。来源地址：${detail.sourceUrl || detail.goodcaseUrl || '暂无可用地址'}`);
    if (url) {
      const video = node('video', 'media-video'); video.controls = true; video.preload = 'metadata'; video.src = url;
      const poster = safeURL(detail.posterUrl); if (poster) video.poster = poster;
      video.addEventListener('error', () => { message.textContent = `这个地址无法直接播放。可在浏览器打开：${url}`; });
      area.append(video);
    }
    area.append(message); const actions = node('div', 'detail-actions');
    if (url) actions.append(linkAction(detail, current.type, current.type === 'retest' ? '打开复测地址 ↗' : '打开视频地址 ↗', current.index));
    if (detail.sourceUrl) actions.append(linkAction(detail, 'source', '来源作品 ↗'));
    if (detail.goodcaseUrl) actions.append(linkAction(detail, 'goodcase', '案例页面 ↗'));
    area.append(actions);
  }
  select.addEventListener('change', () => show(Number(select.value)));
  if (options.length > 1) section.append(select); section.append(area); parent.append(section); show(0);
}
async function openDetail(kind, id) {
  const sequence = ++state.detailId; const dialog = $('detail-dialog'); const content = $('detail-content');
  content.replaceChildren(node('h2', '', '正在读取详情…')); $('detail-kind').textContent = kind === 'template' ? 'TEMPLATE / 提示词模板' : 'CASE / 案例参考';
  if (!dialog.open) dialog.showModal();
  try {
    const detail = await api.detail({ kind, id }); if (sequence !== state.detailId || !dialog.open) return;
    state.detail = detail; content.replaceChildren(node('h2', '', detail.title)); content.firstChild.id = 'detail-title';
    content.append(node('p', 'detail-meta', kind === 'case' ? [display(detail.creator), display(detail.models)].filter(Boolean).join(' · ') : '可复用拍摄结构与写法'));
    if (detail.summary || detail.description) content.append(node('p', '', detail.summary || detail.description));
    const actions = node('div', 'detail-actions');
    actions.append(button(kind === 'template' ? '复制模板' : '复制案例提示词', async () => { await api.copy({ kind, id }); $('notice').textContent = '已复制到剪贴板'; }, 'primary'));
    if (kind === 'case' && detail.templateId) actions.append(button('查看所属模板 ↗', () => openDetail('template', detail.templateId)));
    content.append(actions);
    if (kind === 'case') { mediaSection(detail, content); addSection(content, '原始提示词', detail.prompt); }
    else {
      addSection(content, '适用方向', detail.useWhen); addSection(content, '模板全文', detail.bodyText || detail.copyText || detail.structure);
      addSection(content, '使用建议', detail.guidance); addSection(content, '常见问题', detail.pitfalls);
      if (detail.relatedCases?.length) {
        const related = node('section', 'detail-section'); related.append(node('h3', '', '关联案例'));
        for (const item of detail.relatedCases) related.append(button(item.title || item.id, () => openDetail('case', item.id), 'related-button'));
        content.append(related);
      }
    }
  } catch (error) { if (sequence === state.detailId) content.replaceChildren(node('h2', '', '详情未能加载'), node('p', '', error?.message || '请关闭后重试。')); }
}
function renderSettings(settings) {
  $('base-url').value = settings.baseURL || ''; $('model').value = settings.model || ''; $('api-key').value = ''; $('clear-key').checked = false;
  const persistence = settings.persistence === 'encrypted' ? 'Key 使用系统加密保存在本机。' : settings.persistence === 'session' || settings.persistence === 'memory' ? 'Key 仅保留在本次运行内，退出后需重新输入。' : '未保存 Key。';
  $('key-status').textContent = `${settings.hasApiKey ? '已配置 Key。' : '尚未配置 Key。'} ${persistence}`;
}
async function settingsSave(test = false) {
  if (!$('settings-form').reportValidity()) return;
  $('settings-save').disabled = true; $('connection-test').disabled = true; $('settings-status').textContent = test ? '正在保存并测试连接…' : '正在保存…';
  try {
    const settings = await api.saveSettings({ baseURL: $('base-url').value.trim(), model: $('model').value.trim(), apiKey: $('api-key').value, clearApiKey: $('clear-key').checked });
    renderSettings(settings);
    if (test) { const result = await api.testConnection(); $('settings-status').textContent = result?.message || '连接成功，可以开始 Agent 匹配。'; }
    else $('settings-status').textContent = '配置已保存。';
  } catch (error) { $('settings-status').textContent = error?.message || '保存或测试失败，请检查配置。'; }
  finally { $('settings-save').disabled = false; $('connection-test').disabled = false; }
}
$('search-form').addEventListener('submit', (event) => { event.preventDefault(); runSearch().catch(report); });
$('answer-form').addEventListener('submit', (event) => { event.preventDefault(); if ($('answer').value.trim()) runSearch({ answer: $('answer').value.trim() }).catch(report); });
$('skip').addEventListener('click', () => runSearch({ skipQuestion: true }).catch(report));
$('retry').addEventListener('click', () => runSearch(state.continuation).catch(report));
$('cancel').addEventListener('click', async () => { const requestId = state.requestId; consume({ requestId, stage: 'cancelled' }); state.requestId = null; try { await api.cancelSearch({ requestId }); } catch (error) { report(error); } });
$('browse').addEventListener('click', () => browse().catch(report));
$('refresh').addEventListener('click', () => browse(true).catch(report));
$('load-more').addEventListener('click', () => { state.visibleCases += 12; renderCases(); });
$('more-templates').addEventListener('click', () => { state.visibleTemplates += 3; renderTemplates(); });
$('settings-open').addEventListener('click', async () => { try { renderSettings(await api.getSettings()); $('settings-status').textContent = ''; $('settings-dialog').showModal(); } catch (error) { report(error); } });
$('settings-form').addEventListener('submit', (event) => { event.preventDefault(); settingsSave(); });
$('connection-test').addEventListener('click', () => settingsSave(true));
document.querySelectorAll('[data-close]').forEach((element) => element.addEventListener('click', () => closeDialog($(element.dataset.close))));
$('detail-dialog').addEventListener('close', () => { state.detailId++; const video = $('detail-dialog').querySelector('video'); if (video) { video.pause(); video.removeAttribute('src'); video.load(); } });
$('settings-dialog').addEventListener('close', () => { $('api-key').value = ''; });
document.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) { event.preventDefault(); $('query').focus(); $('query').select(); } });
window.addEventListener('beforeunload', () => state.unsubscribe?.());
if (api) { state.unsubscribe = api.onSearch(consume); browse().catch(report); }
else { $('status').textContent = '请通过桌面应用启动，才能读取本地库。'; }
