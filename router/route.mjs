// Offline routing: explicit facts, profile constraints, bounded content evidence.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadIndex, loadAdapter, buildIdf, buildTermTable, countHits, resolveData } from "./lib/scoring.mjs";
const FACETS = JSON.parse(readFileSync(resolveData("facet-profile.json"), "utf8"));
const SUBJECTS = ["person", "animal", "vehicle", "product", "place", "abstract"];
const BOOLS = ["hasDialogue", "hasReference", "hasMusicSync", "textOnScreen"];
const ENUMS = { styleMode: ["live", "animated"], shotPlan: ["single", "multi"] };
const NEG = /不(?:要|用|需要|提供|说)?|无|没有|没带|禁止|无需|\bno\b|\bnot\b|\bwithout\b|\bdon't\b|\bdo not\b/i;
const CORRECTION = /改成|改为|还是用|更正|\binstead\b|\bactually\b/i;
const PATTERNS = {
  hasDialogue: /台词|对白|对话|口播|开口|说话|人声|旁白|念白|\b(?:says|said|dialogue|speech|speaks|talking|voice[\s-]?over)\b/gi,
  hasReference: /参考图|这张图|附图|首帧图|尾帧图|图生视频|上传.{0,4}图|\breference images?\b|\bimage[\s-]to[\s-]video\b|\bfirst frame\b|\blast frame\b|\bfrom (?:this|the) image\b/gi,
  hasMusicSync: /卡点|卡着|节拍|副歌|翻跳|\bMV\b|\bbeat[\s-]?sync\b|\bsync(?:ed)? to (?:the )?music\b|\bdownbeat\b|背景音乐|配乐|音乐|\bBGM\b|\bmusic\b/gi,
  textOnScreen: /字幕|画面.{0,4}文字|上屏文字|标题|标语|\blogo\b|花字|\btext on screen\b|\bcaptions?\b|\btypography\b|\btitle card\b/gi,
};
const STYLE_SHOT = {
  styleMode: [
    ["animated", /动画|卡通|动漫|三维|3D|皮克斯|定格|黏土|赛璐珞|吉卜力|番剧|\banime\b|\banimat(?:ed|ion)\b|\bcartoon\b|\bstop[\s-]?motion\b|\bpixar\b/i],
    ["live", /实拍|真人|写实|手机|手持|家庭录像|纪录片|伪记录|素人|第一视角|\bvlog\b|\bugc\b|\brealistic\b|\blive[\s-]?action\b|\bfootage\b|\bhandheld\b|\bhome[\s-]?video\b/i],
  ],
  shotPlan: [
    ["single", /一镜到底|单镜头|无剪辑|长镜头|不切镜|一镜|\bone[\s-]?take\b|\bsingle[\s-]?(?:take|shot)\b|\bcontinuous[\s-]?(?:take|shot)\b|\bno cuts\b/i],
    ["multi", /分镜|多镜头|镜头切换|切到|九宫格|故事板|镜头\s?\d|第[一二三四五六七八九十]个镜头|[一二三四五六七八九十\d]+\s*个镜头|\bshot\s?\d|\bstoryboard\b|\bshot list\b|\btimeline\b|\bscene\s?\d|\bmulti[\s-]?shot\b/i],
  ],
};
const SUBJECT_RX = [
  ["animal", /猫|狗|宠物|动物|狐狸|鸟|熊猫|幼龙|\b(?:kitten|puppy|cat|dog|fox|animal|bird|dragon)s?\b/i],
  ["vehicle", /汽车|跑车|摩托|赛车|卡车|载具|自行车|滑板|\b(?:car|motorcycle|truck|vehicle|bike|bicycle)s?\b/i],
  ["product", /产品|商品|护肤|精华|耳机|香水|饮料|包装|咖啡|食物|美食|做菜|瓶|\b(?:product|bottle|packaging|skincare|headphone|perfume|drink|food|cooking|recipe)s?\b/i],
  ["place", /城市|街道|首尔|东京|山|海|沙滩|森林|咖啡馆|厨房|教室|屋顶|旅|\b(?:city|street|seoul|tokyo|mountain|beach|forest|cafe|kitchen)s?\b/i],
  ["person", /女孩|男孩|少女|女人|男人|女生|男生|老人|奶奶|孩子|人|舞者|厨师|程序员|\b(?:woman|women|man|men|girl|boy|person|dancer|chef|people|human|her|his)s?\b/i],
  ["abstract", /抽象|概念|\babstract\b|\bconcept\b/i],
];

