import type { EdgeId, VertexId } from '../graph';
import type { RotationSystem } from '../embedding';

export type PlanarityEdgeSpec = { id: EdgeId; u: VertexId; v: VertexId };

const pairKey = (u: VertexId, v: VertexId) => (u < v ? `${u}:${v}` : `${v}:${u}`);

class Interval {
  low: number | null;
  high: number | null;

  constructor(low: number | null = null, high: number | null = null) {
    this.low = low;
    this.high = high;
  }

  empty(): boolean {
    return this.low === null && this.high === null;
  }
}

class ConflictPair {
  L: Interval;
  R: Interval;

  constructor(left: Interval | null = null, right: Interval | null = null) {
    this.L = left ?? new Interval();
    this.R = right ?? new Interval();
  }
}

type Frame =
  | { type: 'vertex'; v: number; parentEdge: number; iter: number; depth: number }
  | { type: 'post'; edge: number; parentEdge: number; parentVertex: number };

class LRPlanarity {
  private readonly n: number;
  private readonly edges: PlanarityEdgeSpec[];
  private readonly adj: number[][];
  private readonly outEdges: number[][];

  private readonly edgeFrom: number[];
  private readonly edgeTo: number[];
  private readonly height: number[];
  private readonly parentEdge: number[];
  private readonly lowpt: number[];
  private readonly lowpt2: number[];
  private readonly nestingDepth: number[];

  private roots: number[] = [];

  private stack: ConflictPair[] = [];
  private readonly lowptEdge: number[];
  private readonly stackBottom: Array<ConflictPair | null>;
  private readonly ref: number[];
  private readonly side: number[];

  private orderedAdj: number[][] = [];
  private readonly embeddingAdj: number[][];
  private readonly leftRef: Array<number | null>;
  private readonly rightRef: Array<number | null>;

  constructor(n: number, edges: PlanarityEdgeSpec[]) {
    this.n = n;
    this.edges = edges;
    this.adj = Array.from({ length: n }, () => []);
    this.outEdges = Array.from({ length: n }, () => []);

    edges.forEach((edge, index) => {
      this.adj[edge.u]?.push(index);
      this.adj[edge.v]?.push(index);
    });

    const m = edges.length;
    this.edgeFrom = Array(m).fill(-1);
    this.edgeTo = Array(m).fill(-1);
    this.height = Array(n).fill(-1);
    this.parentEdge = Array(n).fill(-1);
    this.lowpt = Array(m).fill(0);
    this.lowpt2 = Array(m).fill(0);
    this.nestingDepth = Array(m).fill(0);
    this.lowptEdge = Array(m).fill(-1);
    this.stackBottom = Array(m).fill(null);
    this.ref = Array(m).fill(-1);
    this.side = Array(m).fill(1);

    this.embeddingAdj = Array.from({ length: n }, () => []);
    this.leftRef = Array(n).fill(null);
    this.rightRef = Array(n).fill(null);
  }

  private updateLowpt(parent: number, child: number) {
    if (this.lowpt[child] < this.lowpt[parent]) {
      this.lowpt2[parent] = Math.min(this.lowpt[parent], this.lowpt2[parent]);
      this.lowpt[parent] = this.lowpt[child];
    } else if (this.lowpt[child] > this.lowpt[parent]) {
      this.lowpt2[parent] = Math.min(this.lowpt2[parent], this.lowpt[child]);
    } else {
      this.lowpt2[parent] = Math.min(this.lowpt2[parent], this.lowpt2[child]);
    }
  }

