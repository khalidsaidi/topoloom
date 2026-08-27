import { useMemo } from 'react';
import { Background, Controls, ReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { GraphBuilder } from '@khalidsaidi/topoloom/graph';
// With topoloom >= 0.3.0 both imports come straight from the package:
//   import { planarizationLayout } from '@khalidsaidi/topoloom/layout';
//   import { toReactFlow } from '@khalidsaidi/topoloom/react-flow';
import { planarizationLayout } from './topoloom-layout';
import { toReactFlow } from './topoloom-react-flow';

const NODE_WIDTH = 104;
const NODE_HEIGHT = 36;

/**
 * A small service-dependency graph. The five core services form a K5 —
 * provably non-planar — so at least one crossing is unavoidable. topoloom's
 * planarizationLayout finds a minimal set of crossings, routes the crossing
 * edges through them, and produces an orthogonal (all right angles) drawing.
 */
function buildLayout() {
  const b = new GraphBuilder();
  const v = (label: string) => b.addVertex(label);
  const gateway = v('gateway');
  const auth = v('auth');
  const users = v('users');
  const billing = v('billing');
  const orders = v('orders');
  const search = v('search');
  const cache = v('cache');
  const db = v('db');

  const core = [gateway, auth, users, billing, orders];
  for (let i = 0; i < core.length; i += 1) {
    for (let j = i + 1; j < core.length; j += 1) {
      b.addEdge(core[i]!, core[j]!, false);
    }
  }
  b.addEdge(gateway, search, false);
  b.addEdge(search, cache, false);
  b.addEdge(users, db, false);
  b.addEdge(billing, db, false);

  const graph = b.build();
  const result = planarizationLayout(graph, { mode: 'orthogonal' });

  const flow = toReactFlow(result, graph, {
    scale: 7,
    nodeWidth: NODE_WIDTH,
    nodeHeight: NODE_HEIGHT,
    nodeDefaults: {
      style: {
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        fontSize: 12,
        fontWeight: 600,
        borderRadius: 8,
        background: '#eef2ff',
        border: '1.5px solid #6366f1',
        color: '#312e81',
      },
    },
    edgeDefaults: {
      style: { stroke: '#94a3b8', strokeWidth: 1.5 },
    },
  });

  return { flow, stats: result.layout.stats };
}

export default function App() {
  const { flow, stats } = useMemo(buildLayout, []);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={flow.nodes}
        edges={flow.edges}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        minZoom={0.05}
      >
        <Background gap={24} />
        <Controls showInteractive={false} />
      </ReactFlow>
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 10,
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 13,
          lineHeight: 1.5,
          maxWidth: 340,
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}
      >
        <strong>topoloom → React Flow</strong>
        <div>
          Orthogonal layout of a non-planar graph (K5 core): {stats.crossings} crossing
          {stats.crossings === 1 ? '' : 's'}, {stats.bends} bends.
        </div>
      </div>
    </div>
  );
}
