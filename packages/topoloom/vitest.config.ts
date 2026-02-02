import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globals: true,
    setupFiles: ['test/setup.ts'],
  },
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json', 'html'],
    lines: 85,
    statements: 85,
    branches: 75,
    functions: 80,
    include: ['src/**/*.ts'],
    exclude: ['src/**/index.ts'],
  },
});
