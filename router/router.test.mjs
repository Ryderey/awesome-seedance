// P0/P1 不变量测试。跑法：node --test router/router.test.mjs
// 不并进 npm test 是因为脚本清单写死在上游 package.json，改它就违反"零修改上游"。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { route, extractFacets, loadIndex, FACETS } from "./route.mjs";
import { runOracle } from "../eval/oracle.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));

test("产物已生成", () => {
  assert.ok(existsSync(path.join(ROOT, "data/routing-index.json")), "先跑 node router/build-index.mjs");
  assert.ok(existsSync(path.join(ROOT, "eval/golden-set.json")), "先跑 node eval/build-golden.mjs");
});

const index = loadIndex();
const capMap = read("router/capability-map.json");
const golden = read("eval/golden-set.json");

test("覆盖 25 个模板与 6 个分类", () => {
  assert.equal(Object.keys(index.templates).length, 25);
  assert.equal(index.categories.length, 6);
});

test("34 个 tag 全部登记且分类计数符合决策", () => {
  const tags = Object.entries(capMap.tags);
  assert.equal(tags.length, 34);
  const n = (c) => tags.filter(([, v]) => v.class === c).length;
  assert.equal(n("gate"), 3);
  assert.equal(n("soft"), 4, "typography 按 2026-09-24 决策归 soft，不是 gate");
  assert.equal(n("dialect"), 1);
  assert.equal(n("signal"), 26);
});

test("facet-profile 覆盖全部 25 个模板", () => {
  const ids = Object.keys(FACETS.templates);
  assert.deepEqual(ids.slice().sort(), Object.keys(index.templates).sort());
  for (const [id, p] of Object.entries(FACETS.templates)) {
    assert.ok(["live", "animated", "either"].includes(p.styleMode), `${id}.styleMode 非法`);
    assert.ok(["single", "multi", "either"].includes(p.shotPlan), `${id}.shotPlan 非法`);
    assert.ok(Array.isArray(p.subjects) && p.subjects.length, `${id}.subjects 不能为空`);
  }
});

test("同一能力不会既是硬门禁又是可降级项", () => {
  for (const [id, t] of Object.entries(index.templates)) {
    assert.deepEqual(t.gates.filter((g) => t.softGates.includes(g)), [], `${id} 判定矛盾`);
  }
});

test("案例溯源不含 goodcase.ai 中间层", () => {
  for (const [id, t] of Object.entries(index.templates)) {
    for (const ex of t.examples) {
      assert.ok(ex.sourceUrl, `${id} 的案例 ${ex.slug} 缺 sourceUrl`);
      assert.ok(!/goodcase\.ai/i.test(ex.sourceUrl), `${id} 的案例 ${ex.slug} 仍指向 goodcase.ai`);
    }
  }
});

test("适配器边界：不放范例与风格，能力位取值合法", () => {
  const forbidden = ["example", "examples", "prompt", "prompts", "style", "styles", "keywords"];
  const files = readdirSync(path.join(ROOT, "adapters")).filter((f) => f.endsWith(".json"));
  assert.equal(files.length, 3, "首批应为即梦 / 可灵 / Veo");
  for (const f of files) {
    const ad = read(`adapters/${f}`);
    for (const k of forbidden) assert.ok(!(k in ad), `${f} 含禁止字段 ${k}`);
    for (const [k, v] of Object.entries(ad.capabilities)) {
      assert.ok([true, false, null].includes(v), `${f}.capabilities.${k} 取值非法`);
      assert.ok(capMap.capabilityKeys.includes(k), `${f}.${k} 未在 capabilityKeys 声明`);
      if (typeof v === "boolean") assert.ok((ad.verifiedFrom || []).length > 0, `${f}.${k} 断言了能力但无来源`);
    }
  }
});

test("拍法抽取：时长 / 风格 / 镜数 / 对白", () => {
  assert.equal(extractFacets("做一个 30 秒的短片").durationSec, 30);
  assert.equal(extractFacets("a 15 seconds clip").durationSec, 15);
  assert.equal(extractFacets("皮克斯风格的动画小猫").styleMode, "animated");
  assert.equal(extractFacets("手机随手拍的真实日常").styleMode, "live");
  assert.equal(extractFacets("一镜到底不剪辑").shotPlan, "single");
  assert.equal(extractFacets("分成 6 个分镜镜头").shotPlan, "multi");
  assert.equal(extractFacets("两人争吵，台词要清楚").hasDialogue, true);
  assert.equal(extractFacets("全程无对白，靠画面叙事").hasDialogue, false);
  assert.equal(extractFacets("按这张参考图的人物来").hasReference, true);
  assert.equal(extractFacets("卡着副歌的 MV").hasMusicSync, true);
});

test("拍法抽取：主体是集合，不是单值", () => {
  // 回归：曾按优先级只取一个，导致"韩国山里好吃的人们"被判 place 而错误否决 person 类模板
  const f = extractFacets("韩国山里，好吃的食物，和善良的人们");
  assert.ok(f.subjects.includes("place"), "应含 place");
  assert.ok(f.subjects.includes("person"), "应含 person");
  assert.ok(f.subjects.includes("product"), "食物归 product");
});

test("拍法冲突会否决并给出可读理由", () => {
  const r = route("皮克斯风格动画短片，一只橘猫当主角", { top: 10, index });
  const blocked = r.blockedExamples.map((b) => b.id);
  assert.ok(blocked.includes("handheld-ugc-vlog"), "实拍类模板应被动画输入否决");
  const why = r.blockedExamples.find((b) => b.id === "handheld-ugc-vlog").blocked[0];
  assert.match(why, /动画|实拍/);
});

test("模型门禁：能力未核对时 strict 模式拦、lenient 模式放行并标降级", () => {
  const input = "30 秒剧情短片，两人对白很多，需要对口型";
  const strict = route(input, { model: "kling", top: 10, index, strictness: "strict" });
  const lenient = route(input, { model: "kling", top: 10, index, strictness: "lenient" });
  assert.ok(strict.shortlist.length <= lenient.shortlist.length, "strict 应不比 lenient 宽松");
  assert.ok(lenient.shortlist.some((c) => c.degraded.length), "lenient 应带降级说明");
});

test("零分候选不进 shortlist（否则字母序会让 3d-cartoon 假性通吃）", () => {
  const r = route("asdf qwer 完全无关的一句话", { top: 10, index });
  assert.ok(r.shortlist.every((c) => c.score > 0));
});

test("oracle 上界：facet-profile 的区分力未退化", () => {
  const o = runOracle(golden.rows);
  assert.ok(o.macro >= 0.75, `oracle top-5 保留率跌到 ${(o.macro * 100).toFixed(1)}%，facet-profile 可能被改坏（基线 84%）`);
});

test("golden set：25 标签、每标签至少 4 条、指标口径为 macro", () => {
  assert.equal(Object.keys(golden.perLabel).length, 25);
  for (const [id, n] of Object.entries(golden.perLabel)) assert.ok(n >= 4, `${id} 只有 ${n} 条`);
  assert.match(golden.metricSpec.primary, /macro|保留/);
});
