import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const targetDir = path.join(root, 'packages', 'topoloom', 'src');

const patterns = [
  { name: '__todo', re: /\b__todo\b/ },
  { name: 'TODO', re: /\bTODO\b/ },
  { name: 'simplified', re: /\bsimplified\b/i },
];

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile() && full.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

const files = await walk(targetDir);
const hits = [];

for (const file of files) {
  const text = await fs.readFile(file, 'utf8');
  for (const pattern of patterns) {
    if (pattern.re.test(text)) {
      hits.push({ file, pattern: pattern.name });
    }
  }
}

if (hits.length > 0) {
  console.error('Stub markers detected in kernel source:');
  for (const hit of hits) {
    console.error(`- ${hit.file} (${hit.pattern})`);
  }
  process.exit(1);
}

console.log('No stub markers found in kernel source.');
