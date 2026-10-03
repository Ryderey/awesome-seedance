#!/usr/bin/env node
// 把路由库打包成一个自包含的 Agent Skill。
// 产物只依赖 node 与自身文件，拷到任何项目的 .agents/skills/ 下都能用。
//
// 关键设计：SKILL.md 只放"怎么问、怎么选、怎么报降级"和一张索引表；
// 模板正文各自一个文件，终选后才读主模板与明确选中的辅助模板。
//
// Run: node router/build-skill.mjs [输出目录]
import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadLibrary } from "../scripts/lib/library.mjs";
import { fingerprint, filesIn, hash, validatePackage } from "./lib/build-data.mjs";
import { validateProfiles } from "./route.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (!process.argv[2]) throw new Error("必须提供临时输出目录；安装使用 router/build.mjs --install");
const OUT = path.resolve(process.argv[2]);

const { library } = loadLibrary(ROOT);
const index = JSON.parse(readFileSync(path.join(ROOT, "data/routing-index.json"), "utf8"));
const facets = JSON.parse(readFileSync(path.join(ROOT, "router/facet-profile.json"), "utf8"));
const ids = library.templates.map(t => t.id).sort();
validateProfiles(facets, ids);
if (ids.join("|") !== Object.keys(index.templates).sort().join("|")) throw new Error("library/index ID 集不一致，拒绝写包");
if (index.dataVersion !== fingerprint(ROOT)) throw new Error("索引输入指纹陈旧，请运行统一构建");
if (existsSync(OUT) && readdirSync(OUT).length) throw new Error("输出目录必须为空；避免新旧托管文件混用");

// Only write a fresh staging directory; installation handles directory switching and rollback.
mkdirSync(path.join(OUT, "references/templates"), { recursive: true });
mkdirSync(path.join(OUT, "scripts/lib"), { recursive: true });

const bilingual = (v) => (typeof v === "string" ? v : [v?.en, v?.zh].filter(Boolean).join("\n"));
const list = (v) => (Array.isArray(v) ? v : typeof v === "string" ? [v] : []);
const langList = (v, lang) => list(typeof v === "object" && v !== null && !Array.isArray(v) ? v[lang] : v);

// ---------- 模板正文 ----------
const catTitle = Object.fromEntries(library.categories.map((c) => [c.id, c.title?.zh || c.id]));
for (const tp of library.templates) {
  const meta = index.templates[tp.id];
  const ex = (meta.examples || []).map((e) => `- ${e.title} — ${e.creator} · 热度 ${e.heat} · [原帖](${e.sourceUrl})`).join("\n") || "- （本模板暂无可溯源案例）";
  const body = [
    `# ${tp.title.zh || tp.title.en}  (\`${tp.id}\`)`,
    ``,
    `> ${tp.description.zh || tp.description.en}`,
    ``,
    `**分类**：${catTitle[tp.category] || tp.category}`,
    ``,
    `## 何时用`,
    ``,
    tp.useWhen.zh ? `${tp.useWhen.zh}` : "",
    tp.useWhen.en ? `\n_${tp.useWhen.en}_` : "",
    ``,
    `## 结构（逐块填，空块就是提示词变平庸的地方）`,
    ``,
    ...langList(tp.structure, "zh").map((s, i) => `${i + 1}. ${s}`),
    ``,
    `## 要点`,
    ``,
    ...langList(tp.guidance, "zh").map((s) => `- ${s}`),
    ``,
    `## 常见坑`,
    ``,
    ...langList(tp.pitfalls, "zh").map((s) => `- ${s}`),
    ``,
    `## 可复制引导语`,
    ``,
    "```text",
    bilingual(tp.copyPrompt?.zh || tp.copyPrompt?.en || tp.copyPrompt || ""),
    "```",
    ``,
    `## 能力要求`,
    ``,
    `- 硬门禁（模型不具备则换模板）：${(meta.gates || []).join(", ") || "无"}`,
    `- 可降级（不具备时改写法，且必须告知用户）：${(meta.softGates || []).join(", ") || "无"}`,
    `- 方言（写法随模型而变）：${(meta.dialect || []).join(", ") || "无"}`,
    `- 建议叠加：${(meta.stacks || []).join(", ") || "无"}`,
    ``,
    `## 可溯源案例（${meta.corpusCount || 0} 条中的高热代表）`,
    ``,
    ex,
    ``,
  ].join("\n");
  writeFileSync(path.join(OUT, `references/templates/${tp.id}.md`), body, "utf8");
}

