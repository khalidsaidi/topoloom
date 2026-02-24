import type { DatasetMode } from '@/data/datasets';

export type WorkerStage =
  | 'sample'
  | 'build-graph'
  | 'planarity'
  | 'embedding'
  | 'layout'
  | 'report'
  | 'serialize';

export type WorkerPartial =
  | {
      kind: 'sample';
      visited: number[];
    }
  | {
      kind: 'witness';
      witnessKind: 'K5' | 'K33' | 'unknown';
      edges: [number, number][];
    }
  | {
      kind: 'faces';
      faceSizes: number[];
    }
  | {
      kind: 'layoutTarget';
      positions: Array<[number, number, number]>;
    };

export type WorkerComputePayload = {
  datasetId: string;
  sampleId: string;
  nodes: string[];
  edges: [number, number][];
  settings: {
    mode: DatasetMode;
    maxNodes: number;
    maxEdges: number;
    seed: number;
    showWitness: boolean;
  };
};

export type WorkerResult = {
  timingsMs: Record<string, number>;
  sampledGraph: {
    nodes: string[];
    edges: [number, number][];
    originalNodeIndices?: number[];
  };
  sampledStats: { nodes: number; edges: number; components: number; maxDegree: number };
  planarity: {
    isPlanar: boolean;
    witness?: { kind: 'K5' | 'K33' | 'unknown'; edgePairs: [number, number][]; edgeIds?: number[] };
    embeddingAvailable: boolean;
  };
  report: {
    faces?: { count: number; sizes: number[] };
    biconnected: { blocks: number; articulationPoints: number; bridges: number };
    spqr?: { nodes: number; counts: { S: number; P: number; R: number; Q: number } };
  };
  layout: {
    mode: string;
    crossings?: number;
    bends?: number;
    positions: Array<[number, { x: number; y: number }]>;
    edgeRoutes?: Array<{ edge: [number, number]; points: Array<{ x: number; y: number }> }>;
    bbox: { minX: number; minY: number; maxX: number; maxY: number };
  };
  highlights: {
    witnessEdges?: Array<[number, number]>;
    articulationPoints?: number[];
    bridges?: Array<[number, number]>;
  };
};

type WorkerRequestMessage =
  | {
      type: 'compute';
      requestId: string;
      payload: WorkerComputePayload;
    }
  | {
      type: 'cancel';
      requestId: string;
    };

type WorkerResponseMessage =
  | {
      type: 'progress';
      requestId: string;
      stage: WorkerStage;
      detail?: string;
    }
  | {
      type: 'partial';
      requestId: string;
      partial: WorkerPartial;
    }
  | {
      type: 'result';
      requestId: string;
      result: WorkerResult;
    }
  | {
      type: 'error';
      requestId: string;
      error: { stage?: string; message: string; stack?: string };
    };

type PendingRequest = {
  resolve: (result: WorkerResult) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: { stage: WorkerStage; detail?: string }) => void;
  onPartial?: (partial: WorkerPartial) => void;
  cleanupAbort?: () => void;
};

let requestCounter = 0;

function makeRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  requestCounter += 1;
  return `req-${Date.now()}-${requestCounter}`;
}

export class TopoloomWorkerClient {
  private worker: Worker;

  private pending = new Map<string, PendingRequest>();

  constructor() {
    this.worker = new Worker(new URL('../workers/topoloomWorker.ts', import.meta.url), {
      type: 'module',
      name: 'topoloom-worker',
    });

    this.worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
      const message = event.data;
      if (!message || typeof message !== 'object') return;
      const entry = this.pending.get(message.requestId);
      if (!entry) return;

      if (message.type === 'progress') {
        entry.onProgress?.({ stage: message.stage, detail: message.detail });
        return;
      }

      if (message.type === 'partial') {
        entry.onPartial?.(message.partial);
        return;
      }

      if (message.type === 'result') {
        entry.cleanupAbort?.();
        this.pending.delete(message.requestId);
        entry.resolve(message.result);
        return;
      }

      if (message.type === 'error') {
        entry.cleanupAbort?.();
        this.pending.delete(message.requestId);
        const err = new Error(message.error.message);
        if (message.error.stack) err.stack = message.error.stack;
        entry.reject(err);
      }
    };

    this.worker.onerror = (event) => {
      for (const [, pending] of this.pending) {
        pending.reject(new Error(event.message || 'Topoloom worker crashed'));
      }
      this.pending.clear();
    };
  }

  compute(
    payload: WorkerComputePayload,
    options: {
      onProgress?: (progress: { stage: WorkerStage; detail?: string }) => void;
      onPartial?: (partial: WorkerPartial) => void;
      signal?: AbortSignal;
    } = {},
  ): Promise<WorkerResult> {
    const requestId = makeRequestId();

    return new Promise<WorkerResult>((resolve, reject) => {
      this.pending.set(requestId, {
        resolve,
        reject,
        onProgress: options.onProgress,
        onPartial: options.onPartial,
      });

      if (options.signal) {
        const abortHandler = () => {
          this.cancel(requestId);
          const current = this.pending.get(requestId);
          current?.cleanupAbort?.();
          this.pending.delete(requestId);
          reject(new Error('Computation cancelled'));
        };
        options.signal.addEventListener('abort', abortHandler, { once: true });
        const pending = this.pending.get(requestId);
        if (pending) {
          pending.cleanupAbort = () => {
            options.signal?.removeEventListener('abort', abortHandler);
          };
        }
      }

      const message: WorkerRequestMessage = {
        type: 'compute',
        requestId,
        payload,
      };
      this.worker.postMessage(message);
    });
  }

  cancel(requestId: string) {
    const message: WorkerRequestMessage = { type: 'cancel', requestId };
    this.worker.postMessage(message);
  }

  terminate() {
    this.worker.terminate();
    this.pending.clear();
  }
}

let singleton: TopoloomWorkerClient | null = null;

export function getTopoloomWorkerClient() {
  if (!singleton) singleton = new TopoloomWorkerClient();
  return singleton;
}
