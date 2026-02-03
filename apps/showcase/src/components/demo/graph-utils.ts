import type { EdgePath, Point } from '@khalidsaidi/topoloom/layout';
import type { GraphState } from '@/components/demo/graph-model';

export const positionsFromState = (state: GraphState): Map<number, Point> => {
  const map = new Map<number, Point>();
  state.nodes.forEach((node) => map.set(node.id, { x: node.x, y: node.y }));
  return map;
};

export const edgePathsFromState = (state: GraphState, positions?: Map<number, Point>): EdgePath[] => {
  const pos = positions ?? positionsFromState(state);
  return state.edges.map((edge) => {
    const p1 = pos.get(edge.source) ?? { x: 0, y: 0 };
    const p2 = pos.get(edge.target) ?? { x: 0, y: 0 };
    return { edge: edge.id, points: [p1, p2] };
  });
};
