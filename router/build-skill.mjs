#!/usr/bin/env node
// 把路由库打包成一个自包含的 Agent Skill。
// 产物只依赖 node 与自身文件，拷到任何项目的 .agents/skills/ 下都能用。
//
// 关键设计：SKILL.md 只放"怎么问、怎么选、怎么报降级"和一张索引表；
// 25 个模板正文各自一个文件，命中后才读那一个 —— 避免把 126KB 全量塞进上下文。
//
// Run: node router/build-skill.mjs [输出目录]
import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadLibrary } from "../scripts/lib/library.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.resolve(process.argv[2] || path.join(ROOT, "..", "..", ".agents/skills/video-prompt-router"));

const { library, taxonomy } = loadLibrary(ROOT);
const index = JSON.parse(readFileSync(path.join(ROOT, "data/routing-index.json"), "utf8"));
const facets = JSON.parse(readFileSync(path.join(ROOT, "router/facet-profile.json"), "utf8"));
const { cases } = JSON.parse(readFileSync(path.join(ROOT, "data/cases.json"), "utf8"));
const casesBySlug = new Map(cases.map((c) => [c.slug, c]));

// 不做整目录删除：宿主（Qoder / Claude）会监视并锁住 skill 目录，rmdir 直接 EBUSY。
// 就地覆盖即可；若上游改了模板 id，残留的旧文件需手工清理（本脚本会列出非本次生成的 .md）。
mkdirSync(path.join(OUT, "references/templates"), { recursive: true });
mkdirSync(path.join(OUT, "scripts/lib"), { recursive: true });

const bilingual = (v) => (typeof v === "string" ? v : [v?.en, v?.zh].filter(Boolean).join("\n"));
const list = (v) => (Array.isArray(v) ? v : typeof v === "string" ? [v] : []);
const langList = (v, lang) => list(typeof v === "object" && v !== null && !Array.isArray(v) ? v[lang] : v);

// ---------- 25 个模板正文 ----------
const catTitle = Object.fromEntries(library.categories.map((c) => [c.id, c.title?.zh || c.id]));
for (const tp of library.templates) {
  const meta = index.templates[tp.id] || {};
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
cpSync(path.join(ROOT, "router/route.mjs"), path.join(OUT, "scripts/route.mjs"));
cpSync(path.join(ROOT, "router/lib/scoring.mjs"), path.join(OUT, "scripts/lib/scoring.mjs"));
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
description: 视频提示词模板路由库。当用户要写、改、评审 AI 视频提示词，或描述一个想拍的片子（短片/广告/vlog/MV/分镜/产品视频/宠物视频等）并需要可直接使用的结构化提示词时使用。先从 25 个已验证模板中按"拍法"定位候选，再按目标模型能力套用降级规则。不限定单一模型，内置即梦/Seedance、可灵、Veo 三份能力适配器。
---

# 视频提示词路由库

25 个从已验证案例中提炼的视频提示词模板。**模板的区分轴是"拍法"，不是"拍什么"**——
同一条猫的视频可以是实拍 vlog、可以是皮克斯动画、可以是一镜到底，三者用的是不同模板。

## 为什么必须先问

实测：只靠用户第一句话做词面匹配，正确答案留在候选里的比例只有 53%；
而拍法信息齐全时是 84%。差距全部来自"用户没说拍法"，不是算法不行。
所以**不要硬猜**，按下面的流程把缺的信息问出来。

## 流程

### 第 0 步：跑路由脚本

\`\`\`bash
node scripts/route.mjs "<用户原话>" [--model <jimeng-seedance|kling|veo>] [--top 5]
\`\`\`

输出含四块：\`facets\`（抽到的拍法）、\`shortlist\`（候选模板）、\`blockedExamples\`（被否决及理由）、\`questions\`（还该问什么）。

### 第 1 步：判定模式

| 模式 | 用户给的是 | 你要做的 |
| --- | --- | --- |
| **A 生成** | 一句想法 | 走第 2-4 步，产出完整提示词 |
| **B 诊断** | 一段已有提示词 | 定位它属于哪个模板 → 逐块比对 \`结构\` 找缺失块 → 对照 \`常见坑\` 指出具体问题 → 给改写版，并说明每处改动对应哪条坑 |
| **C 流水线** | 带参考图，或需要分镜图 | 先确认走 \`storyboard-grid-to-video\`：先出分镜格图，再把图作为参考输入 |

### 第 2 步：补齐拍法

\`questions\` 非空时，**一次问完**（不要逐条追问）。最多挑 3 个最影响结果的：

${questions}

用户不回答或明确说"你决定"，就按候选第一名往下走，并在交付时**声明这是基于假设**。

### 第 3 步：读模板正文

只读命中的那一个：\`references/templates/<id>.md\`。
不要一次读多个，也不要读索引全量。

### 第 4 步：套模型能力

若用户指定了目标模型，读 \`references/adapters/<model>.json\`：

- 模板的**硬门禁**能力该模型为 \`false\` → 换候选里下一个能用的，并说明为什么换
- 能力为 \`null\`（未核对）→ 明确告一句"该能力官方文档未确认，先按不支持处理"
- 模板的**可降级**能力不满足 → 按适配器 \`degradations\` 改写对应块

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

生成时间：${new Date().toISOString().slice(0, 10)}
生成命令：\`node router/build-skill.mjs\`
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
