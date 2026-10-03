#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadIndex, normalizeRequest } from "../router/route.mjs";
import { runOracle } from "./oracle.mjs";
import { evaluateRows, evaluateUserCases, evaluatePass } from "./metrics.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = rel => JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
try {
  const args = process.argv.slice(2), opts = {};
  for (let i = 0; i < args.length; i++) {
    if (["--json", "--write"].includes(args[i])) continue;
    if (!["--top", "--model"].includes(args[i]) || !args[i + 1]) throw new Error(`未知或不完整参数 ${args[i]}`);
    const key = args[i++].slice(2); opts[key] = key === "top" ? Number(args[i]) : args[i];
  }
  normalizeRequest("", opts);
  const index = loadIndex(), thresholds = read("eval/thresholds.json"), userRows = read("eval/user-cases.json").rows;
  const fixedSet = read(thresholds.fixedDataset), currentSet = read("eval/golden-set.json");
  const fixed = evaluateRows(fixedSet.rows, { ...opts, index, labels: Object.keys(fixedSet.perLabel) });
  const current = evaluateRows(currentSet.rows, { ...opts, index, labels: Object.keys(currentSet.perLabel) });
  const oracle = runOracle(read(thresholds.fixedDataset).rows, opts.top || 5, { index });
  const users = evaluateUserCases(userRows, { index });
  const report = { fixed, current, oracle: { macro: oracle.macro, micro: oracle.micro }, users, thresholds, pass: evaluatePass({ fixed, oracle, users }, thresholds) };
  if (args.includes("--write")) {
    const version = createHash("sha256").update(JSON.stringify(report)).update(readFileSync(path.join(ROOT, "router/route.mjs"))).digest("hex");
    const old = existsSync(path.join(ROOT, "data/router-stats.json")) ? read("data/router-stats.json") : {};
    const stats = { measuredAt: old.measurementVersion === version ? old.measuredAt : new Date().toLocaleDateString("sv", { timeZone: "Asia/Shanghai" }), measurementVersion: version, templates: Object.keys(index.templates).length, questions: fixed.rows, labels: fixed.labels, oracleRetention: oracle.macro, textRetention: fixed.retentionMacro, actualRetention: fixed.actualRetentionMacro, avgCandidates: fixed.avgSize, avgEligible: fixed.avgEligible, needsClarification: fixed.askedRate, userRetention: users.sufficientTop5Macro, thresholds, pass: report.pass, report };
    writeFileSync(path.join(ROOT, "data/router-stats.json"), JSON.stringify(stats, null, 2) + "\n");
    console.error("已写入 data/router-stats.json");
  }
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.pass ? 0 : 1;
} catch (err) { console.error(err.message); process.exitCode = 1; }
