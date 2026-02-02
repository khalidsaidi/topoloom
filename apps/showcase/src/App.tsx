import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { AppShell } from '@/components/layout/AppShell';

const Landing = lazy(() => import('@/pages/Landing').then((m) => ({ default: m.Landing })));
const GettingStarted = lazy(() =>
  import('@/pages/GettingStarted').then((m) => ({ default: m.GettingStarted })),
);
const PlanarityDemo = lazy(() =>
  import('@/pages/demos/Planarity').then((m) => ({ default: m.PlanarityDemo })),
);
const EmbeddingDemo = lazy(() =>
  import('@/pages/demos/Embedding').then((m) => ({ default: m.EmbeddingDemo })),
);
const BCTreeDemo = lazy(() =>
  import('@/pages/demos/BCTree').then((m) => ({ default: m.BCTreeDemo })),
);
const SPQRDemo = lazy(() => import('@/pages/demos/SPQR').then((m) => ({ default: m.SPQRDemo })));
const StBipolarDemo = lazy(() =>
  import('@/pages/demos/StBipolar').then((m) => ({ default: m.StBipolarDemo })),
);
const DualRoutingDemo = lazy(() =>
  import('@/pages/demos/DualRouting').then((m) => ({ default: m.DualRoutingDemo })),
);
const MinCostFlowDemo = lazy(() =>
  import('@/pages/demos/MinCostFlow').then((m) => ({ default: m.MinCostFlowDemo })),
);
const OrthogonalDemo = lazy(() =>
  import('@/pages/demos/Orthogonal').then((m) => ({ default: m.OrthogonalDemo })),
);
const PlanarizationDemo = lazy(() =>
  import('@/pages/demos/Planarization').then((m) => ({ default: m.PlanarizationDemo })),
);
const RotationConcept = lazy(() =>
  import('@/pages/concepts/Rotation').then((m) => ({ default: m.RotationConcept })),
);
const BCSPQRConcept = lazy(() =>
  import('@/pages/concepts/BCSPQR').then((m) => ({ default: m.BCSPQRConcept })),
);
const DualRoutingConcept = lazy(() =>
  import('@/pages/concepts/DualRouting').then((m) => ({ default: m.DualRoutingConcept })),
);
const OrthogonalFlowConcept = lazy(() =>
  import('@/pages/concepts/OrthogonalFlow').then((m) => ({ default: m.OrthogonalFlowConcept })),
);
const Api = lazy(() => import('@/pages/Api').then((m) => ({ default: m.Api })));

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Suspense
          fallback={(
            <div className="rounded-2xl border bg-background/80 p-6 text-sm text-muted-foreground">
              Loading TopoLoom…
            </div>
          )}
        >
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/getting-started" element={<GettingStarted />} />
            <Route path="/demo/planarity" element={<PlanarityDemo />} />
            <Route path="/demo/embedding" element={<EmbeddingDemo />} />
            <Route path="/demo/bc-tree" element={<BCTreeDemo />} />
            <Route path="/demo/spqr" element={<SPQRDemo />} />
            <Route path="/demo/st-bipolar" element={<StBipolarDemo />} />
            <Route path="/demo/dual-routing" element={<DualRoutingDemo />} />
            <Route path="/demo/min-cost-flow" element={<MinCostFlowDemo />} />
            <Route path="/demo/orthogonal" element={<OrthogonalDemo />} />
            <Route path="/demo/planarization" element={<PlanarizationDemo />} />
            <Route path="/concepts/rotation" element={<RotationConcept />} />
            <Route path="/concepts/bc-spqr" element={<BCSPQRConcept />} />
            <Route path="/concepts/dual-routing" element={<DualRoutingConcept />} />
            <Route path="/concepts/orthogonal-flow" element={<OrthogonalFlowConcept />} />
            <Route path="/api" element={<Api />} />
          </Routes>
        </Suspense>
      </AppShell>
    </BrowserRouter>
  );
}