  private orientEdges() {
    const stack: Frame[] = [];
    for (let root = 0; root < this.n; root += 1) {
      if (this.height[root] !== -1) continue;
      this.roots.push(root);
      stack.push({ type: 'vertex', v: root, parentEdge: -1, iter: 0, depth: 0 });

      while (stack.length > 0) {
        const frame = stack[stack.length - 1];
        if (!frame) break;

        if (frame.type === 'post') {
          const edgeIdx = frame.edge;
          const v = frame.parentVertex;
          this.nestingDepth[edgeIdx] =
            2 * this.lowpt[edgeIdx] + (this.lowpt2[edgeIdx] < this.height[v] ? 1 : 0);
          if (frame.parentEdge !== -1) this.updateLowpt(frame.parentEdge, edgeIdx);
          stack.pop();
          continue;
        }

        if (frame.iter === 0 && this.height[frame.v] === -1) {
          this.height[frame.v] = frame.depth;
          if (frame.parentEdge !== -1) this.parentEdge[frame.v] = frame.parentEdge;
        }

        if (frame.iter >= (this.adj[frame.v]?.length ?? 0)) {
          stack.pop();
          continue;
        }

        const edgeIdx = this.adj[frame.v]?.[frame.iter++] ?? -1;
        if (edgeIdx === -1) continue;
        if (edgeIdx === frame.parentEdge) continue;
        if (this.edgeFrom[edgeIdx] !== -1) continue;

        const edge = this.edges[edgeIdx];
        const to = edge.u === frame.v ? edge.v : edge.u;
        this.edgeFrom[edgeIdx] = frame.v;
        this.edgeTo[edgeIdx] = to;
        this.outEdges[frame.v]?.push(edgeIdx);
        this.lowpt[edgeIdx] = this.height[frame.v];
        this.lowpt2[edgeIdx] = this.height[frame.v];

        if (this.height[to] === -1) {
          stack.push({ type: 'post', edge: edgeIdx, parentEdge: frame.parentEdge, parentVertex: frame.v });
          stack.push({
            type: 'vertex',
            v: to,
            parentEdge: edgeIdx,
            iter: 0,
            depth: this.height[frame.v] + 1,
          });
        } else {
          this.lowpt[edgeIdx] = this.height[to];
          this.nestingDepth[edgeIdx] =
            2 * this.lowpt[edgeIdx] + (this.lowpt2[edgeIdx] < this.height[frame.v] ? 1 : 0);
          if (frame.parentEdge !== -1) this.updateLowpt(frame.parentEdge, edgeIdx);
        }
      }
    }
  }

  private lowest(pair: ConflictPair): number {
    if (pair.L.empty()) return this.lowpt[pair.R.low ?? 0];
    if (pair.R.empty()) return this.lowpt[pair.L.low ?? 0];
    return Math.min(this.lowpt[pair.L.low ?? 0], this.lowpt[pair.R.low ?? 0]);
  }

  private conflicting(interval: Interval, edge: number): boolean {
    return !interval.empty() && this.lowpt[interval.high ?? 0] > this.lowpt[edge];
  }

  private addConstraints(edge: number, parent: number): boolean {
    const P = new ConflictPair();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const Q = this.stack.pop();
      if (!Q) return false;
      if (!Q.L.empty()) {
        const tmp = Q.L;
        Q.L = Q.R;
        Q.R = tmp;
      }
      if (!Q.L.empty()) return false;
      if (this.lowpt[Q.R.low ?? 0] > this.lowpt[parent]) {
        if (P.R.empty()) {
          P.R.high = Q.R.high;
        } else if (P.R.low !== null) {
          this.ref[P.R.low] = Q.R.high ?? -1;
        }
        P.R.low = Q.R.low;
      } else {
        if (Q.R.low !== null) this.ref[Q.R.low] = this.lowptEdge[parent];
      }

      const bottom = this.stackBottom[edge];
      if (bottom === null ? this.stack.length === 0 : this.stack[this.stack.length - 1] === bottom) {
        break;
      }
    }

    while (
      this.stack.length > 0 &&
      (this.conflicting(this.stack[this.stack.length - 1]?.L ?? new Interval(), edge) ||
        this.conflicting(this.stack[this.stack.length - 1]?.R ?? new Interval(), edge))
    ) {
      const Q = this.stack.pop();
      if (!Q) return false;
      if (this.conflicting(Q.R, edge)) {
        const tmp = Q.L;
        Q.L = Q.R;
        Q.R = tmp;
      }
      if (this.conflicting(Q.R, edge)) return false;
      if (P.R.low !== null) this.ref[P.R.low] = Q.R.high ?? -1;
      if (Q.R.low !== null) P.R.low = Q.R.low;
      if (P.L.empty()) {
        P.L.high = Q.L.high;
      } else if (P.L.low !== null) {
        this.ref[P.L.low] = Q.L.high ?? -1;
      }
      P.L.low = Q.L.low;
    }

