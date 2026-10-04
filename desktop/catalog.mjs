import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { loadLibrary, buildTemplateIndex } from '../scripts/lib/library.mjs';
import { copyPromptOf, renderTemplateBody } from '../scripts/lib/templates.mjs';
import { loadSearchSemantics, evaluateCandidate } from './search-semantics.mjs';

const groups = [
  ['赛博朋克', 'cyberpunk'], ['猫咪', '猫', 'cat', 'cats', 'kitten'],
  ['狗', '小狗', 'dog', 'dogs', 'puppy'], ['广告', '商业', 'commercial', 'advertisement', 'product'],
  ['汽车', '赛车', 'car', 'vehicle'], ['恐怖', '惊悚', 'horror'],
  ['动漫', '动画', 'anime', 'animation'], ['美食', '食物', 'food', 'cooking'],
  ['舞蹈', '跳舞', 'dance', 'dancing'], ['旅行', '旅游', 'travel'],
  ['科幻', 'science fiction', 'sci-fi'], ['定格', 'stop motion', 'stop-motion'],
  ['复古', 'retro', 'vintage'], ['时间冻结', 'time freeze', 'frozen time'],
  ['倒放', 'rewind'], ['口播', 'ugc', 'review'], ['变形', 'transformation'],
  ['打斗', '武打', 'combat', 'fight'], ['音乐', 'music'], ['太空', 'space'],
];
const stop = new Set(['我', '想', '想要', '做', '一个', '一条', '视频', '主题', '方向', '的', '和', '请', '帮', '找', '一些', '相关', '提示词', '模板', '案例', 'video', 'a', 'an', 'the', 'and', 'i', 'want', 'make', 'please', 'find', 'prompt', 'template']);
const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
const normalize = (v) => String(v ?? '').normalize('NFKC').toLowerCase();
const textOf = (v) => typeof v === 'string' ? v : Array.isArray(v) ? v.map(textOf).join('\n') : v && typeof v === 'object' ? Object.values(v).map(textOf).join('\n') : '';
const zh = (v) => typeof v === 'string' ? v : v?.zh ?? v?.en ?? '';
const list = (v) => Array.isArray(zh(v)) ? zh(v) : zh(v) ? [zh(v)] : [];
const clone = (v) => structuredClone(v);

function tokens(text) {
  const cleaned = normalize(text);
  const compounds = groups.flat().filter((w) => /[\p{Script=Han}]/u.test(w) && cleaned.includes(w)).sort((a, b) => b.length - a.length);
  let remaining = cleaned;
  for (const word of compounds) remaining = remaining.replaceAll(word, ' ');
  const words = [...compounds, ...[...segmenter.segment(remaining)].filter((p) => p.isWordLike).map((p) => p.segment)];
  return [...new Set(words.filter((w) => !stop.has(w) && (w.length > 1 || /\p{Script=Han}/u.test(w))).map((w) => groups.find((g) => g.includes(w))?.[0] ?? w))];
}
function aliases(term) {
  return groups.find((g) => g.includes(term)) ?? [term];
}
function contains(text, term, positiveOnly = false) {
  let start = 0;
  while ((start = text.indexOf(term, start)) >= 0) {
    if (!/^[a-z0-9 ]+$/i.test(term) || ((!/[a-z0-9]/i.test(text[start - 1] ?? '')) && !/[a-z0-9]/i.test(text[start + term.length] ?? ''))) {
      if (!positiveOnly) return true;
      const prefix = text.slice(0, start).split(/[\n.!?,;。！？，；]/u).at(-1);
      // Explicit absence is not a positive exclusion hit. Keep this bounded to
      // direct noun negation; the reviewed semantic gate remains authoritative.
      if (!/(?:\b(?:no|without|avoid)\s+|\b(?:not|never)\s+(?:show|include|add|use)\s+|(?:无|没有|不含|不要|不得|禁止|不出现|不展示|不包含)(?:出现|展示|包含|使用|添加)?\s*)$/iu.test(prefix)) return true;
    }
    start += term.length;
  }
  return false;
}
function excerpt(text, matches, length = 640) {
  const lower = normalize(text);
  const offsets = matches.flatMap(aliases).map((w) => lower.indexOf(w)).filter((i) => i >= 0);
  const start = Math.max(0, (offsets[0] ?? 0) - 120);
  return text.slice(start, start + length);
}

