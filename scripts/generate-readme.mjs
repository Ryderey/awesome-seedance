#!/usr/bin/env node
// README copy lives in scripts/readme/{en,zh,ja}.md. Counts and measurements come from local data.
// Also generates the case galleries, template documents, hero and statistics snapshot.
import { readFileSync, writeFileSync, readdirSync, unlinkSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { computeStats, partitionAllPrompts, renderGalleryParts, bucketLabel, galleryIndexFileName, readmeFileName, LANGS, SEEDANCE_BUCKETS, TOP_INLINE_COUNT } from "./lib/render.mjs";
import { buildStatsSnapshot, renderHeroSvg, renderGalleryIndex } from "./lib/sections.mjs";
import { loadLibrary, buildTemplateIndex } from "./lib/library.mjs";
import { TEMPLATE_DOC_LANGS, anchorOf, countSkills, orderedTemplates, renderTemplateDoc, renderTemplateIndex, templateDocLang, templatesHeading } from "./lib/templates.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const loadJson = rel => JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
const optionalJson = rel => {
  try { return loadJson(rel); }
  catch (err) { if (err.code === "ENOENT") return null; throw err; }
};
const casesData = loadJson("data/cases.json"), cases = casesData.cases || [];
const { library, taxonomy } = loadLibrary(ROOT);
const templateIndex = buildTemplateIndex(library.templates, taxonomy, cases);
const stats = computeStats(casesData), skillsData = optionalJson("data/skills.json");
const snapshot = buildStatsSnapshot(stats, library.templates, library.categories, optionalJson("data/site.json"), skillsData ? countSkills(skillsData) : null);
const routerStats = optionalJson("data/router-stats.json"), users = loadJson("eval/user-cases.json").rows;
const skipped = templateIndex.unassigned.filter(c => Object.hasOwn(taxonomy.assignments, c.slug) && taxonomy.assignments[c.slug] === null).length;
const percent = value => Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "—";
const decimal = value => Number.isFinite(value) ? value.toFixed(2) : "—";
const partition = partitionAllPrompts(cases, TOP_INLINE_COUNT);
const bucketCases = { "2.5": partition.v25, "2.0": partition.v20 };
const docsDir = path.join(ROOT, "docs");
mkdirSync(docsDir, { recursive: true });
const written = new Set(), anchors = {};
for (const lang of LANGS) {
  const templatesAnchor = anchorOf(templatesHeading(lang));
  anchors[lang] = templatesAnchor;
  const values = {
    templates_heading: templatesHeading(lang),
    templates: library.templates.length,
    cases: cases.length,
    filed: cases.length - templateIndex.unassigned.length,
    skipped,
    todo: templateIndex.unassigned.length - skipped,
    gallery: `./docs/${galleryIndexFileName(lang)}`,
    template_index: `./docs/templates/${templateDocLang(lang)}/README.md`,
    measured_at: routerStats?.measuredAt || "—",
    fixed_rows: routerStats?.report?.fixed?.rows ?? "—",
    fixed_top5: percent(routerStats?.textRetention),
    current_rows: routerStats?.report?.current?.rows ?? "—",
    current_top5: percent(routerStats?.report?.current?.retentionMacro),
    user_rows: users.length,
    sufficient_rows: users.filter(r => r.sufficient).length,
    user_top5: percent(routerStats?.userRetention),
    avg_candidates: decimal(routerStats?.avgCandidates),
    avg_eligible: decimal(routerStats?.avgEligible),
    asked_rate: percent(routerStats?.report?.fixed?.askedRate),
    after_count: routerStats?.report?.users?.afterCount ?? "—",
  };
  const source = readFileSync(path.join(ROOT, "scripts/readme", `${lang}.md`), "utf8");
  const markdown = source.replace(/\{\{([a-z_0-9]+)\}\}/g, (_, key) => {
    if (!Object.hasOwn(values, key)) throw new Error(`Unknown README placeholder: ${key}`);
    return String(values[key]);
  });
  writeFileSync(path.join(ROOT, readmeFileName(lang)), markdown, "utf8");
  console.log(`${readmeFileName(lang)}: ${Buffer.byteLength(markdown, "utf8")} bytes`);

  const parts = {}, promptLinks = new Map();
  for (const bucket of SEEDANCE_BUCKETS) {
    parts[bucket] = bucketCases[bucket].length ? renderGalleryParts(bucketCases[bucket], lang, { bucket }) : [];
    for (const part of parts[bucket]) {
      writeFileSync(path.join(docsDir, part.fileName), part.markdown, "utf8");
      written.add(part.fileName);
      for (const entry of part.entries) promptLinks.set(entry.slug, `./docs/${part.fileName}#${entry.anchor}`);
    }
    console.log(`${lang} gallery ${bucketLabel(bucket, lang)}: ${bucketCases[bucket].length} cases across ${parts[bucket].length} part(s)`);
  }
  const indexName = galleryIndexFileName(lang);
  writeFileSync(path.join(docsDir, indexName), renderGalleryIndex({ parts, bucketCases, cases, promptLinks, templatesAnchor, templateIndexHref: `./templates/${templateDocLang(lang)}/README.md` }, lang), "utf8");
  written.add(indexName);
}
for (const file of readdirSync(docsDir)) {
  if (/^gallery.*\.md$/.test(file) && !written.has(file)) unlinkSync(path.join(docsDir, file));
}
const ordered = orderedTemplates(library);
for (const lang of TEMPLATE_DOC_LANGS) {
  const dir = path.join(docsDir, "templates", lang);
  mkdirSync(dir, { recursive: true });
  const readmeAnchor = anchors[lang], writtenDocs = new Set(["README.md"]);
  writeFileSync(path.join(dir, "README.md"), renderTemplateIndex(library, lang, templateIndex, readmeAnchor), "utf8");
  ordered.forEach((tp, i) => {
    writeFileSync(path.join(dir, `${tp.id}.md`), renderTemplateDoc(tp, lang, { cases: templateIndex.byTemplate.get(tp.id) || [], prev: ordered[i - 1] || null, next: ordered[i + 1] || null, readmeAnchor }), "utf8");
    writtenDocs.add(`${tp.id}.md`);
  });
  for (const file of readdirSync(dir)) if (file.endsWith(".md") && !writtenDocs.has(file)) unlinkSync(path.join(dir, file));
}
writeFileSync(path.join(ROOT, "data/stats.json"), JSON.stringify(snapshot, null, 2) + "\n", "utf8");
mkdirSync(path.join(ROOT, "assets"), { recursive: true });
writeFileSync(path.join(ROOT, "assets/hero.svg"), renderHeroSvg(snapshot) + "\n", "utf8");
console.log(`Templates: ${ordered.length}; ${cases.length - templateIndex.unassigned.length} cases filed, ${skipped} deliberately skipped, ${templateIndex.unassigned.length - skipped} to file`);
