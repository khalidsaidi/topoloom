import { useEffect, useState } from 'react';

export type BuildInfo = {
  product?: string;
  gitSha?: string;
  gitRef?: string;
  builtAt?: string;
  libraryVersion?: string;
};

const FALLBACK: BuildInfo = {
  product: 'TopoLoom',
  gitSha: 'unknown',
  gitRef: 'unknown',
  builtAt: undefined,
  libraryVersion: '0.2.7',
};

async function fetchJson(path: string): Promise<BuildInfo | null> {
  try {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) return null;
    const data = (await response.json()) as BuildInfo;
    return data;
  } catch {
    return null;
  }
}

export async function loadBuildInfo(): Promise<BuildInfo> {
  const healthz = await fetchJson('/healthz.json');
  if (healthz) return { ...FALLBACK, ...healthz };

  const build = await fetchJson('/build-info.json');
  if (build) return { ...FALLBACK, ...build };

  return FALLBACK;
}

export function useBuildInfo() {
  const [info, setInfo] = useState<BuildInfo>(FALLBACK);

  useEffect(() => {
    let active = true;
    loadBuildInfo().then((loaded) => {
      if (!active) return;
      setInfo(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  return info;
}

export function shortSha(sha?: string) {
  if (!sha) return 'unknown';
  if (sha === 'unknown') return sha;
  return sha.slice(0, 7);
}

export function formatBuildDate(iso?: string) {
  if (!iso) return 'unknown-date';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown-date';
  return date.toISOString().slice(0, 10);
}
