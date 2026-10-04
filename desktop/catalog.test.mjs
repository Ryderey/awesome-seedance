import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from './catalog.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const catalog = loadCatalog(root);
const source = JSON.parse(readFileSync(new URL('../data/cases.json', import.meta.url))).cases;
const taxonomy = JSON.parse(readFileSync(new URL('../data/case-taxonomy.json', import.meta.url))).assignments;

test('all local assets and intentional null taxonomy remain accessible', () => {
  const overview = catalog.overview();
  assert.deepEqual(overview.stats, { templateCount: 27, caseCount: 670, unassignedCount: 6 });
  assert.equal(overview.featured.cases.length, 670);
  assert.equal(overview.featured.templates.length, 27);
  for (const c of source) {
    const detail = catalog.get('case', c.slug);
    assert.equal(detail.prompt, c.promptFull || '');
    assert.equal(detail.mediaUrl, c.mediaUrl);
    assert.equal(detail.sourceUrl, c.sourceUrl);
    assert.equal(detail.posterUrl, c.posterUrl);
    if (taxonomy[c.slug] === null) {
      assert.equal(detail.templateId, null);
      const found = catalog.search(c.title || c.titleEn, { limitCases: 670 }).cases.find((entry) => entry.id === c.slug);
      assert.ok(found, `unassigned case remains searchable: ${c.slug}`);
      assert.equal(found.templateId, null);
    }
    assert.deepEqual(detail.retests.map((r) => r.url), (c.retests ?? []).filter((r) => r.artifactUrl).map((r) => r.artifactUrl));
  }
  assert.equal(catalog.get('case', 'invented-case'), null);
  assert.equal(catalog.get('unknown', source[0].slug), null);
});

test('Chinese and English themes retrieve the same actual animal cases', () => {
  const zh = catalog.search('猫咪');
  const en = catalog.search('cat');
  assert.deepEqual(zh.cases.map((c) => c.id), en.cases.map((c) => c.id));
  assert.ok(en.cases.some((c) => c.id === 'cats-chasing-via-red-mini-motorcycle'));
  assert.ok(en.templates.some((t) => t.id === 'pet-animal'));
  assert.ok(en.totalCases > 10);
});

test('combined themes rank an exact multi-theme case ahead of partial matches', () => {
  for (const query of ['时间冻结倒放', 'frozen time rewind']) {
    const result = catalog.search(query);
    assert.equal(result.cases[0].id, 'seedance-25-diner-frozen-time-rewind');
    assert.equal(result.cases[0].matchType, 'full');
    assert.equal(result.templates[0].id, 'time-freeze-rewind');
  }
  const cyber = catalog.search('赛博朋克猫咪广告');
  assert.ok(cyber.cases.some((c) => c.reason.includes('赛博朋克')));
  assert.ok(cyber.cases.every((c) => ['partial', 'full'].includes(c.matchType)));
});

test('single-character Chinese subjects and exclusions remain meaningful', () => {
  assert.deepEqual(catalog.search('猫').cases.map(c => c.id), catalog.search('猫咪').cases.map(c => c.id));
  assert.deepEqual(catalog.search('狗').cases.map(c => c.id), catalog.search('dog').cases.map(c => c.id));
  assert.ok(catalog.search('狗').totalCases > 0);
  assert.deepEqual(catalog.search('猫，不要狗').cases.map(c => c.id), catalog.search('cat', { excludeTerms: ['dog'] }).cases.map(c => c.id));
});

test('empty search browses; an unknown theme never fills with unrelated examples', () => {
  assert.ok(catalog.search('').cases.length);
  for (const q of ['zzqvxyunlikelynoun', '鹧鸪税务审计']) {
    const result = catalog.search(q);
    assert.equal(result.cases.length, 0);
    assert.equal(result.templates.length, 0);
  }
});

test('purpose-only broad plan retrieves ad evidence without fabricating product keywords', () => {
  const plan = { goal: 'product_ad', primaryKeywords: [], relatedKeywords: [], required: ['广告用途'], optionalKeywords: [], excludeKeywords: [], allowTechniqueOnly: false, broadReference: true, uncertainty: '未指定产品，宽泛参考' };
  const before = structuredClone(plan);
  const results = catalog.searchPlan(plan, { limitCases: 670, limitTemplates: 27 });
  assert.ok(results.cases.some(c => c.id === 'mountain-dew-spark-b16d4e23caef'));
  for (const id of ['seedance-2-5-f3651857750b', 'johnagi168-seedance-ai-556a7495c74b', '90-vhs-vlog-ae90c46cb606']) assert.ok(!results.cases.some(c => c.id === id));
  assert.deepEqual(plan, before);
  for (const card of [...results.templates, ...results.cases]) { assert.equal(card.relevanceTier, 'uncertain'); assert.equal(card.matchType, 'partial'); }
  for (const record of catalog.evidence(results)) { assert.equal(record.relevanceTier, 'uncertain'); assert.equal(record.matchType, 'partial'); }
  const generic = catalog.searchPlan({ ...plan, goal: 'general', required: [] }, { limitCases: 670, limitTemplates: 27 });
  assert.equal(generic.totalCases, 670); assert.equal(generic.totalTemplates, 27);
});

