import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLibrary } from '../scripts/lib/library.mjs';
import { buildSemanticIndex } from '../scripts/build-search-semantics.mjs';
import { validateSearchSemantics } from '../scripts/validate-search-semantics.mjs';
import { loadSearchSemantics, evaluateCandidate, semanticSourceHash, semanticField, validateSemanticEntry } from './search-semantics.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (name) => JSON.parse(readFileSync(path.join(root, name), 'utf8'));
const { library } = loadLibrary(root);
const cases = read('data/cases.json').cases;
const raw = new Map(cases.map((c) => [c.slug, c]));
const overrides = read('data/search-semantic-overrides.json');
const data = read('data/search-semantics.json');
const semantics = loadSearchSemantics(root, { library, cases });
const matrix = read('desktop/agent-evaluation-queries.json').queries;
const plan = matrix.find((row) => row.id === 'sports-drink-cn').plan;
const check = (searchPlan, id) => evaluateCandidate(searchPlan, semantics.get('case', id), raw.get(id), { kind: 'case' });
const rider = 'seedance-2-5-f3651857750b';
const gym = 'johnagi168-seedance-ai-556a7495c74b';
const vhs = '90-vhs-vlog-ae90c46cb606';
const drinks = matrix.find((row) => row.id === 'sports-drink-cn').expected.map((row) => row.id);

test('all current source IDs have validated entries, without turning drafts into confirmed facts', () => {
  assert.equal(semantics.entries.size, 697);
  assert.deepEqual(validateSearchSemantics(root), { reviewed: 57, draft: 165, unknown: 475, stale: 0, invalid: 0, missing: 0, templates: 27, cases: 670 });
  assert.equal(Object.keys(overrides.cases).length, 30);
  assert.equal(read('desktop/semantic-gold.json').reviews.length, 30);
  for (const entry of semantics.entries.values()) {
    const source = entry.kind === 'case' ? raw.get(entry.id) : library.templates.find((t) => t.id === entry.id);
    assert.deepEqual(validateSemanticEntry(entry, entry.kind, entry.id, source), []);
    for (const quote of entry.evidence) assert.ok(semanticField(source, quote.field).includes(quote.quote));
  }
});

test('frozen cycling/fitness failures cannot enter default sports-drink product recommendations', () => {
  for (const id of [rider, gym, vhs]) assert.equal(check(plan, id).eligible, false, id);
  assert.equal(semantics.get('case', rider).subjects.find((s) => s.concept === 'beverage').role, 'background');
  assert.equal(semantics.get('case', gym).contentType, 'vlog');
  assert.equal(semantics.get('case', vhs).contentType, 'vlog');
});

test('real drink ads remain useful related products, never fabricated sports-drink full matches', () => {
  for (const id of drinks) {
    const result = check(plan, id);
    assert.equal(result.eligible, true, id);
    assert.equal(result.relevanceTier, 'related_product', id);
    assert.equal(result.matchType, 'partial', id);
    assert.ok(result.gap);
  }
  assert.ok([...semantics.entries.values()].every((e) => e.productCategory !== 'beverage.sports_drink'));
});

test('background coffee and gym service ads are not beverage product ads', () => {
  const beveragePlan = matrix.find((q) => q.id === 'beverage-ad').plan;
  for (const id of ['avelyrahnai-seedance-ai-a392e2711b0d', 'lianaalane-seedance-ai-c2d4ba0c6fa2', 'seedance-create-a-realistic-10-second-vertical-beauty-product-video-showing-hands-openin-1b5f6c15e630']) assert.equal(check(beveragePlan, id).eligible, false, id);
});

test('extra unproven requirements cannot be upgraded to full by a correct product label', () => {
  const beveragePlan = matrix.find((q) => q.id === 'beverage-ad').plan;
  const exact = check(beveragePlan, drinks[0]);
  assert.equal(exact.matchType, 'full');
  const uncertain = check({ ...beveragePlan, required: ['无字幕无对白'] }, drinks[0]);
  assert.equal(uncertain.eligible, true);
  assert.equal(uncertain.matchType, 'partial');
  assert.match(uncertain.gap, /必要条件/);
});

