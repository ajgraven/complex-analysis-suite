// =============================================================================
// asset-manifest.js -- Single source of truth for the app's static asset list.
//
// Consumed by:
//   * sw.js                              — pre-caches these on install
//   * primary-solver-worker.js (future)  — runtime bundle source list (TODO:
//                                          migrate; currently has its own copy)
//   * param-slice/param-slice-pool.js    — same; ditto TODO
//
// Adding a new browser-loaded JS file? Add it to SOLVER_FILES (if it's a
// solver-side module that needs to live in the worker bundle) or
// UI_FILES (browser-only). The service worker picks up both automatically.
// =============================================================================

(function (global) {
  'use strict';

  // Single canonical release version. BUMP THIS on every release that touches
  // `app/`. Used three ways, all reading this one constant:
  //   * sw.js          — cache name; old caches dropped on activate. Because
  //                      sw.js `importScripts('./asset-manifest.js')`, changing
  //                      this string is part of the service-worker byte-update
  //                      comparison, so a bump reliably triggers an SW update.
  //   * the two worker bundlers (primary-solver-worker.js, param-slice-pool.js)
  //                      append `?v=<CACHE_VERSION>` to every solver-source
  //                      fetch, busting the browser HTTP cache so a Worker can
  //                      never run stale solver source after a deploy.
  const CACHE_VERSION = 'v49-paramslice-pqd-alpha-routing-fix';

  // Files that get concatenated into a Worker bundle by the runtime
  // bundlers in primary-solver-worker.js and param-slice/param-slice-pool.js.
  // Order matters: solver.js must come before family files that call
  // QD.registerFamily(...) at load time. Anything that runs ONLY on the
  // main page (UI, critical-set, etc.) goes in UI_FILES instead.
  const WORKER_BUNDLE_FILES = [
    'complex.js',
    'taylor.js',
    'solver.js',
    'solver-faber.js',
    'solvers/seeds/seeds-qd.js',
    'solver-qd.js',
    'solvers/seeds/seeds-uqd.js',
    'solver-uqd.js',
    'solver-lqd-common.js',
    'solvers/seeds/seeds-lqd.js',
    'solver-lqd.js',
    'solvers/seeds/seeds-lqd-singular.js',
    'solver-lqd-singular.js',
    'solvers/seeds/seeds-uqd-lqd.js',
    'solver-uqd-lqd.js',
    'solvers/seeds/seeds-uqd-lqd-singular.js',
    'solver-uqd-lqd-singular.js',
    'solver-pqd-common.js',
    'solvers/seeds/seeds-pqd.js',
    'solver-pqd.js',
    'solvers/seeds/seeds-pqd-singular.js',
    'solver-pqd-singular.js',
    'solvers/seeds/seeds-uqd-pqd.js',
    'solver-uqd-pqd.js',
    'solvers/seeds/seeds-uqd-pqd-singular.js',
    'solver-uqd-pqd-singular.js',
    'poly-helpers.js',
    'parse-h.js',
  ];

  // Page-only solver-adjacent files. Loaded by index.html as classic
  // <script> tags but NOT bundled into the Workers.
  const SOLVER_PAGE_ONLY_FILES = [
    'critical-set.js',
    'univalence.js',
    'cusps.js',
    'primary-solution.js',
    'primary-solver-worker.js',
  ];

  // Convenience union used by the service worker.
  const SOLVER_FILES = [...WORKER_BUNDLE_FILES, ...SOLVER_PAGE_ONLY_FILES];

  // Browser-only files (UI, rendering, tab subsystems) — needed by the main
  // page but NOT by the Worker bundles.
  const UI_FILES = [
    'qol.js',
    'ui-presets.js',
    'ui-domain-plot.js',
    'riemann-latex.js',
    'ui.js',
    'direct/direct-common.js',
    'direct/direct-ui.js',
    'schwarz/schwarz-common.js',
    'schwarz/schwarz-inverse.js',
    'schwarz/schwarz-analysis.js',
    'schwarz/schwarz-forward.js',
    'schwarz/schwarz-webgl.js',
    'schwarz/schwarz-cpu-worker.js',
    'schwarz/schwarz-ui.js',
    'param-slice/param-slice-common.js',
    'param-slice/param-slice-pool.js',
    'param-slice/param-slice-ui.js',
    'sphere/sphere-common.js',
    'sphere/sphere-webgl.js',
    'sphere/sphere-ui.js',
  ];

  // Non-script assets the service worker should pre-cache.
  const STATIC_ASSETS = [
    'index.html',
    'style.css',
    'manifest.webmanifest',
    'icon.svg',
  ];

  // The complete list, in load order, for the service worker.
  const ALL_ASSETS = [
    ...STATIC_ASSETS,
    ...SOLVER_FILES,
    ...UI_FILES,
  ];

  // CDN assets — pre-cached on first online visit (network-first with
  // cache fallback so offline reloads still get them).
  const CDN_ASSETS = [
    'https://cdnjs.cloudflare.com/ajax/libs/mathjs/12.4.1/math.js',
    'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css',
    'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js',
  ];

  global.QD_ASSET_MANIFEST = {
    CACHE_VERSION,
    WORKER_BUNDLE_FILES,
    SOLVER_PAGE_ONLY_FILES,
    SOLVER_FILES,                    // = WORKER_BUNDLE_FILES + SOLVER_PAGE_ONLY_FILES
    UI_FILES,
    STATIC_ASSETS,
    ALL_ASSETS,
    CDN_ASSETS,
  };

})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
