import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { presets } from '@/components/demo/graph-model';
import type { GraphState } from '@/components/demo/graph-model';
import { Trash2 } from 'lucide-react';

export type GraphEditorProps = {
  state: GraphState;
  onChange: (state: GraphState) => void;
  onSelectNode?: (id: number | null) => void;
  selectedNodeId?: number | null;
};

export function GraphEditor({ state, onChange, onSelectNode, selectedNodeId }: GraphEditorProps) {
  const [source, setSource] = useState<number>(state.nodes[0]?.id ?? 0);
  const [target, setTarget] = useState<number>(state.nodes[1]?.id ?? 0);
  const [importText, setImportText] = useState('');
  const [dirty, setDirty] = useState(false);
  const [pendingEdgeId, setPendingEdgeId] = useState<number | null>(null);

  const normalizeSelection = (
    nodes: Array<{ id: number }>,
    currentSource: number,
    currentTarget: number,
  ) => {
    if (nodes.length === 0) {
      return { source: 0, target: 0 };
    }
    const ids = nodes.map((node) => node.id);
    const nextSource = ids.includes(currentSource) ? currentSource : ids[0]!;
    let nextTarget = ids.includes(currentTarget) ? currentTarget : (ids[1] ?? ids[0]!);
    if (nextSource === nextTarget && ids.length > 1) {
      nextTarget = ids.find((id) => id !== nextSource) ?? nextTarget;
    }
    return { source: nextSource, target: nextTarget };
  };

  const nodeOptions = useMemo(() => state.nodes.map((node) => node.id), [state.nodes]);

  const addNode = () => {
    const id = state.nextNodeId;
    const nextNodes = [
      ...state.nodes,
      {
        id,
        label: String(id),
        x: Math.random() * 120 - 60,
        y: Math.random() * 120 - 60,
      },
    ];
    const selection = normalizeSelection(nextNodes, source, target);
    setDirty(true);
    setSource(selection.source);
    setTarget(selection.target);
    if (selectedNodeId === null) {
      onSelectNode?.(id);
    }
    toast.success(`Node ${id} added`);
    onChange({
      ...state,
      nodes: nextNodes,
      nextNodeId: id + 1,
    });
  };

  const removeNode = (id: number) => {
    setDirty(true);
    const nodes = state.nodes.filter((node) => node.id !== id);
    const edges = state.edges.filter((edge) => edge.source !== id && edge.target !== id);
    const selection = normalizeSelection(nodes, source, target);
    setSource(selection.source);
    setTarget(selection.target);
    onChange({ ...state, nodes, edges });
  };

  const addEdge = () => {
    if (source === target || state.nodes.length < 2) return;
    const id = state.nextEdgeId;
    setDirty(true);
    toast.success(`Edge ${source} → ${target} added`);
    setPendingEdgeId(id);
    window.setTimeout(() => setPendingEdgeId(null), 2000);
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
    setDirty(true);
    onChange({ ...state, edges: state.edges.filter((edge) => edge.id !== id) });
  };

  const toggleDirected = () => {
    setDirty(true);
    onChange({
      ...state,
      directed: !state.directed,
      edges: state.edges.map((edge) => ({ ...edge, directed: !state.directed })),
    });
  };

  const applyPreset = (key: keyof typeof presets) => {
    if (dirty) {
      const ok = window.confirm('Switching presets will discard your current edits. Continue?');
      if (!ok) return;
    }
    const preset = presets[key];
    const directed = state.directed;
    const selection = normalizeSelection(preset.nodes, source, target);
    setDirty(false);
    setSource(selection.source);
    setTarget(selection.target);
    onChange({
      ...preset,
      directed,
      edges: preset.edges.map((edge) => ({ ...edge, directed })),
    });
  };

  const exportJson = () => {
    const payload = JSON.stringify(state, null, 2);
    navigator.clipboard
      .writeText(payload)
      .then(() => toast.success('Graph JSON copied to clipboard'))
      .catch(() => toast.error('Unable to copy JSON to clipboard'));
  };

  const importJson = () => {
    try {
      const parsed = JSON.parse(importText) as GraphState;
      if (parsed.nodes && parsed.edges) {
        setDirty(true);
        const selection = normalizeSelection(parsed.nodes, source, target);
        setSource(selection.source);
        setTarget(selection.target);
        onChange(parsed);
        toast.success('Graph JSON imported');
        return;
      }
      toast.error('Invalid graph JSON format');
    } catch {
      toast.error('Invalid JSON payload');
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
            id="preset-select"
            name="preset"
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
          <div className="mt-1 grid gap-2 md:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-[10px] uppercase text-muted-foreground">From node</span>
              <select
                className="w-full rounded-md border bg-background px-2 py-1"
                id="edge-from"
                name="edgeFrom"
                value={source}
                onChange={(event) => setSource(Number(event.target.value))}
              >
                {nodeOptions.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-[10px] uppercase text-muted-foreground">To node</span>
              <select
                className="w-full rounded-md border bg-background px-2 py-1"
                id="edge-to"
                name="edgeTo"
                value={target}
                onChange={(event) => setTarget(Number(event.target.value))}
              >
                {nodeOptions.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-2 rounded-md border border-dashed px-2 py-1 text-[10px] text-muted-foreground">
            Selected edge: {source} → {target}
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            Tip: click a node card or node in the graph to highlight it.
            {selectedNodeId !== null ? ` Selected node: ${selectedNodeId}.` : ''}
          </div>
        </div>
      </div>

      <Separator />

      <details className="rounded-lg border bg-background/80">
        <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold uppercase text-muted-foreground">
          Nodes ({state.nodes.length})
        </summary>
        <div className="grid gap-2 p-3 pt-1">
          {state.nodes.map((node) => (
            <Card key={node.id}>
              <CardContent className="flex items-center justify-between p-2 text-xs">
                <button
                  type="button"
                  className={`rounded-md px-2 py-1 text-left text-xs font-medium transition ${
                    selectedNodeId === node.id
                      ? 'bg-emerald-100 text-emerald-900'
                      : 'text-foreground hover:bg-muted/60'
                  }`}
                  onClick={() => onSelectNode?.(node.id)}
                >
                  Node {node.label}
                </button>
                <Button size="sm" variant="ghost" onClick={() => removeNode(node.id)}>
                  <Trash2 className="mr-1 h-3 w-3" /> Remove
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </details>

      <details className="rounded-lg border bg-background/80">
        <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold uppercase text-muted-foreground">
          Edges ({state.edges.length})
        </summary>
        <div className="grid gap-2 p-3 pt-1">
          {state.edges.map((edge) => (
            <Card key={edge.id}>
              <CardContent className="flex items-center justify-between p-2 text-xs">
                <div>
                  {edge.source} → {edge.target}
                </div>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeEdge(edge.id)}>
                  <Trash2 className="mr-1 h-3 w-3" /> Remove
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </details>

      <div className="flex flex-wrap gap-2">
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">Import JSON</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Import graph JSON</DialogTitle>
              <DialogDescription>
                Paste a GraphState payload with nodes, edges, and metadata. Example:
                <span className="block text-[10px] text-muted-foreground">
                  {"{ \"nodes\": [{\"id\":0,\"label\":\"0\",\"x\":0,\"y\":0}], \"edges\": [] }"}
                </span>
              </DialogDescription>
            </DialogHeader>
            <textarea
              className="min-h-[160px] w-full rounded-md border bg-background p-2 text-xs"
              id="import-json"
              name="importJson"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
            />
            <Button size="sm" onClick={importJson}>Apply</Button>
          </DialogContent>
        </Dialog>
        <Button size="sm" variant="outline" onClick={exportJson}>Export JSON</Button>
        {pendingEdgeId !== null && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700">
            Edge {pendingEdgeId} added
          </div>
        )}
      </div>
    </div>
  );
}
