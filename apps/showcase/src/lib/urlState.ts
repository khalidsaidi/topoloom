import type { DatasetMode } from '@/data/datasets';

const MODES: DatasetMode[] = [
  'planar-straight',
  'orthogonal',
  'planarization-straight',
  'planarization-orthogonal',
];

export type ViewerUrlState = {
  sample: string;
  mode: DatasetMode;
  maxNodes: number;
  maxEdges: number;
  seed: number;
  witness: boolean;
  labels: boolean;
  articulations: boolean;
  bridges: boolean;
  compare: boolean;
  compareModes: DatasetMode[];
  syncCompareView: boolean;
};

export type ViewerDefaults = {
  sample: string;
  mode: DatasetMode;
  maxNodes: number;
  maxEdges: number;
  seed: number;
};

const parseBool = (value: string | null, fallback: boolean) => {
  if (value === null) return fallback;
  if (value === '1') return true;
  if (value === '0') return false;
  return fallback;
};

const parseIntClamped = (value: string | null, fallback: number, min: number, max: number) => {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.floor(parsed);
  return Math.max(min, Math.min(max, rounded));
};

const asMode = (value: string | null, fallback: DatasetMode): DatasetMode => {
  if (!value) return fallback;
  return (MODES.includes(value as DatasetMode) ? value : fallback) as DatasetMode;
};

const normalizeCompareModes = (modes: DatasetMode[], selectedMode: DatasetMode): DatasetMode[] => {
  const set = new Set<DatasetMode>();
  for (const mode of modes) {
    if (MODES.includes(mode)) set.add(mode);
  }

  if (set.size === 0) {
    set.add(selectedMode.includes('planarization') ? 'planarization-straight' : 'planar-straight');
    set.add(selectedMode.includes('planarization') ? 'planarization-orthogonal' : 'orthogonal');
    set.add(selectedMode);
  }

  if (!set.has(selectedMode)) {
    set.add(selectedMode);
  }

  return [...set].slice(0, 3);
};

export function parseViewerUrlState(
  search: string,
  defaults: ViewerDefaults,
  limits: { maxNodesHard: number; maxEdgesHard: number },
): ViewerUrlState {
  const params = new URLSearchParams(search);
  const mode = asMode(params.get('mode'), defaults.mode);

  const compareModesRaw = (params.get('compareModes') ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean) as DatasetMode[];

  return {
    sample: params.get('sample') ?? defaults.sample,
    mode,
    maxNodes: parseIntClamped(params.get('maxNodes'), defaults.maxNodes, 1, limits.maxNodesHard),
    maxEdges: parseIntClamped(params.get('maxEdges'), defaults.maxEdges, 1, limits.maxEdgesHard),
    seed: parseIntClamped(params.get('seed'), defaults.seed, -2147483648, 2147483647),
    witness: parseBool(params.get('witness'), true),
    labels: parseBool(params.get('labels'), false),
    articulations: parseBool(params.get('articulations'), false),
    bridges: parseBool(params.get('bridges'), false),
    compare: parseBool(params.get('compare'), false),
    compareModes: normalizeCompareModes(compareModesRaw, mode),
    syncCompareView: parseBool(params.get('syncCompareView'), true),
  };
}

export function serializeViewerUrlState(state: ViewerUrlState): string {
  const params = new URLSearchParams();
  params.set('sample', state.sample);
  params.set('mode', state.mode);
  params.set('maxNodes', String(Math.floor(state.maxNodes)));
  params.set('maxEdges', String(Math.floor(state.maxEdges)));
  params.set('seed', String(Math.floor(state.seed)));
  params.set('witness', state.witness ? '1' : '0');
  params.set('labels', state.labels ? '1' : '0');
  params.set('articulations', state.articulations ? '1' : '0');
  params.set('bridges', state.bridges ? '1' : '0');
  params.set('compare', state.compare ? '1' : '0');
  params.set('compareModes', state.compareModes.join(','));
  params.set('syncCompareView', state.syncCompareView ? '1' : '0');
  return params.toString();
}

export const viewerModes = MODES;
