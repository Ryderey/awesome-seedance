import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fingerprint, hash, readJson, validatePackage, filesIn } from "./lib/build-data.mjs";
import { validateInputs, installPackage, smokePackage } from "./build.mjs";
import { loadLibrary } from "../scripts/lib/library.mjs";
import { evaluateRows, evaluateUserCases, evaluatePass } from "../eval/metrics.mjs";
import { runOracle } from "../eval/oracle.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function fixture(t) {
  const parent = path.join(ROOT, ".tmp"); mkdirSync(parent, { recursive: true });
  const temp = mkdtempSync(path.join(parent, "router-test-")), source = path.join(temp, "source"); mkdirSync(source);
  for (const rel of ["router", "eval", "adapters", "scripts", "data", "agents", ".github", ".claude-plugin", "submissions", "package.json"]) cpSync(path.join(ROOT, rel), path.join(source, rel), { recursive: true, filter: src => !/[/\\]__pycache__(?:[/\\]|$)/.test(src) });
  t.after(() => { const relative = path.relative(parent, temp); assert.ok(relative && !relative.startsWith('..')); rmSync(temp, { recursive: true, force: true }); });
  return { temp, source };
}
function command(source, script, args = [], ok = true) {
  const r = spawnSync(process.execPath, [path.join(source, script), ...args], { cwd: source, encoding: "utf8" });
  if (ok) assert.equal(r.status, 0, r.stderr + r.stdout); else assert.notEqual(r.status, 0);
  return r;
}
function regenerate(source) { for (const script of ["router/build-lexicon.mjs", "router/build-index.mjs", "eval/build-golden.mjs"]) command(source, script); }
function save(source, rel, value) { writeFileSync(path.join(source, rel), JSON.stringify(value, null, 2) + "\n"); }
function pack(source, dir) { command(source, "router/build-skill.mjs", [dir]); return dir; }

