// 确定性路由器。
//
// 为什么不靠内容词分类：实测两种纯词面方法（关键词匹配 / TF-IDF 余弦）在 25 路模板上都卡在
// macro top-1 ≈ 41%，退到 6 路分类也只有 52%。原因是模板的区分轴是"拍法"（时长/镜数/是否对白/
// 是否风格化/有无参考图），而用户输入描述的是"内容主体"——两者不同轴。
// foundation 类只有 33% 准确率就是证据：用不用时间轴分镜，和拍什么无关。
//
// 所以这里的分工是：
//   1. 抽取拍法意图（facet）—— 确定性正则，可单测
//   2. 拍法冲突 = 否决；拍法吻合 = 大幅加分
//   3. 模型能力门禁与时长上限 = 否决 + 降级声明
//   4. 内容词得分只用于末位决胜，不参与否决
//   5. 未抽到、但确实会改变候选集的 facet → 生成追问，交给 skill 问用户
//
// CLI: node router/route.mjs "输入" [--model jimeng-seedance] [--top 5] [--strictness strict|lenient]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadIndex, loadAdapter, buildIdf, buildTermTable, countHits, resolveData } from "./lib/scoring.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FACETS = JSON.parse(readFileSync(resolveData("facet-profile.json"), "utf8"));

// ---------- 拍法抽取 ----------
const RX = {
  duration: [/(\d+(?:\.\d+)?)\s*(?:秒|s(?![a-z]))/g, /(\d+(?:\.\d+)?)\s*seconds?/g],
  animated: /动画|卡通|动漫|三维|3D|定格|黏土|赛璐珞|吉卜力|番剧|anime|cartoon|stop[\s-]?motion|pixar|3d[\s-]?cartoon/i,
  live: /实拍|真人|写实|手机|手持|随身|录像|家庭录像|纪录片|伪记录|vlog|UGC|素人|第一视角|realistic|live[\s-]?action|footage|handheld|home[\s-]?video/i,
  single: /一镜到底|单镜头|无剪辑|长镜头|不切镜|一镜|one[\s-]?take|continuous[\s-]?(?:take|shot)|no cuts|POV|第一人称/i,
  multi: /分镜|多镜头|镜头切换|切到|九宫格|故事板|镜头\s?\d|第[一二三四五六七八九十]\s?个镜头|([一二三四五六七八九十]|\d+)\s*个镜头|shot\s?\d|storyboard|shot list|timeline|scene\s?\d/i,
  dialogue: /台词|对白|对话|口播|开口|说道|自言自语|念白|says|said|dialogue|speaks|talking|voice[\s-]?over|口型/i,
  noDialogue: /无对白|没有台词|不说话|无人声|静音|配乐为主|no dialogue|without speech|no speech|silent/i,
  reference: /参考图|这张图|附图|按这张|首帧|尾帧|图生视频|上传.{0,4}图|reference image|image[\s-]to[\s-]video|first frame|last frame|from (?:this|the) image/i,
  musicSync: /卡点|节拍|音乐|BGM|副歌|翻跳|MV|beat[\s-]?sync|sync(?:ed)? to (?:the )?music|downbeat/i,
  textOnScreen: /字幕|画面.{0,4}文字|标题|标语|logo|花字|text on screen|caption|typography|title card/i,
  subject: [
    ["animal", /猫|狗|宠物|动物|狐狸|鸟|熊猫|幼龙|小猫|小狗|kitten|puppy|cat\b|dog\b|fox\b|animal|bird/i],
    ["vehicle", /汽车|跑车|摩托|机车|赛车|卡车|载具|自行车|滑板|car\b|motorcycle|truck|vehicle|bike|bicycle/i],
    ["product", /产品|商品|护肤品|精华|耳机|香水|饮料|包装|咖啡|食物|瓶|咖啡机|product|bottle|packaging|skincare|headphone|perfume|drink|food/i],
    ["place", /城市|街道|首尔|东京|日本|山|海|沙滩|森林|咖啡馆|厨房|教室|屋顶|街|旅|city|street|seoul|tokyo|mountain|beach|forest|cafe|kitchen/i],
    ["person", /女孩|男孩|少女|女人|男人|女生|男生|老人|奶奶|孩子|人|舞者|厨师|程序员|woman|man|girl|boy|person|dancer|chef|people|human|her\b|his\b/i],
  ],
};

function firstNumber(text, patterns) {
  for (const re of patterns) {
    const m = [...text.matchAll(re)];
    if (m.length) return Number(m[0][1]);
  }
  return null;
}

