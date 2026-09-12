import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/{shared,engine,quiz}/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'worker',
          include: ['src/worker/**/*.test.ts'],
          poolOptions: {
            workers: {
              wrangler: { configPath: './wrangler.jsonc' },
            },
          },
        },
      },
    ],
    coverage: { thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 } },
  },
});
