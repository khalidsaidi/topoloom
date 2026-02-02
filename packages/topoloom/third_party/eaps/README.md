# Edge-Addition Planarity Suite (EAPS)

TopoLoom uses the Edge-Addition Planarity Suite (EAPS) by John M. Boyer for
planarity testing + Kuratowski obstruction isolation. We compile a minimal
WASM wrapper around the graph library API.

- Upstream: https://github.com/graph-algorithms/edge-addition-planarity-suite
- Commit: d957ab279adeedb54fa31ee677040b7b572edf2c
- License: BSD 3-Clause (see LICENSE.txt)

Build script: `scripts/build-planarity-wasm.sh`
Wrapper: `packages/topoloom/third_party/eaps/tl_planarity.c`
Output WASM: `packages/topoloom/src/planarity/wasm/planarity.wasm`
