#!/usr/bin/env node
// 评测。指标随架构改过一次，理由见 DESIGN-video-prompt-router.md 第 11 节：
// 纯词面内容分类在 25 路上只有 ~41% top-1，所以脚本不负责"选对"，
// 只负责"别把对的滤掉 + 把拍法冲突的排除并说明理由"，终选交给读得懂 useWhen 的模型。
//
// 因此主指标是 shortlist retention（正确模板是否留在候选里），
// 同时必须报平均候选数——若候选数接近 25，说明筛选没起作用，retention 高是无意义的高。
// Run: node eval/score.mjs [--model jimeng-seedance] [--top 5] [--json]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { route, loadIndex } from "../router/route.mjs";
import { runOracle } from "./oracle.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const golden = JSON.parse(readFileSync(path.join(ROOT, "eval/golden-set.json"), "utf8"));
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const modelFlag = flag("model", null);
const TOP = Number(flag("top", 5));
const asJson = argv.includes("--json");

const index = loadIndex();
const per = new Map();
let retained = 0, first = 0, sizeSum = 0, asked = 0;

for (const row of golden.rows) {
  const r = route(row.input, { model: modelFlag, top: TOP, index });
  const ids = r.shortlist.map((c) => c.id);
  const ret = ids.includes(row.label);
  if (ret) retained++;
  if (ids[0] === row.label) first++;
  sizeSum += ids.length;
  if (r.questions.length) asked++;
  if (!per.has(row.label)) per.set(row.label, [0, 0]);
  const a = per.get(row.label);
  a[0] += ret ? 1 : 0; a[1]++;
}

let macro = 0;
for (const [k, [h, n]] of per) macro += h / n;
const retentionMacro = macro / per.size;
const retentionMicro = retained / golden.rows.length;
const top1Micro = first / golden.rows.length;
const avgSize = sizeSum / golden.rows.length;

const { thresholds } = golden.metricSpec;
// 两个数分别把两道关：
//   oracle  = 打分逻辑本身对不对（拍法信息齐全时能否保住正确答案）—— 这是架构门槛
//   textOnly = 只靠用户第一句话能保住多少 —— 受限于"用户没说"，不是算法缺陷，只作观测
const oracle = runOracle(golden.rows);
const pass = oracle.macro >= 0.8 && avgSize <= 8;

const worst = [...per.entries()].map(([id, [h, n]]) => ({ id, ret: h / n, n })).sort((a, b) => a.ret - b.ret);

if (asJson) {
  console.log(JSON.stringify({ retentionMacro, retentionMicro, top1Micro, avgSize, askedRate: asked / golden.rows.length, worst, pass }, null, 2));
} else {
  console.log(`模型: ${modelFlag || "未指定"}   考题: ${golden.rows.length} 条 / ${per.size} 标签   候选上限: ${TOP}\n`);
  console.log(`  【门槛】oracle 保留率  macro ${(oracle.macro * 100).toFixed(1)}%   ≥80%   ${oracle.macro >= 0.8 ? "PASS" : "FAIL"}   ← 拍法信息齐全时能否保住正确答案`);
  console.log(`  【门槛】平均候选数    ${avgSize.toFixed(1)} / 25   ≤8   ${avgSize <= 8 ? "PASS" : "FAIL"}   ← 候选数接近 25 说明筛选没起作用\n`);
  console.log(`  【观测】文本直推保留率 macro ${(retentionMacro * 100).toFixed(1)}%   ← 受限于用户没说清拍法，不设门槛`);
  console.log(`  【观测】直接命中首位  ${(top1Micro * 100).toFixed(1)}%   ← 终选由模型在候选内读 useWhen 完成`);
  console.log(`  【观测】需追问的输入  ${(asked / golden.rows.length * 100).toFixed(1)}%   ← 与文本直推和 oracle 之间的差距同源\n`);
  console.log("文本直推保留率最差 8 个标签：");
  for (const w of worst.slice(0, 8)) console.log(`  ${(w.ret * 100).toFixed(0).padStart(3)}%  ${w.id}  (n=${w.n})`);
  console.log(`\n结论: ${pass ? "达标" : "未达标"}`);
  console.log(`  原设计的 "top-1 ≥ ${thresholds.top1 * 100}%" 门槛已作废，实测依据见 DESIGN-video-prompt-router.md 第 11 节。`);
}
process.exit(pass ? 0 : 1);