test('negated quotes and substrings inside a different word do not prove additional requirements', () => {
  const fitnessPlan = { goal: 'vlog', primaryKeywords: [{ concept: 'fitness', terms: ['健身'], role: 'activity' }], required: [], relatedKeywords: [], optionalKeywords: [], excludeKeywords: [] };
  assert.equal(check(fitnessPlan, vhs).matchType, 'full');
  assert.ok(semantics.get('case', vhs).evidence.some(e => e.quote.includes('不是广告，不是电影')));
  for (const requirement of ['电影', '广告']) assert.equal(check({ ...fitnessPlan, required: [requirement] }, vhs).matchType, 'partial');
  const cat = 'seedance-created-a-video-a-cinematic-cartoon-style-kitchen-story-featuring-a-curly-red-a64a9ed0a27d';
  const catPlan = { ...fitnessPlan, goal: 'story', primaryKeywords: [{ concept: 'cat', terms: ['猫咪'], role: 'primary' }], required: ['car'] };
  assert.equal(check(catPlan, cat).matchType, 'partial', 'cartoon does not prove a car requirement');
});

test('a broad product-ad query accepts confirmed products but not actor/background-only advertising', () => {
  const generic = matrix.find((q) => q.id === 'generic-product-ad').plan;
  for (const id of drinks) assert.equal(check(generic, id).relevanceTier, 'topic');
  assert.equal(check(generic, 'lianaalane-seedance-ai-c2d4ba0c6fa2').eligible, false);
});

test('unresolved subject broad references respect reviewed purpose and remain uncertain partial', () => {
  const broad = { goal: 'product_ad', primaryKeywords: [], relatedKeywords: [], required: ['广告用途'], optionalKeywords: [], excludeKeywords: [], broadReference: true, uncertainty: '尚未指定产品，仅供宽泛参考' };
  for (const id of drinks) {
    const result = check(broad, id);
    assert.equal(result.eligible, true, id); assert.equal(result.relevanceTier, 'uncertain'); assert.equal(result.matchType, 'partial');
  }
  for (const id of [rider, gym, vhs, 'lianaalane-seedance-ai-c2d4ba0c6fa2']) assert.equal(check(broad, id).eligible, false, id);
  const explicit = { ...matrix.find(q => q.id === 'beverage-ad').plan, broadReference: true, uncertainty: '缺用途细节' };
  assert.equal(check(explicit, rider).eligible, false);
  assert.equal(check(explicit, drinks[0]).matchType, 'partial');
  assert.equal(check({ ...explicit, excludeKeywords: [{ concept: 'beverage', terms: ['饮料'] }] }, drinks[0]).eligible, false);
  assert.equal(check({ ...broad, required: ['月球场景'] }, drinks[0]).eligible, false);
});

test('unconstrained broad references may use unknown records without inventing a subject or purpose', () => {
  const broad = { goal: 'general', primaryKeywords: [], relatedKeywords: [], required: [], optionalKeywords: [], excludeKeywords: [], broadReference: true, uncertainty: '尚未提供主体和用途' };
  assert.equal(check(broad, rider).eligible, true);
  const unknown = { ...semantics.get('case', rider), reviewStatus: 'unknown' };
  const result = evaluateCandidate(broad, unknown, raw.get(rider), { kind: 'case' });
  assert.equal(result.eligible, true); assert.equal(result.relevanceTier, 'uncertain'); assert.equal(result.matchType, 'partial');
  assert.equal(evaluateCandidate({ ...broad, goal: 'documentary' }, unknown, raw.get(rider), { kind: 'case' }).eligible, false);
  assert.equal(evaluateCandidate({ ...broad, primaryKeywords: [{ concept: 'beverage', terms: ['饮料'], role: 'primary_product' }] }, unknown, raw.get(rider), { kind: 'case' }).eligible, false);
});

