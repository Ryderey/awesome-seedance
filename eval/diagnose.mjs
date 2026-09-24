import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { route, loadIndex } from '../router/route.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const golden = JSON.parse(readFileSync(path.join(ROOT, 'eval/golden-set.json'), 'utf8'));
const index = loadIndex();

const byCause = new Map();
const lostIds = new Map();
const examples = [];

for (const row of golden.rows) {
  const r = route(row.input, { top: 25, index });
  const inList = r.shortlist.some((c) => c.id === row.label);
  if (inList) continue;
  const blocked = r.blockedExamples.find((b) => b.id === row.label);
  const cause = blocked ? (blocked.blocked[0].match(/^(模板主角限定|模板要实拍|模板要动画|模板是|输入要|模板依赖|模板建议|不需要卡点|没有参考图)/)?.[0] || '被否决(其他)') : '未进前五(排序不够高)';
  byCause.set(cause, (byCause.get(cause) || 0) + 1);
  lostIds.set(row.label, (lostIds.get(row.label) || 0) + 1);
  if (examples.length < 8 && blocked) examples.push(`${row.label} ← ${blocked.blocked[0]}   [输入: ${row.input.slice(0, 60)}...]`);
}

console.log('正确答案没进候选的原因分布：');
for (const [k, n] of [...byCause.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${k}`);
console.log('\n丢失最多的标签：');
for (const [k, n] of [...lostIds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${String(n).padStart(3)}  ${k}`);
console.log('\n样例：');
for (const e of examples) console.log('  ' + e);