export function extractFacets(input = "") {
  if (typeof input !== "string") throw new TypeError("text 必须是字符串");
  const f = { durationSec: null, styleMode: null, shotPlan: null, hasDialogue: null, hasReference: null, hasMusicSync: null, textOnScreen: null, subjects: [], diagnostics: [], conflicts: [] };
  // ponytail: bounded clause rules; structured facts override ambiguous prose.
  const clauses = input.split(/[，,。.!?！？;；\n]|但(?:是)?|不过|\bbut\b|\bhowever\b/i).filter(Boolean);
  const record = (field, matches) => {
    const values = [...new Set(matches.map(m => m.value))];
    f[field] = values.length === 1 ? values[0] : null;
    if (values.length > 1) f.conflicts.push(field);
    f.diagnostics.push(...matches.map(m => ({ field, source: "text", ...m })));
  };
  for (const [field, re] of Object.entries(PATTERNS)) {
    let matches = [];
    for (const clause of clauses) {
      let end = 0;
      for (const m of clause.matchAll(re)) {
        // Examine the current clause prefix so coordinated negation crosses feature names.
        const prefix = clause.slice(0, m.index);
        const local = clause.slice(end, m.index);
        const negative = NEG.test(local) || (/^\s*(?:和|与|及|或|and|or|、)\s*$/i.test(local) && NEG.test(prefix));
        end = m.index + m[0].length;
        if (field === "hasMusicSync" && /^(?:背景音乐|配乐|音乐|BGM|music)$/i.test(m[0]) && !negative) continue;
        if (CORRECTION.test(local)) matches = [];
        matches.push({ value: !negative, matched: (local + m[0]).trim() });
      }
    }
    if (field === "hasDialogue" && /静音|配乐为主|\bsilent\b/i.test(input)) matches.push({ value: false, matched: input.match(/静音|配乐为主|\bsilent\b/i)[0] });
    record(field, matches);
  }
  for (const [field, entries] of Object.entries(STYLE_SHOT)) {
    let matches = [];
    for (const clause of clauses) {
      if (CORRECTION.test(clause)) matches = [];
      for (const [value, re] of entries) {
        const m = re.exec(clause);
        if (m && (!NEG.test(clause.slice(0, m.index)) || /^(?:无剪辑|不切镜|no cuts)$/i.test(m[0]))) matches.push({ value, matched: m[0] });
      }
    }
    record(field, matches);
  }
  const durationRe = /(\d+(?:\.\d+)?)\s*[- ]?\s*(分钟|秒钟|秒|\bseconds?\b|\bsecs?\b|\bs\b|\bminutes?\b|\bmins?\b)/gi;
  const total = input.match(/(?:总时长|总长|全片|总计|\btotal(?: duration| length)?\b)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*[- ]?\s*(分钟|秒|\bseconds?\b|\bs\b|\bminutes?\b)/i);
  const durations = [...input.matchAll(durationRe)];
  const timedShots = /\d{1,2}:\d{2}|\d+\s*[-–]\s*\d+\s*(?:s|秒)|\bshot\s*\d\s*[:：]|镜头\s*\d\s*[:：]/i.test(input);
  const duration = total || (!timedShots && durations.length === 1 ? durations[0] : null);
  if (duration) {
    f.durationSec = Number(duration[1]) * (/分钟|minute|min/i.test(duration[2]) ? 60 : 1);
    if (f.durationSec <= 0) f.durationSec = null;
    f.diagnostics.push({ field: "durationSec", source: "text", matched: duration[0], value: f.durationSec });
  }
  for (const [subject, re] of SUBJECT_RX) if (re.test(input)) f.subjects.push(subject);
  return f;
}

