// 上界实验：把"神谕 facet"（直接取自正确模板自己的拍法画像）喂给打分逻辑，
// 看正确模板能否进前五。能进 → 架构成立，缺的只是用户没说；进不了 → 打分本身有问题。
// 常驻回归测试：facet-profile.json 改坏时这个数字会掉。
// Run: node eval/oracle.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACETS } from '../router/route.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function oracleFacets(label) {
  const p = FACETS.templates[label];
  return {
    durationSec: p.minDuration || null,
    styleMode: p.styleMode === "either" ? null : p.styleMode,
    shotPlan: p.shotPlan === "either" ? null : p.shotPlan,
    hasDialogue: p.dialogue ? true : p.noDialogue ? false : null,
    hasReference: p.needsReference ? true : null,
    hasMusicSync: p.musicSync ? true : null,
    subjects: p.subjects.includes("any") ? [] : p.subjects,
  };
}

function scoreWith(of, templates) {
  return Object.entries(templates).map(([id, p]) => {
    let blocked = 0;
    if (of.styleMode && p.styleMode !== "either" && p.styleMode !== of.styleMode) blocked++;
    if (of.shotPlan && p.shotPlan !== "either" && p.shotPlan !== of.shotPlan) blocked++;
    if (of.subjects.length && !p.subjects.includes("any") && !of.subjects.some((s) => p.subjects.includes(s))) blocked++;
    if (of.hasDialogue === false && p.dialogue) blocked++;
    if (of.hasDialogue === true && p.noDialogue) blocked++;
    if (of.hasReference === null && p.needsReference) blocked++;
    let sc = 0;
    if (of.styleMode && p.styleMode === of.styleMode) sc += 5;
    if (of.shotPlan && p.shotPlan === of.shotPlan) sc += 5;
    if (of.subjects.length && !p.subjects.includes("any") && of.subjects.some((s) => p.subjects.includes(s))) sc += 6;
    if (of.hasDialogue === true && p.dialogue) sc += 5;
    if (of.hasReference === true && p.needsReference) sc += 6;
    if (of.hasMusicSync === true && p.musicSync) sc += 8;
    return { id, blocked, sc: blocked ? sc - 100 : sc };
  });
}

export function runOracle(rows, k = 5) {
  const per = new Map();
  let retained = 0;
  for (const row of rows) {
    const want = row.label;
    const usable = scoreWith(oracleFacets(want), FACETS.templates)
      .filter((r) => !r.blocked && r.sc > 0)
      .sort((a, b) => b.sc - a.sc);
    const rank = usable.findIndex((r) => r.id === want) + 1;
    const hit = rank > 0 && rank <= k;
    retained += hit ? 1 : 0;
    if (!per.has(want)) per.set(want, [0, 0]);
    const a = per.get(want);
    a[0] += hit ? 1 : 0;
    a[1]++;
  }
  let m = 0;
  for (const [, [h, n]] of per) m += h / n;
  return { macro: m / per.size, micro: retained / rows.length, per };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const golden = JSON.parse(readFileSync(path.join(ROOT, 'eval/golden-set.json'), 'utf8'));
  const r = runOracle(golden.rows);
  console.log('=== 神谕 facet（假设用户如实回答了拍法问题）');
  console.log(`  top-5 保留率  macro ${(r.macro * 100).toFixed(1)}%   micro ${(r.micro * 100).toFixed(1)}%`);
  console.log('  这是当前 facet-profile 下的架构上界。达不到 100% 是因为部分模板在拍法维度上本就同构');
  console.log('  （如 combat-choreography 与 sports-extreme），那部分交给模型读 useWhen 终选。');
  const worst = [...r.per.entries()].map(([id, [h, n]]) => ({ id, ret: h / n, n })).sort((a, b) => a.ret - b.ret).slice(0, 6);
  console.log('\n  上界里最弱的标签：');
  for (const w of worst) console.log(`    ${(w.ret * 100).toFixed(0).padStart(3)}%  ${w.id} (n=${w.n})`);
}
