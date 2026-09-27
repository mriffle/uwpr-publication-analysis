/// <reference types="vitest/config" />
import { copyFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin, type ViteDevServer, type PreviewServer } from 'vite';

/**
 * Serve the committed sample export at the app's data path, in `vite dev` and in `vite preview`.
 *
 * docs/06 §13 assumes only that the two JSON files are reachable at a configurable path relative
 * to the app. In development that path is served from `samples/export/` rather than copied into
 * `public/`, so there is exactly one copy of the fixture in the repository and it is the one the
 * pipeline writes and the tests read. `UWPR_EXPORT_DIR` points it at another export — in
 * practice the real one — which is how the charts are eyeballed against 339 works.
 *
 * `preview` serves the same files, because that is what the Playwright specs run against.
 */
function sampleExportPlugin(dataPath: string): Plugin {
  const dir =
    process.env.UWPR_EXPORT_DIR ?? resolve(import.meta.dirname, '..', 'samples', 'export');
  const prefix = `/${dataPath.replace(/^\/|\/$/g, '')}/`;
  const attach = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((request, response, next) => {
      const url = request.url ?? '';
      const at = url.indexOf(prefix);
      if (at < 0) return next();
      const name = url.slice(at + prefix.length).split('?')[0] ?? '';
      const file = resolve(dir, name);
      if (!/^[\w.-]+\.json$/.test(name) || !existsSync(file)) return next();
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      createReadStream(file).pipe(response);
    });
  };
  return {
    name: 'uwpr-sample-export',
    configureServer: attach,
    configurePreviewServer: attach,
  };
}

/**
 * Ship a `404.html` copy of `index.html` (docs/06 §3).
 *
 * "Routing uses the History API with a build-time base path, and ships a `404.html` copy of
 * `index.html` so a deep link resolves on static hosts that have no rewrite rules (GitHub Pages
 * among them)." The copy is made after the build so it carries the same hashed asset names as
 * the page it stands in for.
 */
function deepLinkFallbackPlugin(): Plugin {
  return {
    name: 'uwpr-404-fallback',
    apply: 'build',
    async closeBundle() {
      const dist = resolve(import.meta.dirname, 'dist');
      const index = resolve(dist, 'index.html');
      if (existsSync(index)) await copyFile(index, resolve(dist, '404.html'));
    },
  };
}

/**
 * `vite preview` has no history fallback of its own, so a deep link served by it would 404
 * before the router ever ran. This rewrites any non-asset GET to the built `index.html`, which
 * is what the `404.html` above does on a static host.
 */
function previewHistoryFallbackPlugin(base: string): Plugin {
  const prefix = `/${base.replace(/^\/+|\/+$/g, '')}`.replace(/\/$/, '');
  return {
    name: 'uwpr-preview-history-fallback',
    configurePreviewServer(server) {
      server.middlewares.use((request, _response, next) => {
        const url = request.url ?? '/';
        const path = url.split('?')[0] ?? '/';
        if (request.method !== 'GET' || /\.[a-z0-9]+$/i.test(path)) return next();
        request.url = `${prefix}/index.html`;
        next();
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
    plugins: [
      react(),
      sampleExportPlugin(dataPath),
      deepLinkFallbackPlugin(),
      previewHistoryFallbackPlugin(base),
    ],
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
      // Playwright owns e2e/; vitest must not try to run those specs.
      exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
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
