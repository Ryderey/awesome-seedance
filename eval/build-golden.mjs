#!/usr/bin/env node
// 生成 eval/golden-set.json：路由准确率评测集（P1 才跑分，P0 只负责把它造出来）。
//
// 防泄漏设计：router 的触发词是从案例「标题」抽的（见 build-lexicon.mjs）。
// 若评测输入也用标题，等于拿训练特征当考题，准确率会虚高。
// 所以这里的输入用案例「摘要」（策展人写的描述文字），并把标题原文从输入里剔除。
//
// 抽样：每模板上限 12 条、不足全保留；超出时按热度排序后等距取样，
// 而不是只取头部——只取 top-heat 会让评测集全是爆款，掩盖长尾误判。
// Run: node eval/build-golden.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadLibrary, buildTemplateIndex } from "../scripts/lib/library.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CAP = 12;

const { cases } = JSON.parse(readFileSync(path.join(ROOT, "data/cases.json"), "utf8"));
const { library, taxonomy } = loadLibrary(ROOT);
const { byTemplate } = buildTemplateIndex(library.templates, taxonomy, cases);

function evenSpread(list, n) {
  if (list.length <= n) return list.slice();
  const out = [];
  for (let i = 0; i < n; i++) out.push(list[Math.round((i * (list.length - 1)) / (n - 1))]);
  return [...new Set(out)];
}

// 部分 summary 是发帖人的推广语而非画面描述（"Seedance 2.5 现已上线 @xxx，限时 5 折"），
// 这种句子不含任何可用于路由的内容信息，留着只会制造假失败。
const PROMO_RE = [
  /https?:\/\/\S+/gi,
  /@[\w]+/g,
  /\d+\s*%\s*off/gi,
  /now available[^\n]{0,60}/gi,
  /limited time[^\n]{0,40}/gi,
  /check (it )?out[^\n]{0,40}/gi,
  /I (just )?tested it (with|on)[^\n]{0,40}/gi,
  /created with [^.]{0,50} on /gi,
  /sign up|discount|giveaway|follow me|like and retweet/gi,
];
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu;

function clean(s) {
  let out = (s || "").replace(/\s+/g, " ").trim();
  for (const re of PROMO_RE) out = out.replace(re, " ");
  out = out.replace(EMOJI_RE, " ").replace(/\s{2,}/g, " ").trim();
  return out;
}

function toInput(c) {
  const raw = c.summary || c.summaryEn || "";
  const title = (c.title || "").trim();
  let body = clean(raw);
  // 标题常是摘要前缀，而标题正是 lexicon 的抽取源——留着就是拿训练特征考自己。
  if (title && body.startsWith(clean(title))) body = body.slice(clean(title).length).trim();
  return body.slice(0, 400);
}

const rows = [];
const dropped = [];
for (const tp of library.templates) {
  const list = byTemplate.get(tp.id) || [];
  const pool = list.map((c) => ({ case: c, input: toInput(c) }));
  const usable = pool.filter((p) => p.input.length >= 40);
  for (const p of evenSpread(usable, CAP)) {
    rows.push({
      input: p.input,
      label: tp.id,
      slug: p.case.slug,
      heat: p.case.heatScore ?? null,
      models: p.case.models || [],
      corpusCountForLabel: list.length,
    });
  }
  if (usable.length < pool.length) dropped.push({ label: tp.id, usable: usable.length, total: pool.length });
}

const perLabel = rows.reduce((a, r) => ((a[r.label] = (a[r.label] || 0) + 1), a), {});
const thin = Object.entries(perLabel).filter(([, n]) => n < 4);
if (thin.length) console.error(`FAIL: ${thin.length} 个模板可用考题少于 4 条，macro 平均会被带偏：${thin.map(([k, n]) => `${k}=${n}`).join(", ")}\n  这些模板的案例摘要多为推广语，清洗后信息量不足。需人工补写考题或放宽来源字段。`);
if (thin.length) process.exit(1);

writeFileSync(
  path.join(ROOT, "eval/golden-set.json"),
  JSON.stringify(
    {
      $comment: "生成物，勿手改。重跑 node eval/build-golden.mjs。input 取自案例摘要（非标题，避免与 signals.lexicon 的抽取源重叠造成评测泄漏），每模板上限 " + CAP + " 条，超出按热度等距取样。",
      metricSpec: {
        primary: "macro-average top-1 accuracy（先按标签算准确率再对 25 个标签取平均，避免 handheld-ugc-vlog 的 92 条压倒 timeline-shot-script 的 4 条）",
        secondary: "top-3 macro recall",
        diagnostic: "混淆矩阵，重点看 handheld-ugc-vlog 吸收了哪些标签",
        thresholds: { top1: 0.75, top3: 0.92 },
      },
      knownLimitation: "摘要仍是策展人书面语，与真实用户口语（『帮我写个猫戴帽子的视频』）有分布差异。P1 应补一份手写输入集做交叉验证。",
      generatedFrom: ["data/cases.json", "data/case-taxonomy.json"],
      total: rows.length,
      cleanedOut: dropped,
      perLabel,
      rows,
    },
    null,
    2
  ) + "\n",
  "utf8"
);

console.log(`golden-set.json 已生成：${rows.length} 条考题 / ${Object.keys(perLabel).length} 个标签`);
const lost = dropped.reduce((a, d) => a + (d.total - d.usable), 0);
if (lost) console.log(`  清洗掉 ${lost} 条推广语/无信息摘要：${dropped.map((d) => `${d.label} ${d.usable}/${d.total}`).join(", ")}`);
for (const [id, n] of Object.entries(perLabel).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(2)}  ${id}`);
}
console.log(`\n样例输入（${rows[0].label}）：\n  ${rows[0].input.slice(0, 200)}`);