test('explicit documentary/vlog/story product purposes never retrieve commercial product cases or templates', () => {
  for (const goal of ['documentary', 'vlog', 'story']) for (const role of ['primary_product', 'primary']) {
    const requested = { goal, primaryKeywords: [{ concept: 'beverage.sports_drink', terms: ['运动饮料'], role }], relatedKeywords: [], required: [], optionalKeywords: [], excludeKeywords: [], allowTechniqueOnly: false };
    // Controlled reviewed fixtures test the gate, not real-provider accuracy or
    // claims that this library contains an actual sports-drink documentary.
    const fixture = type => {
      const source = { slug: `fixture-${type}`, title: `运动饮料 ${type}`, summary: '主商品是运动饮料', promptFull: `Main product is a sports drink. Purpose: ${type}.` };
      const entry = { ...semantics.get('case', drinks[0]), id: source.slug, sourceHash: semanticSourceHash('case', source), subjects: [{ concept: 'beverage.sports_drink', role: 'primary_product' }], productCategory: 'beverage.sports_drink', contentType: type, evidence: [{ axis: 'subjects', concept: 'beverage.sports_drink', role: 'primary_product', field: 'promptFull', quote: 'Main product is a sports drink.' }, { axis: 'contentType', concept: type, field: 'promptFull', quote: `Purpose: ${type}.` }] };
      return { source, entry };
    };
    const ownPurpose = fixture(goal), advertising = fixture('product_ad');
    const positive = evaluateCandidate(requested, ownPurpose.entry, ownPurpose.source, { kind: 'case' });
    assert.equal(positive.eligible, true, `${goal}/${role}`); assert.equal(positive.relevanceTier, 'topic'); assert.equal(positive.matchType, 'full');
    assert.equal(evaluateCandidate(requested, advertising.entry, advertising.source, { kind: 'case' }).eligible, false, `${goal}/${role} cannot become an ad`);
    const template = library.templates.find(t => t.id === 'product-commercial-shotlist');
    assert.equal(evaluateCandidate(requested, semantics.get('template', template.id), template, { kind: 'template' }).eligible, false, `${goal}/${role} cannot use a commercial-only template`);
  }
});

test('explicit cycling remains a topic and optional technique scope does not broaden to arbitrary animation', () => {
  const cycling = matrix.find((q) => q.id === 'cycling-tracking').plan;
  assert.equal(check(cycling, rider).relevanceTier, 'topic');
  const expanded = matrix.find((q) => q.id === 'explicit-technique').plan;
  assert.equal(check(expanded, rider).relevanceTier, 'technique');
  assert.equal(check(expanded, rider).matchType, 'partial');
  assert.equal(check(expanded, 'seedance-created-a-video-in-soft-anime-style-of-a-fluffy-white-cat-with-big-sparkling-te-5d65967aaf57').eligible, false);
});

test('templates express reusable ability without inheriting every linked case product', () => {
  const template = (id) => evaluateCandidate(plan, semantics.get('template', id), library.templates.find((t) => t.id === id), { kind: 'template' });
  assert.equal(template('product-commercial-shotlist').eligible, true);
  assert.equal(template('product-commercial-shotlist').matchType, 'partial');
  assert.equal(template('ugc-creator-review').eligible, true);
  assert.equal(template('car-vehicle').eligible, false);
  assert.equal(template('sports-extreme').eligible, false);
  assert.equal(template('food-asmr').eligible, false);
});