// ---------- 索引与数据 ----------
writeFileSync(path.join(OUT, "references/routing-index.json"), JSON.stringify(index, null, 2) + "\n", "utf8");
writeFileSync(path.join(OUT, "references/facet-profile.json"), JSON.stringify(facets, null, 2) + "\n", "utf8");
cpSync(path.join(ROOT, "adapters"), path.join(OUT, "references/adapters"), { recursive: true });
for (const [from, to] of [["router/route.mjs", "scripts/route.mjs"], ["router/lib/scoring.mjs", "scripts/lib/scoring.mjs"]]) writeFileSync(path.join(OUT, to), readFileSync(path.join(ROOT, from), "utf8").replace(/\r\n/g, "\n"));
// 不需要改写路径：scoring.mjs 的 resolveData 会同时探到仓库内的 data//router//adapters/
// 和打包后的 references/。

// ---------- SKILL.md ----------
const rows = Object.values(index.templates)
  .sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id))
  .map((t) => `| \`${t.id}\` | ${t.title.zh || t.title.en} | ${catTitle[t.category]} | ${(t.gates || []).join("/") || "—"} | ${t.corpusCount} |`)
  .join("\n");

const questions = Object.entries(facets.facets)
  .filter(([, v]) => v.ask)
  .map(([k, v]) => `- \`${k}\`：${v.ask}`)
  .join("\n");

writeFileSync(
  path.join(OUT, "SKILL.md"),
  `---
name: video-prompt-router
description: 视频提示词生成、已有提示词诊断与参考素材工作流。按用户要求从 ${ids.length} 个模板形成候选，补问后重算并比较用途，再按目标模型版本与入口检查能力。
---

# 视频提示词路由库

${ids.length} 个案例提炼模板。拍法、主题和用途共同参与选择；案例数是支撑量，不是置信度。

## 选择原则

只询问会改变候选或选择的信息。读取候选的 useWhen、正向证据、软偏好差异与待确认条件后终选；无正向证据的兼容集合需要补信息。

## 流程

### 第 0 步：判定模式

| 模式 | 用户给的是 | 你要做的 |
| --- | --- | --- |
| **A 生成** | 一句想法 | 走第 2-4 步，产出完整提示词 |
| **B 诊断** | 一段已有提示词 | 同样补问、重算和终选，再比对结构缺口与冲突；将改写对应到原因 |
| **C 素材** | 参考图或需要制作分镜图 | 先确定 referencePurpose：identity / product / first_frame / storyboard，并保留镜头计划 |

### 第 1 步：跑路由脚本

\`\`\`bash
node scripts/route.mjs "<用户原话>" --json [--model <jimeng-seedance|kling|veo>]
node scripts/route.mjs --request <完整请求.json> --json
\`\`\`

结构化请求包含 text、model、facets、referencePurpose。字段省略允许文本补充，显式 null 保持未知。仅把明确回答、实际附件与已声明假设写成事实。status 是路由状态，不代表已生成成品。dataVersion 用于识别包版本。

### 第 2 步：补齐拍法

\`questions\` 非空时，**一次问完**（不要逐条追问）。最多挑 3 个最影响结果的：

${questions}

收到回答后，合并到完整请求的 facets，保留无关已知要求与用户更正，再用 --request 重跑路由。明确矛盾只澄清冲突项。
用户明确说“你决定”时选择合理默认值并声明假设后重算。必要问题尚未回答时保持待答，等待超时不是同意。
人物身份图只约束身份；产品图只约束外观；首帧图检查图生视频入口；分镜格图才按格转镜头。
无图但需分镜时先输出图像阶段产物，图生成后再写入 hasReference=true；保留两阶段区别。

### 第 3 步：终选与读正文

比较最新 shortlist 的 useWhen、aligned/matched、hardChecks、softMismatches、pendingRequirements，选主模板，并解释主要备选未选的原因。
读取主模板全文：\`references/templates/<id>.md\`。明确需要叠加时，再读取被选中的辅助模板全文，依据结构合并。
no_match 时解释主要硬冲突与最小调整项；兼容集合没有证据时澄清。不要把稳定 ID 排序解释为推荐理由。

### 第 4 步：套模型能力

若用户指定了目标模型，按结果 adapter.file 读取 \`references/<adapter.file>\`：

- 模板的**硬门禁**能力该模型为 \`false\` → 换候选里下一个能用的，并说明为什么换
- 能力为 \`null\` → 明确“尚未核实”，核实具体版本与入口；lenient 候选仅为有条件草案
- 模板的软能力不满足 → 按 degradations 的 blocks/action/notice 改写；无具体规则时保留待确认项
- 先核对 adapter 的 entry 与 aliasNote；别名不能抹去 API 与宿主 UI 差异
- 总长超过单次上限且允许剪辑时，确认所选结构可切分，再按 segments/maxSegmentSec 分段；连续单镜头或必须单次生成冲突时换方案
- 后期字幕、配音等需要用户允许后期处理；生成前再核对所有明确禁止项

**任何降级都必须在交付里写明"因目标模型 X，已把 Y 改为 Z"。不做静默降质。**

## 交付格式

1. 成品提示词，单个可复制代码块
2. 用的哪个模板、为什么是它（引用命中的拍法）
3. 若有降级或换模板：一句话说明原因
4. 该模板的 2-3 个可溯源案例链接（模板文件末尾）
5. 若叠加了 foundation 模板（见"建议叠加"），说明怎么合并

## 模板索引

| id | 名称 | 分类 | 硬门禁 | 案例数 |
| --- | --- | --- | --- | --- |
${rows}

## 约束

- 有匹配模板时，**不要凭通用视频生成知识另编结构**。无匹配就说没有，再从第一性原理写。
- 每个结构块都要填实，空块是提示词变平庸的地方。
- 中英双语输入都要能路由；模板正文是中文，术语保留英文原文。

## 出处与许可

见 \`NOTICE.md\`。模板与案例源自 awesome-seedance / goodcase.ai 的策展成果（CC BY 4.0），
案例链接指向创作者原帖，提示词与视频版权归原创作者。
`,
  "utf8"
);

