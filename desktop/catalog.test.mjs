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
