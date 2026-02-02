import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { presets } from '@/components/demo/graph-model';
import type { GraphState } from '@/components/demo/graph-model';

export type GraphEditorProps = {
  state: GraphState;
  onChange: (state: GraphState) => void;
};

export function GraphEditor({ state, onChange }: GraphEditorProps) {
  const [source, setSource] = useState<number>(state.nodes[0]?.id ?? 0);
  const [target, setTarget] = useState<number>(state.nodes[1]?.id ?? 0);
  const [importText, setImportText] = useState('');

  const nodeOptions = useMemo(() => state.nodes.map((node) => node.id), [state.nodes]);

  const addNode = () => {
    const id = state.nextNodeId;
    onChange({
      ...state,
      nodes: [
        ...state.nodes,
        {
          id,
          label: String(id),
          x: Math.random() * 120 - 60,
          y: Math.random() * 120 - 60,
        },
      ],
      nextNodeId: id + 1,
    });
  };

  const removeNode = (id: number) => {
    const nodes = state.nodes.filter((node) => node.id !== id);
    const edges = state.edges.filter((edge) => edge.source !== id && edge.target !== id);
    onChange({ ...state, nodes, edges });
  };

  const addEdge = () => {
    if (source === target) return;
    const id = state.nextEdgeId;
    onChange({
      ...state,
      edges: [
        ...state.edges,
        { id, source, target, directed: state.directed },
      ],
      nextEdgeId: id + 1,
    });
  };

  const removeEdge = (id: number) => {
    onChange({ ...state, edges: state.edges.filter((edge) => edge.id !== id) });
  };

  const toggleDirected = () => {
    onChange({
      ...state,
      directed: !state.directed,
      edges: state.edges.map((edge) => ({ ...edge, directed: !state.directed })),
    });
  };

  const applyPreset = (key: keyof typeof presets) => {
    onChange(presets[key]);
  };

  const exportJson = () => {
    const payload = JSON.stringify(state, null, 2);
    navigator.clipboard.writeText(payload).catch(() => null);
  };

  const importJson = () => {
    try {
      const parsed = JSON.parse(importText) as GraphState;
      if (parsed.nodes && parsed.edges) {
        onChange(parsed);
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={addNode}>Add node</Button>
        <Button size="sm" variant="outline" onClick={addEdge}>Add edge</Button>
        <Button size="sm" variant="ghost" onClick={toggleDirected}>
          {state.directed ? 'Directed' : 'Undirected'}
        </Button>
      </div>

      <div className="grid gap-3 text-xs">
        <div>
          <div className="text-[11px] uppercase text-muted-foreground">Preset</div>
          <select
            className="mt-1 w-full rounded-md border bg-background px-2 py-1"
            onChange={(event) => applyPreset(event.target.value as keyof typeof presets)}
          >
            <option value="triangle">Triangle</option>
            <option value="squareDiagonal">Square + diagonal</option>
            <option value="k4">K4</option>
            <option value="k5">K5</option>
            <option value="k33">K3,3</option>
            <option value="cube">Cube</option>
            <option value="grid">Grid 3x3</option>
            <option value="randomPlanar">Random planar</option>
          </select>
        </div>

        <div>
          <div className="text-[11px] uppercase text-muted-foreground">Add edge</div>
          <div className="mt-1 flex gap-2">
            <select
              className="w-full rounded-md border bg-background px-2 py-1"
              value={source}
              onChange={(event) => setSource(Number(event.target.value))}
            >
              {nodeOptions.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
            <select
              className="w-full rounded-md border bg-background px-2 py-1"
              value={target}
              onChange={(event) => setTarget(Number(event.target.value))}
            >
              {nodeOptions.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <Separator />

      <div className="grid gap-2">
        <div className="text-[11px] uppercase text-muted-foreground">Nodes</div>
        <div className="flex flex-wrap gap-2">
          {state.nodes.map((node) => (
            <Button key={node.id} size="sm" variant="outline" onClick={() => removeNode(node.id)}>
              {node.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <div className="text-[11px] uppercase text-muted-foreground">Edges</div>
        <div className="grid gap-2">
          {state.edges.map((edge) => (
            <Card key={edge.id}>
              <CardContent className="flex items-center justify-between p-2 text-xs">
                <div>
                  {edge.source} → {edge.target}
                </div>
                <Button size="sm" variant="ghost" onClick={() => removeEdge(edge.id)}>
                  Remove
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">Import JSON</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Import graph JSON</DialogTitle>
            </DialogHeader>
            <textarea
              className="min-h-[160px] w-full rounded-md border bg-background p-2 text-xs"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
            />
            <Button size="sm" onClick={importJson}>Apply</Button>
          </DialogContent>
        </Dialog>
        <Button size="sm" variant="outline" onClick={exportJson}>Export JSON</Button>
      </div>
    </div>
  );
}
