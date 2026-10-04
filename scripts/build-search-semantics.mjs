import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLibrary } from './lib/library.mjs';
import { SEMANTIC_SCHEMA_VERSION, SEMANTIC_ANNOTATION_VERSION, SEMANTIC_VOCABULARY, unknownSemantic, validateSemanticEntry } from '../desktop/search-semantics.mjs';

function draft(kind, id, raw) {
  const entry = unknownSemantic(kind, id, raw, 'valid');
  delete entry.versionState;
  const title = kind === 'case' ? raw.title || raw.titleEn || '' : raw.title?.zh || raw.title?.en || '';
  const field = kind === 'case' ? raw.title ? 'title' : 'titleEn' : raw.title?.zh ? 'title.zh' : 'title.en';
  const add = (axis, concept, role) => entry.evidence.push({ axis, concept, ...(role ? { role } : {}), field, quote: title.slice(0, 400) });
  // Explicit title facts are draft hints. They are never promoted to reviewed by rules.
  if (/vlog|日记|家庭录像/i.test(title)) entry.contentType = 'vlog';
  else if (/纪录片|documentary/i.test(title)) entry.contentType = 'documentary';
  else if (/广告|commercial/i.test(title) && !/广告质感|广告风格/i.test(title)) entry.contentType = 'product_ad';
  if (entry.contentType !== 'unknown') add('contentType', entry.contentType);
  for (const v of SEMANTIC_VOCABULARY) {
    const match = v.terms.some((term) => {
      const lower = title.toLowerCase(), word = term.toLowerCase(), offset = lower.indexOf(word);
      return offset >= 0 && (!/^[a-z ]+$/i.test(word) || (!/[a-z]/i.test(lower[offset - 1] ?? '') && !/[a-z]/i.test(lower[offset + word.length] ?? '')));
    });
    if (!match) continue;
    if (v.dimension === 'activity') { entry.activities.push(v.id); add('activities', v.id); }
    if (v.dimension === 'capability') { entry.capabilities.push(v.id); add('capabilities', v.id); }
    if (v.dimension === 'subject' || (v.dimension === 'product' && entry.contentType === 'product_ad')) {
      const role = v.dimension === 'product' ? 'primary_product' : 'primary';
      entry.subjects.push({ concept: v.id, role }); add('subjects', v.id, role);
    }
  }
  if (entry.evidence.length) entry.reviewStatus = 'draft';
  return entry;
}

export function buildSemanticIndex({ library, cases }, overrides = {}, previous = {}) {
  const index = { schemaVersion: SEMANTIC_SCHEMA_VERSION, annotationVersion: SEMANTIC_ANNOTATION_VERSION, annotationPolicy: 'Source-reviewed overrides only support strict topic matches; automatic title extraction remains draft; missing evidence remains unknown.', templates: {}, cases: {} };
  const stats = { reused: 0, generated: 0, reviewed: 0, draft: 0, unknown: 0, staleOverrides: [], invalidOverrides: [], removed: 0 };
  for (const [kind, records, bucket] of [['template', library.templates, 'templates'], ['case', cases, 'cases']]) {
    const currentIds = new Set(records.map((raw) => kind === 'case' ? raw.slug : raw.id));
    stats.removed += Object.keys(previous[bucket] ?? {}).filter((id) => !currentIds.has(id)).length;
    for (const raw of [...records].sort((a, b) => (a.slug ?? a.id).localeCompare(b.slug ?? b.id))) {
      const id = kind === 'case' ? raw.slug : raw.id;
      const override = overrides[bucket]?.[id];
      const errors = override ? validateSemanticEntry(override, kind, id, raw) : [];
      let entry;
      if (override && !errors.length && overrides.schemaVersion === SEMANTIC_SCHEMA_VERSION && overrides.annotationVersion === SEMANTIC_ANNOTATION_VERSION) {
        entry = structuredClone(override);
      } else {
        if (override) (errors.includes('sourceHash') ? stats.staleOverrides : stats.invalidOverrides).push(`${kind}:${id}`);
        const prior = previous[bucket]?.[id];
        // Removing an override also removes its confirmed facts; never retain an old reviewed projection.
        if (prior && prior.reviewStatus !== 'reviewed' && !validateSemanticEntry(prior, kind, id, raw).length && previous.schemaVersion === SEMANTIC_SCHEMA_VERSION && previous.annotationVersion === SEMANTIC_ANNOTATION_VERSION) { entry = structuredClone(prior); stats.reused++; }
        else { entry = draft(kind, id, raw); stats.generated++; }
      }
      delete entry.versionState;
      index[bucket][id] = entry;
      stats[entry.reviewStatus]++;
    }
  }
  return { index, stats };
}

export function buildSearchSemantics(root, { check = false } = {}) {
  const file = path.join(root, 'data/search-semantics.json');
  const read = (name) => existsSync(path.join(root, 'data', name)) ? JSON.parse(readFileSync(path.join(root, 'data', name), 'utf8')) : {};
  const { library } = loadLibrary(root);
  const cases = read('cases.json').cases;
  const result = buildSemanticIndex({ library, cases }, read('search-semantic-overrides.json'), read('search-semantics.json'));
  const text = `${JSON.stringify(result.index, null, 2)}\n`;
  if (check) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== text) throw new Error('Semantic index is out of date. Run node scripts/build-search-semantics.mjs.');
  } else writeFileSync(file, text, 'utf8');
  return result.stats;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(buildSearchSemantics(path.resolve(fileURLToPath(new URL('..', import.meta.url))), { check: process.argv.includes('--check') }), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
