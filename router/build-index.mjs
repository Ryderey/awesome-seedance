#!/usr/bin/env node
// 生成 data/routing-index.json：25 个模板的路由元数据。
// 只读上游 data/，不修改任何上游文件；本产物可随语料增长重跑。
// Run: node router/build-index.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadLibrary, buildTemplateIndex } from "../scripts/lib/library.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));

const EXPECTED_TEMPLATES = 25;
const EXPECTED_CATEGORIES = 6;
const FORBIDDEN_ADAPTER_KEYS = ["example", "examples", "prompt", "prompts", "style", "styles", "keywords"];
const CAP_DOMAIN = [true, false, null];

const errors = [];
const warns = [];
const fail = (msg) => errors.push(msg);

// ---------- 载入 ----------
const capMap = readJson("router/capability-map.json");
const lexiconPath = "router/signals.lexicon.json";
if (!existsSync(path.join(ROOT, lexiconPath))) {
  console.error("FAIL: 缺 router/signals.lexicon.json，请先跑 node router/build-lexicon.mjs");
  process.exit(1);
}
const lexicon = readJson(lexiconPath).templates;
const { library, taxonomy } = loadLibrary(ROOT);
const { cases } = readJson("data/cases.json");
const casesBySlug = new Map(cases.map((c) => [c.slug, c]));
const { byTemplate } = buildTemplateIndex(library.templates, taxonomy, cases);

const tagClass = new Map(Object.entries(capMap.tags).map(([t, v]) => [t, v.class]));
const tagCap = new Map(Object.entries(capMap.tags).map(([t, v]) => [t, v.capability || v.syntax || null]));
const declaredCaps = new Set(capMap.capabilityKeys);

