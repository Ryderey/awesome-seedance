#!/usr/bin/env node
// One snapshot, one validation path. Network refresh is intentionally a separate operation.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, cpSync, existsSync, mkdtempSync, rmSync, renameSync, lstatSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadLibrary, buildTemplateIndex } from "../scripts/lib/library.mjs";
import { STANDALONE_SKILL_MARKER } from "../scripts/lib/standalone-skill.mjs";
import { route, validateProfiles } from "./route.mjs";
import { filesIn, readJson, hash, fingerprint, inputHashes, templateHashes, validatePackage } from "./lib/build-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMP_ROOT = process.env.ROUTER_TEMP_ROOT || path.join(ROOT, ".tmp");
const DERIVED = ["router/signals.lexicon.json", "data/routing-index.json", "eval/golden-set.json", "data/router-stats.json"];
const COPIED = ["router", "eval", "adapters", "scripts", "data", "agents", "docs", "assets", ".github", ".claude-plugin", "submissions", "package.json", "README.md", "README_zh.md", "README_ja.md"];
function run(executable, args, cwd) {
  const r = spawnSync(executable, args, { cwd, encoding: "utf8", shell: false, maxBuffer: 24 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw new Error(`${executable} ${args.join(" ")} 未完成\n${r.error?.message || ""}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}
function safeRemove(target, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || (existsSync(target) && lstatSync(target).isSymbolicLink())) throw new Error(`拒绝删除未验证目录 ${target}`);
  rmSync(target, { recursive: true, force: true });
}
export function validateInputs(root) {
  const { library, taxonomy } = loadLibrary(root), ids = library.templates.map(t => t.id), idSet = new Set(ids);
  validateProfiles(readJson(root, "router/facet-profile.json"), ids);
  const cap = readJson(root, "router/capability-map.json"), overrides = readJson(root, "router/lexicon-overrides.json").templates;
  for (const id of Object.keys(overrides)) if (!idSet.has(id)) throw new Error(`陈旧补词 ${id}，需要迁移`);
  for (const t of library.templates) for (const tag of t.tags || []) if (!cap.tags[tag]) throw new Error(`模板 ${t.id} 的未知 tag ${tag}`);
  for (const [tag, config] of Object.entries(cap.tags)) for (const id of [...(config.templates || []), ...(config.requiredByTemplates || [])]) if (!idSet.has(id)) throw new Error(`tag ${tag} 引用陈旧模板 ${id}，需要迁移`);
  const rows = readJson(root, "eval/user-cases.json").rows, thresholds = readJson(root, "eval/thresholds.json");
  const caseIds = new Set();
  for (const row of rows) {
    if (caseIds.has(row.id)) throw new Error(`重复口语样例 ${row.id}`); caseIds.add(row.id);
    if (!row.reason || !row.acceptableTemplateIds?.length || !idSet.has(row.targetLabel)) throw new Error(`口语样例 ${row.id} 缺审阅依据/模板`);
    for (const id of [...row.acceptableTemplateIds, ...(row.forbiddenTemplateIds || [])]) if (!idSet.has(id)) throw new Error(`口语样例 ${row.id} 引用陈旧模板 ${id}`);
  }
  for (const id of ids) {
    const cases = rows.filter(r => r.targetLabel === id);
    if (cases.length < thresholds.userCasesPerTemplateMin || !cases.some(r => /[一-龥]/.test(r.input)) || !cases.some(r => /^[\x00-\x7F]+$/.test(r.input)) || cases.filter(r => r.sufficient).length < 2) throw new Error(`模板 ${id} 需至少 ${thresholds.userCasesPerTemplateMin} 条中英文口语输入及 2 条明确拍法`);
  }
  const corpus = buildTemplateIndex(library.templates, taxonomy, readJson(root, "data/cases.json").cases);
  const previous = existsSync(path.join(root, "data/router-build.json")) ? readJson(root, "data/router-build.json").templateHashes || {} : {};
  const current = templateHashes(library);
  return { library, templateHashes: current, added: ids.filter(id => !previous[id]), modified: ids.filter(id => previous[id] && previous[id] !== current[id]), removed: Object.keys(previous).filter(id => !idSet.has(id)), unassigned: corpus.unassigned.length, thinCorpus: ids.filter(id => (corpus.byTemplate.get(id) || []).length < 4) };
}

const SMOKE = [
  { text: "15 秒多镜头美食 ASMR，做菜拉丝冒热气，无对白" },
  { text: "15-second single-shot game livestream with HUD and captions" },
  { text: "香水参考图，5 秒一镜到底", referencePurpose: "product" },
];
export function smokePackage(dir, expected = null) {
  const manifest = validatePackage(dir, { allowUnknown: true });
  mkdirSync(TEMP_ROOT, { recursive: true });
  const external = mkdtempSync(path.join(TEMP_ROOT, "router-smoke-"));
  try {
    return SMOKE.map((request, i) => {
      const file = path.join(external, "request.json"); writeFileSync(file, JSON.stringify(request));
      const result = JSON.parse(run(process.execPath, [path.join(dir, "scripts/route.mjs"), "--request", file, "--json"], external));
      if (result.dataVersion !== manifest.dataVersion || !result.shortlist.length) throw new Error("打包版独立冒烟失败");
      if (i === 0 && !result.shortlist.some(t => t.id === "food-asmr")) throw new Error("包中 food-asmr 不可达");
      if (i === 1 && !result.shortlist.some(t => t.id === "game-ui-livestream")) throw new Error("包中 game-ui-livestream 不可达");
      if (expected && JSON.stringify(result) !== JSON.stringify(expected[i])) throw new Error("包与仓库路由结果不一致");
      return result;
    });
  } finally { safeRemove(external, TEMP_ROOT); }
}

export function installationStatus(target, root = ROOT) {
  const desiredVersion = fingerprint(root);
  if (!existsSync(target)) return { target, state: "not_installed", desiredVersion };
  if (!existsSync(path.join(target, "manifest.json"))) return { target, state: "legacy_unmanaged", desiredVersion, installedIds: existsSync(path.join(target, "references/routing-index.json")) ? Object.keys(readJson(target, "references/routing-index.json").templates) : [] };
  try {
    const m = validatePackage(target, { allowUnknown: true });
    return { target, state: m.dataVersion === desiredVersion ? "current" : "outdated", desiredVersion, installedVersion: m.dataVersion, installedIds: m.templateIds };
  } catch (err) { return { target, state: "locally_modified_or_invalid", desiredVersion, error: err.message }; }
}

export function installPackage(source, target, { migrateLegacy = false, afterSwitch = () => {}, rename = renameSync } = {}) {
  source = path.resolve(source); target = path.resolve(target);
  const manifest = validatePackage(source); smokePackage(source);
  const nested = (parent, child) => { const rel = path.relative(parent, child); return !rel || (!rel.startsWith("..") && !path.isAbsolute(rel)); };
  if (nested(source, target) || nested(target, source) || target === path.parse(target).root || target === ROOT) throw new Error("安装源与目标目录必须独立，不能替换仓库或根目录");
  const parent = path.dirname(target), backup = `${target}.backup`;
  mkdirSync(parent, { recursive: true });
  let old = null, unknown = [];
  if (existsSync(target)) {
    if (lstatSync(target).isSymbolicLink()) throw new Error("安装目标不能是符号链接");
    if (existsSync(path.join(target, "manifest.json"))) {
      old = validatePackage(target, { allowUnknown: true }); // Modified managed files stop the update.
      unknown = filesIn(target).filter(f => f !== "manifest.json" && !(f in old.files));
    } else {
      const skill = existsSync(path.join(target, "SKILL.md")) ? readFileSync(path.join(target, "SKILL.md"), "utf8") : "";
      if (!migrateLegacy || !/^name: video-prompt-router\r?$/m.test(skill) || !existsSync(path.join(target, "scripts/route.mjs"))) throw new Error("旧包身份未确认，迁移需要 --migrate-legacy");
      const legacyIds = Object.keys(readJson(target, "references/routing-index.json").templates);
      const managed = new Set(["SKILL.md", "NOTICE.md", "scripts/route.mjs", "scripts/lib/scoring.mjs", "references/routing-index.json", "references/facet-profile.json", "references/adapters/_schema.md", ...legacyIds.map(id => `references/templates/${id}.md`), ...filesIn(target).filter(f => /^references\/adapters\/[^/]+\.json$/.test(f))]);
      unknown = filesIn(target).filter(f => !managed.has(f));
    }
    for (const rel of unknown) if (rel in manifest.files || rel === "manifest.json") throw new Error(`未知文件与新包冲突 ${rel}`);
  }
  const stage = mkdtempSync(path.join(parent, ".router-stage-"));
  let movedOld = false, movedNew = false;
  try {
    cpSync(source, stage, { recursive: true });
    for (const rel of unknown) { mkdirSync(path.dirname(path.join(stage, rel)), { recursive: true }); cpSync(path.join(target, rel), path.join(stage, rel)); }
    validatePackage(stage, { allowUnknown: true });
    if (existsSync(backup)) {
      const owned = existsSync(path.join(backup, "manifest.json")) ? readJson(backup, "manifest.json").name === "video-prompt-router" : existsSync(path.join(backup, "SKILL.md")) && /^name: video-prompt-router\r?$/m.test(readFileSync(path.join(backup, "SKILL.md"), "utf8"));
      if (!owned) throw new Error(`备份目录不属于此 Skill ${backup}`);
      safeRemove(backup, parent);
    }
    if (existsSync(target)) { rename(target, backup); movedOld = true; }
    rename(stage, target); movedNew = true;
    afterSwitch(target); validatePackage(target, { allowUnknown: true }); smokePackage(target);
    return { target, backup: movedOld ? backup : null, dataVersion: manifest.dataVersion, templateIds: manifest.templateIds, state: "installed" };
  } catch (err) {
    try {
      if (movedNew) renameSync(target, stage);
      if (movedOld) renameSync(backup, target);
    } catch (rollbackError) { throw new Error(`切换后恢复受阻：${rollbackError.message}；完整旧包保留在 ${backup}，关闭宿主后恢复。原错误：${err.message}`); }
    throw new Error(`安装失败，旧版本已保留/恢复：${err.message}。若文件被锁定，请关闭占用 Skill 的宿主后重试。`);
  } finally { if (existsSync(stage)) safeRemove(stage, parent); }
}

function generatedFiles(root) {
  return [...DERIVED, "README.md", "README_zh.md", "README_ja.md", "data/stats.json", "assets/hero.svg", ...filesIn(root, "docs").filter(f => /^docs\/(gallery|templates\/)/.test(f)), "agents/skills/seedance-prompt-library/references/style-library.md", ...filesIn(root, "agents/skills").filter(f => {
    const skillDir = f.split("/").slice(0, 3).join("/");
    const md = path.join(root, skillDir, "SKILL.md");
    return existsSync(md) && readFileSync(md, "utf8").includes(STANDALONE_SKILL_MARKER) && /(?:SKILL\.md|references\/cases\.md)$/.test(f);
  })].sort();
}
export function build(root = ROOT, { write = false, out = null, python = process.env.ROUTER_PYTHON || (process.platform === "win32" ? "python" : "python3") } = {}) {
  const inputs = inputHashes(root), version = hash(JSON.stringify(inputs)), delta = validateInputs(root);
  console.error(JSON.stringify({ added: delta.added, modified: delta.modified, removed: delta.removed, unassigned: delta.unassigned, thinCorpus: delta.thinCorpus }));
  const tempRoot = process.env.ROUTER_TEMP_ROOT || path.join(root, ".tmp");
  mkdirSync(tempRoot, { recursive: true });
  const temp = mkdtempSync(path.join(tempRoot, "router-build-")), snapshot = path.join(temp, "snapshot"), pack = path.join(temp, "package");
  try {
    mkdirSync(snapshot);
    for (const rel of COPIED) cpSync(path.join(root, rel), path.join(snapshot, rel), { recursive: true, filter: src => !/[/\\]__pycache__(?:[/\\]|$)/.test(src) });
    for (const rel of readdirSync(root).filter(f => /\.(md|svg)$/.test(f) || f === "LICENSE")) cpSync(path.join(root, rel), path.join(snapshot, rel));
    if (fingerprint(snapshot) !== version || fingerprint(root) !== version) throw new Error("复制期间输入变化，请重试快照");
    for (const script of ["router/build-lexicon.mjs", "router/build-index.mjs", "eval/build-golden.mjs"]) run(process.execPath, [script], snapshot);
    run(process.execPath, ["--test", ...filesIn(snapshot, "router").filter(f => f.endsWith(".test.mjs")), ...filesIn(snapshot, "scripts/lib").filter(f => f.endsWith(".test.mjs"))], snapshot);
    run(python, ["-m", "unittest", "discover", "-s", "agents/skills/seedance-production-workflow/scripts"], snapshot);
    run(process.execPath, ["eval/score.mjs", "--write", "--json"], snapshot);
    for (const script of ["scripts/generate-readme.mjs", "scripts/generate-skill-reference.mjs", "scripts/generate-standalone-skills.mjs"]) run(process.execPath, [script], snapshot);
    run(process.execPath, ["scripts/check-links.mjs"], snapshot);
    run(process.execPath, ["router/build-skill.mjs", pack], snapshot);
    const expected = SMOKE.map(request => JSON.parse(run(process.execPath, ["router/route.mjs", "--json", "--request", (() => { const p = path.join(temp, "request.json"); writeFileSync(p, JSON.stringify(request)); return p; })()], snapshot)));
    smokePackage(pack, expected);
    const generated = generatedFiles(snapshot), previous = existsSync(path.join(root, "data/router-build.json")) ? readJson(root, "data/router-build.json") : null;
    const stale = (previous ? Object.keys(previous.artifacts || {}) : []).filter(f => !generated.includes(f) && f !== "data/router-build.json");
    const record = { schemaVersion: 1, dataVersion: version, source: { upstreamCommit: null, note: "未显式选择可验证上游 SHA；本地输入快照，不表示最新上游" }, inputs, templateHashes: delta.templateHashes, templateIds: Object.keys(delta.templateHashes), unassignedCases: delta.unassigned, thinCorpus: delta.thinCorpus, artifacts: Object.fromEntries(generated.map(f => [f, hash(readFileSync(path.join(snapshot, f)))])), packageFiles: readJson(pack, "manifest.json").files, validation: { upstreamJs: "passed", upstreamPython: "passed", router: "passed", evaluation: "passed", packageSmoke: "passed", links: "passed" } };
    writeFileSync(path.join(snapshot, "data/router-build.json"), JSON.stringify(record, null, 2) + "\n");
    const changed = [...generated, "data/router-build.json"].filter(f => !existsSync(path.join(root, f)) || hash(readFileSync(path.join(root, f))) !== hash(readFileSync(path.join(snapshot, f))));
    if (fingerprint(root) !== version) throw new Error("构建期间工作区输入已变化，停止写回");
    if (write) {
      for (const f of stale) {
        if (existsSync(path.join(root, f)) && hash(readFileSync(path.join(root, f))) !== previous.artifacts[f]) throw new Error(`陈旧生成文件有本地修改 ${f}`);
      }
      for (const f of generated) { mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); cpSync(path.join(snapshot, f), path.join(root, f)); }
      for (const f of stale) if (existsSync(path.join(root, f))) unlinkSync(path.join(root, f));
      cpSync(path.join(snapshot, "data/router-build.json"), path.join(root, "data/router-build.json")); // Last: interrupted writes remain detectable.
    }
    if (out) installPackage(pack, path.resolve(root, out));
    if (!write && (changed.length || stale.length)) throw new Error(`派生产物陈旧：${[...changed, ...stale].join(", ")}`);
    return { dataVersion: version, changed, package: out ? path.resolve(root, out) : null, validation: record.validation };
  } finally { safeRemove(temp, tempRoot); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), flags = {}, modes = ["--check", "--write", "--status", "--install"];
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (["--check", "--write", "--status", "--migrate-legacy"].includes(arg)) flags[arg] = true;
      else if (["--install", "--target", "--out"].includes(arg) && args[i + 1] && !args[i + 1].startsWith("--")) flags[arg] = args[++i];
      else throw new Error(`未知或不完整参数 ${arg}`);
    }
    if (modes.filter(m => flags[m]).length !== 1) throw new Error("选择一个模式：--check / --write / --status / --install <包目录>");
    let result;
    if (flags["--status"] || flags["--install"]) {
      if (!flags["--target"]) throw new Error("状态/安装需要明确 --target <Skill目录>");
      result = flags["--status"] ? installationStatus(path.resolve(flags["--target"])) : installPackage(flags["--install"], flags["--target"], { migrateLegacy: !!flags["--migrate-legacy"] });
    } else result = build(ROOT, { write: !!flags["--write"], out: flags["--out"] });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