export function loadCatalog(root) {
  const { library, taxonomy } = loadLibrary(root);
  const caseData = JSON.parse(readFileSync(path.join(root, 'data/cases.json'), 'utf8'));
  const cases = caseData.cases;
  const semantics = loadSearchSemantics(root, { library, cases });
  const index = buildTemplateIndex(library.templates, taxonomy, cases);
  // Deliberate null overrides template example links as well as automatic inference.
  const assigned = new Map();
  for (const [id, entries] of index.byTemplate) for (const c of entries) {
    if (Object.hasOwn(taxonomy.assignments, c.slug) && taxonomy.assignments[c.slug] === null) continue;
    assigned.set(c.slug, id);
  }
  const templates = new Map(library.templates.map((t) => [t.id, t]));
  const rawCases = new Map(cases.map((c) => [c.slug, c]));
  const hash = createHash('sha256');
  for (const data of [library, taxonomy, caseData, semantics.dataVersion]) hash.update(JSON.stringify(data));
  const dataVersion = hash.digest('hex');
  const cardMatches = new WeakMap();
  const cardEvidence = new WeakMap();
  const templateRecords = library.templates.map((t) => ({ kind: 'template', id: t.id, title: textOf(t.title), summary: textOf(t.description), content: textOf([t.useWhen, t.structure, t.guidance, t.pitfalls, t.copyPrompt, t.tags]), raw: t }));
  const caseRecords = cases.map((c) => ({ kind: 'case', id: c.slug, title: textOf([c.title, c.titleEn]), summary: textOf([c.summary, c.summaryEn]), content: textOf([c.promptFull, c.tags, c.creator, c.models]), raw: c }));
  for (const r of [...templateRecords, ...caseRecords]) r.fields = [r.title, r.summary, r.content].map(normalize);
  const related = (id) => (index.byTemplate.get(id) ?? []).filter((c) => assigned.get(c.slug) === id);
  function card(r, matches = [], coverage = 0, count = 0) {
    const raw = r.raw;
    const result = r.kind === 'template' ? {
      id: r.id, title: zh(raw.title), description: zh(raw.description), category: raw.category,
      tags: clone(raw.tags ?? []), corpusCount: related(r.id).length,
    } : {
      id: r.id, title: raw.title || raw.titleEn || r.id, summary: raw.summary || raw.summaryEn || '',
      posterUrl: raw.posterUrl || '', creator: raw.creator || '', models: clone(raw.models ?? []),
      templateId: assigned.get(r.id) ?? null, templateTitle: zh(templates.get(assigned.get(r.id))?.title) || null,
    };
    if (count) {
      result.reason = `匹配：${matches.join('、')}`;
      result.matchType = coverage === count ? 'full' : 'partial';
    } else result.matchType = 'browse';
    cardMatches.set(result, matches);
    return result;
  }
  function search(query, options = {}) {
    const started = performance.now();
    const exclusions = [...(options.excludeTerms ?? [])];
    const cleanQuery = String(query ?? '').replace(/(?:不要|排除|不含|不包含|without|exclude|excluding|\bno\b)\s*([^，。;,]+)/gi, (_, value) => { exclusions.push(value); return ''; });
    const terms = [...new Set([...tokens(cleanQuery), ...(options.terms ?? []).flatMap(tokens)])];
    const exclude = exclusions.flatMap(tokens).flatMap(aliases);
    const isBrowse = !String(query ?? '').trim() && !(options.terms?.length);
    const matchGroups = terms.map(aliases);
    const allRecords = [...templateRecords, ...caseRecords];
    const rarity = matchGroups.map((g) => 1 + Math.log(1 + allRecords.length / (1 + allRecords.filter((r) => g.some((w) => r.fields.some((f) => contains(f, w)))).length)));
    const rank = (records) => records.map((r) => {
      if (exclude.some((w) => r.fields.some((f) => contains(f, w)))) return null;
      const matches = [], weights = [5, 3, 1];
      let score = 0;
      matchGroups.forEach((g, i) => {
        const field = r.fields.findIndex((f) => g.some((w) => contains(f, w)));
        if (field >= 0) { matches.push(terms[i]); score += weights[field] * rarity[i]; }
      });
      return { r, score: score + matches.length * 12, matches };
    }).filter((entry) => entry && (isBrowse || entry.matches.length)).sort((a, b) => b.matches.length - a.matches.length || b.score - a.score || (b.r.raw.heatScore ?? 0) - (a.r.raw.heatScore ?? 0) || a.r.id.localeCompare(b.r.id));
    const caseRanked = rank(caseRecords);
    const templateRanked = rank(templateRecords);
    // A matching real example supports its template even when the theme is absent from generic guidance.
    if (!isBrowse) for (const entry of caseRanked) {
      const id = assigned.get(entry.r.id);
      if (!id || templateRanked.some((t) => t.r.id === id) || exclude.some((w) => templateRecords.find((r) => r.id === id).fields.some((f) => contains(f, w)))) continue;
      templateRanked.push({ r: templateRecords.find((r) => r.id === id), score: entry.score * 0.5, matches: entry.matches, via: entry.r.id });
    }
    templateRanked.sort((a, b) => b.matches.length - a.matches.length || b.score - a.score || a.r.id.localeCompare(b.r.id));
    const limit = (v, fallback, max) => Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : fallback;
    const toCard = (e) => {
      const result = card(e.r, e.matches, e.matches.length, terms.length);
      if (e.via) { result.reason = `案例支持：${rawCases.get(e.via).title}；${result.reason}`; cardMatches.set(result, { matches: e.matches, via: e.via }); }
      return result;
    };
    return { templates: templateRanked.slice(0, limit(options.limitTemplates, 8, templateRecords.length)).map(toCard), cases: caseRanked.slice(0, limit(options.limitCases, 24, caseRecords.length)).map(toCard), totalTemplates: templateRanked.length, totalCases: caseRanked.length, elapsedMs: performance.now() - started };
  }
  // This path follows the Agent's plan; the original query belongs only to local browsing.
  // One compound concept has one score regardless of how many translated aliases match.
  function searchPlan(plan, options = {}) {
    const started = performance.now();
    const atomic = (groups = []) => groups.map(group => typeof group === 'string' ? { concept: 'unknown', terms: [group] } : group).map(group => ({ ...group, terms: [...new Set((group.terms ?? []).map(normalize).filter(Boolean))] }));
    const primary = atomic(plan.primaryKeywords), relatedGroups = atomic(plan.relatedKeywords), optional = atomic(plan.optionalKeywords), exclusions = atomic(plan.excludeKeywords);
    const tierOrder = ['topic', 'related_product', 'technique', 'uncertain'];
    const rank = records => records.map(r => {
      if (exclusions.some(group => group.terms.some(term => r.fields.some(field => contains(field, term, true))))) return null;
      const semantic = semantics.get(r.kind, r.id);
      const gate = evaluateCandidate(plan, semantic, r.raw, { kind: r.kind, allowTechniqueOnly: !!plan.allowTechniqueOnly });
      if (!gate.eligible) return null;
      const groups = [...primary, ...relatedGroups, ...optional], matches = [];
      let lexicalScore = 0;
      groups.forEach((group, i) => {
        const field = r.fields.findIndex(text => group.terms.some(term => contains(text, term)));
        if (field < 0) return;
        matches.push(group.terms[0]);
        lexicalScore += (i < primary.length ? 12 : i < primary.length + relatedGroups.length ? 4 : 2) * [5, 3, 1][field];
      });
      if (!matches.length && !(gate.score > 0)) return null;
      return { r, semantic, gate, matches, score: (gate.score ?? 0) + lexicalScore };
    }).filter(Boolean).sort((a, b) => tierOrder.indexOf(a.gate.relevanceTier) - tierOrder.indexOf(b.gate.relevanceTier) || b.score - a.score || a.r.id.localeCompare(b.r.id));
    const caseRanked = rank(caseRecords), templateRanked = rank(templateRecords);
    // A template is reusable; a matching case cannot grant it product-subject labels.
    const limit = (value, fallback, max) => Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : fallback;
    const toCard = entry => {
      const result = card(entry.r, entry.matches);
      Object.assign(result, { relevanceTier: entry.gate.relevanceTier, matchType: entry.gate.matchType, gap: entry.gate.gap, reason: entry.gate.gap || `主体与用途有依据：${entry.matches.join('、')}` });
      cardEvidence.set(result, { gate: clone(entry.gate), semantic: clone(entry.semantic), matches: entry.matches });
      return result;
    };
    return { templates: templateRanked.slice(0, limit(options.limitTemplates, 8, templateRecords.length)).map(toCard), cases: caseRanked.slice(0, limit(options.limitCases, 24, caseRecords.length)).map(toCard), totalTemplates: templateRanked.length, totalCases: caseRanked.length, elapsedMs: performance.now() - started };
  }
  function get(kind, id) {
    if (kind === 'template') {
      const t = templates.get(id);
      if (!t) return null;
      const bodyText = renderTemplateBody(t, 'zh');
      return { kind, id, title: zh(t.title), description: zh(t.description), useWhen: zh(t.useWhen), structure: clone(list(t.structure)), guidance: clone(list(t.guidance)), pitfalls: clone(list(t.pitfalls)), copyText: `${copyPromptOf(t, 'zh')}\n\n${bodyText}`, bodyText, relatedCases: related(id).slice(0, 24).map((c) => card(caseRecords.find((r) => r.id === c.slug))) };
    }
    if (kind !== 'case') return null;
    const c = rawCases.get(id);
    if (!c) return null;
    return { kind, id, title: c.title || c.titleEn || id, summary: c.summary || c.summaryEn || '', prompt: c.promptFull || '', mediaUrl: c.mediaUrl || '', posterUrl: c.posterUrl || '', sourceUrl: c.sourceUrl || '', goodcaseUrl: c.goodcaseUrl || '', creator: c.creator || '', models: clone(c.models ?? []), templateId: assigned.get(id) ?? null, templateTitle: zh(templates.get(assigned.get(id))?.title) || null, retests: (c.retests ?? []).filter((r) => r.artifactUrl).map((r) => ({ url: r.artifactUrl, model: r.model, verdict: r.verdict, testedAt: r.testedAt })) };
  }
  function evidence(results, budget = 18000) {
    const output = [];
    const max = Number.isFinite(budget) ? Math.max(2, Math.floor(budget)) : 18000;
    const semanticSearch = [...(results.templates ?? []), ...(results.cases ?? [])].some(c => cardEvidence.has(c));
    if (semanticSearch) {
      const project = (kind, c) => {
        const r = (kind === 'template' ? templateRecords : caseRecords).find(entry => entry.id === c.id), trusted = cardEvidence.get(c);
        if (!r || !trusted) return null;
        const semantic = trusted.semantic;
        // Product/purpose quotes precede capabilities so background props never hide the subject.
        const axes = ['contentType', 'productCategory', 'activities', 'capabilities', 'subjects', 'scenes'];
        const priority = e => e.role === 'primary_product' ? -1 : e.role === 'background' ? 10 : axes.indexOf(e.axis);
        const quotes = [...(semantic.evidence ?? [])].sort((a, b) => priority(a) - priority(b));
        const evidenceQuotes = quotes.slice(0, 4);
        const primaryQuote = evidenceQuotes.find(e => e.role === 'primary_product') ?? evidenceQuotes[0];
        const sourceText = kind === 'case' ? r.raw.promptFull || r.content : r.content;
        const quoteAt = primaryQuote ? sourceText.indexOf(primaryQuote.quote) : -1;
        const text = quoteAt >= 0 ? sourceText.slice(Math.max(0, quoteAt - 80), Math.max(0, quoteAt - 80) + 420) : excerpt(sourceText, trusted.matches, 420);
        return { kind, id: r.id, title: r.title.slice(0, 220), summary: r.summary.slice(0, 180), excerpt: text, templateId: kind === 'case' ? assigned.get(r.id) ?? null : r.id, relevanceTier: trusted.gate.relevanceTier, matchType: trusted.gate.matchType, gap: trusted.gate.gap, semantic: { reviewStatus: semantic.reviewStatus, versionState: semantic.versionState, contentType: semantic.contentType, subjects: semantic.subjects, productCategory: semantic.productCategory, activities: semantic.activities, capabilities: semantic.capabilities }, evidenceQuotes };
      };
      const candidates = { case: (results.cases ?? []).map(c => project('case', c)).filter(Boolean), template: (results.templates ?? []).map(c => project('template', c)).filter(Boolean) };
      const add = record => { if (!output.some(r => r.kind === record.kind && r.id === record.id) && JSON.stringify([...output, record]).length <= max) { output.push(record); return true; } return false; };
      // Reserve most of the input for actual cases; unused budgets are shared in the second pass.
      for (const [kind, fraction] of [['case', 0.72], ['template', 0.28]]) {
        let used = 0;
        for (const record of candidates[kind]) {
          const size = JSON.stringify(record).length + 1;
          if (used + size > max * fraction) continue;
          if (add(record)) used += size;
        }
      }
      for (const record of [...candidates.case, ...candidates.template]) add(record);
      return output;
    }
    const entries = [];
    for (let i = 0; i < Math.max(results.templates?.length ?? 0, results.cases?.length ?? 0); i++) {
      if (results.templates?.[i]) entries.push(['template', results.templates[i]]);
      if (results.cases?.[i]) entries.push(['case', results.cases[i]]);
    }
    for (const [kind, c] of entries) {
      const r = (kind === 'template' ? templateRecords : caseRecords).find((entry) => entry.id === c.id);
      if (!r) continue;
      const matched = cardMatches.get(c) ?? [];
      const matches = Array.isArray(matched) ? matched : matched.matches;
      const source = matched.via ? rawCases.get(matched.via) : null;
      const content = source ? source.promptFull || source.summary : r.content;
      const record = { kind, id: r.id, title: r.title, summary: r.summary.slice(0, 360), excerpt: excerpt(content, matches), templateId: kind === 'case' ? assigned.get(r.id) ?? null : r.id };
      if (source) record.exampleCaseId = source.slug;
      if (JSON.stringify([...output, record]).length > max) continue;
      output.push(record);
    }
    return output;
  }
  return { dataVersion, vocabulary: clone(semantics.vocabulary), search, searchPlan, get, evidence, overview: () => ({ stats: { templateCount: templates.size, caseCount: cases.length, unassignedCount: cases.filter((c) => !assigned.has(c.slug)).length }, dataVersion, categories: clone(library.categories.map((c) => ({ id: c.id, title: zh(c.title) }))), featured: search('', { limitCases: cases.length, limitTemplates: templates.size }) }) };
}
