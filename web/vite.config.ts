/// <reference types="vitest/config" />
import { createReadStream, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Serve the committed sample export at the app's data path during `vite dev`.
 *
 * docs/06 §13 assumes only that the two JSON files are reachable at a configurable path relative
 * to the app. In development that path is served from `samples/export/` rather than copied into
 * `public/`, so there is exactly one copy of the fixture in the repository and it is the one the
 * pipeline writes and the tests read.
 */
function sampleExportPlugin(dataPath: string): Plugin {
  const dir = resolve(import.meta.dirname, '..', 'samples', 'export');
  const prefix = `/${dataPath.replace(/^\/|\/$/g, '')}/`;
  return {
    name: 'uwpr-sample-export',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url ?? '';
        if (!url.startsWith(prefix)) return next();
        const name = url.slice(prefix.length).split('?')[0] ?? '';
        const file = resolve(dir, name);
        if (!/^[\w.-]+\.json$/.test(name) || !existsSync(file)) return next();
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        createReadStream(file).pipe(response);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Build-time configuration (docs/06 §3 and §13): the same source serves a root deployment, a
  // sub-path or a different host without a code change.
  const base = process.env.VITE_BASE_PATH ?? '/';
  const dataPath = process.env.VITE_DATA_PATH ?? 'data';

  return {
    base,
    define: {
      __DATA_PATH__: JSON.stringify(dataPath),
    },
    plugins: [react(), sampleExportPlugin(dataPath)],
    build: {
      // One JS file keeps the budget check in scripts/check-bundle-budget.mjs honest and simple.
      target: 'es2022',
      sourcemap: mode !== 'production',
    },
    test: {
      environment: 'jsdom',
      globals: false,
      setupFiles: ['./vitest.setup.ts'],
      include: ['test/**/*.test.{ts,tsx}'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/main.tsx', 'src/contract/generated/**', 'src/**/*.d.ts'],
        thresholds: {
          lines: 80,
          statements: 80,
          functions: 80,
          branches: 80,
        },
      },
    },
  };
});