export function extractFacets(input) {
  const t = input || "";
  const styleMode = RX.animated.test(t) && !RX.live.test(t) ? "animated" : RX.live.test(t) && !RX.animated.test(t) ? "live" : RX.animated.test(t) && RX.live.test(t) ? null : null;
  const shotPlan = RX.single.test(t) && !RX.multi.test(t) ? "single" : RX.multi.test(t) && !RX.single.test(t) ? "multi" : null;
  const hasDialogue = RX.noDialogue.test(t) ? false : RX.dialogue.test(t) ? true : null;
  // 主体是集合不是单值：一条片子常常同时有人、地点、食物。按优先级只取一个会把
  // "韩国山里好吃的和善良的人们"判成 place，进而错误否决 person 类模板。
  const subjects = [];
  for (const [name, re] of RX.subject) if (re.test(t)) subjects.push(name);
  return {
    durationSec: firstNumber(t, RX.duration),
    styleMode,
    shotPlan,
    hasDialogue,
    hasReference: RX.reference.test(t) ? true : null,
    hasMusicSync: RX.musicSync.test(t) ? true : null,
    textOnScreen: RX.textOnScreen.test(t) ? true : null,
    subjects,
  };
}

// ---------- 冲突判定 ----------
function conflicts(profile, f) {
  const out = [];
  if (f.styleMode && profile.styleMode !== "either" && profile.styleMode !== f.styleMode) {
    out.push({ facet: "styleMode", why: `模板要${profile.styleMode === "animated" ? "动画/风格化" : "实拍质感"}，输入要${f.styleMode === "animated" ? "动画" : "实拍"}` });
  }
  if (f.shotPlan && profile.shotPlan !== "either" && profile.shotPlan !== f.shotPlan) {
    out.push({ facet: "shotPlan", why: `模板是${profile.shotPlan === "single" ? "一镜到底" : "多镜头分镜"}，输入要${f.shotPlan === "single" ? "一镜到底" : "多镜头"}` });
  }
  if (f.subjects?.length && !profile.subjects.includes("any")) {
    const inter = f.subjects.filter((s) => profile.subjects.includes(s));
    if (!inter.length) out.push({ facet: "subject", why: `模板主角限定 ${profile.subjects.join("/")}，输入主体是 ${f.subjects.join("/")}` });
  }
  if (profile.dialogue && f.hasDialogue === false) out.push({ facet: "hasDialogue", why: "模板依赖台词与表演节拍，输入明确不要对白" });
  if (profile.noDialogue && f.hasDialogue === true) out.push({ facet: "hasDialogue", why: "模板靠无对白的画面叙事，输入要求有台词" });
  if (profile.needsReference && f.hasReference === false) out.push({ facet: "hasReference", why: "模板需要参考图锁定身份，输入没有" });
  if (profile.musicSync && f.hasMusicSync === false) out.push({ facet: "hasMusicSync", why: "模板靠音乐节拍锚定剪辑点，输入不需要卡点" });
  if (profile.minDuration && f.durationSec && f.durationSec < profile.minDuration) {
    out.push({ facet: "duration", why: `模板建议 ≥${profile.minDuration}s，输入只有 ${f.durationSec}s` });
  }
  return out;
}

function alignments(profile, f) {
  const out = [];
  if (f.styleMode && profile.styleMode === f.styleMode) out.push({ facet: "styleMode", points: 5 });
  if (f.shotPlan && profile.shotPlan === f.shotPlan) out.push({ facet: "shotPlan", points: 5 });
  if (f.subjects?.length && !profile.subjects.includes("any")) {
    const inter = f.subjects.filter((s) => profile.subjects.includes(s));
    if (inter.length) out.push({ facet: `subject:${inter.join("+")}`, points: 6 });
  }
  if (f.hasDialogue === true && profile.dialogue) out.push({ facet: "hasDialogue", points: 5 });
  if (f.hasDialogue === false && profile.noDialogue) out.push({ facet: "noDialogue", points: 3 });
  if (f.hasReference === true && profile.needsReference) out.push({ facet: "hasReference", points: 6 });
  if (f.hasMusicSync === true && profile.musicSync) out.push({ facet: "musicSync", points: 8 });
  if (f.durationSec && profile.minDuration && f.durationSec >= profile.minDuration) out.push({ facet: "minDuration", points: 2 });
  if (f.textOnScreen === true && profile.textOnScreen === true) out.push({ facet: "textOnScreen", points: 3 });
  return out;
}

// 只有真正会改变候选集的未知 facet 才值得追问用户。
function openQuestions(facets, profiles) {
  const qs = [];
  const known = (v) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0);
  const check = (name, decide) => {
    if (known(facets[name])) return;
    const split = decide(name, profiles);
    if (split.blocked > 0 && split.kept > 0) qs.push({ facet: name, question: FACETS.facets[name]?.ask || name, impact: `${split.blocked} 个模板会被排除，${split.kept} 个保留` });
  };
  check("styleMode", (n, ps) => tally(ps, (p) => p[n] !== "either", (p) => p[n] === "either"));
  check("shotPlan", (n, ps) => tally(ps, (p) => p[n] !== "either", (p) => p[n] === "either"));
  check("subject", (n, ps) => tally(ps, (p) => !p.subjects.includes("any"), (p) => p.subjects.includes("any")));
  check("hasReference", (n, ps) => tally(ps, (p) => !!p.needsReference, () => true));
  check("hasDialogue", (n, ps) => tally(ps, (p) => !!p.dialogue || !!p.noDialogue, () => true));
  check("durationSec", (n, ps) => tally(ps, (p) => !!p.minDuration, () => true));
  return qs;
}
const tally = (ps, isAffected, isFree) => ({
  blocked: ps.filter(isAffected).length,
  kept: ps.filter(isFree).length,
});

