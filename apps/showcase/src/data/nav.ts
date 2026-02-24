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
    title: 'Real Data',
    items: [
      {
        label: 'Gallery',
        path: '/gallery',
        description: 'Hard graphs → clean topology-first drawings.',
      },
    ],
  },
  {
    title: 'Kernel Concepts',
    items: [
      { label: 'Rotation vs Half-Edge', path: '/concepts/rotation' },
      { label: 'BC-tree + SPQR', path: '/concepts/bc-spqr' },
      { label: 'Dual Routing', path: '/concepts/dual-routing' },
      { label: 'Orthogonal Flow', path: '/concepts/orthogonal-flow' },
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
