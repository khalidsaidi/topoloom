import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globals: true,
    setupFiles: ['test/setup.ts'],
    coverage: {
      provider: 'istanbul',
      all: true,
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: {
        lines: 91,
        statements: 88,
        functions: 90,
        branches: 67,
      },
    },
  },
});
