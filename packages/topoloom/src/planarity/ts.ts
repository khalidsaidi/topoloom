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

  private numAt(arr: number[], idx: number, label: string): number {
    const value = arr[idx];
    if (value === undefined) {
      throw new Error(`Planarity internal error: ${label}[${idx}] is missing`);
    }
    return value;
  }

  private edgeAt(idx: number): PlanarityEdgeSpec {
    const edge = this.edges[idx];
    if (!edge) {
      throw new Error(`Planarity internal error: edge ${idx} is missing`);
    }
    return edge;
  }

  private listAt(arr: number[][], idx: number): number[] {
    return arr[idx] ?? [];
  }

  private updateLowpt(parent: number, child: number) {
    const lowChild = this.numAt(this.lowpt, child, 'lowpt');
    const lowParent = this.numAt(this.lowpt, parent, 'lowpt');
    const low2Child = this.numAt(this.lowpt2, child, 'lowpt2');
    const low2Parent = this.numAt(this.lowpt2, parent, 'lowpt2');
    if (lowChild < lowParent) {
      this.lowpt2[parent] = Math.min(lowParent, low2Parent);
      this.lowpt[parent] = lowChild;
    } else if (lowChild > lowParent) {
      this.lowpt2[parent] = Math.min(low2Parent, lowChild);
    } else {
      this.lowpt2[parent] = Math.min(low2Parent, low2Child);
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
            2 * this.numAt(this.lowpt, edgeIdx, 'lowpt') +
            (this.numAt(this.lowpt2, edgeIdx, 'lowpt2') < this.numAt(this.height, v, 'height') ? 1 : 0);
          if (frame.parentEdge !== -1) this.updateLowpt(frame.parentEdge, edgeIdx);
          stack.pop();
          continue;
        }

        if (frame.iter === 0 && this.height[frame.v] === -1) {
          this.height[frame.v] = frame.depth;
          if (frame.parentEdge !== -1) this.parentEdge[frame.v] = frame.parentEdge;
        }

        const adj = this.listAt(this.adj, frame.v);
        if (frame.iter >= adj.length) {
          stack.pop();
          continue;
        }

        const edgeIdx = adj[frame.iter++];
        if (edgeIdx === undefined) continue;
        if (edgeIdx === frame.parentEdge) continue;
        if (this.edgeFrom[edgeIdx] !== -1) continue;

        const edge = this.edgeAt(edgeIdx);
        const to = edge.u === frame.v ? edge.v : edge.u;
        this.edgeFrom[edgeIdx] = frame.v;
        this.edgeTo[edgeIdx] = to;
        this.outEdges[frame.v]?.push(edgeIdx);
        this.lowpt[edgeIdx] = this.numAt(this.height, frame.v, 'height');
        this.lowpt2[edgeIdx] = this.numAt(this.height, frame.v, 'height');

        if (this.height[to] === -1) {
          stack.push({ type: 'post', edge: edgeIdx, parentEdge: frame.parentEdge, parentVertex: frame.v });
          stack.push({
            type: 'vertex',
            v: to,
            parentEdge: edgeIdx,
            iter: 0,
            depth: this.numAt(this.height, frame.v, 'height') + 1,
          });
        } else {
          this.lowpt[edgeIdx] = this.numAt(this.height, to, 'height');
          this.nestingDepth[edgeIdx] =
            2 * this.numAt(this.lowpt, edgeIdx, 'lowpt') +
            (this.numAt(this.lowpt2, edgeIdx, 'lowpt2') < this.numAt(this.height, frame.v, 'height') ? 1 : 0);
          if (frame.parentEdge !== -1) this.updateLowpt(frame.parentEdge, edgeIdx);
        }
      }
    }
  }

  private lowest(pair: ConflictPair): number {
    if (pair.L.empty()) return this.numAt(this.lowpt, pair.R.low ?? 0, 'lowpt');
    if (pair.R.empty()) return this.numAt(this.lowpt, pair.L.low ?? 0, 'lowpt');
    return Math.min(
      this.numAt(this.lowpt, pair.L.low ?? 0, 'lowpt'),
      this.numAt(this.lowpt, pair.R.low ?? 0, 'lowpt'),
    );
  }

  private conflicting(interval: Interval, edge: number): boolean {
    return (
      !interval.empty() &&
      this.numAt(this.lowpt, interval.high ?? 0, 'lowpt') > this.numAt(this.lowpt, edge, 'lowpt')
    );
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
      if (
        this.numAt(this.lowpt, Q.R.low ?? 0, 'lowpt') >
        this.numAt(this.lowpt, parent, 'lowpt')
      ) {
        if (P.R.empty()) {
          P.R.high = Q.R.high;
        } else if (P.R.low !== null) {
          this.ref[P.R.low] = Q.R.high ?? -1;
        }
        P.R.low = Q.R.low;
      } else {
        if (Q.R.low !== null) this.ref[Q.R.low] = this.numAt(this.lowptEdge, parent, 'lowptEdge');
      }

      const bottom = this.stackBottom[edge];
      const top = this.stack.at(-1) ?? null;
      if (bottom === null ? this.stack.length === 0 : top === bottom) {
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
    const pEdge = this.numAt(this.parentEdge, v, 'parentEdge');
    const ordered = this.orderedAdj[v] ?? [];

    for (let i = 0; i < ordered.length; i += 1) {
      const edge = ordered[i];
      if (edge === undefined) continue;
      const to = this.numAt(this.edgeTo, edge, 'edgeTo');
      this.stackBottom[edge] = this.stack.at(-1) ?? null;

      if (this.parentEdge[to] === edge) {
        if (!this.checkPlanarity(to)) return false;
      } else {
        this.lowptEdge[edge] = edge;
        this.stack.push(new ConflictPair(null, new Interval(edge, edge)));
      }

      if (this.numAt(this.lowpt, edge, 'lowpt') < this.numAt(this.height, v, 'height')) {
        if (i === 0) {
          if (pEdge !== -1) this.lowptEdge[pEdge] = this.numAt(this.lowptEdge, edge, 'lowptEdge');
        } else if (pEdge !== -1 && !this.addConstraints(edge, pEdge)) {
          return false;
        }
      }
    }

    if (pEdge !== -1) {
      const p = this.numAt(this.edgeFrom, pEdge, 'edgeFrom');
      while (
        this.stack.length > 0 &&
        this.lowest(this.stack[this.stack.length - 1]!) === this.numAt(this.height, p, 'height')
      ) {
        const P = this.stack.pop();
        if (!P) continue;
        if (P.L.low !== null) this.side[P.L.low] = -1;
      }
      if (this.stack.length > 0) {
        const P = this.stack.pop();
        if (!P) return false;
        while (P.L.high !== null && this.numAt(this.edgeTo, P.L.high, 'edgeTo') === p) {
          const ref = this.numAt(this.ref, P.L.high, 'ref');
          P.L.high = ref !== -1 ? ref : null;
        }
        if (P.L.high === null && P.L.low !== null) {
          const low = P.L.low;
          if (low !== undefined) {
            this.ref[low] = P.R.low ?? -1;
            this.side[low] = -1;
          }
          P.L.low = null;
        }
        while (P.R.high !== null && this.numAt(this.edgeTo, P.R.high, 'edgeTo') === p) {
          const ref = this.numAt(this.ref, P.R.high, 'ref');
          P.R.high = ref !== -1 ? ref : null;
        }
        if (P.R.high === null && P.R.low !== null) {
          const low = P.R.low;
          if (low !== undefined) {
            this.ref[low] = P.L.low ?? -1;
            this.side[low] = -1;
          }
          P.R.low = null;
        }
        this.stack.push(P);
      }

      if (this.numAt(this.lowpt, pEdge, 'lowpt') < this.numAt(this.height, p, 'height') && this.stack.length > 0) {
        const top = this.stack[this.stack.length - 1]!;
        const H_l = top.L.high;
        const H_r = top.R.high;
        if (
          H_l !== null &&
          (H_r === null || this.numAt(this.lowpt, H_l, 'lowpt') > this.numAt(this.lowpt, H_r ?? 0, 'lowpt'))
        ) {
          this.ref[pEdge] = H_l;
        } else {
          this.ref[pEdge] = H_r ?? -1;
        }
      }
    }

    return true;
  }

  private sign(edge: number): number {
    const ref = this.numAt(this.ref, edge, 'ref');
    if (ref !== -1) {
      const current = this.numAt(this.side, edge, 'side');
      this.side[edge] = current * this.sign(ref);
      this.ref[edge] = -1;
    }
    return this.numAt(this.side, edge, 'side');
  }

  private dfsEmbedding(v: number) {
    const ordered = this.orderedAdj[v] ?? [];
    for (const edge of ordered) {
      if (edge === undefined) continue;
      const to = this.numAt(this.edgeTo, edge, 'edgeTo');
      if (this.numAt(this.parentEdge, to, 'parentEdge') === edge) {
        this.embeddingAdj[to]?.unshift(edge);
        this.leftRef[v] = edge;
        this.rightRef[v] = edge;
        this.dfsEmbedding(to);
      } else if (this.side[edge] === 1) {
        const ref = this.rightRef[to] ?? null;
        const list = this.embeddingAdj[to] ?? (this.embeddingAdj[to] = []);
        const idx = ref === null ? list.length - 1 : list.indexOf(ref);
        list.splice(Math.max(idx + 1, 0), 0, edge);
      } else {
        const ref = this.leftRef[to] ?? null;
        const list = this.embeddingAdj[to] ?? (this.embeddingAdj[to] = []);
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
      this.listAt(this.outEdges, v).slice().sort((a, b) => {
        if (a === undefined || b === undefined) return 0;
        const da = this.numAt(this.nestingDepth, a, 'nestingDepth') - this.numAt(this.nestingDepth, b, 'nestingDepth');
        if (da !== 0) return da;
        return this.edgeAt(a).id - this.edgeAt(b).id;
      }),
    );

    for (const root of this.roots) {
      if (!this.checkPlanarity(root)) return null;
    }

    for (let i = 0; i < this.edges.length; i += 1) {
      const depth = this.numAt(this.nestingDepth, i, 'nestingDepth');
      this.nestingDepth[i] = depth * this.sign(i);
    }

    this.orderedAdj = Array.from({ length: this.n }, (_, v) =>
      this.listAt(this.outEdges, v).slice().sort((a, b) => {
        if (a === undefined || b === undefined) return 0;
        const da = this.numAt(this.nestingDepth, a, 'nestingDepth') - this.numAt(this.nestingDepth, b, 'nestingDepth');
        if (da !== 0) return da;
        return this.edgeAt(a).id - this.edgeAt(b).id;
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
        if (edgeIdx === undefined) continue;
        const edge = this.edgeAt(edgeIdx);
        const other =
          this.numAt(this.edgeFrom, edgeIdx, 'edgeFrom') === v
            ? this.numAt(this.edgeTo, edgeIdx, 'edgeTo')
            : this.numAt(this.edgeFrom, edgeIdx, 'edgeFrom');
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
      const e1 = incident[0];
      const e2 = incident[1];
      if (!e1 || !e2) continue;
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