test('a literal theme absent from the small vocabulary stays searchable without claiming confirmed full', () => {
  const unknown = { goal: 'reference', primaryKeywords: [{ concept: null, terms: ['对白'], role: 'primary' }], relatedKeywords: [], required: [], excludeKeywords: [] };
  const id = 'dialogue-performance-beats';
  const template = library.templates.find((entry) => entry.id === id);
  const candidate = evaluateCandidate(unknown, semantics.get('template', id), template, { kind: 'template' });
  assert.equal(candidate.eligible, true);
  assert.equal(candidate.relevanceTier, 'uncertain');
  assert.equal(candidate.matchType, 'partial');
  assert.equal(evaluateCandidate({ ...unknown, primaryKeywords: [{ concept: null, terms: ['qzjxunknown'], role: 'primary' }] }, semantics.get('template', id), template, { kind: 'template' }).eligible, false);
});

test('independently reviewed query matrix exercises source constraints and frozen negatives', () => {
  assert.ok(matrix.length >= 30);
  for (const q of matrix) {
    for (const expected of q.expected) {
      const actual = check(q.plan, expected.id);
      assert.equal(actual.eligible, true, `${q.id}/${expected.id}`);
      assert.equal(actual.relevanceTier, expected.tier, `${q.id}/${expected.id}`);
    }
    for (const id of q.forbidden) assert.equal(check(q.plan, id).eligible, false, `${q.id}/${id}`);
  }
});

test('incremental rebuild reuses unchanged drafts, regenerates changed/new sources, and removes deleted IDs', () => {
  const same = buildSemanticIndex({ library, cases }, overrides, data);
  assert.deepEqual(same.index, data);
  assert.equal(same.stats.reused, 640);
  const draftId = cases.find((c) => data.cases[c.slug].reviewStatus === 'draft').slug;
  const changed = cases.map((c) => c.slug === draftId ? { ...c, title: '全新未知主题 qzxj' } : c).filter((c) => c.slug !== rider);
  changed.push({ slug: 'new-unknown-case', title: 'qzxj', summary: 'qzxj', promptFull: 'qzxj', tags: [] });
  const result = buildSemanticIndex({ library, cases: changed }, overrides, data);
  assert.equal(result.stats.removed, 1);
  assert.equal(result.index.cases[rider], undefined);
  assert.equal(result.index.cases['new-unknown-case'].reviewStatus, 'unknown');
  assert.notEqual(result.index.cases[draftId].sourceHash, data.cases[draftId].sourceHash);
  assert.notEqual(result.index.cases[draftId].reviewStatus, 'reviewed');
});

test('removing a manual override removes its confirmed status instead of retaining the derived copy', () => {
  const next = structuredClone(overrides);
  delete next.cases[drinks[0]];
  const rebuilt = buildSemanticIndex({ library, cases }, next, data);
  assert.notEqual(rebuilt.index.cases[drinks[0]].reviewStatus, 'reviewed');
});

test('refresh revokes removed manual reviews before rebuilding the derived index', t => {
  const tmpBase = path.join(root, '.tmp'); mkdirSync(tmpBase, { recursive: true });
  const fixture = mkdtempSync(path.join(tmpBase, 'semantic-test-')); mkdirSync(path.join(fixture, 'data'));
  t.after(() => { assert.ok(path.resolve(fixture).startsWith(`${path.resolve(tmpBase)}${path.sep}`)); rmSync(fixture, { recursive: true, force: true }); });
  writeFileSync(path.join(fixture, 'data/search-semantics.json'), JSON.stringify(data));
  const next = structuredClone(overrides); delete next.cases[drinks[0]];
  writeFileSync(path.join(fixture, 'data/search-semantic-overrides.json'), JSON.stringify(next));
  const loaded = loadSearchSemantics(fixture, { library, cases });
  const item = loaded.get('case', drinks[0]);
  assert.equal(item.reviewStatus, 'unknown'); assert.equal(item.versionState, 'missing');
  assert.equal(evaluateCandidate(plan, item, raw.get(drinks[0]), { kind: 'case' }).eligible, false);
});