test('explicit exclusions and negated query terms remove excluded content', () => {
  const direct = catalog.search('猫咪', { excludeTerms: ['恐怖'] });
  const prose = catalog.search('猫咪，不要恐怖');
  assert.deepEqual(direct.cases.map((c) => c.id), prose.cases.map((c) => c.id));
  for (const c of direct.cases) {
    const original = source.find((s) => s.slug === c.id);
    assert.doesNotMatch([original.title, original.titleEn, original.summary, original.summaryEn, original.promptFull].join('\n'), /恐怖|horror/i);
  }
  const all = catalog.search('猫咪', { limitCases: 670 });
  assert.equal(all.totalCases, all.cases.length);
  assert.equal(catalog.search('猫咪', { limitCases: 0 }).cases.length, 0);
});

test('detail and cards cannot mutate the catalog source or later queries', () => {
  const id = source.find((c) => c.models.length)?.slug;
  const detail = catalog.get('case', id);
  const original = clone(detail);
  detail.models.push('invented model');
  detail.prompt = 'invented prompt';
  assert.deepEqual(catalog.get('case', id), original);
  const template = catalog.get('template', 'pet-animal');
  template.guidance.push('invented');
  assert.ok(!catalog.get('template', 'pet-animal').guidance.includes('invented'));
  assert.equal(catalog.dataVersion, loadCatalog(root).dataVersion);
});

test('Agent evidence is bounded, local, searchable and does not trust input card content', () => {
  const results = catalog.search('时间冻结倒放', { limitCases: 30, limitTemplates: 27 });
  const records = catalog.evidence(results, 6000);
  assert.ok(records.some((r) => r.kind === 'case'));
  assert.ok(records.some((r) => r.kind === 'template'));
  assert.ok(JSON.stringify(records).length <= 6000);
  for (const record of records) {
    assert.ok(catalog.get(record.kind, record.id));
    assert.ok(!('mediaUrl' in record));
    assert.ok(!('apiKey' in record));
    if (record.kind === 'case') {
      const original = source.find((c) => c.slug === record.id);
      assert.ok([original.promptFull, original.summary, original.title, original.titleEn, original.summaryEn].some((text) => text?.includes(record.excerpt)) || record.excerpt.includes(original.promptFull));
    }
  }
  results.cases[0].title = 'malicious invented title';
  assert.ok(!JSON.stringify(catalog.evidence(results)).includes('malicious invented'));
  assert.deepEqual(catalog.evidence(results, 2), []);
  assert.deepEqual(catalog.evidence({ cases: [{ id: 'invented' }] }), []);
});

function clone(value) { return structuredClone(value); }

const sportsPlan = { summary: '运动饮料广告', goal: 'product_ad', primaryKeywords: [{ concept: 'beverage.sports_drink', terms: ['运动饮料', 'sports drink'], role: 'primary_product' }], relatedKeywords: [{ concept: 'beverage', terms: ['饮料', 'beverage'], scope: 'related_product' }], required: ['运动饮料产品', '广告用途'], optionalKeywords: [], excludeKeywords: [], allowTechniqueOnly: false, question: null };

test('Agent plan uses compound concepts and separates products from background or techniques', () => {
  const result = catalog.searchPlan(sportsPlan, { limitCases: 670, limitTemplates: 27 });
  assert.ok(result.cases.some(c => c.id === 'mountain-dew-spark-b16d4e23caef'));
  assert.ok(result.cases.some(c => c.id === 'ugc-80d503f66caa'));
  for (const c of result.cases) { assert.equal(c.relevanceTier, 'related_product'); assert.equal(c.matchType, 'partial'); assert.ok(c.gap); }
  for (const id of ['seedance-2-5-f3651857750b', 'johnagi168-seedance-ai-556a7495c74b', '90-vhs-vlog-ae90c46cb606']) assert.ok(!result.cases.some(c => c.id === id));
  assert.ok(result.templates.some(t => t.id === 'product-commercial-shotlist'));
  assert.ok(!result.templates.some(t => t.id === 'sports-extreme-motion'));
  const atomicOnly = catalog.searchPlan({ ...sportsPlan, relatedKeywords: [] }, { limitCases: 670 });
  assert.equal(atomicOnly.cases.length, 0, 'no known exact sports-drink products; sports cannot leak in through a split phrase');
  const equivalent = catalog.searchPlan({ ...sportsPlan, primaryKeywords: [{ ...sportsPlan.primaryKeywords[0], terms: ['运动饮料', 'sports drink', '运动饮料'] }], relatedKeywords: [{ ...sportsPlan.relatedKeywords[0], terms: ['饮料', 'beverage', '饮料'] }] }, { limitCases: 670 });
  assert.deepEqual(equivalent.cases.map(c => c.id), result.cases.map(c => c.id), 'duplicate aliases do not multiply a concept score');
});

