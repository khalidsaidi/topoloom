import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Graph } from '../src/graph';
import { testPlanarity } from '../src/planarity';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const loadGraph = (name: string) => {
  const file = path.join(__dirname, '../testdata', name);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Graph.fromJSON(raw);
};

describe('regression corpus', () => {
  it('classifies planar graphs', () => {
    const triangle = loadGraph('triangle.json');
    const square = loadGraph('square-diagonal.json');
    expect(testPlanarity(triangle).planar).toBe(true);
    expect(testPlanarity(square).planar).toBe(true);
  });

  it('classifies nonplanar graphs', () => {
    const k5 = loadGraph('k5.json');
    const k33 = loadGraph('k33.json');
    expect(testPlanarity(k5).planar).toBe(false);
    expect(testPlanarity(k33).planar).toBe(false);
  });
});
