import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const directory of ['desktop', 'desktop/ui']) {
  for (const file of readdirSync(path.join(root, directory))) {
    if (!/\.(mjs|cjs|js)$/.test(file)) continue;
    const result = spawnSync(process.execPath, ['--check', path.join(root, directory, file)], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log('Desktop JavaScript syntax passed. Runtime contracts are checked by desktop:test and desktop:smoke.');