const adapters = readdirSync(path.join(ROOT, "adapters"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({ file: `adapters/${f}`, ...readJson(`adapters/${f}`) }));

// ---------- 校验 A：上游结构漂移 ----------
if (library.templates.length !== EXPECTED_TEMPLATES) {
  fail(`模板数 ${library.templates.length} != ${EXPECTED_TEMPLATES}，上游 data/ 结构可能已变`);
}
if (library.categories.length !== EXPECTED_CATEGORIES) {
  fail(`分类数 ${library.categories.length} != ${EXPECTED_CATEGORIES}，上游 data/ 结构可能已变`);
}

// ---------- 校验 B：每个 tag 都必须已登记 ----------
for (const tp of library.templates) {
  for (const tag of tp.tags || []) {
    if (!tagClass.has(tag)) fail(`模板 "${tp.id}" 的 tag "${tag}" 未在 capability-map.json 登记（会静默丢失路由信号）`);
  }
}

// ---------- 校验 C：适配器边界 ----------
for (const ad of adapters) {
  const leaked = FORBIDDEN_ADAPTER_KEYS.filter((k) => k in ad);
  if (leaked.length) fail(`${ad.file} 含禁止字段 ${leaked.join("/")}：适配器只声明能力，不放范例与风格`);
  for (const [k, v] of Object.entries(ad.capabilities || {})) {
    if (!CAP_DOMAIN.includes(v)) fail(`${ad.file}.capabilities.${k} = ${JSON.stringify(v)}，只允许 true/false/null`);
    if (!declaredCaps.has(k)) fail(`${ad.file}.capabilities.${k} 不在 capability-map.json 的 capabilityKeys 里`);
    if (typeof v === "boolean" && !(ad.verifiedFrom || []).length) {
      fail(`${ad.file}.capabilities.${k} 已填 ${v} 但 verifiedFrom 为空：无来源不许断言能力`);
    }
  }
  const unverified = Object.entries(ad.capabilities || {}).filter(([, v]) => v === null).map(([k]) => k);
  if (unverified.length) warns.push(`${ad.file} 有 ${unverified.length} 个能力位未核对：${unverified.join(", ")}`);
}

// ---------- 组装 ----------
const foundationIds = new Set(library.categories.filter((c) => c.id === "foundation").flatMap((c) => library.templates.filter((t) => t.category === c.id).map((t) => t.id)));

// 门禁要能从模板正文找到依据。上游 tag 里存在偶然标注——例如 travel-city-walk 被打了
// lip-sync，但它是旅行蒙太奇，正文通篇没有口型要求；照 tag 直接判硬门禁会错误屏蔽整个模板。
// 规则：tag 声明为 gate，但模板正文找不到该能力的文字依据时，降为 soft 并记录降级原因。
const CAP_EVIDENCE = {
  lipSync: /口型|唇|lip[\s-]?sync/i,
  audioDriven: /音轨|音频|audio/i,
  refImage: /参考图|图像参考|图片参考|reference image|首帧/i,
  refVideo: /参考视频|视频参考|reference video/i,
  typography: /文字|字幕|排版|typograph|text on screen/i,
  physicsCoherence: /物理|重力|接触|momentum|physics/i,
};

function evidenceText(tp) {
  const copy = { ...tp };
  delete copy.tags; // 被检验的就是 tags 自己，不能当证据
  return JSON.stringify(copy);
}

// 时长阈值只从 useWhen 里明确写了数字的模板抽取，抽不到就留 null，不猜。
const DUR_RE = /(?:超过|长于|不少于|至少)\s*(\d+)\s*秒|longer than about\s*(\d+)\s*seconds?|at least\s*(\d+)\s*seconds?/i;

const index = {
  $comment: "生成物，勿手改。重跑 node router/build-index.mjs。此文件把 data/ 的模板转成路由可用的元数据：gates 是硬门禁（模型不具备则换模板），softGates 可降级但必须告知，dialect 走适配器 syntax，signals 参与打分。",
  generatedFrom: ["data/style-library.json", "data/templates-local.json", "data/case-taxonomy.json", "data/cases.json", "router/capability-map.json", "router/signals.lexicon.json"],
  classes: capMap.classes,
  capabilityKeys: capMap.capabilityKeys,
  adapters: adapters.map((a) => ({ model: a.model, file: a.file, unverifiedCapabilities: Object.entries(a.capabilities || {}).filter(([, v]) => v === null).map(([k]) => k) })),
  categories: library.categories.map((c) => ({ id: c.id, title: c.title, description: c.description })),
  templates: {},
};

for (const tp of library.templates) {
  const tags = tp.tags || [];
  const text = evidenceText(tp);
  const downgraded = [];
  const gateSet = new Set();
  const softSet = new Set();

  for (const t of tags.filter((x) => tagClass.get(x) === "gate")) {
    const cap = tagCap.get(t);
    if (!cap) continue;
    const re = CAP_EVIDENCE[cap];
    if (re && !re.test(text)) downgraded.push({ capability: cap, fromTag: t, because: `tag "${t}" 标为硬门禁，但模板正文无该能力的文字依据` });
    else gateSet.add(cap);
  }
  for (const d of downgraded) softSet.add(d.capability);
  for (const t of tags.filter((x) => tagClass.get(x) === "soft")) {
    const cap = tagCap.get(t);
    if (cap && !gateSet.has(cap)) softSet.add(cap); // 同一能力既是 gate 又是 soft 时，gate 优先
  }
  const gates = [...gateSet];
  const softGates = [...softSet].filter((c) => !gateSet.has(c));
  const dialect = [...new Set(tags.filter((t) => tagClass.get(t) === "dialect").map((t) => tagCap.get(t)))].filter(Boolean);

  const stacks = [...new Set(
    tags
      .filter((t) => t === "timeline" || t === "character-consistency" || t === "reference-lock")
      .map((t) => (t === "timeline" ? "timeline-shot-script" : "character-reference-lock"))
  )].filter((id) => id !== tp.id && foundationIds.has(id));

  const dur = [tp.useWhen?.zh, tp.useWhen?.en].map((s) => (s || "").match(DUR_RE)).find(Boolean);
  const hardLimits = { minDuration: dur ? Number(dur[1] || dur[2] || dur[3]) : null, needsVertical: null };

  // 不消费 exampleCaseUrls（上游会编造 goodcase.ai 链接），改用 slug 回查原帖。
  const examples = (byTemplate.get(tp.id) || []).slice(0, 4).map((c) => ({
    slug: c.slug,
    title: c.title,
    creator: c.creator,
    sourceUrl: c.sourceUrl,
    heat: c.heatScore,
    stability: c.stabilityScore,
  }));

  index.templates[tp.id] = {
    id: tp.id,
    category: tp.category,
    title: tp.title,
    description: tp.description,
    useWhen: tp.useWhen,
    tags,
    signals: lexicon[tp.id] || { en: [], zh: [] },
    gates,
    softGates,
    dialect,
    gateDowngraded: downgraded,
    hardLimits,
    stacks,
    corpusCount: (byTemplate.get(tp.id) || []).length,
    examples,
  };
}

// ---------- 校验 D：产物自洽 ----------
for (const tp of Object.values(index.templates)) {
  for (const g of [...tp.gates, ...tp.softGates]) {
    if (!declaredCaps.has(g)) fail(`模板 "${tp.id}" 的门禁 "${g}" 未在 capabilityKeys 声明`);
  }
  for (const s of tp.stacks) if (!index.templates[s]) fail(`模板 "${tp.id}" 的 stacks 指向不存在的 "${s}"`);
  for (const ex of tp.examples) {
    if (!ex.sourceUrl) fail(`模板 "${tp.id}" 的案例 "${ex.slug}" 没有 sourceUrl，无法溯源`);
    else if (/goodcase\.ai/i.test(ex.sourceUrl)) fail(`模板 "${tp.id}" 的案例 "${ex.slug}" sourceUrl 仍指向 goodcase.ai，中间层未剥离`);
  }
  if (!tp.signals.zh.length && !tp.signals.en.length) fail(`模板 "${tp.id}" 无任何触发词，永远路由不到`);
  const overlap = tp.gates.filter((g) => tp.softGates.includes(g));
  if (overlap.length) fail(`模板 "${tp.id}" 的能力 ${overlap.join("/")} 同时是硬门禁和可降级项，判定矛盾`);
}

// ---------- 落盘 ----------
if (errors.length) {
  console.error(`FAIL: ${errors.length} 项校验未通过`);
  for (const e of errors) console.error("  ✗ " + e);
  process.exit(1);
}

writeFileSync(path.join(ROOT, "data/routing-index.json"), JSON.stringify(index, null, 2) + "\n", "utf8");

const gateCount = Object.values(index.templates).filter((t) => t.gates.length).length;
const softCount = Object.values(index.templates).filter((t) => t.softGates.length).length;
console.log(`routing-index.json 已生成：${Object.keys(index.templates).length} 个模板 / ${index.categories.length} 个分类`);
console.log(`  有硬门禁 ${gateCount} 个，有可降级项 ${softCount} 个，适配器 ${adapters.length} 个`);
console.log(`  案例溯源全部指向原帖（0 条 goodcase.ai 链接）`);
const dg = Object.values(index.templates).flatMap((t) => t.gateDowngraded.map((d) => [t.id, d]));
if (dg.length) {
  console.log(`\n硬门禁因缺正文依据降为可降级 ${dg.length} 处：`);
  for (const [id, d] of dg) console.log(`  ~ ${id}：${d.capability} ← ${d.fromTag}`);
}
if (warns.length) {
  console.log(`\nWARN ${warns.length} 项（不阻断）：`);
  for (const w of warns) console.log("  ! " + w);
}
