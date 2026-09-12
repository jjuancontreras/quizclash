import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { coverageConfigDefaults, defineConfig } from 'vitest/config';

const unitProject = {
  test: {
    name: 'unit',
    include: ['src/{shared,engine,quiz}/**/*.test.ts'],
    environment: 'node',
  },
};

const workerProject = {
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
  test: {
    name: 'worker',
    include: ['src/worker/**/*.test.ts'],
  },
};

/**
 * `@vitest/coverage-v8` instruments through the V8 inspector protocol, which
 * workerd does not implement. With the worker project in a coverage run the
 * command emitted three ERR_METHOD_NOT_IMPLEMENTED errors and exited 1 — and
 * the percentage it printed never included `src/worker` anyway, so the
 * thresholds below had never once applied to the adapter.
 *
 * A coverage run is therefore scoped to the unit project, and `src/worker` is
 * excluded from the report: the command exits 0 and the number it prints is
 * honest about exactly what it measured. The worker tests still run on every
 * plain `npm test`; they simply stop claiming a coverage figure.
 *
 * Do NOT "fix" this by putting the worker project back into a coverage run.
 */
const isCoverageRun = process.argv.some((arg) => arg.startsWith('--coverage'));

export default defineConfig({
  test: {
    projects: isCoverageRun ? [unitProject] : [unitProject, workerProject],
    coverage: {
      exclude: [...coverageConfigDefaults.exclude, 'src/worker/**'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
