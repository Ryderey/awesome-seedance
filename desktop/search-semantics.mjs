import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadLibrary } from '../scripts/lib/library.mjs';

export const SEMANTIC_SCHEMA_VERSION = 1;
export const SEMANTIC_ANNOTATION_VERSION = 1;
// Small retrieval vocabulary: aliases of one concept never become independent requirements.
export const SEMANTIC_VOCABULARY = [
  { id: 'beverage', dimension: 'product', terms: ['饮料', '饮品', 'beverage', 'drink'] },
  { id: 'beverage.sports_drink', parent: 'beverage', dimension: 'product', terms: ['运动饮料', '电解质饮料', 'sports drink', 'electrolyte drink'] },
  { id: 'beverage.soda', parent: 'beverage', dimension: 'product', terms: ['汽水', '可乐', 'soda', 'cola', 'Mountain Dew'] },
  { id: 'beverage.fruit_drink', parent: 'beverage', dimension: 'product', terms: ['果饮', '果汁', 'fruit drink', 'juice'] },
  { id: 'beverage.coffee', parent: 'beverage', dimension: 'product', terms: ['咖啡', 'coffee'] },
  { id: 'beverage.tea', parent: 'beverage', dimension: 'product', terms: ['茶饮', '奶茶', 'tea', 'milk tea'] },
  { id: 'beverage.water', parent: 'beverage', dimension: 'product', terms: ['矿泉水', '瓶装水', 'bottled water'] },
  { id: 'footwear', dimension: 'product', terms: ['鞋', '运动鞋', '跑鞋', 'sneaker', 'shoe', 'footwear'] },
  { id: 'cosmetics', dimension: 'product', terms: ['美妆', '化妆品', '唇蜜', 'cosmetics', 'beauty product', 'lip gloss'] },
  { id: 'skincare', dimension: 'product', terms: ['护肤品', '精华', 'skincare', 'serum'] },
  { id: 'vehicle', dimension: 'product', terms: ['汽车', '赛车', 'car', 'vehicle'] },
  { id: 'food', dimension: 'product', terms: ['食物', '美食', 'food'] },
  { id: 'person', dimension: 'subject', terms: ['人物', '人像', 'person', 'woman', 'man'] },
  { id: 'cat', dimension: 'subject', terms: ['猫', '猫咪', '小猫', 'cat', 'kitten'] },
  { id: 'dog', dimension: 'subject', terms: ['狗', '小狗', 'dog', 'puppy'] },
  { id: 'cycling', dimension: 'activity', terms: ['骑行', '骑单车', '骑自行车', 'cycling', 'bicycle ride'] },
  { id: 'fitness', dimension: 'activity', terms: ['健身', '训练', 'fitness', 'gym', 'workout'] },
  { id: 'running', dimension: 'activity', terms: ['跑步', 'running', 'jogging'] },
  { id: 'dance', dimension: 'activity', terms: ['舞蹈', '跳舞', 'dance', 'dancing'] },
  { id: 'cooking', dimension: 'activity', terms: ['烹饪', '做饭', 'cooking'] },
  { id: 'travel', dimension: 'activity', terms: ['旅行', '旅游', 'travel'] },
  { id: 'product_hero', dimension: 'capability', terms: ['产品展示', '产品英雄镜头', 'product hero', 'product showcase'] },
  { id: 'macro', dimension: 'capability', terms: ['微距', 'macro'] },
  { id: 'tracking', dimension: 'capability', terms: ['跟拍', 'tracking', 'follow shot'] },
  { id: 'continuous_take', dimension: 'capability', terms: ['一镜到底', '长镜头', 'continuous take', 'one take'] },
  { id: 'timeline_script', dimension: 'capability', terms: ['时间线', '分镜', 'timeline', 'shot list'] },
  { id: 'handheld', dimension: 'capability', terms: ['手持', 'handheld'] },
  { id: 'reference_lock', dimension: 'capability', terms: ['身份锁定', '参考图', 'reference lock'] },
  { id: 'transition', dimension: 'capability', terms: ['转场', 'transition'] },
  { id: 'retro', dimension: 'capability', terms: ['复古', 'retro', 'vintage', 'VHS'] },
  { id: 'anime', dimension: 'capability', terms: ['动漫', '动画', 'anime', 'animation'] },
  { id: 'stop_motion', dimension: 'capability', terms: ['定格', 'stop motion', 'stop-motion'] },
  { id: 'cyberpunk', dimension: 'capability', terms: ['赛博朋克', 'cyberpunk'] },
  { id: 'horror', dimension: 'capability', terms: ['恐怖', '惊悚', 'horror'] },
  { id: 'combat', dimension: 'activity', terms: ['打斗', '武打', 'combat', 'fight'] },
];
const concepts = new Map(SEMANTIC_VOCABULARY.map((v) => [v.id, v]));
const contentTypes = new Set(['product_ad', 'ugc_review', 'vlog', 'documentary', 'story', 'unknown']);
const roles = new Set(['primary_product', 'primary', 'actor', 'background', 'negated']);
const flatten = (v) => typeof v === 'string' ? v : Array.isArray(v) ? v.map(flatten).join('\n') : v && typeof v === 'object' ? Object.values(v).map(flatten).join('\n') : '';
const normalize = (v) => String(v ?? '').normalize('NFKC').toLowerCase();
const readJson = (file, fallback) => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
function readSemanticFile(file) {
  try {
    const value = readJson(file, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : { invalidFile: true };
  } catch { return { invalidFile: true }; }
}

export function semanticSources(kind, raw) {
  const keys = kind === 'case' ? ['title', 'titleEn', 'summary', 'summaryEn', 'promptFull', 'tags'] : ['title', 'description', 'useWhen', 'structure', 'guidance', 'pitfalls', 'copyPrompt', 'tags'];
  return Object.fromEntries(keys.map((key) => [key, raw?.[key] ?? null]));
}
export function semanticSourceHash(kind, raw) {
  return createHash('sha256').update(JSON.stringify(semanticSources(kind, raw))).digest('hex');
}
export function semanticField(raw, field) {
  return flatten(field.split('.').reduce((value, key) => value?.[key], raw));
}
export function unknownSemantic(kind, id, raw, versionState = 'missing') {
  return { kind, id, schemaVersion: SEMANTIC_SCHEMA_VERSION, annotationVersion: SEMANTIC_ANNOTATION_VERSION, sourceHash: semanticSourceHash(kind, raw), reviewStatus: 'unknown', contentType: 'unknown', subjects: [], productCategory: null, activities: [], scenes: [], capabilities: [], evidence: [], versionState };
}
export function validateSemanticEntry(entry, kind, id, raw) {
  const errors = [];
  if (!entry || entry.kind !== kind || entry.id !== id || entry.schemaVersion !== SEMANTIC_SCHEMA_VERSION || entry.annotationVersion !== SEMANTIC_ANNOTATION_VERSION) return ['schema'];
  if (entry.sourceHash !== semanticSourceHash(kind, raw)) errors.push('sourceHash');
  if (!['reviewed', 'draft', 'unknown'].includes(entry.reviewStatus) || !contentTypes.has(entry.contentType)) errors.push('status');
  if (!Array.isArray(entry.evidence) || entry.evidence.length > 40) return [...errors, 'evidence'];
  for (const e of entry.evidence) {
    const allowedRoot = Object.hasOwn(semanticSources(kind, raw), String(e?.field).split('.')[0]);
    if (!e || !allowedRoot || typeof e.field !== 'string' || typeof e.quote !== 'string' || !e.quote.trim() || e.quote.length > 400 || !semanticField(raw, e.field).includes(e.quote) || !['contentType', 'subjects', 'productCategory', 'activities', 'scenes', 'capabilities'].includes(e.axis)) errors.push('quote');
  }
  const supported = (axis, concept, role) => entry.evidence.some((e) => e?.axis === axis && e.concept === concept && (!role || e.role === role));
  if (!Array.isArray(entry.subjects) || entry.subjects.some((s) => !s || !concepts.has(s.concept) || !roles.has(s.role) || (s.role === 'primary_product' && concepts.get(s.concept)?.dimension !== 'product') || !supported('subjects', s.concept, s.role))) errors.push('subjects');
  if (entry.contentType !== 'unknown' && !supported('contentType', entry.contentType)) errors.push('contentType');
  if (entry.productCategory && (concepts.get(entry.productCategory)?.dimension !== 'product' || !Array.isArray(entry.subjects) || !entry.subjects.some((s) => s?.role === 'primary_product' && conceptMatches(s.concept, entry.productCategory)) || !supported('productCategory', entry.productCategory))) errors.push('productCategory');
  for (const axis of ['activities', 'scenes', 'capabilities']) if (!Array.isArray(entry[axis]) || entry[axis].some((concept) => typeof concept !== 'string' || concept.length > 100 || (axis === 'activities' && concepts.get(concept)?.dimension !== 'activity') || (axis === 'capabilities' && concepts.get(concept)?.dimension !== 'capability') || !supported(axis, concept))) errors.push(axis);
  return [...new Set(errors)];
}

export function loadSearchSemantics(root, sources = {}) {
  const library = sources.library ?? loadLibrary(root).library;
  const cases = sources.cases ?? readJson(path.join(root, 'data/cases.json'), { cases: [] }).cases;
  const data = readSemanticFile(path.join(root, 'data/search-semantics.json'));
  const overrides = readSemanticFile(path.join(root, 'data/search-semantic-overrides.json'));
  const entries = new Map();
  const stats = { reviewed: 0, draft: 0, unknown: 0, stale: 0, invalid: 0, missing: 0, templates: library.templates.length, cases: cases.length };
  for (const [kind, records, bucket] of [['template', library.templates, 'templates'], ['case', cases, 'cases']]) for (const raw of records) {
    const id = kind === 'case' ? raw.slug : raw.id;
    const hasOverride = Object.hasOwn(overrides[bucket] ?? {}, id);
    const source = hasOverride ? overrides : data;
    const entry = hasOverride ? overrides[bucket][id] : data[bucket]?.[id];
    const errors = entry ? validateSemanticEntry(entry, kind, id, raw) : [];
    const invalidFile = source.invalidFile || overrides.invalidFile;
    // Reviewed facts are owned by the manual manifest. Refresh must revoke them as
    // soon as an override is removed, even before the derived index is rebuilt.
    const missingReview = !hasOverride && entry?.reviewStatus === 'reviewed';
    const versionState = invalidFile ? 'invalid' : !entry || missingReview ? 'missing' : errors.includes('sourceHash') ? 'stale' : errors.length || source.schemaVersion !== SEMANTIC_SCHEMA_VERSION || source.annotationVersion !== SEMANTIC_ANNOTATION_VERSION ? 'invalid' : 'valid';
    const value = versionState === 'valid' ? { ...structuredClone(entry), versionState } : unknownSemantic(kind, id, raw, versionState);
    if (versionState !== 'valid') stats[versionState]++;
    stats[value.reviewStatus]++;
    entries.set(`${kind}:${id}`, value);
  }
  const dataVersion = createHash('sha256').update(JSON.stringify([...entries])).digest('hex');
  return { entries, stats, vocabulary: structuredClone(SEMANTIC_VOCABULARY), dataVersion, get: (kind, id) => structuredClone(entries.get(`${kind}:${id}`) ?? null) };
}

export function conceptMatches(actual, wanted) {
  for (let id = actual; id; id = concepts.get(id)?.parent) if (id === wanted) return true;
  return false;
}
function keywordConcept(group) {
  if (concepts.has(group?.concept)) return group.concept;
  return SEMANTIC_VOCABULARY.find((v) => (group?.terms ?? []).some((t) => v.terms.some((alias) => normalize(alias) === normalize(t))))?.id ?? group?.concept;
}
function facts(entry) {
  return [...entry.subjects.filter((s) => ['primary', 'primary_product'].includes(s.role)).map((s) => s.concept), ...entry.activities, ...entry.capabilities];
}
function hasGroup(entry, group, productOnly = false) {
  const actual = productOnly ? entry.subjects.filter((s) => s.role === 'primary_product').map((s) => s.concept) : facts(entry);
  const wanted = keywordConcept(group);
  return actual.some((v) => conceptMatches(v, wanted));
}
function requirementsSupported(plan, entry) {
  return (plan.required ?? []).every((requirement) => {
    let remainder = normalize(typeof requirement === 'string' ? requirement : requirement?.text);
    if (!remainder) return false;
    if (entry.evidence.some((e) => {
      const quote = normalize(e.quote);
      let offset = -1;
      while ((offset = quote.indexOf(remainder, offset + 1)) >= 0) {
        if (/^[a-z0-9 ]+$/i.test(remainder) && (/[a-z0-9]/i.test(quote[offset - 1] ?? '') || /[a-z0-9]/i.test(quote[offset + remainder.length] ?? ''))) continue;
        const prefix = quote.slice(0, offset).split(/[\n.,，。;；]/u).at(-1);
        // A quote saying "不是电影" is evidence against the requirement "电影".
        // Negation inside the requirement itself (e.g. "无对白") remains intact.
        if (!/(?:无|不|禁止|没有|\bnot\b|\bno\b|\bwithout\b|\bavoid\b|\bnever\b)[^\n.,，。;；]{0,32}$/iu.test(prefix)) return true;
      }
      return false;
    })) return true;
    for (const v of SEMANTIC_VOCABULARY) if (facts(entry).some((actual) => conceptMatches(actual, v.id))) {
      for (const alias of [...v.terms].sort((a, b) => b.length - a.length)) remainder = remainder.replaceAll(normalize(alias), '');
    }
    if (['product_ad', 'ugc_review'].includes(entry.contentType)) remainder = remainder.replace(/product_ad|ugc_review|广告用途|产品广告|产品展示|商业广告|广告|测评|带货|product advertising|product ad|commercial|advertisement|advertising|review/gi, '');
    if (entry.contentType !== 'unknown') remainder = remainder.replaceAll(entry.contentType, '');
    return !remainder.replace(/主要|产品|主体|用途|类型|拍摄|展示|使用|属于|为|是|的|和|、|以及|required|primary|product|subject|purpose|\s/gi, '');
  });
}
function literalGroup(raw, kind, group) {
  const text = normalize(flatten(semanticSources(kind, raw)));
  return (group.terms ?? []).some((term) => {
    const word = normalize(term).trim();
    if (!word) return false;
    let offset = -1;
    while ((offset = text.indexOf(word, offset + 1)) >= 0) if (!/^[a-z0-9 ]+$/i.test(word) || (!/[a-z0-9]/i.test(text[offset - 1] ?? '') && !/[a-z0-9]/i.test(text[offset + word.length] ?? ''))) return true;
    return false;
  });
}

// Same gate is used at retrieval and after ranking; model reasons cannot upgrade a tier.
export function evaluateCandidate(plan, semantic, rawOrOptions = {}, options = {}) {
  if (rawOrOptions.kind && !rawOrOptions.title && !rawOrOptions.slug && !rawOrOptions.promptFull) options = rawOrOptions;
  const entry = semantic ?? unknownSemantic(options.kind ?? 'case', '', {});
  const kind = options.kind ?? entry.kind;
  const trusted = entry.reviewStatus === 'reviewed' && entry.versionState === 'valid';
  const primary = plan.primaryKeywords ?? [];
  const related = plan.relatedKeywords ?? [];
  const product = plan.goal === 'product_ad' || plan.goal === 'ugc_review' || primary.some((g) => g.role === 'primary_product' || concepts.get(keywordConcept(g))?.dimension === 'product');
  const nonCommercialPurpose = ['documentary', 'vlog', 'story'].includes(plan.goal);
  const techniqueAllowed = options.allowTechniqueOnly ?? plan.allowTechniqueOnly ?? false;
  const transferable = ['product_hero', 'macro', 'tracking', 'handheld', 'transition'];
  const techniqueMatch = entry.capabilities.some((v) => transferable.includes(v)) || [...primary, ...(plan.optionalKeywords ?? [])].some((g) => hasGroup(entry, g));
  const output = (eligible, relevanceTier, matchType, gap, score = 0) => ({ eligible, relevanceTier, matchType, gap, score, evidence: structuredClone(entry.evidence) });
  const excluded = (plan.excludeKeywords ?? []).some((g) => [...facts(entry), ...entry.subjects.filter((s) => s.role !== 'negated').map((s) => s.concept)].some((v) => conceptMatches(v, keywordConcept(typeof g === 'string' ? { terms: [g] } : g))));
  if (trusted && excluded) return output(false, 'uncertain', 'partial', '命中排除条件');
  if (plan.broadReference) {
    // An unknown subject never borrows its identity from a candidate. Explicit
    // purpose/product constraints still need reviewed evidence before inclusion.
    const constrainedPurpose = ['product_ad', 'ugc_review', 'vlog', 'documentary', 'story'].includes(plan.goal);
    const purpose = plan.goal === 'product_ad' ? ['product_ad', 'ugc_review'].includes(entry.contentType) : entry.contentType === plan.goal;
    const products = primary.filter(g => g.role === 'primary_product' || concepts.get(keywordConcept(g))?.dimension === 'product');
    const mainProduct = entry.subjects.some(s => s.role === 'primary_product');
    const supported = primary.every(g => concepts.has(keywordConcept(g)) ? hasGroup(entry, g, products.includes(g)) : literalGroup(rawOrOptions, kind, g));
    const eligible = (!constrainedPurpose || trusted && purpose) && (!(products.length || product && kind === 'case') || trusted && mainProduct) && (!primary.length || supported) && (!(plan.required ?? []).length || trusted && requirementsSupported(plan, entry));
    return output(eligible, 'uncertain', 'partial', plan.uncertainty || '信息不足，仅供宽泛参考', eligible ? trusted ? 30 : 1 : 0);
  }
  if (!trusted) return output(!product, 'uncertain', 'partial', entry.versionState === 'stale' ? '来源已更新，语义标记待复核' : '主体与用途尚未确认');
  if (kind === 'template' && product && !nonCommercialPurpose) {
    const domains = entry.subjects.filter((s) => s.role === 'primary_product');
    const requested = primary.filter((g) => g.role === 'primary_product' || concepts.get(keywordConcept(g))?.dimension === 'product');
    const domainMatches = !domains.length || !requested.length || requested.every((g) => domains.some((s) => conceptMatches(s.concept, keywordConcept(g)) || conceptMatches(keywordConcept(g), s.concept)));
    if (domainMatches && (['product_ad', 'ugc_review'].includes(entry.contentType) || entry.capabilities.includes('product_hero'))) return output(true, 'topic', 'partial', '可复用产品结构，需替换为目标产品并核对条件', 80);
    return output(techniqueAllowed && techniqueMatch, 'technique', 'partial', '仅提供拍法，需补充目标产品展示', techniqueAllowed && techniqueMatch ? 8 : 0);
  }
  if (product) {
    const purpose = plan.goal === 'ugc_review' || nonCommercialPurpose ? entry.contentType === plan.goal : ['product_ad', 'ugc_review'].includes(entry.contentType);
    const productGroups = primary.filter((g) => g.role === 'primary_product' || concepts.get(keywordConcept(g))?.dimension === 'product');
    const subjectMatches = entry.subjects.some((s) => s.role === 'primary_product') && productGroups.every((g) => hasGroup(entry, g, true));
    const secondaryMatches = primary.filter((g) => !productGroups.includes(g)).every((g) => hasGroup(entry, g));
    if (purpose && subjectMatches && secondaryMatches) return requirementsSupported(plan, entry) ? output(true, 'topic', 'full', '', 100) : output(true, 'topic', 'partial', '主体与用途已确认，额外必要条件需核对', 90);
    if (purpose && secondaryMatches && related.some((g) => hasGroup(entry, g, true))) return output(true, 'related_product', 'partial', '产品属于相关类别，未满足目标产品细类', 60);
    return output(techniqueAllowed && techniqueMatch, 'technique', 'partial', '缺少所需主要产品或用途，仅可借用拍法', techniqueAllowed && techniqueMatch ? 8 : 0);
  }
  const subjectMatches = primary.length > 0 && primary.every((g) => hasGroup(entry, g));
  const purpose = ['vlog', 'documentary', 'story'].includes(plan.goal) ? entry.contentType === plan.goal : true;
  if (subjectMatches && purpose) return requirementsSupported(plan, entry) ? output(true, 'topic', 'full', '', 100) : output(true, 'topic', 'partial', '主要主题已确认，额外必要条件需核对', 90);
  if (subjectMatches) return output(true, 'uncertain', 'partial', '主题有依据，创作用途不完全匹配', 30);
  // Vocabulary is deliberately small. Literal new themes can be reviewed by the ranking
  // Agent without pretending they already have verified subject/purpose annotations.
  if (primary.some((g) => !concepts.has(keywordConcept(g))) && primary.every((g) => concepts.has(keywordConcept(g)) ? hasGroup(entry, g) : literalGroup(rawOrOptions, kind, g))) return output(true, 'uncertain', 'partial', '原文包含目标短语，尚缺已确认的主题标记', 20);
  if (techniqueAllowed && primary.some((g) => hasGroup(entry, g))) return output(true, 'technique', 'partial', '仅支持部分拍法条件', 8);
  return output(false, 'uncertain', 'partial', '缺少主要主题依据');
}
