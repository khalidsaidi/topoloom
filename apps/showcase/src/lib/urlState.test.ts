import { describe, expect, it } from 'vitest';

import { parseViewerUrlState, serializeViewerUrlState } from '@/lib/urlState';

const defaults = {
  sample: 'bfs-250-s1',
  mode: 'planar-straight' as const,
  maxNodes: 250,
  maxEdges: 800,
  seed: 1,
};

const limits = {
  maxNodesHard: 350,
  maxEdgesHard: 1200,
};

describe('urlState roundtrip + clamping', () => {
  it('clamps and normalizes invalid values', () => {
    const parsed = parseViewerUrlState(
      '?sample=x&mode=invalid&maxNodes=9999&maxEdges=-2&seed=42&witness=0&labels=1&articulations=1&bridges=0&compare=1&compareModes=orthogonal,planarization-straight&syncCompareView=0',
      defaults,
      limits,
    );

    expect(parsed.mode).toBe('planar-straight');
    expect(parsed.maxNodes).toBe(350);
    expect(parsed.maxEdges).toBe(1);
    expect(parsed.witness).toBe(false);
    expect(parsed.labels).toBe(true);
    expect(parsed.compare).toBe(true);
  });

  it('serialize(parse(url)) is stable with clamped values', () => {
    const parsed = parseViewerUrlState(
      '?sample=s1&mode=orthogonal&maxNodes=301&maxEdges=901&seed=17&witness=1&labels=0&articulations=0&bridges=1&compare=1&compareModes=orthogonal,planar-straight&syncCompareView=1',
      defaults,
      limits,
    );
    const encoded = serializeViewerUrlState(parsed);
    const reparsed = parseViewerUrlState(`?${encoded}`, defaults, limits);
    expect(reparsed).toEqual(parsed);
  });
});
