import { describe, expect, it } from 'vitest';

import { validateDatasetJson } from '@/lib/datasetLoader';

describe('validateDatasetJson', () => {
  it('accepts a valid dataset payload', () => {
    const payload = {
      meta: {
        id: 'sample',
        name: 'Sample',
        sourceUrl: 'https://example.com/source',
        licenseName: 'Example License',
        licenseUrl: 'https://example.com/license',
        attribution: 'Example attribution',
        note: 'Example note',
      },
      nodes: ['0', '1', '2'],
      edges: [
        [0, 1],
        [1, 2],
      ],
    };

    const validated = validateDatasetJson(payload);
    expect(validated.nodes).toHaveLength(3);
    expect(validated.edges).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });

  it('rejects malformed datasets with clear errors', () => {
    const payload = {
      meta: {
        id: 'bad',
        name: 'Bad',
        sourceUrl: 'https://example.com/source',
        licenseName: 'Example License',
        licenseUrl: 'https://example.com/license',
        attribution: 'Example attribution',
        note: 'Example note',
      },
      nodes: ['0', '1'],
      edges: [
        [0, 2],
      ],
    };

    expect(() => validateDatasetJson(payload)).toThrow(/out of range/i);
  });
});
