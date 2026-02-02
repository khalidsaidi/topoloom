export type NavItem = {
  label: string;
  path: string;
  description?: string;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const navSections: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Landing', path: '/' },
      { label: 'Getting Started', path: '/getting-started' },
      { label: 'API', path: '/api' },
    ],
  },
  {
    title: 'Topology Demos',
    items: [
      { label: 'Planarity', path: '/demo/planarity' },
      { label: 'Embedding', path: '/demo/embedding' },
      { label: 'BC-Tree', path: '/demo/bc-tree' },
      { label: 'SPQR', path: '/demo/spqr' },
      { label: 'st/Bipolar', path: '/demo/st-bipolar' },
      { label: 'Dual Routing', path: '/demo/dual-routing' },
      { label: 'Min-Cost Flow', path: '/demo/min-cost-flow' },
    ],
  },
  {
    title: 'Geometry Demos',
    items: [
      { label: 'Orthogonal', path: '/demo/orthogonal' },
      { label: 'Planarization', path: '/demo/planarization' },
    ],
  },
];