writeFileSync(
  path.join(OUT, "NOTICE.md"),
  `# 出处与许可

本 skill 的模板、案例归类与统计来自 [awesome-seedance](https://github.com/LearnPrompt/awesome-seedance) / [goodcase.ai](https://goodcase.ai)，分层授权：

- **代码**（\`scripts/\`）：MIT
- **策展成果**（模板提炼、分类、统计、摘要）：CC BY 4.0，须署名 *awesome-seedance / goodcase.ai*
- **提示词原文与媒体**：版权归各原创作者。本包仅为文档与学习目的引用公开帖子，每条都附原帖链接。

本包已去除 goodcase.ai 跳转链接与 UTM 参数，保留 x.com 原帖出处与上述署名。

输入版本：${index.dataVersion}
构建命令：\`node router/build.mjs --write --out <临时包目录>\`
`,
  "utf8"
);

const sizes = {
  skill: readFileSync(path.join(OUT, "SKILL.md"), "utf8").length,
  templates: library.templates.length,
};
console.log(`skill 已打包到 ${OUT}`);
console.log(`  SKILL.md ${sizes.skill} 字符   模板文件 ${sizes.templates} 个   适配器 3 个`);
if (sizes.skill > 9000) console.error("WARN: SKILL.md 超过 9000 字符，索引表可能太长");

// 就地覆盖不会删除改名后遗留的旧模板文件，这里显式报出来。
const current = new Set(library.templates.map((t) => `${t.id}.md`));
const stale = readdirSync(path.join(OUT, "references/templates")).filter((f) => f.endsWith(".md") && !current.has(f));
if (stale.length) console.error(`WARN: 有 ${stale.length} 个陈旧模板文件需手工删除：${stale.join(", ")}`);
const manifest = { schemaVersion: 1, name: "video-prompt-router", dataVersion: index.dataVersion, templateIds: ids, files: Object.fromEntries(filesIn(OUT).map(file => [file, hash(readFileSync(path.join(OUT, file)))])) };
writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
validatePackage(OUT);
