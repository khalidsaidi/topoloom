import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function git(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

const repoRoot = git('git rev-parse --show-toplevel') || process.cwd();
const outPath = path.join(repoRoot, 'apps/showcase/public/build-info.json');

const sha = process.env.GITHUB_SHA || git('git rev-parse HEAD') || 'unknown';
const ref = process.env.GITHUB_REF_NAME || git('git rev-parse --abbrev-ref HEAD') || 'unknown';
const when = new Date().toISOString();

let libVersion = 'unknown';
try {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'packages/topoloom/package.json'), 'utf8'),
  );
  libVersion = pkg.version || libVersion;
} catch {}

const info = {
  product: 'TopoLoom',
  gitSha: sha,
  gitRef: ref,
  builtAt: when,
  libraryVersion: libVersion,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(info, null, 2) + '\n', 'utf8');
console.log(`Wrote ${outPath}:`, info);
