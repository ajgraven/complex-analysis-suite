// =============================================================================
// prewarm.mjs -- O4: warm the LIVE (drag) solver worker ahead of the first drag.
//
// The live drag path (quickSolveAndRender -> PSW.liveSolve) runs on a DEDICATED
// worker, separate from the primary solve lane. Left alone it spawns lazily on
// the first pole/slider drag, so the first drag frame stalls while the worker is
// created and the ~20-module solver graph parses. We warm it on the user's FIRST
// pointerdown (once) — the start of their first gesture — so that spawn+parse
// overlaps the pointerdown→first-move→first-solve gap instead of blocking it.
//
// Why pointerdown and not boot: measurement (docs/perf) showed that eagerly
// spawning a worker during boot only competes with the app-bundle load and
// *slows* time-to-first-solve (+~60 ms at 1x). A pointerdown fires only after
// boot, only on real interaction, so this adds ZERO cost to first paint / first
// solve and spawns nothing for a visitor who just views the default domain.
//
// The PRIMARY lane is intentionally NOT pre-warmed: the boot solve already spawns
// it, so an extra early spawn is pure contention with no overlap to win.
//
// Fire-and-forget: the live lane falls back to the main thread when Workers are
// unavailable (e.g. the file:// origin), and a real live solve surfaces any
// genuine error, so a rejected pre-warm is swallowed here.
// =============================================================================
import _QD from './solver.mjs';

const PSW = _QD && _QD.PrimarySolverWorker;
const g = (typeof globalThis !== 'undefined') ? globalThis : null;

if (g && g.document && typeof g.document.addEventListener === 'function' &&
    PSW && typeof PSW.ensureLiveReady === 'function') {
  const warmLive = () => { Promise.resolve(PSW.ensureLiveReady()).catch(() => {}); };
  g.document.addEventListener('pointerdown', warmLive, { once: true, capture: true });
}
