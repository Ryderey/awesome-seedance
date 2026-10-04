/* Isolated renderer: all library content comes through the narrow preload bridge. */
import { validateHeaders } from '../headers.mjs';

const api = window.library;
const $ = (id) => document.getElementById(id);
const state = { requestId: null, settled: false, query: '', results: null, resultView: 'local', localResults: null, agentResults: null, visibleCases: 12, visibleTemplates: 3, detailId: 0, busy: false, detail: null, unsubscribe: null, continuation: {}, pendingQuestion: null, headerRows: [], settingsBusy: false, overview: null, viewSequence: 0 };
const caseTiers = [['topic', '同主题案例'], ['related_product', '相关产品案例'], ['technique', '拍法参考'], ['uncertain', '信息不足']];
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
function selectResults(view) {
  const agent = view === 'agent';
  const results = agent ? state.agentResults : state.localResults;
  if (!results) return;
  state.resultView = agent ? 'agent' : 'local';
  $('view-agent').setAttribute('aria-pressed', String(agent));
  $('view-local').setAttribute('aria-pressed', String(!agent));
  $('results-note').textContent = agent ? results.broadReference ? `信息不足，仅作宽泛参考。${display(results.uncertainty)}不会猜测未提供的产品、品牌或用途。` : '按主体与用途依据分层。相关产品差异和缺少的信息会单独注明。' : '关键词搜索结果，尚未经 Agent 逐条判断。';
  $('expand-techniques').hidden = !agent || state.continuation.allowTechniqueOnly === true;
  showResults(results);
}
function resetResultViews() {
  state.settled = false; state.localResults = null; state.agentResults = null; state.resultView = 'local';
  $('result-views').hidden = true;
}
function renderTemplates() {
  const results = state.results;
  const templates = $('templates'); templates.replaceChildren();
  for (const item of results.templates.slice(0, state.visibleTemplates)) {
    const card = button('', () => openDetail('template', item.id), 'template-card');
    card.append(node('span', 'category', display(item.category) || '提示词结构'), node('h3', '', item.title), node('p', '', item.reason || item.description));
    if (state.resultView === 'agent' && item.gap) {
      const gap = node('p', 'template-gap', `使用时：${display(item.gap)}`); gap.title = gap.textContent; card.append(gap);
    }
    card.append(node('span', 'card-footer', `${item.corpusCount ?? 0} 条关联案例 · 查看模板 ↗`));
    templates.append(card);
  }
  if (!results.templates.length) templates.append(node('p', 'empty', '暂无匹配模板。可以从案例提示词继续探索。'));
  $('more-templates').hidden = state.visibleTemplates >= results.templates.length;
  $('more-templates').textContent = `更多模板（还有 ${Math.max(0, results.templates.length - state.visibleTemplates)} 个） ↓`;
}
function renderCases() {
  const container = $('cases'); container.replaceChildren();
  const agent = state.resultView === 'agent';
  const rawCases = state.results?.cases || [];
  const tierOf = item => caseTiers.some(([tier]) => tier === item.relevanceTier) ? item.relevanceTier : 'uncertain';
  const cases = agent ? caseTiers.flatMap(([tier]) => rawCases.filter(item => tierOf(item) === tier)) : rawCases;
  const shown = cases.slice(0, state.visibleCases);
  container.className = agent ? 'case-tiers' : 'case-grid';
  const groups = new Map();
  if (agent) {
    if (cases.length && !cases.some(item => tierOf(item) === 'topic')) container.append(node('p', 'tier-empty', '当前库中暂未找到已确认的同主题案例。'));
    for (const [tier, title] of caseTiers) {
      const total = cases.filter(item => tierOf(item) === tier).length;
      if (!shown.some(item => tierOf(item) === tier)) continue;
      const section = node('section', 'case-tier'); section.dataset.tier = tier;
      const heading = node('h3', 'tier-title', title); heading.append(node('span', '', `${total} 条`));
      const grid = node('div', 'case-grid'); section.append(heading, grid); container.append(section); groups.set(tier, grid);
    }
  }
  for (const item of shown) {
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
    if (agent) {
      if (item.gap) { const gap = node('p', 'case-gap', `差异 / 待确认：${display(item.gap)}`); gap.title = gap.textContent; card.append(gap); }
      if (item.evidence) { const evidence = node('p', 'case-evidence', `依据：${display(item.evidence)}`); evidence.title = evidence.textContent; card.append(evidence); }
    }
    (agent ? groups.get(tierOf(item)) : container).append(card);
  }
  if (!cases.length) container.append(node('p', 'empty', agent ? 'Agent 没有找到依据充分的案例。可以查看全部本地结果，或主动拓展拍法参考。' : '没有找到相关案例。试试补充场景、主体或拍摄方式。'));
  $('load-more').hidden = state.visibleCases >= cases.length;
  $('load-more').textContent = `查看更多案例（还有 ${Math.max(0, cases.length - state.visibleCases)} 条）`;
}
function consume(event) {
  if (!event || event.requestId !== state.requestId || state.settled) return;
  if (['agent', 'error', 'cancelled', 'clarification'].includes(event.stage)) state.settled = true;
  if (event.localResults) state.localResults = event.localResults;
  if (event.stage === 'preliminary') state.localResults = event.results;
  if (event.stage === 'agent' && event.results) {
    state.agentResults = event.results;
    $('result-views').hidden = false;
    $('view-agent').textContent = `Agent ${event.results.broadReference ? '宽泛参考' : '推荐'}（${event.results.templates.length + event.results.cases.length}）`;
    selectResults('agent');
  } else if (event.results) showResults(event.stage === 'clarification' ? state.localResults || event.results : event.results);
  if (event.intent?.summary) { $('intent').textContent = `理解你的方向：${event.intent.summary}`; $('intent').hidden = false; }
  $('clarification').hidden = event.stage !== 'clarification';
  if (event.stage === 'preliminary') $('status').textContent = '本地初步候选 · Agent 正在理解你的方向';
  if (event.stage === 'progress') $('status').textContent = event.message || 'Agent 正在检索并判断相关性…';
  if (event.stage === 'agent') { $('status').textContent = event.results.templates.length || event.results.cases.length ? event.results.broadReference ? '已由 Agent 提供宽泛参考 · 主题信息不足，可切换全部本地结果' : '已由 Agent 推荐 · 全部本地结果仍可切换查看' : 'Agent 暂无依据充分的推荐 · 可切换全部本地结果'; setBusy(false); }
  if (event.stage === 'error') { $('status').textContent = `${event.message || 'Agent 匹配失败'} · 当前显示本地搜索结果`; $('retry').hidden = false; setBusy(false); }
  if (event.stage === 'cancelled') { $('status').textContent = '已取消 · 当前结果尚未经 Agent 判断'; setBusy(false); }
  if (event.stage === 'clarification') {
    state.pendingQuestion = event.question?.text || '你更倾向哪种方向？';
    const history = state.continuation.clarificationHistory || [];
    const round = event.clarificationRound ?? history.length + 1;
    $('question-progress').textContent = `第 ${round}${event.maxClarificationRounds ? ` / ${event.maxClarificationRounds}` : ''} 问 · 补充最关键的信息`;
    $('clarification-history').replaceChildren(...history.map(item => node('p', 'clarification-reply', `${item.question} → ${item.answer}`)));
    setBusy(false); $('status').textContent = '等待补充说明 · 此时不会请求模型，也可以跳过';
    $('question').textContent = event.question?.text || '你更倾向哪种方向？';
    $('question-options').replaceChildren(...(event.question?.options || []).map((option) => button(option, () => answerQuestion(option))));
    $('answer').value = '';
  }
}
function answerQuestion(value) {
  const answer = value.trim();
  if (!answer || state.busy || !state.pendingQuestion) return;
  const clarificationHistory = [...(state.continuation.clarificationHistory || []), { question: state.pendingQuestion, answer }];
  return runSearch({ ...state.continuation, clarificationHistory, skipQuestion: false });
}
function skipClarification() {
  if (state.busy || !state.pendingQuestion) return;
  return runSearch({ ...state.continuation, skipQuestion: true });
}
async function runSearch(extra = {}) {
  const query = $('query').value.trim();
  if (!query) return browse();
  state.viewSequence++;
  selectCategory(undefined);
  if (query !== state.query) extra = {};
  const requestId = crypto.randomUUID(); state.requestId = requestId; state.query = query;
  resetResultViews();
  state.continuation = extra;
  state.pendingQuestion = null;
  $('notice').textContent = ''; $('retry').hidden = true; $('clarification').hidden = true; $('intent').hidden = true;
  $('status').textContent = '正在搜索本地库…'; setBusy(true);
  try { consume(await api.search({ query, requestId, ...extra })); }
  catch (error) { consume({ requestId, stage: 'error', message: error?.message || '搜索失败，请重试。' }); }
}
function selectCategory(categoryId) {
  const all = categoryId === null;
  $('browse').classList.toggle('active', all);
  $('browse').setAttribute('aria-pressed', String(all));
  for (const element of $('categories').children) {
    const selected = element.dataset.categoryId === categoryId;
    element.classList.toggle('active', selected);
    element.setAttribute('aria-pressed', String(selected));
  }
}
async function browse(refresh = false, categoryId = null) {
  const sequence = ++state.viewSequence;
  const previous = state.requestId; state.requestId = null; setBusy(false);
  resetResultViews();
  state.query = ''; state.continuation = {}; state.pendingQuestion = null;
  $('query').value = ''; $('retry').hidden = true; $('clarification').hidden = true; $('intent').hidden = true;
  $('notice').textContent = ''; $('expand-techniques').hidden = true;
  selectCategory(categoryId);
  if (previous) await api.cancelSearch({ requestId: previous });
  if (sequence !== state.viewSequence) return;
  const overview = await (refresh ? api.refresh() : state.overview || api.overview());
  if (sequence !== state.viewSequence) return;
  state.overview = overview;
  const templates = categoryId === null ? overview.featured.templates : overview.featured.templates.filter((item) => item.category === categoryId);
  const templateIds = new Set(templates.map((item) => item.id));
  const cases = categoryId === null ? overview.featured.cases : overview.featured.cases.filter((item) => templateIds.has(item.templateId));
  showResults({ ...overview.featured, templates, cases, totalTemplates: templates.length, totalCases: cases.length });
  $('library-info').textContent = `${overview.stats.templateCount} 个模板 / ${overview.stats.caseCount} 条案例`;
  $('data-version').textContent = `数据版本 ${(overview.dataVersion || '').slice(0, 12)}`;
  const selected = overview.categories.find((category) => category.id === categoryId);
  $('status').textContent = selected ? `浏览拍法分类：${selected.title} · 本地模板与关联案例` : `浏览本地库 · ${overview.stats.unassignedCount ?? 0} 条案例暂无对应模板，仍可搜索`;
  $('categories').replaceChildren(...(overview.categories || []).map((category) => {
    const label = typeof category === 'string' ? category : category.title || category.label || category.name || category.id;
    const id = typeof category === 'string' ? category : category.id;
    const element = node('button', '', label);
    element.type = 'button';
    element.addEventListener('click', () => browse(false, id).catch(report));
    element.dataset.categoryId = id;
    return element;
  }));
  selectCategory(categoryId);
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
function validateHeaderRows() {
  const result = validateHeaders(state.headerRows);
  [...$('header-rows').children].forEach((row, index) => {
    row.disabled = state.settingsBusy;
    const error = result.errors[index] || '';
    row.querySelector('.header-error').textContent = error;
    row.querySelectorAll('input:not([type=checkbox]), select').forEach(input => input.setAttribute('aria-invalid', String(!!error)));
  });
  $('headers-error').textContent = result.message || '';
  const invalidTimeout = !$('request-timeout').checkValidity();
  $('timeout-error').textContent = invalidTimeout ? '请输入 1–120 秒的单次请求等待时间，最多保留三位小数。' : '';
  $('request-timeout').setAttribute('aria-invalid', String(invalidTimeout));
  const invalidOutputTokens = !$('max-output-tokens').checkValidity();
  $('output-tokens-error').textContent = invalidOutputTokens ? '请留空使用模型默认值，或填写 1–1048576 的整数。' : '';
  $('max-output-tokens').setAttribute('aria-invalid', String(invalidOutputTokens));
  $('output-parameter-field').hidden = $('max-output-tokens').value === '';
  const invalid = !!result.message || result.errors.some(Boolean) || invalidTimeout || invalidOutputTokens;
  $('settings-save').disabled = state.settingsBusy || invalid;
  $('connection-test').disabled = state.settingsBusy || invalid;
  $('add-header').disabled = state.settingsBusy || state.headerRows.length >= 20;
  for (const id of ['base-url', 'model', 'api-key', 'clear-key', 'request-timeout', 'max-output-tokens', 'max-output-parameter', 'reasoning-effort']) $(id).disabled = state.settingsBusy;
  return invalid ? null : result.rows;
}
function renderHeaderRows() {
  $('header-rows').replaceChildren(...state.headerRows.map((header, index) => {
    const row = node('fieldset', 'header-row');
    row.append(node('legend', '', `请求头 ${index + 1}`));
    const errorId = `header-error-${index}`;
    function field(label, key, input) {
      const wrapper = node('div', `header-field header-${key}`);
      const caption = node('label', '', label); input.id = `header-${index}-${key}`; caption.htmlFor = input.id;
      input.setAttribute('aria-describedby', errorId);
      input.value = header[key];
      input.addEventListener('input', () => { header[key] = input.value; validateHeaderRows(); });
      wrapper.append(caption, input); row.append(wrapper); return input;
    }
    const name = field('名称', 'name', node('input'));
    name.placeholder = 'x-opencode-session'; name.maxLength = 128; name.spellcheck = false; name.autocomplete = 'off';
    const type = node('select');
    for (const [value, label] of [['fixed', '固定文本'], ['session', '自动会话 ID']]) { const option = node('option', '', label); option.value = value; type.append(option); }
    field('值类型', 'valueType', type);
    const value = field('值', 'value', node('input'));
    value.maxLength = 8192; value.autocomplete = 'off'; value.spellcheck = false;
    function updateValueMode() {
      value.disabled = header.valueType === 'session' || !header.enabled;
      value.placeholder = header.valueType === 'session' ? '本次应用运行自动生成并复用，重启后更新' : '输入非空请求头值';
      name.disabled = !header.enabled; type.disabled = !header.enabled;
    }
    type.addEventListener('change', () => { header.valueType = type.value; if (header.valueType === 'session') { header.value = ''; value.value = ''; } updateValueMode(); validateHeaderRows(); });
    const controls = node('div', 'header-controls');
    for (const [key, label] of [['enabled', '启用'], ['remember', '本地记住（明文）']]) {
      const wrapper = node('label', 'checkbox'); const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.checked = header[key];
      checkbox.addEventListener('change', () => { header[key] = checkbox.checked; updateValueMode(); validateHeaderRows(); });
      wrapper.append(checkbox, document.createTextNode(label)); controls.append(wrapper);
    }
    controls.append(button('删除', () => { state.headerRows.splice(index, 1); renderHeaderRows(); }, 'delete-header'));
    row.append(controls);
    const error = node('p', 'header-error'); error.id = errorId; error.setAttribute('aria-live', 'polite'); row.append(error);
    updateValueMode(); return row;
  }));
  validateHeaderRows();
}
function renderSettings(settings) {
  $('base-url').value = settings.baseURL || ''; $('model').value = settings.model || ''; $('api-key').value = ''; $('clear-key').checked = false;
  $('request-timeout').value = settings.timeoutMs / 1000;
  $('max-output-tokens').value = settings.maxOutputTokens ?? '';
  $('max-output-parameter').value = settings.maxOutputParameter ?? 'max_tokens';
  $('reasoning-effort').value = settings.reasoningEffort ?? '';
  state.headerRows = (settings.headers || []).map(header => ({ ...header })); renderHeaderRows();
  const persistence = settings.persistence === 'encrypted' ? 'Key 使用系统加密保存在本机。' : settings.persistence === 'session' || settings.persistence === 'memory' ? 'Key 仅保留在本次运行内，退出后需重新输入。' : '未保存 Key。';
  $('key-status').textContent = `${settings.hasApiKey ? '已配置 Key。' : '尚未配置 Key。'} ${persistence}`;
}
async function settingsSave(test = false) {
  const headers = validateHeaderRows();
  if (!headers) { $('advanced-settings').open = true; return; }
  if (!$('settings-form').reportValidity()) return;
  state.settingsBusy = true; validateHeaderRows(); $('settings-status').textContent = test ? '正在保存并测试连接…' : '正在保存…';
  try {
    const settings = await api.saveSettings({ baseURL: $('base-url').value.trim(), model: $('model').value.trim(), apiKey: $('api-key').value, clearApiKey: $('clear-key').checked, timeoutMs: Math.round($('request-timeout').valueAsNumber * 1000), maxOutputTokens: $('max-output-tokens').value === '' ? null : $('max-output-tokens').valueAsNumber, maxOutputParameter: $('max-output-parameter').value, reasoningEffort: $('reasoning-effort').value || null, headers });
    renderSettings(settings);
    if (test) { const result = await api.testConnection(); $('settings-status').textContent = result?.message || '连接成功，可以开始 Agent 匹配。'; }
    else $('settings-status').textContent = '配置已保存。';
  } catch (error) { $('settings-status').textContent = error?.message || '保存或测试失败，请检查配置。'; }
  finally { state.settingsBusy = false; validateHeaderRows(); }
}
$('search-form').addEventListener('submit', (event) => { event.preventDefault(); runSearch().catch(report); });
$('answer-form').addEventListener('submit', (event) => { event.preventDefault(); Promise.resolve(answerQuestion($('answer').value)).catch(report); });
$('skip').addEventListener('click', () => Promise.resolve(skipClarification()).catch(report));
$('retry').addEventListener('click', () => runSearch(state.continuation).catch(report));
$('cancel').addEventListener('click', async () => { const requestId = state.requestId; consume({ requestId, stage: 'cancelled' }); state.requestId = null; try { await api.cancelSearch({ requestId }); } catch (error) { report(error); } });
$('browse').addEventListener('click', () => browse().catch(report));
$('refresh').addEventListener('click', () => browse(true).catch(report));
$('load-more').addEventListener('click', () => { state.visibleCases += 12; renderCases(); });
$('more-templates').addEventListener('click', () => { state.visibleTemplates += 3; renderTemplates(); });
$('view-agent').addEventListener('click', () => selectResults('agent'));
$('view-local').addEventListener('click', () => selectResults('local'));
$('expand-techniques').addEventListener('click', () => { $('query').value = state.query; runSearch({ ...state.continuation, allowTechniqueOnly: true }).catch(report); });
$('settings-open').addEventListener('click', async () => { try { renderSettings(await api.getSettings()); $('advanced-settings').open = false; $('settings-status').textContent = ''; $('settings-dialog').showModal(); } catch (error) { report(error); } });
$('add-header').addEventListener('click', () => { state.headerRows.push({ name: '', value: '', valueType: 'fixed', enabled: true, remember: false }); renderHeaderRows(); $('header-rows').lastElementChild.querySelector('input').focus(); });
$('settings-form').addEventListener('submit', (event) => { event.preventDefault(); settingsSave(); });
$('connection-test').addEventListener('click', () => settingsSave(true));
$('request-timeout').addEventListener('input', validateHeaderRows);
$('max-output-tokens').addEventListener('input', validateHeaderRows);
document.querySelectorAll('[data-close]').forEach((element) => element.addEventListener('click', () => closeDialog($(element.dataset.close))));
$('detail-dialog').addEventListener('close', () => { state.detailId++; const video = $('detail-dialog').querySelector('video'); if (video) { video.pause(); video.removeAttribute('src'); video.load(); } });
$('settings-dialog').addEventListener('close', () => { $('api-key').value = ''; });
document.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) { event.preventDefault(); $('query').focus(); $('query').select(); } });
window.addEventListener('beforeunload', () => state.unsubscribe?.());
if (api) { state.unsubscribe = api.onSearch(consume); browse().catch(report); }
else { $('status').textContent = '请通过桌面应用启动，才能读取本地库。'; }