export function normalizeRequest(input, opts = {}) {
  if (typeof input !== "string") throw new TypeError("text 必须是字符串");
  const allowed = ["model", "top", "strictness", "facets", "referencePurpose", "index", "profiles", "singleGeneration", "allowEditing"];
  for (const key of Object.keys(opts)) if (!allowed.includes(key)) throw new Error(`未知参数 ${key}`);
  const { top = 5, strictness = "strict", referencePurpose = null } = opts;
  if (opts.model !== undefined && opts.model !== null && (typeof opts.model !== "string" || !opts.model.trim())) throw new Error("model 必须是非空模型名或 null");
  if (!Number.isInteger(top) || top <= 0) throw new Error("top 必须是正整数");
  if (!["strict", "lenient"].includes(strictness)) throw new Error("strictness 仅支持 strict / lenient");
  if (referencePurpose !== null && !["identity", "product", "first_frame", "storyboard"].includes(referencePurpose)) throw new Error("referencePurpose 非法");
  for (const key of ["singleGeneration", "allowEditing"]) if (opts[key] !== undefined && typeof opts[key] !== "boolean") throw new Error(`${key} 必须是布尔值`);
  if (opts.facets !== undefined && (!opts.facets || typeof opts.facets !== "object" || Array.isArray(opts.facets))) throw new Error("facets 必须是对象");
  const facets = extractFacets(input);
  for (const [key, value] of Object.entries(opts.facets || {})) {
    if (!["durationSec", "subjects", ...BOOLS, ...Object.keys(ENUMS)].includes(key)) throw new Error(`未知 facet ${key}`);
    if (key === "durationSec" && value !== null && (typeof value !== "number" || !Number.isFinite(value) || value <= 0)) throw new Error("durationSec 必须是正有限数或 null");
    if (BOOLS.includes(key) && value !== null && typeof value !== "boolean") throw new Error(`${key} 必须是 true / false / null`);
    if (ENUMS[key] && value !== null && !ENUMS[key].includes(value)) throw new Error(`${key} 非法`);
    if (key === "subjects" && (!Array.isArray(value) || value.some(s => !SUBJECTS.includes(s)))) throw new Error("subjects 必须是主体枚举数组");
    facets[key] = Array.isArray(value) ? [...new Set(value)] : value;
    facets.conflicts = facets.conflicts.filter(k => k !== key);
    facets.diagnostics.push({ field: key, source: "structured", value: facets[key] });
  }
  return { ...opts, text: input, top, strictness, referencePurpose, facets };
}

const PROFILE_FIELDS = ["styleMode", "shotPlan", "subjects", "dialogue", "noDialogue", "needsReference", "musicSync", "minDuration", "textOnScreen"];
const FIELD = { dialogue: "hasDialogue", noDialogue: "hasDialogue", needsReference: "hasReference", musicSync: "hasMusicSync", minDuration: "durationSec" };
const POINTS = { styleMode: 5, shotPlan: 5, subjects: 2, dialogue: 5, noDialogue: 3, needsReference: 6, musicSync: 8, minDuration: 2, textOnScreen: 3 };
const neutral = (k, v) => v === undefined || v === null || (["styleMode", "shotPlan"].includes(k) && v === "either") || (k === "subjects" && v.includes("any")) || (["dialogue", "noDialogue", "needsReference", "musicSync"].includes(k) && v === false);

