import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const targets = [
  'apps/showcase/src/pages/Landing.tsx',
  'apps/showcase/src/pages/GalleryViewer.tsx',
  'apps/showcase/src/components/CinemaControlsSheet.tsx',
  'apps/showcase/src/components/PipelineStrip.tsx',
  'apps/showcase/src/components/HUD.tsx',
  'apps/showcase/src/components/CompareLayout.tsx',
];

const pattern = /<(button|input|select|label)(?=[\s>])/g;
const violations = [];

for (const relativePath of targets) {
  const absolutePath = path.join(repoRoot, relativePath);
  const text = fs.readFileSync(absolutePath, 'utf8');
  const matches = [...text.matchAll(pattern)];
  if (matches.length === 0) continue;

  for (const match of matches) {
    const index = match.index ?? 0;
    const line = text.slice(0, index).split('\n').length;
    violations.push(`${relativePath}:${line} -> <${match[1]}>`);
  }
}

if (violations.length > 0) {
  console.error('Unstyled control tags detected in cinema-critical files:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('Cinema control check passed: no raw button/input/select/label tags found.');
