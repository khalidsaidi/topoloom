import { useState } from 'react';

export type JsonInspectorProps = {
  data: unknown;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isMap = (value: unknown): value is Map<unknown, unknown> => value instanceof Map;
const isSet = (value: unknown): value is Set<unknown> => value instanceof Set;

const Node = ({ label, value }: { label: string; value: unknown }) => {
  const [open, setOpen] = useState(false);
  if (isMap(value)) {
    const entries = Array.from(value.entries());
    return (
      <div className="ml-3">
        <button
          className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs text-foreground hover:bg-muted/50"
          onClick={() => setOpen(!open)}
          type="button"
        >
          <span className="w-3 text-center">{open ? '▾' : '▸'}</span>
          <span className="flex-1">{label} (Map {entries.length})</span>
        </button>
        {open && (
          <div className="ml-3">
            {entries.map(([key, val], idx) => (
              <Node key={idx} label={String(key)} value={val} />
            ))}
          </div>
        )}
      </div>
    );
  }
  if (isSet(value)) {
    const entries = Array.from(value.values());
    return (
      <div className="ml-3">
        <button
          className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs text-foreground hover:bg-muted/50"
          onClick={() => setOpen(!open)}
          type="button"
        >
          <span className="w-3 text-center">{open ? '▾' : '▸'}</span>
          <span className="flex-1">{label} (Set {entries.length})</span>
        </button>
        {open && (
          <div className="ml-3">
            {entries.map((item, idx) => (
              <Node key={idx} label={String(idx)} value={item} />
            ))}
          </div>
        )}
      </div>
    );
  }
  if (Array.isArray(value)) {
    return (
      <div className="ml-3">
        <button
          className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs text-foreground hover:bg-muted/50"
          onClick={() => setOpen(!open)}
          type="button"
        >
          <span className="w-3 text-center">{open ? '▾' : '▸'}</span>
          <span className="flex-1">{label} [{value.length}]</span>
        </button>
        {open && (
          <div className="ml-3">
            {value.map((item, idx) => (
              <Node key={idx} label={String(idx)} value={item} />
            ))}
          </div>
        )}
      </div>
    );
  }
  if (isObject(value)) {
    return (
      <div className="ml-3">
        <button
          className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs text-foreground hover:bg-muted/50"
          onClick={() => setOpen(!open)}
          type="button"
        >
          <span className="w-3 text-center">{open ? '▾' : '▸'}</span>
          <span className="flex-1">{label}</span>
        </button>
        {open && (
          <div className="ml-3">
            {Object.entries(value).map(([key, val]) => (
              <Node key={key} label={key} value={val} />
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="ml-3 text-xs text-muted-foreground">
      {label}: {String(value)}
    </div>
  );
};

export function JsonInspector({ data }: JsonInspectorProps) {
  return (
    <div className="h-[360px] overflow-auto rounded-lg border bg-muted/30 p-3">
      <Node label="root" value={data} />
    </div>
  );
}
