#!/usr/bin/env node
// 从已归类语料反推每个模板的中英触发词，而不是手写。
// 依据：data/case-taxonomy.json 把 448 条真实案例归到 25 个模板下，案例标题就是用户会说的话。
// 打分 = 模板内词频 × log(总案例数 / 含该词的案例数)，即 TF-IDF；再剔除跨模板过泛的词。
// Run: node router/build-lexicon.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadLibrary } from "../scripts/lib/library.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOP_N = 8;
const MAX_TEMPLATE_COVERAGE = 0.5; // 出现在超过一半模板里的词视为无区分度

const EN_STOP = new Set(
  "a an the and or of to in on for with from at by is are be as that this it its into using use used one two first then when while what how video clip shot scene style look prompt seedance ai vs but not no all any can will make made".split(" ")
);
const ZH_STOP = new Set(["的", "了", "和", "与", "在", "是", "一个", "一种", "这", "那", "把", "被", "用", "到", "中", "视频", "短片", "画面", "镜头", "风格", "提示词", "场景"]);
// 滑窗没有词边界概念，会切出"的机器/女孩的/冻结与倒"这类以虚词开头或结尾的碎片。
// 含这些字的候选一律剔除——它们要么不是词，要么匹配面过宽。
const ZH_EDGE = /[的了与是在和被把中过]/;

function enTerms(s) {
  return (s || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !EN_STOP.has(w));
}

// 中文按 2-4 字滑窗取候选，再靠区分度筛掉噪声——语料小，不值得引分词依赖。
function zhTerms(s) {
  const clean = (s || "").replace(/[^一-龥]/g, "");
  const out = [];
  for (const n of [2, 3, 4]) {
    for (let i = 0; i + n <= clean.length; i++) {
      const g = clean.slice(i, i + n);
      if (ZH_EDGE.test(g)) continue;
      if (!ZH_STOP.has(g)) out.push(g);
    }
  }
  return out;
}

function tally(map, terms) {
  for (const t of terms) map.set(t, (map.get(t) || 0) + 1);
}

const { cases } = JSON.parse(readFileSync(path.join(ROOT, "data/cases.json"), "utf8"));
const { library, taxonomy } = loadLibrary(ROOT);
const casesBySlug = new Map(cases.map((c) => [c.slug, c]));

// 全局文档频率：一个词出现在多少个模板下，用于筛掉泛词
const templatesPerTerm = new Map();
const perTemplate = new Map();

for (const tp of library.templates) {
  const slugs = Object.entries(taxonomy.assignments || {})
    .filter(([, id]) => id === tp.id)
    .map(([s]) => s)
    .filter((s) => casesBySlug.has(s));
  const docs = slugs.map((s) => casesBySlug.get(s));
  const tfEn = new Map();
  const tfZh = new Map();
  for (const c of docs) {
    tally(tfEn, enTerms(c.titleEn));
    tally(tfZh, zhTerms(c.title));
  }
  perTemplate.set(tp.id, { tfEn, tfZh, n: docs.length });
  const seen = new Set([...tfEn.keys(), ...tfZh.keys()]);
  for (const term of seen) templatesPerTerm.set(term, (templatesPerTerm.get(term) || 0) + 1);
}

function pick(tfMap, n, totalDocs) {
  if (!n) return [];
  // 先按门槛筛：词频 <2 是偶然，跨模板覆盖率过高的是泛词，两者都没有区分度。
  const cands = [...tfMap.entries()]
    .filter(([term, tf]) => tf >= 2 && (templatesPerTerm.get(term) || 0) / library.templates.length <= MAX_TEMPLATE_COVERAGE)
    .map(([term, tf]) => ({ term, tf, score: tf * Math.log(1 + totalDocs / tf) }))
    .sort((a, b) => b.score - a.score || b.term.length - a.term.length || a.term.localeCompare(b.term));
  // 滑窗会产生重叠子串（韩国/国女/女孩/韩国女孩）。判据：短词与包含它的某个长词词频完全相等，
  // 说明它从不独立出现、总是嵌在长词里，不携带额外信息 → 丢弃，把名额留给真正的区分词。
  const kept = [];
  for (const cand of cands) {
    const swallowed = cands.some((o) => o.tf === cand.tf && o.term.length > cand.term.length && o.term.includes(cand.term));
    if (swallowed) continue;
    if (kept.some((k) => k.term.includes(cand.term))) continue;
    kept.push(cand);
    if (kept.length === TOP_N) break;
  }
  return kept.map((x) => x.term);
}

const lexicon = {};
for (const tp of library.templates) {
  const { tfEn, tfZh, n } = perTemplate.get(tp.id);
  lexicon[tp.id] = { en: pick(tfEn, n, cases.length), zh: pick(tfZh, n, cases.length), corpusDocs: n };
}

// 语料薄的模板（如 character-reference-lock 只有 5 条案例）抽不出中文触发词，
// 中文输入就永远路由不到它。overrides 追加而不是替换，语料涨起来后重跑不会丢手工词。
const overridesPath = path.join(ROOT, "router/lexicon-overrides.json");
const overrides = existsSync(overridesPath) ? JSON.parse(readFileSync(overridesPath, "utf8")).templates || {} : {};
const knownIds = new Set(Object.keys(lexicon));
for (const id of Object.keys(overrides)) {
  if (!knownIds.has(id)) {
    console.error(`FAIL: lexicon-overrides.json 指向不存在的模板 "${id}"`);
    process.exit(1);
  }
}
for (const [id, extra] of Object.entries(overrides)) {
  const entry = lexicon[id];
  const added = (extra || []).filter((w) => !entry.zh.includes(w));
  entry.zh = [...entry.zh, ...added];
  entry.manualAdded = added.length;
}

const stillEmpty = Object.entries(lexicon).filter(([, v]) => v.en.length === 0 && v.zh.length === 0);
if (stillEmpty.length) {
  console.error(`FAIL: ${stillEmpty.length} 个模板既无抽取词也无手工词：${stillEmpty.map(([k]) => k).join(", ")}`);
  process.exit(1);
}
const zhEmpty = Object.entries(lexicon).filter(([, v]) => v.zh.length === 0);
if (zhEmpty.length) {
  console.error(`WARN: ${zhEmpty.length} 个模板中文触发词为空（中文输入路由不到）：${zhEmpty.map(([k]) => k).join(", ")}`);
}

writeFileSync(
  path.join(ROOT, "router/signals.lexicon.json"),
  JSON.stringify(
    {
      $comment: "生成物，勿手改。改 data/case-taxonomy.json 或上游案例后重跑 node router/build-lexicon.mjs。补词写 lexicon-overrides.json（追加，不替换）。en 来自案例 titleEn，zh 来自 title 的 2-4 字滑窗，按 TF-IDF 取每语言前 " + TOP_N + " 个，被更长高分词包含的重叠子串已剔除；跨模板覆盖率 >" + Math.round(MAX_TEMPLATE_COVERAGE * 100) + "% 的泛词已剔除。",
      generatedFrom: "data/case-taxonomy.json + data/cases.json + router/lexicon-overrides.json",
      templates: lexicon,
    },
    null,
    2
  ) + "\n",
  "utf8"
);

console.log(`signals.lexicon.json 已生成：${Object.keys(lexicon).length} 个模板`);
for (const [id, v] of Object.entries(lexicon)) {
  const m = v.manualAdded ? ` +${v.manualAdded}手工` : "";
  console.log(`  ${id.padEnd(32)} zh[${v.zh.length}${m}] ${v.zh.slice(0, 5).join("/")}   en[${v.en.length}] ${v.en.slice(0, 3).join("/")}`);
}
