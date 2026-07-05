'use strict';
// =============================================================================
// ui-inputs tests — guard that behavior-bearing UI "gauge" controls actually
// affect the solve. Motivated by the conformal-radius `c` slider regression
// (HANDOFF #61 follow-up): a stale warm-start seed silently pinned the OLD c and
// NO test caught it, because the suite had no test driving a UI control's
// state → normalization → solver path.
//
// Seam-level (no jsdom, no DOM): the DOM event handlers in ui.js/ui-solve.js are
// thin wrappers that write `state.<gauge>` then schedule a solve. The behavior
// that actually broke lives in the pure mode-descriptor hooks (ui-modes.js:
// buildNorm / applyNorm / warmStartUpdate) + the real solver. We install those
// descriptors into the shared vm with a minimal mock uiCtx and exercise them
// against the real QD.solveInverseQD — fast and deterministic.
//
// Coverage map (the four behavior-bearing gauges and where each is checked):
//   • warmStartUpdate injects the live gauge into the seed — ALL 10 modes (§1)
//   • buildNorm reads the live state gauge — representative per gauge (§2)
//   • changing the gauge re-solves to a DIFFERENT φ — c & α via the real
//     solver (§3)
//   • warm-start contract: stale seed pins the old gauge, gauge-injected seed
//     yields the new one — the exact c-bug + its fix (§4)
// (Pole/pole-order/residue/poly and family routing are already exercised by the
//  solver/direct family batteries; this file closes the UI-gauge gap.)
// =============================================================================
require('./bootstrap');

