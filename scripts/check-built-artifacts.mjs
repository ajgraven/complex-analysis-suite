// check-built-artifacts.mjs — post-`vite build` gate for the PUBLISHED apps' Web Workers.
//
// Why this exists (QD-BUILD-1): a worker spawned as
//     new Worker(new URL('<path>', import.meta.url), { type: 'module' })
// is bundled by Vite's worker-import transform ONLY when the first `new URL` arg is a STRING LITERAL.
// A variable there is left untransformed, so the worker's entry chunk is silently OMITTED from the
// production build and 404s at runtime — the deployed app's Solve / Schwarz / param-slice / sym paths
// hard-fail, while node/jsdom tests and `vite dev` (which don't run the production transform) stay
// green. That is exactly how the primary-solver worker reached the live site broken.
//
// worker-url-static-literal.test.ts pins the SOURCE rule (no variable first-arg) in `pnpm test`.
// THIS gate is the complementary BUILD-OUTPUT check: after a real build it asserts that every worker
// the published apps spawn actually produced an emitted chunk. It runs as the tail of `pnpm build`,
// so local dev, CI (ci.yml `build`), and the Pages publish (deploy-pages.yml `build`, the step that
// uploads the site) all self-verify — a dropped chunk fails the build instead of reaching users.
// Deterministic: a dist directory listing, no browser and no flake.
//
// Scope: the two PUBLISHED apps (launcher has no workers; correspondences is built-but-not-published).
// Detection is derived from source, so a NEW worker is covered automatically — no list to maintain.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// PUBLISHED apps + the source root(s) to scan for worker spawns.
const APPS = [
  { name: 'quadrature-domains', dir: 'apps/quadrature-domains', srcRoots: ['app'] },
  { name: 'complex-dynamics', dir: 'apps/complex-dynamics', srcRoots: ['src'] },
];

// `new Worker( new URL( '<literal>' , import.meta.url` — the bundlable form. Captures the specifier.
const WORKER_URL = /new\s+Worker\s*\(\s*new\s+URL\s*\(\s*(['"`])([^'"`]+)\1\s*,\s*import\.meta\.url/g;

// Strip // line comments (keeping `://`) and /* */ blocks, so a worker call quoted inside a comment
// (e.g. a "(LATER) rework to new Worker(new URL(…" note) is not mistaken for a real spawn site.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/([^:]|^)\/\/.*$/gm, '$1');
}

// Recursively collect .mjs/.ts/.js under a dir, skipping build output and test trees (test files use
// `new URL(...)` for readFileSync, never `new Worker(new URL(...))`, but skipping them is faster/safer).
function collectSources(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (['node_modules', 'dist', 'test', 'vitest', '__tests__'].includes(ent.name)) continue;
      collectSources(join(dir, ent.name), out);
    } else if (/\.(mjs|ts|js)$/.test(ent.name)) {
      out.push(join(dir, ent.name));
    }
  }
  return out;
}

const problems = [];
let workersChecked = 0;

for (const app of APPS) {
  const appAbs = join(ROOT, app.dir);
  const assetsDir = join(appAbs, 'dist', 'assets');
  if (!existsSync(assetsDir)) {
    problems.push(`[${app.name}] no dist/assets — run \`vite build\` before this gate`);
    continue;
  }
  const emitted = readdirSync(assetsDir);
  for (const srcRoot of app.srcRoots) {
    for (const file of collectSources(join(appAbs, srcRoot))) {
      const src = stripComments(readFileSync(file, 'utf8'));
      let m;
      WORKER_URL.lastIndex = 0;
      while ((m = WORKER_URL.exec(src))) {
        const spec = m[2];
        // Vite names the worker chunk after the entry file's basename minus its final extension:
        //   ../workers/solver-worker-entry.mjs -> solver-worker-entry-<hash>.js
        //   ./juliaMetrics.worker.ts           -> juliaMetrics.worker-<hash>.js  (keeps `.worker`)
        const stem = basename(spec).replace(/\.(mjs|cjs|mts|cts|ts|js)$/, '');
        workersChecked++;
        const present = emitted.some((f) => f.startsWith(stem + '-') && f.endsWith('.js'));
        if (!present) {
          const rel = file.slice(appAbs.length + 1);
          problems.push(
            `[${app.name}] MISSING chunk ${stem}-*.js in dist/assets — ` +
              `spawned by ${app.dir}/${rel} via new Worker(new URL('${spec}'))`,
          );
        }
      }
    }
  }
}

if (problems.length) {
  console.error('✗ built-artifact gate FAILED — a spawned worker has no emitted chunk:');
  for (const p of problems) console.error('    ' + p);
  console.error(
    '\nA `new Worker(new URL(<x>, import.meta.url))` chunk is dropped from `vite build` when <x> is\n' +
      'not a string literal (QD-BUILD-1). Restore the literal, or — if a worker was intentionally\n' +
      'removed — delete its spawn site so this gate stops expecting it.',
  );
  process.exit(1);
}

console.log(
  `✓ built-artifact gate: all ${workersChecked} spawned worker chunk(s) present ` +
    `across ${APPS.length} published apps (quadrature-domains, complex-dynamics).`,
);
