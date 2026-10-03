import { readFileSync, readdirSync, existsSync, lstatSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
export const hash = bytes => createHash("sha256").update(bytes).digest("hex");
export const readJson = (root, rel) => JSON.parse(readFileSync(path.join(root, rel), "utf8"));
export function filesIn(root, rel = "") {
  const out = [];
  for (const item of readdirSync(path.join(root, rel), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    const file = rel ? `${rel}/${item.name}` : item.name;
    if (item.isSymbolicLink()) throw new Error(`不接受符号链接 ${file}`);
    if (item.isDirectory()) out.push(...filesIn(root, file)); else out.push(file);
  }
  return out;
}
const GENERATED = new Set(["router/signals.lexicon.json", "eval/golden-set.json", "eval/latest-report.json", "data/routing-index.json", "data/router-stats.json", "data/router-build.json", "data/stats.json"]);
export function inputHashes(root) {
  const files = ["package.json", ...["router", "eval", "adapters", "scripts", "data", ".github/workflows", ".claude-plugin", "submissions"].flatMap(dir => filesIn(root, dir))].filter(f => !GENERATED.has(f));
  // Python tests/scripts are inputs; generated Skill Markdown is not.
  files.push(...filesIn(root, "agents").filter(f => /\.(py|json|mjs)$/.test(f)));
  return Object.fromEntries(files.sort().map(file => [file, hash(readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n"))]));
}
export function fingerprint(root) { return hash(JSON.stringify(inputHashes(root))); }
export function templateHashes(library) { return Object.fromEntries(library.templates.map(t => [t.id, hash(JSON.stringify(t))]).sort(([a], [b]) => a.localeCompare(b))); }
export function validatePackage(dir, { allowUnknown = false } = {}) {
  const manifest = readJson(dir, "manifest.json");
  if (manifest.name !== "video-prompt-router" || manifest.schemaVersion !== 1 || !manifest.files || !Array.isArray(manifest.templateIds)) throw new Error("无效 Skill manifest");
  for (const [rel, expected] of Object.entries(manifest.files)) {
    const target = path.resolve(dir, rel), relative = path.relative(path.resolve(dir), target);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !existsSync(target) || lstatSync(target).isSymbolicLink() || hash(readFileSync(target)) !== expected) throw new Error(`包摘要冲突 ${rel}`);
  }
  const actual = filesIn(dir), managed = new Set(["manifest.json", ...Object.keys(manifest.files)]);
  if (!allowUnknown && actual.some(f => !managed.has(f))) throw new Error("包含 manifest 未登记文件");
  const index = readJson(dir, "references/routing-index.json"), facets = readJson(dir, "references/facet-profile.json");
  const ids = manifest.templateIds.slice().sort().join("|");
  if (ids !== Object.keys(index.templates).sort().join("|") || ids !== Object.keys(facets.templates).sort().join("|") || index.dataVersion !== manifest.dataVersion) throw new Error("包模板集/版本不一致");
  for (const id of manifest.templateIds) if (!manifest.files[`references/templates/${id}.md`]) throw new Error(`包缺模板正文 ${id}`);
  return manifest;
}