test("R07: real empty routing and shared empty oracle fail release", () => {
  const thresholds = readJson(ROOT, "eval/thresholds.json"), rows = readJson(ROOT, thresholds.fixedDataset).rows;
  const empty = () => ({ facets: {}, shortlist: [], eligibleCount: 0, questions: [], status: "no_match" });
  const fixed = evaluateRows(rows, { router: empty });
  const users = evaluateUserCases(readJson(ROOT, "eval/user-cases.json").rows, { router: empty });
  const oracle = runOracle(rows, 5, { ranker: () => ({ eligible: [] }) });
  assert.equal(oracle.macro, 0); assert.ok(users.unexpectedEmpty > 0); assert.equal(evaluatePass({ fixed, oracle, users }, thresholds), false);
  assert.equal(evaluatePass({ fixed, oracle: runOracle(rows), users }, thresholds), false, "正常 oracle 不能掩盖实际路由全部为空");
});
test("R06: same-ID body edits, missing profiles, unknown tags and removed references block packages", t => {
  const { temp, source } = fixture(t); regenerate(source);
  const file = "data/templates-local.json", local = readJson(source, file);
  local.overrides['timeline-shot-script'] = { guidance: { zh: ['Changed body'] } }; save(source, file, local);
  const out = path.join(temp, "must-not-exist");
  assert.match(command(source, "router/build-skill.mjs", [out], false).stderr, /指纹陈旧/); assert.ok(!existsSync(out));
  const profiles = readJson(source, "router/facet-profile.json"); delete profiles.templates['food-asmr']; save(source, "router/facet-profile.json", profiles);
  assert.throws(() => validateInputs(source), /ID 集不一致/);
  cpSync(path.join(ROOT, 'router/facet-profile.json'), path.join(source, 'router/facet-profile.json'));
  local.overrides['timeline-shot-script'].tags = ['unknown-test-tag']; save(source, file, local);
  assert.throws(() => validateInputs(source), /未知 tag/);
  delete local.overrides['timeline-shot-script']; save(source, file, local);
  const data = readJson(source, 'data/style-library.json'); data.templates = data.templates.filter(t => t.id !== 'timeline-shot-script'); save(source, 'data/style-library.json', data);
  assert.throws(() => validateInputs(source), /unknown template|陈旧|ID 集/);
});
test("S4: 28th template with zero corpus builds without count edits and is independently reachable", t => {
  const { temp, source } = fixture(t), id = 'synthetic-demo';
  const local = readJson(source, 'data/templates-local.json');
  const original = loadLibrary(source).library.templates.find(t => t.id === 'timeline-shot-script');
  local.templates.push({ ...original, id, category: 'foundation', title: { zh: '合成演示', en: 'Synthetic demo' }, tags: ['synthetic-demo'], exampleCases: [], exampleCaseUrls: [] }); save(source, 'data/templates-local.json', local);
  const profiles = readJson(source, 'router/facet-profile.json'); profiles.templates[id] = { styleMode: 'either', shotPlan: 'multi', subjects: ['any'], needsReference: true, hard: ['needsReference'], soft: ['shotPlan'] }; save(source, 'router/facet-profile.json', profiles);
  const cap = readJson(source, 'router/capability-map.json'); cap.tags[id] = { class: 'signal', templates: [id] }; save(source, 'router/capability-map.json', cap);
  const lexicon = readJson(source, 'router/lexicon-overrides.json'); lexicon.templates[id] = { zh: ['合成演示'], en: ['syntheticdemo'] }; save(source, 'router/lexicon-overrides.json', lexicon);
  const users = readJson(source, 'eval/user-cases.json');
  for (let i = 0; i < 4; i++) users.rows.push({ id: `synthetic-${i}`, targetLabel: id, input: i < 2 ? '合成演示，多镜头，10 秒，有参考图' : 'syntheticdemo multi-shot, 10 seconds, with reference image', acceptableTemplateIds: [id], sufficient: true, reason: 'build integration fixture' }); save(source, 'eval/user-cases.json', users);
  assert.ok(validateInputs(source).added.includes(id)); regenerate(source);
  assert.equal(readJson(source, 'eval/golden-set.json').perLabel[id], 0);
  const dir = pack(source, path.join(temp, 'package')); const manifest = validatePackage(dir);
  assert.equal(manifest.templateIds.length, Object.keys(profiles.templates).length);
  const r = JSON.parse(command(dir, 'scripts/route.mjs', ['syntheticdemo multi-shot with reference image', '--json']).stdout);
  assert.ok(r.shortlist.some(t => t.id === id));
  const conflict = JSON.parse(command(dir, 'scripts/route.mjs', ['syntheticdemo, no reference image', '--json']).stdout);
  assert.ok(!conflict.shortlist.some(t => t.id === id));
});
test("S5: deterministic packages, unknown file preservation, managed conflicts, lock and rollback", t => {
  const { temp, source } = fixture(t); regenerate(source);
  const one = pack(source, path.join(temp, 'one')), two = pack(source, path.join(temp, 'two'));
  assert.deepEqual(readJson(one, 'manifest.json'), readJson(two, 'manifest.json')); smokePackage(one);
  const target = path.join(temp, 'installed'); installPackage(one, target);
  writeFileSync(path.join(target, 'personal.txt'), 'keep this'); installPackage(two, target);
  assert.equal(readFileSync(path.join(target, 'personal.txt'), 'utf8'), 'keep this');
  const original = readFileSync(path.join(target, 'SKILL.md')); writeFileSync(path.join(target, 'SKILL.md'), 'local change');
  assert.throws(() => installPackage(two, target), /摘要冲突/); assert.equal(readFileSync(path.join(target, 'SKILL.md'), 'utf8'), 'local change');
  writeFileSync(path.join(target, 'SKILL.md'), original);
  const before = hash(readFileSync(path.join(target, 'manifest.json')));
  assert.throws(() => installPackage(two, target, { rename: () => { const error = new Error('EBUSY test lock'); error.code = 'EBUSY'; throw error; } }), /锁定/);
  assert.equal(hash(readFileSync(path.join(target, 'manifest.json'))), before);
  assert.throws(() => installPackage(two, target, { afterSwitch: () => { throw new Error('post-switch validation failure'); } }), /恢复/);
  assert.equal(hash(readFileSync(path.join(target, 'manifest.json'))), before); assert.equal(readFileSync(path.join(target, 'personal.txt'), 'utf8'), 'keep this');
  validatePackage(target, { allowUnknown: true });
  const legacy = path.join(temp, 'legacy'); cpSync(one, legacy, { recursive: true }); unlinkSync(path.join(legacy, 'manifest.json'));
  writeFileSync(path.join(legacy, 'personal.txt'), 'legacy personal');
  assert.throws(() => installPackage(two, legacy), /migrate-legacy/);
  installPackage(two, legacy, { migrateLegacy: true });
  assert.equal(readFileSync(path.join(legacy, 'personal.txt'), 'utf8'), 'legacy personal');
  assert.ok(existsSync(`${legacy}.backup`)); validatePackage(legacy, { allowUnknown: true });
});
