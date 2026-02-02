import { useState } from 'react';

export type JsonInspectorProps = {
  data: unknown;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const Node = ({ label, value }: { label: string; value: unknown }) => {
  const [open, setOpen] = useState(false);
  if (Array.isArray(value)) {
    return (
      <div className="ml-3">
        <button className="text-xs text-foreground" onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'} {label} [{value.length}]
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
        <button className="text-xs text-foreground" onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'} {label}
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