module.exports = async function run() {
  section('UI inputs — gauge propagation + warm-start');

  // --- install the mode descriptors with a minimal mock uiCtx -----------------
  // window is masked in the vm, so the factory registers on ctx.QD_UI. The only
  // ui.js closure the descriptors call is buildW0 (5 families, at solve time);
  // mock it to honor the mock state's w₀ mode so w₀ propagation is testable.
  loadInCtx('ui-modes.js');
  const mockState = { mode: 'bounded', alpha: 2, w0Mode: 'auto', w0Manual: '0', c: 0.5, q: '0' };
  function centroid(hData) {
    const ps = (hData.poles || []);
    if (!ps.length) return { re: 0, im: 0 };
    let re = 0, im = 0;
    for (const p of ps) { re += p.a.re; im += p.a.im; }
    return { re: re / ps.length, im: im / ps.length };
  }
  const uiCtx = {
    state: mockState,
    buildW0(hData) {
      if (mockState.w0Mode === 'manual') {
        const w = C.parse(mockState.w0Manual);
        return w ? { w0: w } : { error: 'bad w0' };
      }
      return { w0: centroid(hData) };
    },
  };
  const { MODES } = ctx.QD_UI.installModes(uiCtx);

  // boundary-scale probe: mean |φ| just off ∂𝔻 (the same diagnostic used to
  // catch the c-slider bug). For unbounded φ this grows monotonically with c.
  function boundaryScale(phi) {
    const sw = Schwarz.buildSchwarzFromPhi(phi, null, null);
    let s = 0; const n = 24;
    for (let i = 0; i < n; i++) {
      const t = 2 * Math.PI * i / n;
      const z = { re: 1.0001 * Math.cos(t), im: 1.0001 * Math.sin(t) };
      const w = sw.evalPhi(z);
      s += Math.hypot(w.re, w.im);
    }
    return s / n;
  }

  // ===========================================================================
  // §1. warmStartUpdate injects the live gauge into the seed — every mode.
  // This is the exact linchpin of the c-slider fix: each mode's warmStartUpdate
  // must copy norm.{c,α,w₀,q} onto the warm seed, else a re-solve keeps the old
  // gauge (the bug). A removed/typo'd hook fails here.
  // ===========================================================================
  const GAUGE_FIELDS = {
    'bounded':                 ['w0'],
    'pqd-bounded':             ['w0', 'alpha'],
    'pqd-bounded-singular':    ['w0', 'alpha'],
    'pqd-unbounded':           ['c', 'alpha'],
    'pqd-unbounded-singular':  ['c', 'alpha'],
    'unbounded':               ['c'],
    'lqd-bounded':             ['w0'],
    'lqd-unbounded':           ['c'],
    'lqd-unbounded-singular':  ['c', 'q'],
    'lqd-bounded-singular':    ['w0', 'q'],
  };
  for (const [modeKey, fields] of Object.entries(GAUGE_FIELDS)) {
    const desc = MODES[modeKey];
    ok('§1 ' + modeKey + ': descriptor exists with warmStartUpdate',
       !!desc && typeof desc.warmStartUpdate === 'function');
    if (!desc || typeof desc.warmStartUpdate !== 'function') continue;
    const norm = { c: 9, alpha: 9, w0: { re: 9, im: 9 }, q: { re: 9, im: 9 } };
    const seed = { c: 0, alpha: 0, w0: { re: 0, im: 0 }, q: { re: 0, im: 0 } };
    desc.warmStartUpdate(seed, norm);
    for (const f of fields) {
      if (f === 'c')     ok('§1 ' + modeKey + ': warmStartUpdate injects c', seed.c === 9, 'got=' + seed.c);
      if (f === 'alpha') ok('§1 ' + modeKey + ': warmStartUpdate injects α', seed.alpha === 9, 'got=' + seed.alpha);
      if (f === 'w0')    ok('§1 ' + modeKey + ': warmStartUpdate injects w₀', seed.w0.re === 9 && seed.w0.im === 9);
      if (f === 'q')     ok('§1 ' + modeKey + ': warmStartUpdate injects q', seed.q.re === 9 && seed.q.im === 9);
    }
  }

  // ===========================================================================
  // §2. buildNorm reads the live state gauge (catches "buildNorm stopped reading
  // state.<gauge>"). Pure — no solve.
  // ===========================================================================
  {
    // c (unbounded classical)
    mockState.mode = 'unbounded';
    mockState.c = 0.7;
    ok('§2 unbounded buildNorm reads c=0.7', MODES.unbounded.buildNorm({ poles: [], polyPart: [] }, mockState).c === 0.7);
    mockState.c = 2.0;
    ok('§2 unbounded buildNorm reads c=2.0', MODES.unbounded.buildNorm({ poles: [], polyPart: [] }, mockState).c === 2.0);

    // α (pqd-bounded) — needs an interior w₀ ≠ 0; auto-centroid of a single pole.
    mockState.mode = 'pqd-bounded';
    mockState.w0Mode = 'manual'; mockState.w0Manual = '1';
    const hPqd = { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 3, im: 0 }] }] };
    mockState.alpha = 2;
    ok('§2 pqd-bounded buildNorm reads α=2', MODES['pqd-bounded'].buildNorm(hPqd, mockState).alpha === 2);
    mockState.alpha = 3;
    ok('§2 pqd-bounded buildNorm reads α=3', MODES['pqd-bounded'].buildNorm(hPqd, mockState).alpha === 3);

    // w₀ (bounded classical, manual mode)
    mockState.mode = 'bounded';
    mockState.w0Mode = 'manual'; mockState.w0Manual = '0.3-0.1i';
    const nW = MODES.bounded.buildNorm({ poles: [{ a: { re: 1, im: 0 }, principal: [{ re: 1, im: 0 }] }] }, mockState);
    ok('§2 bounded buildNorm reads manual w₀', !nW.error && approxEq(nW.w0, { re: 0.3, im: -0.1 }),
       nW.error || ('w0=' + JSON.stringify(nW.w0)));

    // q (lqd-bounded-singular)
    mockState.mode = 'lqd-bounded-singular';
    mockState.w0Mode = 'manual'; mockState.w0Manual = '1'; mockState.q = '0.5+0.2i';
    const nQ = MODES['lqd-bounded-singular'].buildNorm({ poles: [{ a: { re: 1, im: 0 }, principal: [{ re: 1, im: 0 }] }] }, mockState);
    ok('§2 lqd-bounded-singular buildNorm reads q', !nQ.error && approxEq(nQ.q, { re: 0.5, im: 0.2 }),
       nQ.error || ('q=' + JSON.stringify(nQ.q)));
  }

  // ===========================================================================
  // §3. Changing the gauge re-solves to a DIFFERENT φ (the "control is not
  // inert" proof, through the REAL solver). The full path a UI handler triggers:
  // state → buildNorm → applyNorm(opts) → solveInverseQD.
  // ===========================================================================
  // c — classical unbounded one-point QD (the c-slider family).
  {
    const desc = MODES.unbounded;
    const hData = { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 1, im: 0 }] }] };
    const solveAt = (c) => {
      mockState.mode = 'unbounded'; mockState.c = c;
      const opts = {}; desc.applyNorm(opts, desc.buildNorm(hData, mockState));
      return solveInverseQD(hData, opts);
    };
    const r1 = solveAt(0.6), r2 = solveAt(1.0);
    ok('§3 c→solve: both succeed', r1.success && r2.success,
       (r1.error || '') + ' / ' + (r2.error || ''));
    if (r1.success && r2.success) {
      ok('§3 c→solve: φ.c tracks the gauge',
         approxEq(r1.primary.phi.c, 0.6) && approxEq(r2.primary.phi.c, 1.0),
         'c1=' + r1.primary.phi.c + ' c2=' + r2.primary.phi.c);
      const s1 = boundaryScale(r1.primary.phi), s2 = boundaryScale(r2.primary.phi);
      ok('§3 c→solve: the domain actually changes with c', s2 > s1 * 1.2,
         's(0.6)=' + s1.toFixed(3) + ' s(1.0)=' + s2.toFixed(3));
    }
  }
  // α — unbounded PQD (vary α at fixed c; φ.alpha must track).
  {
    const desc = MODES['pqd-unbounded'];
    const hData = { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 1, im: 0 }] }] };
    const solveAt = (alpha) => {
      mockState.mode = 'pqd-unbounded'; mockState.alpha = alpha; mockState.c = 2;
      const opts = {}; desc.applyNorm(opts, desc.buildNorm(hData, mockState));
      return solveInverseQD(hData, opts);
    };
    const r1 = solveAt(2), r2 = solveAt(1.5);
    ok('§3 α→solve: both succeed', r1.success && r2.success,
       (r1.error || '') + ' / ' + (r2.error || ''));
    if (r1.success && r2.success) {
      ok('§3 α→solve: φ.alpha tracks the gauge',
         approxEq(r1.primary.phi.alpha, 2) && approxEq(r2.primary.phi.alpha, 1.5),
         'a1=' + r1.primary.phi.alpha + ' a2=' + r2.primary.phi.alpha);
    }
  }

  // ===========================================================================
  // §4. Warm-start contract — the EXACT c-slider bug + its fix. The solver's
  // warm-start trusts the seed's own gauge; the UI must inject the live gauge
  // into the seed (via warmStartUpdate) before passing it. Guards both halves.
  // ===========================================================================
  {
    const desc = MODES.unbounded;
    const hData = { poles: [], polyPart: [{ re: 0, im: 0 }, { re: 0, im: 0 }, { re: 1, im: 0 }] }; // deltoid h = w²
    mockState.mode = 'unbounded'; mockState.c = 0.5;
    const o0 = {}; desc.applyNorm(o0, desc.buildNorm(hData, mockState));
    const base = solveInverseQD(hData, o0);
    ok('§4 baseline deltoid solves at c=0.5', base.success && approxEq(base.primary.phi.c, 0.5),
       base.error || ('c=' + (base.primary && base.primary.phi.c)));
    if (base.success) {
      mockState.c = 2.0;
      const norm2 = desc.buildNorm(hData, mockState);
      const opts2 = {}; desc.applyNorm(opts2, norm2);

      // (a) stale seed (c=0.5) — the solver pins the OLD gauge → documents WHY
      //     the UI must inject. If this ever returns 2.0, the warm-start contract
      //     changed and the UI workaround can be revisited.
      const stale = QD_NS.clonePhi(base.primary.phi);
      const rStale = solveInverseQD(hData, Object.assign({}, opts2, { warmPhi: stale }));
      ok('§4 stale warm seed pins the old c (why the UI injects the gauge)',
         rStale.success && approxEq(rStale.primary.phi.c, 0.5),
         'c=' + (rStale.primary && rStale.primary.phi.c));

      // (b) gauge-injected seed (the fix) — warmStartUpdate sets c=2.0 → new φ.
      const fresh = QD_NS.clonePhi(base.primary.phi);
      desc.warmStartUpdate(fresh, norm2);
      const rFix = solveInverseQD(hData, Object.assign({}, opts2, { warmPhi: fresh }));
      ok('§4 gauge-injected warm seed → new c (the fix)',
         rFix.success && approxEq(rFix.primary.phi.c, 2.0),
         'c=' + (rFix.primary && rFix.primary.phi.c));
    }
  }
};
