export type DatasetMode =
  | 'planar-straight'
  | 'orthogonal'
  | 'planarization-straight'
  | 'planarization-orthogonal';

export type DatasetDomain = 'Infrastructure' | 'Roads' | 'Benchmarks' | 'Circuits' | 'Other';

export type DatasetDef = {
  id: string;
  name: string;
  domain: DatasetDomain;
  description: string;
  whyHard: string[];
  sourceUrl: string;
  licenseName: string;
  licenseUrl: string;
  sampleFiles: Array<{
    id: string;
    label: string;
    file: string;
    stats?: { nodes: number; edges: number };
    recommended: {
      mode: DatasetMode;
      maxNodes: number;
      maxEdges: number;
      seed: number;
    };
  }>;
  originalStats?: { nodes: number; edges: number };
  limits: {
    maxNodesHard: number;
    maxEdgesHard: number;
  };
};

const HARD_LIMITS = {
  maxNodesHard: 350,
  maxEdgesHard: 1200,
} as const;

export const datasets: DatasetDef[] = [
  {
    id: 'power-grid',
    name: 'Power Grid Network',
    domain: 'Infrastructure',
    description:
      'US western power-grid topology with sparse connectivity and long-range structural dependencies.',
    whyHard: [
      'Sparse but irregular degree profile.',
      'Large connected region with weak local geometry cues.',
      'Crossing-heavy naive drawings hide critical structure.',
      'Good stress test for deterministic embedding artifacts.',
    ],
    sourceUrl: 'https://datarepository.wolframcloud.com/resources/Power-Grid-Network',
    licenseName: 'Wolfram Data Repository Terms (Wolfram Cloud Terms of Use)',
    licenseUrl: 'https://www.wolfram.com/legal/terms/wolfram-cloud.html',
    sampleFiles: [
      {
        id: 'bfs-250-s1',
        label: 'BFS 250 (seed 1)',
        file: '/datasets/powergrid-bfs-250-s1.json',
        stats: { nodes: 250, edges: 297 },
        recommended: {
          mode: 'planarization-straight',
          maxNodes: 250,
          maxEdges: 800,
          seed: 1,
        },
      },
      {
        id: 'bfs-320-s7',
        label: 'BFS 320 (seed 7)',
        file: '/datasets/powergrid-bfs-320-s7.json',
        stats: { nodes: 320, edges: 399 },
        recommended: {
          mode: 'planarization-straight',
          maxNodes: 320,
          maxEdges: 1200,
          seed: 7,
        },
      },
    ],
    originalStats: { nodes: 4941, edges: 6594 },
    limits: HARD_LIMITS,
  },
  {
    id: 'roadnet-ca',
    name: 'SNAP roadNet-CA',
    domain: 'Roads',
    description:
      'Large road network with strong local planarity, large diameter, and low-degree structure from California roads.',
    whyHard: [
      'Massive scale in original corpus.',
      'Long chains amplify pan/zoom and routing artifacts.',
      'Tiny geometric perturbations can cause visual clutter.',
      'Good benchmark for topology-preserving simplification.',
    ],
    sourceUrl: 'https://snap.stanford.edu/data/roadNet-CA.html',
    licenseName: 'SNAP dataset terms (source citation requested)',
    licenseUrl: 'https://snap.stanford.edu/data/roadNet-CA.html',
    sampleFiles: [
      {
        id: 'bfs-250-s11',
        label: 'BFS 250 (seed 11)',
        file: '/datasets/roadnet-ca-bfs-250-s11.json',
        stats: { nodes: 250, edges: 336 },
        recommended: {
          mode: 'planar-straight',
          maxNodes: 250,
          maxEdges: 800,
          seed: 11,
        },
      },
      {
        id: 'bfs-340-s23',
        label: 'BFS 340 (seed 23)',
        file: '/datasets/roadnet-ca-bfs-340-s23.json',
        stats: { nodes: 340, edges: 455 },
        recommended: {
          mode: 'orthogonal',
          maxNodes: 340,
          maxEdges: 1200,
          seed: 23,
        },
      },
    ],
    originalStats: { nodes: 1965206, edges: 2766607 },
    limits: HARD_LIMITS,
  },
  {
    id: 'bu4p',
    name: 'Graph Drawing BU4P Benchmarks',
    domain: 'Benchmarks',
    description:
      'Biconnected planar degree-4 graphs from BU4P benchmark suites used in graph-drawing research.',
    whyHard: [
      'Many near-symmetric alternatives for embeddings.',
      'Face and block structure must remain stable under reruns.',
      'Good target for BC/SPQR report-card diagnostics.',
      'Highlights deterministic tie-breaking quality.',
    ],
    sourceUrl: 'https://graphdrawing.unipg.it/data.html',
    licenseName: 'Graph Drawing benchmark terms (publicly available datasets as stated on source hub)',
    licenseUrl: 'https://graphdrawing.unipg.it/data.html',
    sampleFiles: [
      {
        id: 'g00100-01',
        label: 'BU4P g.00100.01',
        file: '/datasets/benchmark-bu4p-g00100-01.json',
        stats: { nodes: 100, edges: 140 },
        recommended: {
          mode: 'planar-straight',
          maxNodes: 100,
          maxEdges: 300,
          seed: 1,
        },
      },
      {
        id: 'g00200-01',
        label: 'BU4P g.00200.01',
        file: '/datasets/benchmark-bu4p-g00200-01.json',
        stats: { nodes: 200, edges: 266 },
        recommended: {
          mode: 'orthogonal',
          maxNodes: 200,
          maxEdges: 500,
          seed: 1,
        },
      },
      {
        id: 'g00300-01',
        label: 'BU4P g.00300.01',
        file: '/datasets/benchmark-bu4p-g00300-01.json',
        stats: { nodes: 300, edges: 492 },
        recommended: {
          mode: 'orthogonal',
          maxNodes: 300,
          maxEdges: 800,
          seed: 1,
        },
      },
    ],
    limits: HARD_LIMITS,
  },
  {
    id: 'hamm-circuits',
    name: 'SuiteSparse Hamm Circuits',
    domain: 'Circuits',
    description:
      'Circuit simulation sparsity patterns from Hamm add20/add32 matrices converted to undirected topology graphs.',
    whyHard: [
      'Heterogeneous degree distribution with hub-like constraints.',
      'Nonplanar motifs appear quickly under induced sampling.',
      'Useful for witness extraction and planarization paths.',
      'SPQR summaries expose rigid substructures.',
    ],
    sourceUrl: 'https://sparse.tamu.edu/Hamm',
    licenseName: 'SuiteSparse Matrix Collection terms (matrices: CC-BY 4.0)',
    licenseUrl: 'https://sparse.tamu.edu/about',
    sampleFiles: [
      {
        id: 'add20',
        label: 'add20 sample',
        file: '/datasets/suitesparse-hamm-add20-sample.json',
        stats: { nodes: 250, edges: 800 },
        recommended: {
          mode: 'planarization-orthogonal',
          maxNodes: 250,
          maxEdges: 800,
          seed: 5,
        },
      },
      {
        id: 'add32',
        label: 'add32 sample',
        file: '/datasets/suitesparse-hamm-add32-sample.json',
        stats: { nodes: 300, edges: 623 },
        recommended: {
          mode: 'planarization-straight',
          maxNodes: 300,
          maxEdges: 1000,
          seed: 9,
        },
      },
    ],
    originalStats: { nodes: 4960, edges: 9462 },
    limits: HARD_LIMITS,
  },
  {
    id: 'osm-downtown-sf',
    name: 'OpenStreetMap Downtown SF',
    domain: 'Other',
    description:
      'Fixed downtown San Francisco extract converted into an intersection graph with preserved geographic baseline.',
    whyHard: [
      'Road geometry and topology diverge under naive layout.',
      'Intersections include dense local motifs and long connectors.',
      'Geographic baseline enables explicit compare against topology-first output.',
      'ODbL attribution requirements must be handled correctly.',
    ],
    sourceUrl: 'https://www.openstreetmap.org',
    licenseName: 'Open Database License (ODbL) 1.0',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/',
    sampleFiles: [
      {
        id: 'downtown-sf-bfs-220-s3',
        label: 'Downtown SF 220 (seed 3)',
        file: '/datasets/osm-downtown-sf-bfs-220-s3.json',
        stats: { nodes: 220, edges: 274 },
        recommended: {
          mode: 'planar-straight',
          maxNodes: 220,
          maxEdges: 800,
          seed: 3,
        },
      },
      {
        id: 'downtown-sf-bfs-320-s17',
        label: 'Downtown SF 320 (seed 17)',
        file: '/datasets/osm-downtown-sf-bfs-320-s17.json',
        stats: { nodes: 320, edges: 423 },
        recommended: {
          mode: 'orthogonal',
          maxNodes: 320,
          maxEdges: 1100,
          seed: 17,
        },
      },
    ],
    originalStats: { nodes: 6595, edges: 9053 },
    limits: HARD_LIMITS,
  },
];

export const datasetById = new Map(datasets.map((dataset) => [dataset.id, dataset]));

export function getDatasetById(datasetId: string): DatasetDef | undefined {
  return datasetById.get(datasetId);
}

export function getDefaultSample(dataset: DatasetDef) {
  return dataset.sampleFiles[0] ?? null;
}
