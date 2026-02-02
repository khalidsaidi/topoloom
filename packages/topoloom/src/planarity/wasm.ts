import { PLANARITY_WASM_BASE64 } from './wasm-data';

export type PlanarityWasm = {
  memory: WebAssembly.Memory;
  tl_planarity_run: (n: number, m: number, uPtr: number, vPtr: number, flags: number) => number;
  tl_planarity_rotation_size: () => number;
  tl_planarity_write_rotation: (offsetsPtr: number, edgePtr: number, neighborPtr: number) => void;
  tl_planarity_witness_edge_count: () => number;
  tl_planarity_write_witness_edges: (edgePtr: number) => void;
  tl_planarity_witness_vertex_count: () => number;
  tl_planarity_write_witness_vertices: (vertexPtr: number) => void;
  tl_planarity_witness_type: () => number;
  tl_planarity_free: () => void;
  malloc: (size: number) => number;
  free: (ptr: number) => void;
};

let wasmInstance: PlanarityWasm | null = null;

const decodeBase64 = (base64: string): Uint8Array => {
  const bufferCtor = (globalThis as {
    Buffer?: { from: (input: string, encoding: string) => Uint8Array };
  }).Buffer;
  if (bufferCtor) {
    return Uint8Array.from(bufferCtor.from(base64, 'base64'));
  }
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  throw new Error('No base64 decoder available in this runtime.');
};

export const getPlanarityWasm = (): PlanarityWasm => {
  if (wasmInstance) return wasmInstance;

  const bytes = decodeBase64(PLANARITY_WASM_BASE64);
  const module = new WebAssembly.Module(bytes as unknown as BufferSource);
  const instance = new WebAssembly.Instance(module, {
    env: {
      emscripten_notify_memory_growth: () => undefined,
    },
  });

  wasmInstance = instance.exports as unknown as PlanarityWasm;
  return wasmInstance;
};

export const allocInt32Ptr = (wasm: PlanarityWasm, length: number) => {
  const bytes = length * Int32Array.BYTES_PER_ELEMENT;
  const ptr = wasm.malloc(bytes);
  if (!ptr) throw new Error('WASM malloc failed');
  return ptr;
};

export const viewInt32 = (wasm: PlanarityWasm, ptr: number, length: number) => {
  return new Int32Array(wasm.memory.buffer, ptr, length);
};
