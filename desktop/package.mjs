import { cp, mkdir, readFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { packager } from '@electron/packager';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = path.join(root, '.tmp/desktop-stage');
const out = path.join(root, 'dist/desktop');
async function removeWithin(target, base) {
  const relative = path.relative(path.resolve(base), path.resolve(target));
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Unsafe package path');
  await rm(target, { recursive: true, force: true });
}
await removeWithin(stage, path.join(root, '.tmp'));
await removeWithin(out, path.join(root, 'dist'));
await mkdir(stage, { recursive: true });
for (const entry of ['data', 'scripts/lib', 'LICENSE', 'package.json', 'package-lock.json']) await cp(path.join(root, entry), path.join(stage, entry), { recursive: true });
await mkdir(path.join(stage, 'desktop/ui'), { recursive: true });
for (const entry of ['main.mjs', 'preload.cjs', 'catalog.mjs', 'agent.mjs', 'settings.mjs', 'headers.mjs', 'search-semantics.mjs', 'ui/index.html', 'ui/app.js', 'ui/styles.css']) await cp(path.join(root, 'desktop', entry), path.join(stage, 'desktop', entry));
if (!process.env.npm_execpath) throw new Error('Run through npm run desktop:package');
const localCache = path.join(root, '.tmp/npm-cache');
const install = spawnSync(process.execPath, [process.env.npm_execpath, 'ci', '--omit=dev', '--ignore-scripts', '--offline', ...(existsSync(localCache) ? ['--cache', localCache] : [])], { cwd: stage, stdio: 'inherit' });
if (install.status !== 0) throw new Error('Runtime dependency staging failed');
const electronVersion = JSON.parse(await readFile(path.join(root, 'node_modules/electron/package.json'), 'utf8')).version;
async function findZip(dir) {
  if (!existsSync(dir)) return undefined;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { const found = await findZip(full); if (found) return found; }
    else if (entry.name === `electron-v${electronVersion}-win32-x64.zip`) return path.dirname(full);
  }
}
const electronZipDir = await findZip(path.join(root, '.tmp/electron-cache'));
const paths = await packager({ dir: stage, out, name: 'Video Prompt Library', platform: 'win32', arch: 'x64', electronVersion, electronZipDir, overwrite: true, prune: false, asar: true, executableName: 'VideoPromptLibrary' });
await removeWithin(stage, path.join(root, '.tmp'));
console.log(paths.join('\n'));
