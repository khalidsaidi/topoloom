import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const BASE_TITLE = 'TopoLoom — Planar Graph Layout & Orthogonal Drawing for JS/TS';

const staticTitles: Record<string, string> = {
  '/': BASE_TITLE,
  '/getting-started': 'Getting started',
  '/benchmarks': 'Benchmarks',
  '/gallery': 'Gallery',
  '/theater': 'Algorithm theater',
  '/api': 'API reference',
  '/concepts/rotation': 'Rotation systems',
  '/concepts/bc-spqr': 'BC & SPQR trees',
  '/concepts/dual-routing': 'Dual routing',
  '/concepts/orthogonal-flow': 'Orthogonal flow',
};

const demoTitles: Record<string, string> = {
  planarity: 'Planarity demo',
  embedding: 'Embedding demo',
  'bc-tree': 'BC-tree demo',
  spqr: 'SPQR demo',
  'st-bipolar': 'st-numbering demo',
  'dual-routing': 'Dual routing demo',
  'min-cost-flow': 'Min-cost flow demo',
  orthogonal: 'Orthogonal layout demo',
  planarization: 'Planarization demo',
};

export function titleForPath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  const staticTitle = staticTitles[normalized];
  if (staticTitle) return staticTitle === BASE_TITLE ? BASE_TITLE : `${staticTitle} — TopoLoom`;
  const demoMatch = normalized.match(/^\/demos?\/([^/]+)$/);
  if (demoMatch) {
    const title = demoTitles[demoMatch[1] ?? ''];
    if (title) return `${title} — TopoLoom`;
  }
  const galleryMatch = normalized.match(/^\/gallery\/([^/]+)$/);
  if (galleryMatch) return `Gallery: ${galleryMatch[1]} — TopoLoom`;
  return BASE_TITLE;
}

/**
 * Keeps document.title in sync with the current SPA route (the static
 * index.html title otherwise goes stale after client-side navigation).
 */
export function useRouteDocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = titleForPath(pathname);
  }, [pathname]);
}