export function validateProfiles(profiles, ids) {
  const ps = profiles.templates || profiles;
  const missing = [...ids].filter(id => !ps[id]), stale = Object.keys(ps).filter(id => !ids.includes(id));
  if (missing.length || stale.length) throw new Error(`facet-profile 模板 ID 集不一致；缺失：${missing.join(", ")}；陈旧：${stale.join(", ")}`);
  for (const [id, p] of Object.entries(ps)) {
    if (!["live", "animated", "either"].includes(p.styleMode) || !["single", "multi", "either"].includes(p.shotPlan)) throw new Error(`${id} 风格/镜头枚举非法`);
    if (!Array.isArray(p.subjects) || !p.subjects.length || p.subjects.some(s => ![...SUBJECTS, "any"].includes(s)) || (p.subjects.includes("any") && p.subjects.length !== 1)) throw new Error(`${id}.subjects 非法`);
    if (p.dialogue && p.noDialogue) throw new Error(`${id} 对白画像矛盾`);
    if (p.minDuration !== undefined && (typeof p.minDuration !== "number" || !Number.isFinite(p.minDuration) || p.minDuration <= 0)) throw new Error(`${id}.minDuration 非法`);
    for (const k of ["dialogue", "noDialogue", "needsReference", "musicSync", "textOnScreen"]) if (p[k] !== undefined && typeof p[k] !== "boolean") throw new Error(`${id}.${k} 非法`);
    if (!Array.isArray(p.hard) || !Array.isArray(p.soft)) throw new Error(`${id} 缺 hard/soft`);
    const classified = [...p.hard, ...p.soft];
    if (new Set(classified).size !== classified.length || classified.some(k => !PROFILE_FIELDS.includes(k) || neutral(k, p[k]))) throw new Error(`${id} 重复/未知/中性字段分类`);
    for (const k of PROFILE_FIELDS) if (!neutral(k, p[k]) && !classified.includes(k)) throw new Error(`${id}.${k} 未分类`);
  }
  return ps;
}

export function rankTemplates({ text = "", facets, index, profiles = FACETS, adapter = null, strictness = "strict", referencePurpose = null, singleGeneration = false, allowEditing = true }) {
  const ps = profiles.templates || profiles, idf = buildIdf(Object.values(index.templates));
  const scored = Object.values(index.templates).map(tp => {
    const p = ps[tp.id];
    if (!p) throw new Error(`facet-profile 缺模板 ${tp.id}`);
    const blocked = [], pendingRequirements = [], softMismatches = [], alignments = [], hardChecks = [], degraded = [];
    for (const field of [...p.hard, ...p.soft]) {
      const key = FIELD[field] || field, actual = facets[key];
      const unknown = actual === null || actual === undefined || (Array.isArray(actual) && !actual.length);
      const expected = field === "noDialogue" ? false : p[field];
      const matches = !unknown && (field === "subjects" ? actual.some(s => expected.includes(s)) : field === "minDuration" ? actual >= expected : actual === expected);
      const check = { facet: key, profileField: field, expected, actual, result: unknown ? "unknown" : matches ? "satisfied" : "conflict", why: `${field}：模板 ${JSON.stringify(expected)}，输入 ${JSON.stringify(actual)}` };
      if (p.hard.includes(field)) hardChecks.push(check);
      if (unknown) { if (p.hard.includes(field)) pendingRequirements.push(check); }
      else if (matches) alignments.push({ facet: key, points: POINTS[field] });
      else (p.hard.includes(field) ? blocked : softMismatches).push(check);
    }
    if (tp.id === "storyboard-grid-to-video" && referencePurpose && referencePurpose !== "storyboard") blocked.push({ facet: "referencePurpose", why: "身份、产品或首帧图不能当作分镜格图" });
    if (referencePurpose && referencePurpose !== "storyboard" && tp.id === "character-reference-lock") alignments.push({ facet: "referencePurpose", points: 3 });
    const gates = new Set(tp.gates || []);
    if (facets.hasReference === true) gates.add("refImage");
    if (adapter) {
      for (const capability of gates) {
        const v = adapter.capabilities?.[capability];
        if (v === true) continue;
        const item = { capability, kind: v === false ? "unsupported" : "unverified", why: `${adapter.model} 的 ${capability} ${v === false ? "不支持" : "尚未核实"}` };
        if (v === false || strictness === "strict") blocked.push(item);
        else { pendingRequirements.push(item); degraded.push(item); }
      }
      for (const capability of tp.softGates || []) {
        if (gates.has(capability) || adapter.capabilities?.[capability] === true) continue;
        const rule = adapter.degradations?.find(d => d.capability === capability);
        const item = { capability, kind: adapter.capabilities?.[capability] === false ? "unsupported" : "unverified", why: `${adapter.model} 的 ${capability} ${adapter.capabilities?.[capability] === false ? "不支持" : "尚未核实"}`, ...(rule ? { action: rule.action, blocks: rule.blocks, notice: rule.notice } : {}) };
        if (rule && allowEditing) degraded.push(item); else pendingRequirements.push(item);
      }
      if (adapter.limits?.maxDuration && facets.durationSec > adapter.limits.maxDuration) {
        const item = { capability: "duration", kind: "segmentation", segments: Math.ceil(facets.durationSec / adapter.limits.maxDuration), maxSegmentSec: adapter.limits.maxDuration, why: `总时长 ${facets.durationSec}s 超过单次 ${adapter.limits.maxDuration}s，需确认结构允许分段剪辑` };
        if (facets.shotPlan === "single" || singleGeneration || !allowEditing) blocked.push(item);
        else { degraded.push(item); pendingRequirements.push(item); }
      }
      const allowedDurations = facets.hasReference === true && adapter.limits?.referenceDuration ? [adapter.limits.referenceDuration] : adapter.limits?.durations;
      if (allowedDurations?.length && facets.durationSec && facets.durationSec <= adapter.limits.maxDuration && !allowedDurations.includes(facets.durationSec)) {
        const item = { capability: "duration", kind: "trim", generateSec: allowedDurations.find(n => n >= facets.durationSec), trimToSec: facets.durationSec, why: `该入口时长档位为 ${allowedDurations.join("/")}s，目标 ${facets.durationSec}s 需生成后裁剪并确认允许后期` };
        if (!allowEditing || !item.generateSec) blocked.push(item); else { degraded.push(item); pendingRequirements.push(item); }
      }
    }
    const hits = countHits(text, text.toLowerCase(), buildTermTable(tp, idf));
    const contentScore = Math.min(2, hits.reduce((n, h) => n + h.weight, 0) / 10), facetScore = alignments.reduce((n, a) => n + a.points, 0);
    return { id: tp.id, category: tp.category, title: tp.title, useWhen: tp.useWhen, score: facetScore + contentScore - softMismatches.length * 0.5, facetScore, contentScore, positiveEvidence: facetScore > 0 || contentScore > 0, aligned: alignments.map(a => a.facet), hardChecks, blocked, pendingRequirements, softMismatches, degraded, stacks: tp.stacks || [], corpusCount: tp.corpusCount, matched: hits.slice(0, 5).map(h => h.term) };
  });
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return { scored, eligible: scored.filter(s => !s.blocked.length) };
}

