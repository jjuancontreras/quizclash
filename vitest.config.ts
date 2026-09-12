import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
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
        plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
        test: {
          name: 'worker',
          include: ['src/worker/**/*.test.ts'],
        },
      },
    ],
    coverage: { thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 } },
  },
});
