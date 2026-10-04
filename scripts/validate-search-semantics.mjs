import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLibrary } from './lib/library.mjs';
import { loadSearchSemantics, validateSemanticEntry } from '../desktop/search-semantics.mjs';
import { buildSearchSemantics } from './build-search-semantics.mjs';

export function validateSearchSemantics(root) {
  buildSearchSemantics(root, { check: true });
  const { library } = loadLibrary(root);
  const cases = JSON.parse(readFileSync(path.join(root, 'data/cases.json'), 'utf8')).cases;
  const index = JSON.parse(readFileSync(path.join(root, 'data/search-semantics.json'), 'utf8'));
  for (const [kind, records, bucket] of [['case', cases, 'cases'], ['template', library.templates, 'templates']]) {
    const ids = new Set(records.map((r) => r.slug ?? r.id));
    if (Object.keys(index[bucket]).length !== ids.size || Object.keys(index[bucket]).some((id) => !ids.has(id))) throw new Error(`${bucket}: incomplete/stale ID coverage`);
    for (const raw of records) {
      const id = raw.slug ?? raw.id;
      const errors = validateSemanticEntry(index[bucket][id], kind, id, raw);
      if (errors.length) throw new Error(`${kind}:${id}: ${errors.join(', ')}`);
    }
  }
  const { stats } = loadSearchSemantics(root, { library, cases });
  if (stats.stale || stats.invalid || stats.missing) throw new Error('Semantic overrides contain stale or invalid entries; review the affected records.');
  return stats;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(validateSearchSemantics(path.resolve(fileURLToPath(new URL('..', import.meta.url)))), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
