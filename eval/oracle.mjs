// Synthetic profile injection measures scoring consistency, not a generalization ceiling.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FACETS, loadIndex, rankTemplates } from "../router/route.mjs";
export function oracleFacets(label) {
  const p = FACETS.templates[label];
  if (!p) throw new Error(`oracle 缺画像 ${label}`);
  return { durationSec: p.minDuration || null, styleMode: p.styleMode === "either" ? null : p.styleMode, shotPlan: p.shotPlan === "either" ? null : p.shotPlan, hasDialogue: p.dialogue ? true : p.noDialogue ? false : null, hasReference: p.needsReference ? true : null, hasMusicSync: p.musicSync ? true : null, textOnScreen: p.textOnScreen ?? null, subjects: p.subjects.includes("any") ? [] : p.subjects };
}
export function runOracle(rows, k = 5, { index = loadIndex(), ranker = rankTemplates } = {}) {
  const per = new Map(); let retained = 0;
  for (const row of rows) {
    const ids = ranker({ text: row.input, facets: oracleFacets(row.label), index }).eligible.slice(0, k).map(t => t.id);
    const hit = ids.includes(row.label); retained += Number(hit);
    const a = per.get(row.label) || [0, 0]; a[0] += Number(hit); a[1]++; per.set(row.label, a);
  }
  return { macro: per.size ? [...per.values()].reduce((n, [h, count]) => n + h / count, 0) / per.size : 0, micro: rows.length ? retained / rows.length : 0, per };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const r = runOracle(JSON.parse(readFileSync(path.join(root, "eval/baselines/golden-set-2026-10-03.json"))).rows);
  console.log(JSON.stringify({ macro: r.macro, micro: r.micro, per: Object.fromEntries(r.per) }, null, 2));
}