test('source fingerprints track semantic content while heat changes do not invalidate evidence', () => {
  const original = raw.get(rider);
  assert.equal(semanticSourceHash('case', original), semanticSourceHash('case', { ...original, heatScore: 999999, creator: 'changed creator' }));
  assert.notEqual(semanticSourceHash('case', original), semanticSourceHash('case', { ...original, promptFull: `${original.promptFull}\nChanged.` }));
  assert.notEqual(semanticSourceHash('case', original), semanticSourceHash('case', { ...original, tags: [...original.tags, 'new content tag'] }));
});

test('stale hashes, invalid quotes and missing items become unknown at load time, with no stale full matches', (t) => {
  const tmpBase = path.join(root, '.tmp'); mkdirSync(tmpBase, { recursive: true });
  const fixture = mkdtempSync(path.join(tmpBase, 'semantic-test-')); mkdirSync(path.join(fixture, 'data'));
  t.after(() => { assert.ok(path.resolve(fixture).startsWith(`${path.resolve(tmpBase)}${path.sep}`)); rmSync(fixture, { recursive: true, force: true }); });
  writeFileSync(path.join(fixture, 'data/search-semantics.json'), JSON.stringify(data));
  const changedOverrides = structuredClone(overrides);
  changedOverrides.cases[gym].evidence[0].quote = 'fabricated evidence';
  delete changedOverrides.cases[vhs];
  const changedData = structuredClone(data); delete changedData.cases[vhs];
  writeFileSync(path.join(fixture, 'data/search-semantics.json'), JSON.stringify(changedData));
  writeFileSync(path.join(fixture, 'data/search-semantic-overrides.json'), JSON.stringify(changedOverrides));
  const changedCases = cases.map((c) => c.slug === rider ? { ...c, summary: `${c.summary} Changed.` } : c);
  const loaded = loadSearchSemantics(fixture, { library, cases: changedCases });
  for (const [id, state] of [[rider, 'stale'], [gym, 'invalid'], [vhs, 'missing']]) {
    assert.equal(loaded.get('case', id).versionState, state);
    assert.equal(loaded.get('case', id).reviewStatus, 'unknown');
    assert.equal(evaluateCandidate(plan, loaded.get('case', id), { kind: 'case' }).eligible, false);
  }
  const record = loaded.get('case', drinks[0]); record.subjects.length = 0;
  assert.ok(loaded.get('case', drinks[0]).subjects.length > 0);
});

test('malformed manifests and wrong annotation versions cannot preserve confirmed status', (t) => {
  const tmpBase = path.join(root, '.tmp'); mkdirSync(tmpBase, { recursive: true });
  const fixture = mkdtempSync(path.join(tmpBase, 'semantic-test-')); mkdirSync(path.join(fixture, 'data'));
  t.after(() => { assert.ok(path.resolve(fixture).startsWith(`${path.resolve(tmpBase)}${path.sep}`)); rmSync(fixture, { recursive: true, force: true }); });
  const indexFile = path.join(fixture, 'data/search-semantics.json');
  const overridesFile = path.join(fixture, 'data/search-semantic-overrides.json');
  writeFileSync(indexFile, JSON.stringify(data));
  writeFileSync(overridesFile, '{bad JSON');
  assert.equal(loadSearchSemantics(fixture, { library, cases }).get('case', drinks[0]).versionState, 'invalid');
  const next = { ...overrides, annotationVersion: 999 };
  writeFileSync(overridesFile, JSON.stringify(next));
  assert.equal(loadSearchSemantics(fixture, { library, cases }).get('case', drinks[0]).reviewStatus, 'unknown');
  assert.equal(buildSemanticIndex({ library, cases }, next, data).index.cases[drinks[0]].reviewStatus, 'draft');
  writeFileSync(overridesFile, '{}'); writeFileSync(indexFile, 'null');
  assert.equal(loadSearchSemantics(fixture, { library, cases }).get('case', drinks[0]).versionState, 'invalid');
  const malformed = { ...overrides.cases[drinks[0]], subjects: [null], evidence: [null] };
  assert.ok(validateSemanticEntry(malformed, 'case', drinks[0], raw.get(drinks[0])).length);
});
