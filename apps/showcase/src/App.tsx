import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { AppShell } from '@/components/layout/AppShell';
import { Api } from '@/pages/Api';
import { GettingStarted } from '@/pages/GettingStarted';
import { Landing } from '@/pages/Landing';
import { BCTreeDemo } from '@/pages/demos/BCTree';
import { DualRoutingDemo } from '@/pages/demos/DualRouting';
import { EmbeddingDemo } from '@/pages/demos/Embedding';
import { MinCostFlowDemo } from '@/pages/demos/MinCostFlow';
import { OrthogonalDemo } from '@/pages/demos/Orthogonal';
import { PlanarityDemo } from '@/pages/demos/Planarity';
import { PlanarizationDemo } from '@/pages/demos/Planarization';
import { SPQRDemo } from '@/pages/demos/SPQR';
import { StBipolarDemo } from '@/pages/demos/StBipolar';
import { RotationConcept } from '@/pages/concepts/Rotation';
import { BCSPQRConcept } from '@/pages/concepts/BCSPQR';
import { DualRoutingConcept } from '@/pages/concepts/DualRouting';
import { OrthogonalFlowConcept } from '@/pages/concepts/OrthogonalFlow';

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
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
      </AppShell>
    </BrowserRouter>
  );
}