function openQuestions(request, ranked, index, profiles, adapter) {
  const ids = new Set(ranked.eligible.map(t => t.id));
  if (!ids.size) return [];
  const subset = { ...index, templates: Object.fromEntries(Object.entries(index.templates).filter(([id]) => ids.has(id))) };
  const ps = profiles.templates || profiles;
  const durations = [...new Set([5, 15, ...ranked.eligible.flatMap(t => ps[t.id].minDuration ? [ps[t.id].minDuration - 1, ps[t.id].minDuration] : [])])].filter(n => n > 0);
  const options = { styleMode: ["live", "animated"], shotPlan: ["single", "multi"], subjects: SUBJECTS.map(s => [s]), hasReference: [true, false], hasDialogue: [true, false], hasMusicSync: [true, false], textOnScreen: [true, false], durationSec: durations };
  const qs = [];
  for (const [facet, values] of Object.entries(options)) {
    const actual = request.facets[facet];
    if (actual !== null && actual !== undefined && !(Array.isArray(actual) && !actual.length)) continue;
    const simulated = values.map(value => {
      const r = rankTemplates({ ...request, index: subset, profiles, adapter, facets: { ...request.facets, [facet]: value } });
      return { answer: value, kept: r.eligible.length, excluded: ids.size - r.eligible.length, signature: r.eligible.slice(0, request.top).map(t => t.id).join("|") };
    });
    if (new Set(simulated.map(s => s.signature)).size <= 1) continue;
    qs.push({ facet, question: FACETS.facets[facet]?.ask || `请确认 ${facet}`, impact: { total: ids.size, alternatives: simulated.map(({ signature, ...s }) => s) }, priority: Math.max(...simulated.map(s => s.excluded)) });
  }
  qs.sort((a, b) => b.priority - a.priority);
  return qs.slice(0, 3).map(({ priority, ...q }) => q);
}

