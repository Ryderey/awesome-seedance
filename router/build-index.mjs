#!/usr/bin/env node
// 生成 data/routing-index.json：27 个模板的路由元数据。
// 只读上游 data/，不修改任何上游文件；本产物可随语料增长重跑。
// Run: node router/build-index.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadLibrary, buildTemplateIndex } from "../scripts/lib/library.mjs";
import { fingerprint, templateHashes } from "./lib/build-data.mjs";
import { validateProfiles } from "./route.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));

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
for (const [tag, config] of Object.entries(capMap.tags)) {
  if (!Object.keys(capMap.classes).includes(config.class)) fail(`tag ${tag} 分类非法`);
  if (["gate", "soft"].includes(config.class) && !declaredCaps.has(config.capability)) fail(`tag ${tag} 能力未声明`);
}

const adapters = readdirSync(path.join(ROOT, "adapters"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({ file: `adapters/${f}`, ...readJson(`adapters/${f}`) }));

// Coverage and schema, rather than a frozen template count.
const ids = library.templates.map(t => t.id);
if (!ids.length || new Set(ids).size !== ids.length) fail("模板 ID 为空或重复");
for (const tp of library.templates) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(tp.id) || !tp.useWhen?.zh || !tp.useWhen?.en || !tp.structure?.zh?.length || !tp.structure?.en?.length || !Array.isArray(tp.tags)) fail(`模板 ${tp.id} schema 不完整`);
}
try { validateProfiles(readJson("router/facet-profile.json"), ids); } catch (err) { fail(err.message); }
if (Object.keys(lexicon).sort().join("|") !== ids.slice().sort().join("|")) fail("lexicon ID 集不一致");
const aliases = new Map();

// ---------- 校验 B：每个 tag 都必须已登记 ----------
for (const tp of library.templates) {
  for (const tag of tp.tags || []) {
    if (!tagClass.has(tag)) fail(`模板 "${tp.id}" 的 tag "${tag}" 未在 capability-map.json 登记（会静默丢失路由信号）`);
  }
}

// ---------- 校验 C：适配器边界 ----------
for (const ad of adapters) {
  if (!ad.id || !ad.entry) fail(`${ad.file} 缺模型版本标识或入口`);
  for (const rule of ad.degradations || []) if (!declaredCaps.has(rule.capability) || !rule.trigger || !Array.isArray(rule.blocks) || !rule.blocks.length || !rule.action || !rule.notice) fail(`${ad.file} 降级条目不完整`);
  for (const name of new Set([ad.model, ad.id, path.basename(ad.file, ".json"), ...(ad.aliases || [])].filter(Boolean).map(n => n.toLowerCase()))) {
    if (aliases.has(name)) fail(`适配器别名冲突 ${name}`); else aliases.set(name, ad.file);
  }
  const leaked = FORBIDDEN_ADAPTER_KEYS.filter((k) => k in ad);
  if (leaked.length) fail(`${ad.file} 含禁止字段 ${leaked.join("/")}：适配器只声明能力，不放范例与风格`);
  for (const [k, v] of Object.entries(ad.capabilities || {})) {
    if (!CAP_DOMAIN.includes(v)) fail(`${ad.file}.capabilities.${k} = ${JSON.stringify(v)}，只允许 true/false/null`);
    if (!declaredCaps.has(k)) fail(`${ad.file}.capabilities.${k} 不在 capability-map.json 的 capabilityKeys 里`);
    if (typeof v === "boolean" && !ad.verifications?.some(r => r.capability === k && r.value === v && r.sourceType === "official" && /^https:\/\//.test(r.url) && r.verifiedAt && r.scope)) fail(`${ad.file}.${k} 无逐能力官方依据`);
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
  schemaVersion: 1,
  dataVersion: fingerprint(ROOT),
  templateHashes: templateHashes(library),
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
    const required = capMap.tags[t].requiredByTemplates || [];
    if (!required.includes(tp.id) || (re && !re.test(text))) downgraded.push({ capability: cap, fromTag: t, because: `tag "${t}" 无该模板必须使用此能力的审阅依据` });
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
