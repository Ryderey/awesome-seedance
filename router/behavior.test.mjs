import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { route, extractFacets, normalizeRequest, rankTemplates, validateProfiles, FACETS, loadIndex } from "./route.mjs";
const index = loadIndex();
test("R01: local and coordinated negation, correction and unknown", () => {
  const f = extractFacets("没有参考图，不要音乐和字幕");
  assert.deepEqual([f.hasReference, f.hasMusicSync, f.textOnScreen], [false, false, false]);
  for (const text of ["不要背景音乐，但保留字幕", "No reference image, no music, but captions"]) {
    const r = extractFacets(text); assert.equal(r.hasMusicSync, false); assert.equal(r.textOnScreen, true);
  }
  assert.equal(extractFacets("有背景音乐，不用卡点").hasMusicSync, false);
  assert.equal(extractFacets("有背景音乐").hasMusicSync, null);
  assert.equal(extractFacets("有参考图，没有参考图").hasReference, null);
  assert.equal(extractFacets("不要字幕，改成要字幕").textOnScreen, true);
  assert.equal(extractFacets("a woman carrying a carpet").subjects.includes("vehicle"), false);
});
test("R01: duration means total, units and timestamp ambiguity", () => {
  assert.equal(extractFacets("a 30-second clip").durationSec, 30);
  assert.equal(extractFacets("2 分钟").durationSec, 120);
  assert.equal(extractFacets("[00:00-00:04] 镜头1；[00:04-00:10] 镜头2").durationSec, null);
  assert.equal(extractFacets("总时长 15 秒；[00:00-00:04] 镜头1").durationSec, 15);
});
test("structured answers override inference, null stays unknown, other facts survive", () => {
  const r = route("动画猫，有参考图", { facets: { styleMode: "live", hasReference: null } });
  assert.equal(r.facets.styleMode, "live"); assert.equal(r.facets.hasReference, null); assert.ok(r.facets.subjects.includes("animal"));
  assert.ok(r.facets.diagnostics.some(d => d.source === "structured"));
});
test("R02: soft narrative dialogue/duration never hard-block; hard conflicts do", () => {
  const req = normalizeRequest("10 秒，无对白，多镜头感人故事");
  const r = rankTemplates({ ...req, index });
  const c = r.eligible.find(t => t.id === "cinematic-narrative-short");
  assert.ok(c); assert.deepEqual(c.softMismatches.map(m => m.profileField).sort(), ["dialogue", "minDuration"]);
  assert.ok(r.scored.find(t => t.id === "dialogue-performance-beats").blocked.length);
  validateProfiles(FACETS, Object.keys(index.templates));
  const bad = structuredClone(FACETS); bad.templates['food-asmr'].hard.push('subjects');
  assert.throws(() => validateProfiles(bad, Object.keys(index.templates)), /重复/);
});
test("R03/R04: multi-turn rerouting and reference purposes preserve single take", () => {
  const r = route("猫的视频", { facets: { styleMode: "live", shotPlan: "single", durationSec: 15 } });
  assert.ok(r.shortlist.some(t => t.id === "pov-continuous-take"));
  assert.ok(!r.questions.some(q => ["subjects", "styleMode", "shotPlan", "durationSec"].includes(q.facet)));
  assert.ok(r.questions.length <= 3);
  for (const q of r.questions) for (const a of q.impact.alternatives) assert.equal(a.kept + a.excluded, q.impact.total);
  const ref = route("香水参考图，5 秒，一镜到底", { referencePurpose: "product" });
  assert.ok(ref.shortlist.some(t => t.id === "character-reference-lock"));
  assert.ok(!ref.shortlist.some(t => t.id === "storyboard-grid-to-video"));
  const grid = route("九宫格分镜转视频，有参考图，15 秒", { referencePurpose: "storyboard" });
  assert.ok(grid.shortlist.some(t => t.id === "storyboard-grid-to-video"));
});
test("T14/T15: unsupported vs unverified and segmentable vs continuous duration", () => {
  const req = normalizeRequest("30 秒多镜头剧情", { facets: { hasReference: true } });
  const base = { ...req, index, adapter: { model: "test", capabilities: { refImage: null }, limits: { maxDuration: 10 } } };
  assert.ok(rankTemplates(base).scored.every(t => t.blocked.some(b => b.kind === "unverified")));
  assert.ok(rankTemplates({ ...base, adapter: { ...base.adapter, capabilities: { refImage: false } } }).scored.every(t => t.blocked.some(b => b.kind === "unsupported")));
  const lenient = rankTemplates({ ...base, strictness: "lenient" });
  assert.ok(lenient.eligible.length); assert.ok(lenient.eligible.every(t => t.degraded.some(d => d.kind === "segmentation")));
  assert.equal(rankTemplates({ ...base, strictness: "lenient", facets: { ...req.facets, shotPlan: "single" } }).eligible.length, 0);
});
test("invalid public inputs and CLI fail, JSON has no logging pollution", () => {
  for (const top of [0, -1, 1.5, NaN]) assert.throws(() => route("猫", { top }), /top/);
  for (const opts of [{ strictness: "strcit" }, { facets: { durationSec: -1 } }, { facets: { durationSec: "10" } }, { facets: { styleMode: "either" } }, { model: "unknown" }, { typo: true }]) assert.throws(() => route("猫", opts));
  const bad = spawnSync(process.execPath, ["router/route.mjs", "猫", "--top", "0", "--json"], { encoding: "utf8" });
  assert.notEqual(bad.status, 0); assert.equal(bad.stdout, "");
  const ok = spawnSync(process.execPath, ["router/route.mjs", "猫", "--json"], { encoding: "utf8" });
  assert.equal(ok.status, 0); assert.ok(JSON.parse(ok.stdout).shortlist.length);
});
test("compatibility without evidence is clarification, content score cannot grow unbounded", () => {
  const r = route("asdf qwer"); assert.equal(r.status, "needs_clarification"); assert.ok(r.shortlist.every(t => !t.positiveEvidence));
  const long = route(Object.values(index.templates).flatMap(t => t.signals.zh).join(' '));
  assert.ok(long.shortlist.every(t => t.contentScore <= 2));
});
test("fully answered facts generate no repeated questions; aliases preserve exact entry scope", () => {
  const r = route("女孩的日常", { facets: { durationSec: 15, styleMode: "live", shotPlan: "single", subjects: ["person"], hasDialogue: false, hasReference: false, hasMusicSync: false, textOnScreen: false } });
  assert.deepEqual(r.questions, []);
  assert.equal(route("猫", { model: "可灵" }).model, route("猫", { model: "kling-v3" }).model);
  const trim = route("5 秒实拍一镜到底猫", { model: "veo" });
  assert.ok(trim.shortlist.some(t => t.pendingRequirements.some(p => p.kind === "trim" && p.generateSec === 6)));
  assert.equal(route("5 秒实拍一镜到底猫", { model: "veo", allowEditing: false }).status, "no_match");
});