test('explicit cycling and technique scope preserve footage discovery', () => {
  const rider = 'seedance-2-5-f3651857750b';
  const result = catalog.searchPlan({ ...sportsPlan, goal: 'documentary', primaryKeywords: [{ concept: 'cycling', terms: ['骑行', 'cycling'], role: 'activity' }], relatedKeywords: [], required: ['骑行纪录片'] }, { limitCases: 670 });
  const card = result.cases.find(c => c.id === rider);
  assert.ok(card); assert.equal(card.relevanceTier, 'topic'); assert.equal(card.matchType, 'full');
  const expanded = catalog.searchPlan({ ...sportsPlan, allowTechniqueOnly: true }, { limitCases: 670, limitTemplates: 27 });
  const technique = expanded.cases.find(c => c.id === rider);
  assert.ok(technique); assert.equal(technique.relevanceTier, 'technique'); assert.equal(technique.matchType, 'partial');
  assert.ok(technique.gap.includes('产品'));
});

test('unknown generic topics stay discoverable without claiming confirmed full matches', () => {
  for (const [concept, terms] of [['cat', ['猫咪', 'cat']], ['horror', ['恐怖', 'horror']]]) {
    const result = catalog.searchPlan({ ...sportsPlan, goal: 'general', primaryKeywords: [{ concept, terms, role: 'primary' }], relatedKeywords: [], required: [terms[0]] }, { limitCases: 670 });
    assert.ok(result.cases.length);
    assert.ok(result.cases.every(c => ['topic', 'uncertain'].includes(c.relevanceTier)));
    assert.ok(result.cases.filter(c => c.relevanceTier === 'uncertain').every(c => c.matchType === 'partial'));
  }
  const empty = catalog.searchPlan({ ...sportsPlan, goal: 'general', primaryKeywords: [{ concept: 'unknown', terms: ['zzqvxyunlikelynoun'], role: 'primary' }], relatedKeywords: [], required: [] });
  assert.equal(empty.totalCases, 0); assert.equal(empty.totalTemplates, 0);
});

test('plan exclusions distinguish an explicitly absent subject from a present one in the actual source', () => {
  const id = 'sci-fi-mystery-message-from-2100';
  const plan = { ...sportsPlan, goal: 'general', primaryKeywords: [{ concept: 'unknown', terms: ['futuristic city'], role: 'scene' }], relatedKeywords: [], required: [] };
  const prompt = catalog.get('case', id).prompt;
  assert.ok(prompt.includes('No cars.'));
  assert.ok(prompt.includes('flying vehicles'));
  const absent = catalog.searchPlan({ ...plan, excludeKeywords: [{ concept: 'unknown', terms: ['car', 'cars'] }] }, { limitCases: 670 });
  assert.ok(absent.cases.some(item => item.id === id), 'Explicit absence of cars must not remove this city reference');
  const present = catalog.searchPlan({ ...plan, excludeKeywords: [{ concept: 'vehicle', terms: ['vehicles'] }] }, { limitCases: 670 });
  assert.ok(!present.cases.some(item => item.id === id), 'A positive flying-vehicle mention still satisfies the exclusion');
});

test('semantic evidence budgets favor case subjects and retain trusted tier despite card mutations', () => {
  const result = catalog.searchPlan(sportsPlan, { limitCases: 40, limitTemplates: 27 });
  result.cases[0].title = 'malicious invented title'; result.cases[0].relevanceTier = 'topic'; result.cases[0].gap = '';
  const records = catalog.evidence(result, 18000);
  assert.ok(records.filter(r => r.kind === 'case').length >= 5);
  assert.ok(records.filter(r => r.kind === 'template').length >= 2);
  assert.ok(JSON.stringify(records).length <= 18000);
  assert.doesNotMatch(JSON.stringify(records), /malicious invented title/);
  for (const record of records.filter(r => r.kind === 'case')) {
    assert.equal(record.relevanceTier, 'related_product'); assert.equal(record.matchType, 'partial');
    assert.ok(record.evidenceQuotes.some(e => e.role === 'primary_product'));
    assert.ok(record.evidenceQuotes.some(e => e.axis === 'contentType'));
    for (const quote of record.evidenceQuotes) assert.ok([source.find(c => c.slug === record.id).title, source.find(c => c.slug === record.id).summary, source.find(c => c.slug === record.id).promptFull].some(text => text?.includes(quote.quote)));
  }
  assert.deepEqual(catalog.evidence(result, 2), []);
});