    if (!P.L.empty() || !P.R.empty()) this.stack.push(P);
    return true;
  }

  private checkPlanarity(v: number): boolean {
    const pEdge = this.parentEdge[v];
    const ordered = this.orderedAdj[v] ?? [];

    for (let i = 0; i < ordered.length; i += 1) {
      const edge = ordered[i] ?? -1;
      if (edge === -1) continue;
      const to = this.edgeTo[edge];
      this.stackBottom[edge] = this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;

      if (this.parentEdge[to] === edge) {
        if (!this.checkPlanarity(to)) return false;
      } else {
        this.lowptEdge[edge] = edge;
        this.stack.push(new ConflictPair(null, new Interval(edge, edge)));
      }

      if (this.lowpt[edge] < this.height[v]) {
        if (i === 0) {
          if (pEdge !== -1) this.lowptEdge[pEdge] = this.lowptEdge[edge];
        } else if (!this.addConstraints(edge, pEdge)) {
          return false;
        }
      }
    }

    if (pEdge !== -1) {
      const p = this.edgeFrom[pEdge];
      while (this.stack.length > 0 && this.lowest(this.stack[this.stack.length - 1]) === this.height[p]) {
        const P = this.stack.pop();
        if (P?.L.low !== null) this.side[P.L.low] = -1;
      }
      if (this.stack.length > 0) {
        const P = this.stack.pop();
        if (!P) return false;
        while (P.L.high !== null && this.edgeTo[P.L.high] === p) {
          P.L.high = this.ref[P.L.high] !== -1 ? this.ref[P.L.high] : null;
        }
        if (P.L.high === null && P.L.low !== null) {
          this.ref[P.L.low] = P.R.low ?? -1;
          this.side[P.L.low] = -1;
          P.L.low = null;
        }
        while (P.R.high !== null && this.edgeTo[P.R.high] === p) {
          P.R.high = this.ref[P.R.high] !== -1 ? this.ref[P.R.high] : null;
        }
        if (P.R.high === null && P.R.low !== null) {
          this.ref[P.R.low] = P.L.low ?? -1;
          this.side[P.R.low] = -1;
          P.R.low = null;
        }
        this.stack.push(P);
      }

      if (this.lowpt[pEdge] < this.height[p] && this.stack.length > 0) {
        const top = this.stack[this.stack.length - 1];
        const H_l = top.L.high;
        const H_r = top.R.high;
        if (H_l !== null && (H_r === null || this.lowpt[H_l] > this.lowpt[H_r ?? 0])) {
          this.ref[pEdge] = H_l;
        } else {
          this.ref[pEdge] = H_r ?? -1;
        }
      }
    }

    return true;
  }

  private sign(edge: number): number {
    const ref = this.ref[edge];
    if (ref !== -1) {
      this.side[edge] *= this.sign(ref);
      this.ref[edge] = -1;
    }
    return this.side[edge];
  }

  private dfsEmbedding(v: number) {
    const ordered = this.orderedAdj[v] ?? [];
    for (const edge of ordered) {
      const to = this.edgeTo[edge];
      if (this.parentEdge[to] === edge) {
        this.embeddingAdj[to]?.unshift(edge);
        this.leftRef[v] = edge;
        this.rightRef[v] = edge;
        this.dfsEmbedding(to);
      } else if (this.side[edge] === 1) {
        const ref = this.rightRef[to];
        const list = this.embeddingAdj[to];
        const idx = ref === null ? list.length - 1 : list.indexOf(ref);
        list.splice(Math.max(idx + 1, 0), 0, edge);
      } else {
        const ref = this.leftRef[to];
        const list = this.embeddingAdj[to];
        const idx = ref === null ? 0 : list.indexOf(ref);
        list.splice(Math.max(idx, 0), 0, edge);
        this.leftRef[to] = edge;
      }
    }
  }

  run(): RotationSystem | null {
    if (this.n <= 1) {
      return { order: Array.from({ length: this.n }, () => []) };
    }
    this.orientEdges();

    this.orderedAdj = Array.from({ length: this.n }, (_, v) =>
      (this.outEdges[v] ?? []).slice().sort((a, b) => {
        const da = this.nestingDepth[a] - this.nestingDepth[b];
        if (da !== 0) return da;
        return this.edges[a]?.id - this.edges[b]?.id;
      }),
    );

    for (const root of this.roots) {
      if (!this.checkPlanarity(root)) return null;
    }

    for (let i = 0; i < this.edges.length; i += 1) {
      this.nestingDepth[i] = this.nestingDepth[i] * this.sign(i);
    }

    this.orderedAdj = Array.from({ length: this.n }, (_, v) =>
      (this.outEdges[v] ?? []).slice().sort((a, b) => {
        const da = this.nestingDepth[a] - this.nestingDepth[b];
        if (da !== 0) return da;
        return this.edges[a]?.id - this.edges[b]?.id;
      }),
    );

    for (let v = 0; v < this.n; v += 1) {
      this.embeddingAdj[v] = (this.orderedAdj[v] ?? []).slice();
    }

    for (const root of this.roots) {
      this.dfsEmbedding(root);
    }

    const order: RotationSystem['order'] = Array.from({ length: this.n }, () => []);
    for (let v = 0; v < this.n; v += 1) {
      const list = this.embeddingAdj[v] ?? [];
      const output = order[v];
      for (const edgeIdx of list) {
        const edge = this.edges[edgeIdx];
        if (!edge) continue;
        const other = this.edgeFrom[edgeIdx] === v ? this.edgeTo[edgeIdx] : this.edgeFrom[edgeIdx];
        output?.push({ edge: edge.id, to: other as VertexId });
      }
    }

    return { order };
  }
}

