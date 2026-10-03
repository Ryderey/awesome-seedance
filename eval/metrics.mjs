import { route, loadIndex } from "../router/route.mjs";
export function evaluateRows(rows, { router = route, index = loadIndex(), top = 5, model = null, labels = [...new Set(rows.map(r => r.label))] } = {}) {
  const per = new Map(labels.map(id => [id, { hits: 0, actualHits: 0, n: 0 }])); let retained = 0, first = 0, size = 0, eligible = 0, asked = 0, empty = 0;
  for (const row of rows) {
    const r = router(row.input, { index, top, model }), ids = r.shortlist.map(t => t.id);
    const hit = ids.slice(0, 5).includes(row.label), a = per.get(row.label) || { hits: 0, actualHits: 0, n: 0 };
    a.hits += Number(hit); a.actualHits += Number(ids.includes(row.label)); a.n++; per.set(row.label, a);
    retained += Number(hit); first += Number(ids[0] === row.label); size += ids.length; eligible += r.eligibleCount || 0; asked += Number(r.questions.length > 0); empty += Number(!ids.length);
  }
  const n = rows.length || 1, macro = key => per.size ? [...per.values()].reduce((s, a) => s + (a.n ? a[key] / a.n : 0), 0) / per.size : 0;
  return { retentionMacro: macro("hits"), actualRetentionMacro: macro("actualHits"), retentionMicro: retained / n, top1Micro: first / n, avgSize: size / n, avgEligible: eligible / n, eligibleRatio: eligible / n / Object.keys(index.templates).length, askedRate: asked / n, empty, labels: per.size, zeroSampleLabels: [...per].filter(([, a]) => !a.n).map(([id]) => id), rows: rows.length, per: Object.fromEntries(per) };
}
export function evaluateUserCases(rows, { router = route, index = loadIndex() } = {}) {
  const per = new Map(), failures = [], targetCoverage = Object.fromEntries(Object.keys(index.templates).map(id => [id, { zh: 0, en: 0 }])); let hardViolations = 0, unexpectedEmpty = 0, answeredQuestions = 0, afterHits = 0, afterCount = 0;
  for (const row of rows) {
    const options = { index, ...(row.facets ? { facets: row.facets } : {}), ...(row.referencePurpose ? { referencePurpose: row.referencePurpose } : {}) };
    const r = router(row.input, options), ids = r.shortlist.map(t => t.id);
    const hit = ids.slice(0, 5).some(id => row.acceptableTemplateIds.includes(id));
    if (r.shortlist.slice(0, 5).some(t => t.id === row.targetLabel && t.positiveEvidence) && targetCoverage[row.targetLabel]) targetCoverage[row.targetLabel][/[一-龥]/.test(row.input) ? "zh" : "en"]++;
    const fail = message => failures.push({ id: row.id, message, ids });
    if (!hit) fail("acceptable template absent from top 5");
    if (!ids.length) { unexpectedEmpty++; fail("unexpected empty shortlist"); }
    if (r.shortlist.some(t => t.blocked?.length || row.forbiddenTemplateIds?.includes(t.id))) { hardViolations++; fail("hard conflict in shortlist"); }
    for (const [key, value] of Object.entries(row.requiredFacets || {})) if (JSON.stringify(r.facets[key]) !== JSON.stringify(value)) { hardViolations++; fail(`facet ${key} differs`); }
    if (row.shouldClarify === true && r.status !== "needs_clarification") fail("expected clarification");
    if (row.sufficient) { const a = per.get(row.targetLabel) || [0, 0]; a[0] += Number(hit); a[1]++; per.set(row.targetLabel, a); }
    if (row.answers) {
      const known = Object.fromEntries(["durationSec", "styleMode", "shotPlan", "hasDialogue", "hasReference", "hasMusicSync", "textOnScreen", "subjects"].map(k => [k, r.facets[k]]));
      const next = router(row.input, { ...options, facets: { ...known, ...row.answers } });
      afterCount++; afterHits += Number(next.shortlist.slice(0, 5).some(t => row.acceptableTemplateIds.includes(t.id)));
      answeredQuestions += next.questions.filter(q => Object.keys(row.answers).includes(q.facet) || (q.facet === "subjects" && known.subjects.length)).length;
    }
  }
  return { sufficientTop5Macro: per.size ? [...per.values()].reduce((n, [h, count]) => n + h / count, 0) / per.size : 0, hardViolations, unexpectedEmpty, answeredQuestions, afterAnswerRetention: afterCount ? afterHits / afterCount : 0, afterCount, targetCoverage, unreachableLanguages: Object.entries(targetCoverage).flatMap(([id, counts]) => Object.entries(counts).filter(([, n]) => !n).map(([lang]) => `${id}:${lang}`)), failures, per: Object.fromEntries(per) };
}
export function evaluatePass({ fixed, oracle, users }, thresholds) {
  return users.unreachableLanguages.length === 0 && fixed.rows > 0 && fixed.retentionMacro >= thresholds.textRetentionMacroMin && fixed.eligibleRatio <= thresholds.eligibleRatioMax && fixed.avgSize <= thresholds.candidatesMax && oracle.macro >= thresholds.oracleRetentionMacroMin && users.sufficientTop5Macro >= thresholds.userSufficientTop5MacroMin && users.hardViolations <= thresholds.hardViolationsMax && users.unexpectedEmpty <= thresholds.unexpectedEmptyMax && users.answeredQuestions <= thresholds.answeredQuestionMax && users.afterAnswerRetention >= thresholds.afterAnswerRetentionMin;
}
