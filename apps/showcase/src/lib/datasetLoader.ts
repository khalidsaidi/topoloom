export type DatasetJsonMeta = {
  id: string;
  name: string;
  sourceUrl: string;
  licenseName: string;
  licenseUrl: string;
  attribution: string;
  note: string;
};

export type DatasetJson = {
  meta: DatasetJsonMeta;
  nodes: string[];
  edges: Array<[number, number]>;
  extras?: {
    geographic?: {
      x: number[];
      y: number[];
    };
  };
};

type DatasetGeographic = NonNullable<NonNullable<DatasetJson['extras']>['geographic']>;

const COORD_LIMIT = 1e7;

const clampCoordinate = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  if (value > COORD_LIMIT) return COORD_LIMIT;
  if (value < -COORD_LIMIT) return -COORD_LIMIT;
  return value;
};

function ensureStringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing or invalid meta.${key}`);
  }
  return value;
}

function normalizeEdge(u: number, v: number): [number, number] {
  return u < v ? [u, v] : [v, u];
}

export function validateDatasetJson(raw: unknown): DatasetJson {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Dataset payload is not an object');
  }

  const record = raw as Record<string, unknown>;
  const rawMeta = record.meta;
  if (!rawMeta || typeof rawMeta !== 'object') {
    throw new Error('Dataset meta section is missing');
  }

  const metaRecord = rawMeta as Record<string, unknown>;
  const meta: DatasetJsonMeta = {
    id: ensureStringField(metaRecord, 'id'),
    name: ensureStringField(metaRecord, 'name'),
    sourceUrl: ensureStringField(metaRecord, 'sourceUrl'),
    licenseName: ensureStringField(metaRecord, 'licenseName'),
    licenseUrl: ensureStringField(metaRecord, 'licenseUrl'),
    attribution: ensureStringField(metaRecord, 'attribution'),
    note: ensureStringField(metaRecord, 'note'),
  };

  const rawNodes = record.nodes;
  if (!Array.isArray(rawNodes)) {
    throw new Error('Dataset nodes must be an array');
  }
  const nodes = rawNodes.map((value, index) => {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    throw new Error(`Dataset nodes[${index}] is not a valid node label`);
  });

  const rawEdges = record.edges;
  if (!Array.isArray(rawEdges)) {
    throw new Error('Dataset edges must be an array');
  }

  const edgeKeys = new Set<string>();
  const edges: Array<[number, number]> = [];

  for (let i = 0; i < rawEdges.length; i += 1) {
    const edge = rawEdges[i];
    if (!Array.isArray(edge) || edge.length < 2) {
      throw new Error(`Dataset edges[${i}] is malformed`);
    }
    const u = Number(edge[0]);
    const v = Number(edge[1]);
    if (!Number.isInteger(u) || !Number.isInteger(v)) {
      throw new Error(`Dataset edges[${i}] endpoints must be integers`);
    }
    if (u < 0 || u >= nodes.length || v < 0 || v >= nodes.length) {
      throw new Error(`Dataset edges[${i}] endpoints are out of range`);
    }
    if (u === v) {
      throw new Error(`Dataset edges[${i}] contains a self-loop (${u}, ${v})`);
    }
    const [a, b] = normalizeEdge(u, v);
    const key = `${a},${b}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    edges.push([a, b]);
  }

  edges.sort((a, b) => {
    if (a[0] !== b[0]) return a[0] - b[0];
    return a[1] - b[1];
  });

  const extras = record.extras;
  let geographic: DatasetGeographic | undefined;

  if (extras && typeof extras === 'object') {
    const geo = (extras as Record<string, unknown>).geographic;
    if (geo !== undefined) {
      if (!geo || typeof geo !== 'object') {
        throw new Error('Dataset extras.geographic must be an object');
      }
      const g = geo as Record<string, unknown>;
      if (!Array.isArray(g.x) || !Array.isArray(g.y)) {
        throw new Error('Dataset extras.geographic must have x/y arrays');
      }
      if (g.x.length !== nodes.length || g.y.length !== nodes.length) {
        throw new Error('Dataset extras.geographic arrays must match node count');
      }
      geographic = {
        x: g.x.map((value, index) => {
          const n = Number(value);
          if (!Number.isFinite(n)) {
            throw new Error(`Dataset extras.geographic.x[${index}] is not finite`);
          }
          return clampCoordinate(n);
        }),
        y: g.y.map((value, index) => {
          const n = Number(value);
          if (!Number.isFinite(n)) {
            throw new Error(`Dataset extras.geographic.y[${index}] is not finite`);
          }
          return clampCoordinate(n);
        }),
      };
    }
  }

  return {
    meta,
    nodes,
    edges,
    ...(geographic ? { extras: { geographic } } : {}),
  };
}

export async function loadDatasetSample(filePath: string): Promise<DatasetJson> {
  const response = await fetch(filePath);
  if (!response.ok) {
    throw new Error(`Failed to load dataset file (${response.status}): ${filePath}`);
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new Error(`Dataset JSON parse failed for ${filePath}`);
  }

  try {
    return validateDatasetJson(parsed);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Dataset validation failed for ${filePath}: ${reason}. Hint: run pnpm datasets:build to regenerate samples.`,
    );
  }
}
