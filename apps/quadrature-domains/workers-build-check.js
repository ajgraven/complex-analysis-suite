// Phase 2 build check (task #18) — throwaway, not shipped. Imports the three worker
// MAIN-THREAD modules so Vite/Rollup statically discovers and bundles the NATIVE module
// workers they spawn via `new Worker(new URL('./workers/*-entry.mjs', import.meta.url),
// { type: 'module' })`. A successful `vite build` proves each worker's full ESM import
// graph (solver-graph barrel + kernels) resolves and Vite emits the module worker chunks —
// the compile-time half of the worker validation (the live round-trip is checked in the
// browser at the index.html flip). Removed when the flip repoints Vite at app/index.html.
import "./app/primary-solver-worker.mjs";
import "./app/schwarz/schwarz-cpu-worker.mjs";
import "./app/param-slice/param-slice-pool.mjs";

if (typeof document !== "undefined") {
  const el = document.getElementById("out");
  if (el) el.textContent = "worker main-thread modules imported; workers bundled by Vite.";
}
