import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/graph/index.ts',
    'src/dfs/index.ts',
    'src/planarity/index.ts',
    'src/embedding/index.ts',
    'src/dual/index.ts',
    'src/decomp/index.ts',
    'src/order/index.ts',
    'src/flow/index.ts',
    'src/layout/index.ts',
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: true,
  target: 'es2022',
});
