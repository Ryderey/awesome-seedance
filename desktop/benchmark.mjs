import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadCatalog } from './catalog.mjs';

const root = process.argv[2] ? path.resolve(process.argv[2]) : fileURLToPath(new URL('../', import.meta.url));
const started = performance.now();
const catalog = loadCatalog(root);
const startupMs = performance.now() - started;
const queries = ['赛博朋克猫咪广告', '时间冻结倒放', 'cat commercial', '恐怖酒店', '汽车变形', 'dance music', '美食广告', '太空科幻', '猫咪，不要恐怖', 'zzqvxyunlikelynoun'];
for (const query of queries) catalog.search(query);
const timings = [];
for (let run = 0; run < 20; run++) for (const query of queries) timings.push(catalog.search(query, { limitCases: 670, limitTemplates: 27 }).elapsedMs);
timings.sort((a, b) => a - b);
const p95Ms = timings[Math.ceil(timings.length * 0.95) - 1];
const plans = [
  { goal: 'product_ad', primaryKeywords: [{ concept: 'beverage.sports_drink', terms: ['运动饮料', 'sports drink'], role: 'primary_product' }], relatedKeywords: [{ concept: 'beverage', terms: ['饮料', 'beverage'], scope: 'related_product' }] },
  { goal: 'documentary', primaryKeywords: [{ concept: 'cycling', terms: ['骑行', 'bicycle ride'], role: 'activity' }], relatedKeywords: [] },
  { goal: 'general', primaryKeywords: [{ concept: 'cat', terms: ['猫咪', 'cat'], role: 'primary' }], relatedKeywords: [] },
].map(plan => ({ ...plan, required: [], optionalKeywords: [], excludeKeywords: [], allowTechniqueOnly: false }));
const planTimings = [];
for (const plan of plans) catalog.searchPlan(plan);
for (let run = 0; run < 40; run++) for (const plan of plans) planTimings.push(catalog.searchPlan(plan, { limitCases: 40, limitTemplates: 27 }).elapsedMs);
planTimings.sort((a, b) => a - b);
const planP95Ms = planTimings[Math.ceil(planTimings.length * .95) - 1];
const report = { ...catalog.overview().stats, dataVersion: catalog.dataVersion, startupMs, samples: timings.length, medianMs: timings[Math.floor(timings.length / 2)], p95Ms, planRetrieval: { samples: planTimings.length, medianMs: planTimings[Math.floor(planTimings.length / 2)], p95Ms: planP95Ms }, targetMs: 200, passed: p95Ms <= 200 && planP95Ms <= 200 };
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