const suppressDegreeTwo = (edges: Array<[VertexId, VertexId]>): Array<[VertexId, VertexId]> => {
  let changed = true;
  let current = edges.slice();

  while (changed) {
    changed = false;
    const degrees = new Map<VertexId, number>();
    for (const [u, v] of current) {
      degrees.set(u, (degrees.get(u) ?? 0) + 1);
      degrees.set(v, (degrees.get(v) ?? 0) + 1);
    }
    for (const [v, deg] of degrees.entries()) {
      if (deg !== 2) continue;
      const incident = current.filter(([u, w]) => u === v || w === v);
      if (incident.length !== 2) continue;
      const [e1, e2] = incident;
      const a = e1[0] === v ? e1[1] : e1[0];
      const b = e2[0] === v ? e2[1] : e2[0];
      current = current.filter((edge) => edge !== e1 && edge !== e2);
      if (a !== b) current.push([a, b]);
      changed = true;
      break;
    }
  }

  return current;
};

const classifyWitness = (edges: Array<[VertexId, VertexId]>): 'K5' | 'K3,3' => {
  const reduced = suppressDegreeTwo(edges).filter(([u, v]) => u !== v);
  const vertices = Array.from(new Set(reduced.flat()));

  const uniqueEdges = new Set<string>();
  for (const [u, v] of reduced) uniqueEdges.add(pairKey(u, v));

  if (vertices.length === 5 && uniqueEdges.size === 10) return 'K5';

  if (vertices.length === 6 && uniqueEdges.size === 9) {
    const adj = new Map<VertexId, VertexId[]>();
    for (const v of vertices) adj.set(v, []);
    for (const [u, v] of reduced) {
      adj.get(u)?.push(v);
      adj.get(v)?.push(u);
    }
    const color = new Map<VertexId, number>();
    let ok = true;
    for (const v of vertices) {
      if (color.has(v)) continue;
      color.set(v, 0);
      const stack = [v];
      while (stack.length > 0) {
        const cur = stack.pop();
        if (cur === undefined) continue;
        const c = color.get(cur) ?? 0;
        for (const nb of adj.get(cur) ?? []) {
          if (!color.has(nb)) {
            color.set(nb, 1 - c);
            stack.push(nb);
          } else if ((color.get(nb) ?? 0) === c) {
            ok = false;
            break;
          }
        }
        if (!ok) break;
      }
      if (!ok) break;
    }
    if (ok) return 'K3,3';
  }

  return vertices.length <= 5 ? 'K5' : 'K3,3';
};

export const planarityLeftRight = (
  n: number,
  edges: PlanarityEdgeSpec[],
): RotationSystem | null => {
  if (n >= 3 && edges.length > 3 * n - 6) return null;
  const tester = new LRPlanarity(n, edges);
  return tester.run();
};

export const planarityWitness = (n: number, edges: PlanarityEdgeSpec[]) => {
  let working = edges.slice();
  const ordered = edges.slice().sort((a, b) => a.id - b.id);

  for (const edge of ordered) {
    const next = working.filter((entry) => entry !== edge);
    if (planarityLeftRight(n, next) !== null) {
      working = next.concat([edge]);
    } else {
      working = next;
    }
  }

  const witnessEdges = working.map((edge) => edge.id);
  const witnessVertices = Array.from(new Set(working.flatMap((edge) => [edge.u, edge.v])));
  const witnessPairs = working.map((edge) => [edge.u, edge.v] as [VertexId, VertexId]);
  const type = classifyWitness(witnessPairs);

  return { edges: witnessEdges, vertices: witnessVertices, type } as const;
};