export function route(input, opts = {}) {
  const { model = null, top = 5, strictness = "strict", index = opts.index || loadIndex() } = opts;
  const adapter = loadAdapter(model, index);
  const facets = extractFacets(input);
  const idf = buildIdf(Object.values(index.templates));
  const lower = (input || "").toLowerCase();

  const scored = [];
  for (const tp of Object.values(index.templates)) {
    const profile = FACETS.templates[tp.id];
    if (!profile) throw new Error(`facet-profile.json 缺模板 "${tp.id}"`);

    const contentHits = countHits(input, lower, buildTermTable(tp, idf));
    const contentScore = contentHits.reduce((a, h) => a + h.weight, 0);

    const facetBlock = conflicts(profile, facets);
    const align = alignments(profile, facets);
    const facetScore = align.reduce((a, x) => a + x.points, 0);

    const gateBlock = [];
    const degraded = [];
    if (adapter) {
      for (const g of tp.gates || []) {
        const v = adapter.capabilities?.[g];
        if (v === false) gateBlock.push({ capability: g, why: `${adapter.model} 不支持 ${g}` });
        else if (v === null || v === undefined) (strictness === "strict" ? gateBlock : degraded).push({ capability: g, why: `${adapter.model} 的 ${g} 未核对` });
      }
      for (const g of tp.softGates || []) {
        const v = adapter.capabilities?.[g];
        if (v === false || v === null || v === undefined) degraded.push({ capability: g, why: `${adapter.model} 的 ${g} ${v === false ? "不支持" : "未核对"}` });
      }
      if (adapter.limits?.maxDuration && facets.durationSec && facets.durationSec > adapter.limits.maxDuration) {
        gateBlock.push({ capability: "duration", why: `输入要 ${facets.durationSec}s，超过 ${adapter.model} 单次上限 ${adapter.limits.maxDuration}s，需分段拼接` });
      }
    }

    const blocked = [...facetBlock, ...gateBlock];
    // 内容分只作末位决胜：除以 10 压到 0.x~几的量级，永远盖不过拍法与门禁的判断。
    const score = facetScore + contentScore / 10;
    scored.push({
      id: tp.id, category: tp.category, title: tp.title, score: blocked.length ? score - 100 : score,
      facetScore, contentScore: Math.round((contentScore / 10) * 10) / 10,
      aligned: align.map((a) => a.facet), blocked, degraded,
      stacks: tp.stacks || [], corpusCount: tp.corpusCount, useWhen: tp.useWhen,
      matched: contentHits.slice(0, 5).map((h) => h.term),
    });
  }

  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const usable = scored.filter((s) => !s.blocked.length && s.score > 0);
  return {
    input: (input || "").slice(0, 200),
    facets,
    model: adapter?.model || null,
    shortlist: usable.slice(0, top),
    blockedExamples: scored.filter((s) => s.blocked.length && s.facetScore + s.contentScore > 0).slice(0, 3)
      .map((s) => ({ id: s.id, blocked: s.blocked.map((b) => b.why) })),
    questions: openQuestions(facets, Object.values(FACETS.templates)),
    noMatch: usable.length === 0,
  };
}

export { loadIndex, FACETS };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (n, d) => { const i = args.indexOf(`--${n}`); if (i === -1) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
  const model = flag("model", null);
  const top = Number(flag("top", 5));
  const strictness = flag("strictness", "strict");
  const text = args.join(" ");
  if (!text.trim()) { console.error('用法: node router/route.mjs "输入" [--model jimeng-seedance] [--top 5] [--strictness lenient]'); process.exit(1); }
  const r = route(text, { model, top, strictness });
  console.log(`输入: ${r.input}\n拍法: ${JSON.stringify(r.facets)}\n模型: ${r.model || "未指定"}\n`);
  for (const c of r.shortlist) {
    console.log(`  ${c.score.toFixed(1).padStart(5)}  ${c.id}  [${c.category}]  拍法+${c.facetScore} 内容+${c.contentScore}  语料${c.corpusCount}`);
    if (c.aligned.length) console.log(`         吻合: ${c.aligned.join(", ")}`);
    for (const d of c.degraded) console.log(`         ! 降级: ${d.why}`);
    if (c.stacks.length) console.log(`         建议叠加: ${c.stacks.join(", ")}`);
  }
  if (r.blockedExamples.length) { console.log("\n  被拍法/门禁排除："); for (const b of r.blockedExamples) console.log(`    ${b.id}: ${b.blocked.join("；")}`); }
  if (r.questions.length) { console.log("\n  需要追问："); for (const q of r.questions) console.log(`    ${q.question}   (${q.impact})`); }
  if (r.noMatch) console.log("\n  无候选通过，请放宽描述或改模型。");
}
