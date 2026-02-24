import { z } from 'zod';

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

const metaSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  sourceUrl: z.string().trim().url(),
  licenseName: z.string().trim().min(1),
  licenseUrl: z.string().trim().url(),
  attribution: z.string().trim().min(1),
  note: z.string().trim().min(1),
});

const rawDatasetSchema = z.object({
  meta: metaSchema,
  nodes: z.array(z.union([z.string(), z.number()])),
  edges: z.array(z.tuple([z.coerce.number(), z.coerce.number()])),
  extras: z
    .object({
      geographic: z
        .object({
          x: z.array(z.coerce.number()),
          y: z.array(z.coerce.number()),
        })
        .optional(),
    })
    .optional(),
});

function normalizeEdge(u: number, v: number): [number, number] {
  return u < v ? [u, v] : [v, u];
}

function parseDataset(raw: unknown): DatasetJson {
  const parsed = rawDatasetSchema.parse(raw);
  const nodes = parsed.nodes.map((value, index) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) return trimmed;
      throw new Error(`Dataset nodes[${index}] is empty`);
    }
    if (Number.isFinite(value)) return String(value);
    throw new Error(`Dataset nodes[${index}] is not a valid node label`);
  });

  const edgeKeys = new Set<string>();
  const edges: Array<[number, number]> = [];

  for (let i = 0; i < parsed.edges.length; i += 1) {
    const [uRaw, vRaw] = parsed.edges[i];
    const u = Math.trunc(uRaw);
    const v = Math.trunc(vRaw);

    if (!Number.isFinite(uRaw) || !Number.isFinite(vRaw) || uRaw !== u || vRaw !== v) {
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

  let geographic: DatasetGeographic | undefined;
  if (parsed.extras?.geographic) {
    const geo = parsed.extras.geographic;
    if (geo.x.length !== nodes.length || geo.y.length !== nodes.length) {
      throw new Error('Dataset extras.geographic arrays must match node count');
    }
    geographic = {
      x: geo.x.map((value, index) => {
        if (!Number.isFinite(value)) {
          throw new Error(`Dataset extras.geographic.x[${index}] is not finite`);
        }
        return clampCoordinate(value);
      }),
      y: geo.y.map((value, index) => {
        if (!Number.isFinite(value)) {
          throw new Error(`Dataset extras.geographic.y[${index}] is not finite`);
        }
        return clampCoordinate(value);
      }),
    };
  }

  return {
    meta: parsed.meta,
    nodes,
    edges,
    ...(geographic ? { extras: { geographic } } : {}),
  };
}

export function validateDatasetJson(raw: unknown): DatasetJson {
  try {
    return parseDataset(raw);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      const path = issue?.path.length ? issue.path.join('.') : 'dataset';
      throw new Error(`Missing or invalid ${path}: ${issue?.message ?? 'unknown error'}`);
    }
    throw error;
  }
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