export function route(input, opts = {}) {
  const request = normalizeRequest(input, opts), index = opts.index || loadIndex(), profiles = opts.profiles || FACETS;
  const adapter = loadAdapter(request.model, index), ranked = rankTemplates({ ...request, index, profiles, adapter });
  const questions = openQuestions(request, ranked, index, profiles, adapter), limit = Math.min(request.top, ranked.eligible.length);
  let end = limit;
  while (request.top === 5 && end < Math.min(8, ranked.eligible.length) && Math.abs(ranked.eligible[end].score - ranked.eligible[limit - 1].score) < 0.001) end++;
  const shortlist = ranked.eligible.slice(0, end);
  const tieOverflow = end < ranked.eligible.length && end > 0 && Math.abs(ranked.eligible[end].score - ranked.eligible[end - 1].score) < 0.001;
  const status = !ranked.eligible.length ? "no_match" : request.facets.conflicts.length || questions.length || !shortlist.some(t => t.positiveEvidence) || shortlist[0]?.pendingRequirements.length ? "needs_clarification" : "ready";
  return { input, facets: request.facets, referencePurpose: request.referencePurpose, model: adapter?.model || null, adapter: adapter ? { id: adapter.id, file: adapter.file, entry: adapter.entry, aliasNote: adapter.aliasNote || null } : null, status, shortlist, eligibleCount: ranked.eligible.length, shortlistCount: shortlist.length, tieOverflow, ambiguous: end > limit || tieOverflow, blockedExamples: ranked.scored.filter(s => s.blocked.length).slice(0, 8).map(s => ({ id: s.id, blocked: s.blocked.map(b => b.why), reasons: s.blocked })), questions, noMatch: status === "no_match", dataVersion: index.dataVersion || null };
}
export { loadIndex, FACETS };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), opts = {}, words = [];
    let requestFile = null, json = false;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--json") { json = true; continue; }
      if (["--request", "--model", "--top", "--strictness"].includes(arg)) {
        const value = args[++i];
        if (!value || value.startsWith("--")) throw new Error(`${arg} 缺少值`);
        if (arg === "--request") requestFile = value; else opts[arg.slice(2)] = arg === "--top" ? Number(value) : value;
      } else if (arg.startsWith("--")) throw new Error(`未知参数 ${arg}`); else words.push(arg);
    }
    let text = words.join(" "), request = {};
    if (requestFile) {
      if (words.length) throw new Error("--request 不能与文本参数混用");
      const raw = JSON.parse(readFileSync(requestFile, "utf8").replace(/^\uFEFF/, ""));
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("request 必须是对象");
      ({ text, ...request } = raw);
    }
    const r = route(text, { ...request, ...opts });
    if (json) console.log(JSON.stringify(r, null, 2));
    else {
      console.log(`状态: ${r.status}\n拍法: ${JSON.stringify(r.facets)}\n模型: ${r.model || "未指定"}\n兼容模板: ${r.eligibleCount} / 候选: ${r.shortlistCount}`);
      for (const c of r.shortlist) {
        console.log(`\n${c.score.toFixed(2)} ${c.id} 拍法+${c.facetScore} 内容+${c.contentScore.toFixed(2)} 案例${c.corpusCount}\n适用: ${c.useWhen?.zh || c.useWhen?.en || c.useWhen}`);
        for (const item of [...c.pendingRequirements, ...c.softMismatches, ...c.degraded]) console.log(`  ${item.why}`);
      }
      for (const q of r.questions) console.log(`\n需确认: ${q.question} ${JSON.stringify(q.impact)}`);
      for (const b of r.blockedExamples) console.log(`排除 ${b.id}: ${b.blocked.join("；")}`);
      if (r.facets.conflicts.length) console.log(`冲突需澄清: ${r.facets.conflicts.join(", ")}`);
    }
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
