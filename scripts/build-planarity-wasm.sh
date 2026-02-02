#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
EAPS_DIR="${EAPS_DIR:-/tmp/eaps}"
EAPS_COMMIT="d957ab279adeedb54fa31ee677040b7b572edf2c"

if [ ! -d "$EAPS_DIR/.git" ]; then
  git clone --depth 1 https://github.com/graph-algorithms/edge-addition-planarity-suite.git "$EAPS_DIR"
fi

git -C "$EAPS_DIR" fetch --depth 1 origin "$EAPS_COMMIT"
git -C "$EAPS_DIR" checkout -q "$EAPS_COMMIT"

SRC_FILES=$(find "$EAPS_DIR/c/graphLib" -name '*.c' | sed "s#^$EAPS_DIR#/eaps#" | tr '\n' ' ')
OUT_WASM="$ROOT_DIR/packages/topoloom/src/planarity/wasm/planarity.wasm"

mkdir -p "$(dirname "$OUT_WASM")"

# Build via emscripten container to avoid local toolchain requirements.
docker run --rm \
  -v "$ROOT_DIR":/work \
  -v "$EAPS_DIR":/eaps \
  emscripten/emsdk \
  emcc -O3 \
    -DUSE_0BASEDARRAYS \
    -I/eaps/c -I/eaps/c/graphLib \
    /work/packages/topoloom/third_party/eaps/tl_planarity.c \
    $SRC_FILES \
    -sSTANDALONE_WASM=1 \
    -Wl,--no-entry \
    -sALLOW_MEMORY_GROWTH=1 \
    -sEXPORTED_FUNCTIONS="['_tl_planarity_run','_tl_planarity_rotation_size','_tl_planarity_write_rotation','_tl_planarity_witness_edge_count','_tl_planarity_write_witness_edges','_tl_planarity_witness_vertex_count','_tl_planarity_write_witness_vertices','_tl_planarity_witness_type','_tl_planarity_free','_malloc','_free']" \
    -o /work/packages/topoloom/src/planarity/wasm/planarity.wasm

echo "WASM written to $OUT_WASM"
