// 打分底座：加载路由索引、构建词表、算内容命中。
// 与 route.mjs 分开是因为 eval/ 也要直接复用这些函数做离线评测。
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// tag 是模板元数据，不会原样出现在用户输入里，需要一张中英对照词表才能参与匹配。
export const TAG_WORDS = {
  timeline: ["时间轴", "分镜", "镜头表", "逐秒", "timeline", "shot list"],
  "shot-list": ["分镜", "镜头清单", "shot list", "breakdown"],
  "character-consistency": ["保持一致", "同一个人", "不变", "consistent", "same character"],
  handheld: ["手持", "晃", "handheld", "shake"],
  "camera-imperfection": ["对焦", "失焦", "曝光", "颗粒", "autofocus", "grain", "imperfect"],
  ugc: ["UGC", "素人", "手机拍", "自拍", "随手"],
  "one-take": ["一镜到底", "无剪辑", "长镜头", "one take", "continuous"],
  product: ["产品", "商品", "护肤", "耳机", "饮料", "美妆", "product"],
  dialogue: ["对话", "台词", "对白", "dialogue", "talk"],
  narrative: ["剧情", "故事", "叙事", "narrative", "story"],
  "multi-act": ["三幕", "起承转合", "多段", "act"],
  "style-lock": ["画风", "风格锁定", "style"],
  vlog: ["vlog", "日志", "日常", "记录"],
  pov: ["第一人称", "主观", "视角", "POV"],
  commercial: ["广告", "商业", "品牌", "投放", "commercial"],
  "locked-camera": ["固定机位", "locked", "static"],
  combat: ["打斗", "格斗", "武打", "战斗", "combat", "fight"],
  choreography: ["编排", "动作设计", "choreography"],
  vfx: ["特效", "视觉特效", "VFX", "special effect"],
  "spoken-review": ["测评", "口播", "开箱", "review"],
  performance: ["表演", "演技", "performance"],
  anime: ["动漫", "动画", "番剧", "anime"],
  "stop-motion": ["定格", "黏土", "stop motion"],
  material: ["材质", "纸", "黏土", "material", "clay"],
  transformation: ["变身", "制作过程", "transform", "before after"],
  timelapse: ["延时", "快进", "timelapse"],
};

export const CATEGORY_WORDS = {
  foundation: ["结构", "骨架", "foundation"],
  realism: ["真实感", "像真的", "realism"],
  narrative: ["故事", "剧情", "narrative"],
  commercial: ["广告", "带货", "产品", "commercial"],
  stylized: ["风格化", "卡通", "动漫", "stylized"],
  motion: ["动作", "运动", "速度", "motion"],
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// 同一份代码要能在仓库内（data/、adapters/）和打包后的 skill 内（references/…）跑。
// 用候选根目录探测，避免在打包脚本里做脆弱的字符串替换。
const CANDIDATE_ROOTS = ["", "references", "data", "router"];

export function resolveData(rel, roots = [ROOT]) {
  for (const base of roots) {
    for (const prefix of CANDIDATE_ROOTS) {
      const p = path.join(base, prefix, rel);
      if (existsSync(p)) return p;
    }
  }
  throw new Error(`找不到数据文件 "${rel}"（试过 ${ROOT} 与 ${ROOT}/references）`);
}

export function loadIndex(file) {
  return finalizeIndex(JSON.parse(readFileSync(file || resolveData("routing-index.json"), "utf8")));
}

function finalizeIndex(raw) {
  return { ...raw, adapterFiles: raw.adapters };
}

export function loadAdapter(name, index) {
  if (!name) return null;
  const entry = (index.adapterFiles || []).find((a) => a.file === `adapters/${name}.json` || a.model === name || a.file.endsWith(`/${name}.json`));
  if (!entry) throw new Error(`未知模型适配器 "${name}"`);
  return JSON.parse(readFileSync(resolveData(entry.file.replace(/^adapters\//, "adapters/")), "utf8"));
}

// 泛词抑制：一个词铺在越多个模板的词表里，越不携带区分信息。
export function buildIdf(templates) {
  const df = new Map();
  const add = (t) => df.set(t, (df.get(t) || 0) + 1);
  for (const tp of templates) {
    const seen = new Set([
      ...(tp.signals?.zh || []), ...(tp.signals?.en || []),
      ...(tp.tags || []).flatMap((tag) => TAG_WORDS[tag] || []),
      ...(CATEGORY_WORDS[tp.category] || []),
    ]);
    for (const t of seen) add(t);
  }
  const N = templates.length;
  const idf = new Map();
  for (const [t, n] of df) idf.set(t, Math.log(1 + N / n) / Math.log(1 + N));
  return idf;
}

export function buildTermTable(tp, idf) {
  const w = (base, t) => Math.round(base * (idf.get(t) ?? 1) * 100) / 100;
  const terms = [];
  for (const t of tp.signals?.zh || []) terms.push({ term: t, weight: w(3, t), lang: "zh", from: "signal" });
  for (const t of tp.signals?.en || []) terms.push({ term: t, weight: w(3, t), lang: "en", from: "signal" });
  for (const tag of tp.tags || []) {
    for (const word of TAG_WORDS[tag] || []) terms.push({ term: word, weight: w(2, word), lang: /[一-龥]/.test(word) ? "zh" : "en", from: `tag:${tag}` });
  }
  for (const word of CATEGORY_WORDS[tp.category] || []) terms.push({ term: word, weight: w(1, word), lang: /[一-龥]/.test(word) ? "zh" : "en", from: "category" });
  return terms;
}

export function countHits(input, lower, terms) {
  const hits = [];
  for (const t of terms) {
    const matched = t.lang === "zh"
      ? input.includes(t.term)
      : new RegExp(`\\b${esc(t.term)}\\b`, "i").test(lower);
    if (matched) hits.push(t);
  }
  return hits;
}
