// =============================================================================
// ui.js -- Frontend for the Quadrature Domain Solver
//
// File layout (search the banner comments / function names below to jump;
// approximate line numbers in brackets drift — names are the stable anchors):
//
//   Preset library            [in ui-presets.js] quadrature-function presets
//   MODE DESCRIPTORS / MODES   [~60] single source of truth for all 10 modes:
//                              family tag, visible cards, preset list, norm
//                              build, vector-field label, auto-escalate flag
//   Aggressiveness presets     [~358] numRestarts / Newton tol / cont. steps
//   State                      [in ui-state.js] the single source of UI truth
//   Search options             [~424] advanced panel: per-phase toggles + overrides
//   Helpers                    [~536] $, debounce, fmtArg, subscripts
//   buildHData / buildW0        [~551] read DOM → solver input
//   Polar slider bookkeeping   [~608]
//   renderPolesList /          [~644] build the pole-control cards
//     renderPolyCoefList              and the poly-coefficient cards
//   quickSolveAndRender        [~798] snappy warm-start path for slider drags
//   solveAndRender             [~874] MAIN solve pipeline (debounced) — see its
//                              own header for the step-by-step contract
//   scheduleGeomClassification / [~992] async geometric-univalence card (§25):
//     renderGeomProps                 convex / star-like / spiral-like status
//   FAMILY_TO_MODE /           [~1055] §23 auto-switch reflector: mirror the
//     reflectFamilyMode               solver-chosen PQD regime into the compact
//                                     domain-type control (via applyModeVisuals)
//   showSolution               [~1071] push a solution to canvas + Riemann display
//   renderRiemannMap           [~1215] DOM render of φ(z) into the Domain-type tile (the
//                              LaTeX itself comes from QD.RiemannLatex.build in
//                              riemann-latex.js — pure + Node-testable)
//   refreshAlternatesPanel     build the alternates UI
//   startBackgroundAltSearch   [~1598] chunked async alternate-hunt after solve
//   class DomainPlot           [~1664] canvas plot: axes, boundary, poles, field
//   DOM wiring                 [~1678] all event listeners
//   applyModeVisuals / setMode [~1946] mode chrome (descriptor-driven) + switch
//   View-mode toggle           [~2095] inverse | direct (HANDOFF #30)
//   mountQolHelp               [~2149] the "?" help popovers on each card
//   Search-options panel wiring[~2436]
//   Direct-view hooks          [~2556] QD.Direct._sendHToInverseTab cross-load
//   Param-slice cross-tab hooks[~2669] QD_UI.snapshotScenario / loadScenarioIntoQdTab
//
// All math is delegated to QD (= window.QD from solver.js); this file only
// translates between DOM state and QD calls.
// =============================================================================
'use strict';

// NB: `complex.js` already declares `Complex` in the shared script lexical
// scope, so we must NOT redeclare it here. Reference it via QD.Complex when
// needed, or via the unaliased global from complex.js.

// ===========================================================================
// Preset library lives in ui-presets.js (P0 split, §1.1).
// ---------------------------------------------------------------------------
// That file attaches each list to a top-level global keeping the original
// const name (QD_PRESETS_BOUNDED, QD_PRESETS_UNBOUNDED, LQD_PRESETS_BOUNDED,
// LQD_PRESETS_BOUNDED_SINGULAR, LQD_PRESETS_UNBOUNDED,
// LQD_PRESETS_UNBOUNDED_SINGULAR) AND mirrors them under window.QD_UI.Presets.*
// for any future namespaced reader. Bare identifiers below resolve to those
// globals — no other ui.js change required by the move.
// ===========================================================================


// ===========================================================================
// MODE DESCRIPTORS (R5)
// ---------------------------------------------------------------------------
// Single source of truth for everything that varies between QD/LQD modes:
//   • the family tag expected on phi
//   • which UI cards are visible
//   • which preset list to populate the dropdown with
//   • how to build the `norm` and route into solver opts
//   • the vector-field "external" label
//   • whether auto-escalate runs on solve failure
//
// Adding a new mode (e.g. the upcoming unbounded LQDs) is one entry here +
// one radio in index.html + per-family solver file. No more if/else chains
// scattered across setMode / buildNormalization / applyNormToOpts /
// quickSolveAndRender / currentPresetList.
// ===========================================================================
const MODES = {
  'bounded': {
    label: 'Bounded QD',
    familyTag:        undefined,           // legacy: untagged phi (boundedQD)
    cards: { w0: true, c: false, poly: false, q: false, alpha: false },
    hint: null,
    presets:          () => QD_PRESETS_BOUNDED,
    externalFieldLabel: 'External field   w − h̄(w)',
    externalFieldKind:  'qd',              // 'qd' = w − h̄;  'lqd' = ln|w|²/w̄ − h̄
    vectorFieldOriginAbs2Floor: 1e-30,     // origin not in Ω, no special clip
    extraHContrib:    null,                // no extra terms beyond polyPart + finite poles
    autoEscalate:     true,
    buildNorm(hData, state) {
      const w0 = buildW0(hData);
      if (w0.error) return w0;
      return { w0: w0.w0 };
    },
    applyNorm(opts, norm) { opts.w0 = norm.w0; },
    warmStartUpdate(initPhi, norm) { initPhi.w0 = { re: norm.w0.re, im: norm.w0.im }; },
  },
  'pqd-bounded': {
    label: 'Bounded PQD',
    familyTag:        'powerQD',
    cards: { w0: true, c: false, poly: false, q: false, alpha: true },
    hint:             'pqd-hint',
    presets:          () => QD_PRESETS_BOUNDED_PQD,
    externalFieldLabel: 'External field   (1/α)w|w|^{2(α−1)} − h̄(w)',
    externalFieldKind:  'pqd',
    vectorFieldOriginAbs2Floor: 1e-30,
    extraHContrib:    null,
    autoEscalate:     false,               // PQD existence has a realizability
                                           // floor; auto-escalate doesn't help.
    // In 'auto' w₀-mode w₀ = the live centroid of the poles, recomputed on every
    // solve (so it tracks continuously while a pole is dragged and stays
    // interior — avoids a stale w₀ drifting OUT of Ω on a long drag). The user
    // can still pin a manual w₀.
    buildNorm(hData, state) {
      // α from the dedicated PQD input: any real α > 0, α ≠ 1 (QA milestone).
      const alpha = +state.alpha;
      if (!(alpha > 0) || alpha === 1) {
        return { error: 'PQD power α must be a real number > 0 with α ≠ 1 (α = 1 is classical bounded QD).' };
      }
      const w0 = buildW0(hData);                  // manual value, or the centroid
      if (w0.error) return w0;
      let center = w0.w0;
      // A bounded PQD needs w₀ ≠ 0 (0 ∉ Ω). In auto mode, if the centroid lands
      // ~0 (e.g. poles symmetric about the origin) fall back to the
      // dominant-|residue| pole (always interior, ≠ 0) — the same candidate
      // order as bootstrapW0_PQD, but without the per-frame nested classical
      // solve, so it stays cheap during a drag.
      if (state.w0Mode !== 'manual' && QD.Complex.abs(center) < 1e-9) {
        let best = null, bestMag = -1;
        for (const p of hData.poles) {
          const mag = p.principal.length ? QD.Complex.abs(p.principal[0]) : 0;
          if (mag > bestMag && QD.Complex.abs(p.a) > 1e-9) { bestMag = mag; best = p.a; }
        }
        if (best) center = best;
      }
      if (QD.Complex.abs(center) < 1e-12) {
        return { error: 'Bounded PQD requires w₀ ≠ 0 (0 ∉ Ω assumed).' };
      }
      return { w0: center, alpha };
    },
    applyNorm(opts, norm) {
      // buildNorm always supplies w0 now (centroid in auto, manual otherwise),
      // so opts.w0 is set every solve. The `if` only guards the degenerate
      // no-w0 shape; solver-side bootstrapW0_PQD remains the fallback when w0 is
      // genuinely absent (e.g. headless/direct callers).
      if (norm.w0) opts.w0 = norm.w0;
      opts.alpha = norm.alpha;
    },
    warmStartUpdate(initPhi, norm) {
      if (norm.w0) initPhi.w0 = { re: norm.w0.re, im: norm.w0.im };
      initPhi.alpha = norm.alpha;
    },
  },
  'pqd-bounded-singular': {
    label: 'Bounded singular PQD',
    familyTag:        'powerQD_singular',
    cards: { w0: true, c: false, poly: false, q: false, alpha: true },
    hint:             'pqd-singular-hint',
    presets:          () => QD_PRESETS_BOUNDED_PQD_SINGULAR,
    externalFieldLabel: 'External field   (1/α)w|w|^{2(α−1)} − h̄(w)',
    externalFieldKind:  'pqd',
    vectorFieldOriginAbs2Floor: 1e-30,
    extraHContrib:    null,
    autoEscalate:     false,
    buildNorm(hData, state) {
      // Singular PQD: 0 ∈ Ω (the origin is the Blaschke-zero image φ(z₀)=0),
      // but w₀ = φ(0) is a DIFFERENT interior point and must be nonzero (it
      // appears in the hardwired constant w₀^α/|z₀|^α).
      const w0 = buildW0(hData);
      if (w0.error) return w0;
      if (QD.Complex.abs(w0.w0) < 1e-12) {
        return { error: 'Bounded singular PQD requires w₀ = φ(0) ≠ 0 (a non-origin interior point). Set a manual w₀.' };
      }
      const alpha = +state.alpha;
      if (!(alpha > 0) || alpha === 1) {
        return { error: 'PQD power α must be a real number > 0 with α ≠ 1 (α = 1 is classical bounded QD).' };
      }
      return { w0: w0.w0, alpha, singular: true };
    },
    applyNorm(opts, norm) {
      opts.w0 = norm.w0;
      opts.alpha = norm.alpha;
      opts.singular = true;
    },
    warmStartUpdate(initPhi, norm) {
      initPhi.w0 = { re: norm.w0.re, im: norm.w0.im };
      initPhi.alpha = norm.alpha;
    },
  },
  'pqd-unbounded': {
    label: 'Unbounded PQD',
    familyTag:        'unboundedPQD',
    cards: { w0: false, c: true, poly: true, q: false, alpha: true },
    hint:             'pqd-unbounded-hint',
    presets:          () => QD_PRESETS_UNBOUNDED_PQD,
    externalFieldLabel: 'External field   (1/α)w|w|^{2(α−1)} − h̄(w)',
    externalFieldKind:  'pqd',
    vectorFieldOriginAbs2Floor: 1e-30,
    extraHContrib:    null,
    autoEscalate:     false,
    buildNorm(hData, state) {
      // Unbounded PQD: φ(z)=z·(r#)^{1/α} on 𝔻*, r#(∞)=c^α. c is the conformal
      // radius (user input, as classical unbounded QD); α any real > 0, α ≠ 1.
      const c = +state.c;
      if (!(c > 0) || !isFinite(c)) return { error: 'c must be a positive number' };
      const alpha = +state.alpha;
      if (!(alpha > 0) || alpha === 1) {
        return { error: 'PQD power α must be a real number > 0 with α ≠ 1 (α = 1 is classical unbounded QD).' };
      }
      return { c, alpha, unbounded: true };
    },
    applyNorm(opts, norm) { opts.unbounded = true; opts.c = norm.c; opts.alpha = norm.alpha; },
    warmStartUpdate(initPhi, norm) { initPhi.c = norm.c; initPhi.alpha = norm.alpha; },
  },
  'pqd-unbounded-singular': {
    label: 'Unbounded singular PQD',
    familyTag:        'unboundedPQD_singular',
    cards: { w0: false, c: true, poly: true, q: false, alpha: true },
    hint:             'pqd-unbounded-singular-hint',
    presets:          () => QD_PRESETS_UNBOUNDED_PQD_SINGULAR,
    externalFieldLabel: 'External field   (1/α)w|w|^{2(α−1)} − h̄(w)',
    externalFieldKind:  'pqd',
    vectorFieldOriginAbs2Floor: 1e-30,
    extraHContrib:    null,
    autoEscalate:     false,
    buildNorm(hData, state) {
      // Unbounded singular PQD: 0 ∈ Ω (origin-preimage z₀ ∈ 𝔻*, φ(z₀)=0).
      // No q; the z₀-closure is r(z₀)=0 (Prop 4.6.3). c is the conformal radius.
      const c = +state.c;
      if (!(c > 0) || !isFinite(c)) return { error: 'c must be a positive number' };
      const alpha = +state.alpha;
      if (!(alpha > 0) || alpha === 1) {
        return { error: 'PQD power α must be a real number > 0 with α ≠ 1 (α = 1 is classical unbounded QD).' };
      }
      return { c, alpha, unbounded: true, singular: true };
    },
    applyNorm(opts, norm) { opts.unbounded = true; opts.singular = true; opts.c = norm.c; opts.alpha = norm.alpha; },
    warmStartUpdate(initPhi, norm) { initPhi.c = norm.c; initPhi.alpha = norm.alpha; },
  },
  'unbounded': {
    label: 'Unbounded QD',
    familyTag:        undefined,           // legacy: untagged phi (unboundedQD)
    cards: { w0: false, c: true, poly: true, q: false },
    hint: null,
    presets:          () => QD_PRESETS_UNBOUNDED,
    externalFieldLabel: 'External field   w − h̄(w)',
    externalFieldKind:  'qd',
    vectorFieldOriginAbs2Floor: 1e-30,
    extraHContrib:    null,
    autoEscalate:     true,
    buildNorm(hData, state) {
      const c = +state.c;
      if (!(c > 0) || !isFinite(c)) return { error: 'c must be a positive number' };
      return { c, unbounded: true };
    },
    applyNorm(opts, norm) { opts.unbounded = true; opts.c = norm.c; },
    warmStartUpdate(initPhi, norm) { initPhi.c = norm.c; },
  },
  'lqd-bounded': {
    label: 'Bounded LQD',
    familyTag:        'boundedLQD',
    cards: { w0: true, c: false, poly: false, q: false },
    hint:             'lqd-hint',
    presets:          () => LQD_PRESETS_BOUNDED,
    externalFieldLabel: 'External field   ln|w|²/w̄ − h̄(w)',
    externalFieldKind:  'lqd',
    vectorFieldOriginAbs2Floor: 1e-30,     // 0 ∉ Ω̄, no special clip
    extraHContrib:    null,
    autoEscalate:     false,                // existence is constrained (Thm 5.3.2)
    buildNorm(hData, state) {
      const w0 = buildW0(hData);
      if (w0.error) return w0;
      if (QD.Complex.abs(w0.w0) < 1e-12) {
        return { error: 'LQD mode requires w₀ ≠ 0 (non-singular: 0 ∉ Ω̄). Set a manual w₀.' };
      }
      return { w0: w0.w0, lqd: true };
    },
    applyNorm(opts, norm) { opts.lqd = true; opts.w0 = norm.w0; },
    warmStartUpdate(initPhi, norm) { initPhi.w0 = { re: norm.w0.re, im: norm.w0.im }; },
  },
  'lqd-unbounded': {
    label: 'Unbounded LQD',
    familyTag:        'unboundedLQD',
    cards: { w0: false, c: true, poly: true, q: false },
    hint:             'lqd-unbounded-hint',
    presets:          () => LQD_PRESETS_UNBOUNDED,
    externalFieldLabel: 'External field   ln|w|²/w̄ − h̄(w)',
    externalFieldKind:  'lqd',
    vectorFieldOriginAbs2Floor: 1e-30,    // 0 ∈ K, no special clip
    extraHContrib:    null,
    autoEscalate:     false,
    buildNorm(hData, state) {
      const c = +state.c;
      if (!(c > 0) || !isFinite(c)) return { error: 'c must be a positive number' };
      return { c, lqd: true, unbounded: true };
    },
    applyNorm(opts, norm) { opts.unbounded = true; opts.lqd = true; opts.c = norm.c; },
    warmStartUpdate(initPhi, norm) { initPhi.c = norm.c; },
  },
  'lqd-unbounded-singular': {
    label: 'Unbounded singular LQD',
    familyTag:        'unboundedLQD_singular',
    cards: { w0: false, c: true, poly: true, q: true },
    hint:             'lqd-unbounded-singular-hint',
    presets:          () => LQD_PRESETS_UNBOUNDED_SINGULAR,
    externalFieldLabel: 'External field   ln|w|²/w̄ − h̄(w)',
    externalFieldKind:  'lqd',
    vectorFieldOriginAbs2Floor: 1e-4,      // 0 ∈ Ω; clip arrows near origin
    extraHContrib(w, hData, phi, state) {
      // Singular LQD: h has an extra q/w pole at the origin.
      const q = (phi && phi.q) ? phi.q : QD.Complex.parse(state.q) || { re: 0, im: 0 };
      const denQ = w.re * w.re + w.im * w.im;
      if (denQ < 1e-30) return { re: 0, im: 0 };
      return {
        re: (q.re * w.re + q.im * w.im) / denQ,
        im: (q.im * w.re - q.re * w.im) / denQ,
      };
    },
    autoEscalate:     false,
    buildNorm(hData, state) {
      const c = +state.c;
      if (!(c > 0) || !isFinite(c)) return { error: 'c must be a positive number' };
      const q = QD.Complex.parse(state.q);
      if (!q) return { error: 'Invalid value for q' };
      return { c, q, lqd: true, unbounded: true, singular: true };
    },
    applyNorm(opts, norm) {
      opts.unbounded = true; opts.lqd = true; opts.singular = true;
      opts.c = norm.c; opts.q = norm.q;
    },
    warmStartUpdate(initPhi, norm) {
      initPhi.c = norm.c;
      initPhi.q = { re: norm.q.re, im: norm.q.im };
    },
  },
  'lqd-bounded-singular': {
    label: 'Bounded singular LQD',
    familyTag:        'boundedLQD_singular',
    cards: { w0: true, c: false, poly: false, q: true },
    hint:             'lqd-singular-hint',
    presets:          () => LQD_PRESETS_BOUNDED_SINGULAR,
    externalFieldLabel: 'External field   ln|w|²/w̄ − h̄(w)',
    externalFieldKind:  'lqd',
    vectorFieldOriginAbs2Floor: 1e-4,      // 0 ∈ Ω; clip arrows near origin
    // Singular LQDs add a simple pole of h at w = 0 with residue q.
    extraHContrib(w, hData, phi, state) {
      const q = (phi && phi.q) ? phi.q : QD.Complex.parse(state.q) || { re: 0, im: 0 };
      const denQ = w.re * w.re + w.im * w.im;
      if (denQ < 1e-30) return { re: 0, im: 0 };
      return {
        re: (q.re * w.re + q.im * w.im) / denQ,
        im: (q.im * w.re - q.re * w.im) / denQ,
      };
    },
    autoEscalate:     false,
    buildNorm(hData, state) {
      const w0 = buildW0(hData);
      if (w0.error) return w0;
      if (QD.Complex.abs(w0.w0) < 1e-12) {
        return { error: 'Singular LQD requires w₀ = φ(0) ≠ 0 (preimage 0 ↔ z_0 ≠ 0). Set a manual w₀.' };
      }
      const q = QD.Complex.parse(state.q);
      if (!q) return { error: 'Invalid value for q' };
      return { w0: w0.w0, q, lqd: true, singular: true };
    },
    applyNorm(opts, norm) {
      opts.lqd = true; opts.singular = true; opts.w0 = norm.w0; opts.q = norm.q;
    },
    warmStartUpdate(initPhi, norm) {
      initPhi.w0 = { re: norm.w0.re, im: norm.w0.im };
      initPhi.q  = { re: norm.q.re,  im: norm.q.im  };
    },
  },
};

function modeDescriptor() { return MODES[state.mode] || MODES['bounded']; }

function currentPresetList() {
  return modeDescriptor().presets();
}

// ===========================================================================
// Aggressiveness presets
// ---------------------------------------------------------------------------
// Each entry tunes the four cost knobs of the solver:
//
//   numRestarts         — multistart budget AND base for diverse/deflation
//                         phases AND foreground alternates loop
//   newton.maxIter      — per-Newton-attempt iteration cap
//   newton.tolerance    — residual at which Newton declares success
//   continuation.tStart — initial step in the pole-distance continuation
//   continuation.growFactor — how aggressively to grow t each successful step
//   bgAltChunks         — number of background search rounds after a solve
//   bgAltChunkSize      — restarts per background round
//
// Total background alternate-search restarts = bgAltChunks × bgAltChunkSize.
// To make presets more/less aggressive, just edit the numbers here.
// "exhaustive" is also wired to the "Try harder" button in the UI.
// ===========================================================================

const PRESETS = {

  //              | numRestarts |  Newton              |  Continuation              |  bgAltChunks × size
  //              | (a3 + alts) |  maxIter   tolerance |  tStart    growFactor      |  → total bg restarts
  quick: {
    numRestarts:    3,
    newton:       { maxIter:  40, tolerance: 1e-8  },
    continuation: { tStart: 0.20, growFactor: 2.0 },
    bgAltChunks:    8,
    bgAltChunkSize: 4,
  },

  standard: {
    numRestarts:    8,
    newton:       { maxIter:  80, tolerance: 1e-10 },
    continuation: { tStart: 0.10, growFactor: 1.6  },
    bgAltChunks:   20,
    bgAltChunkSize: 6,
  },

  thorough: {
    numRestarts:   20,
    newton:       { maxIter: 150, tolerance: 1e-12 },
    continuation: { tStart: 0.05, growFactor: 1.4  },
    bgAltChunks:   40,
    bgAltChunkSize: 8,
  },

  // Used by the "Try harder" button (and auto-escalation, when enabled in
  // the search-options panel). Much larger multistart budget; deflation is
  // implicit (always on in solveInverseQD once spurious roots appear).
  exhaustive: {
    numRestarts:   60,
    newton:       { maxIter: 200, tolerance: 1e-12 },
    continuation: { tStart: 0.03, growFactor: 1.3  },
    bgAltChunks:   60,
    bgAltChunkSize: 10,
  },

};

// ---------- State --------------------------------------------------------
// The `state` object lives in ui-state.js (A1 split). It's still a
// cross-script-realm `const` so the bare identifier resolves here, and
// is also exposed via window.QD_UI.state for explicit-namespace callers.
// See ui-state.js for the field-by-field schema.

// ===========================================================================
// Search options (advanced panel)
// ---------------------------------------------------------------------------
// The panel exposes per-phase toggles and numeric overrides for everything
// in the aggressiveness preset, plus a few solver knobs the preset doesn't
// touch. Blank numeric fields fall back to the preset.
// ===========================================================================

// Read a number from a text/number input. Returns null when blank / NaN
// so the caller knows to fall back to the preset.
function readNumOrNull(sel) {
  const v = $(sel).value.trim();
  if (v === '') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

// Read the entire search-options DOM into state.searchOptions.
function readSearchOptions() {
  const so = state.searchOptions;
  so.phases.direct       = $('#so-phase-direct').checked;
  so.phases.continuation = $('#so-phase-continuation').checked;
  so.phases.multistart   = $('#so-phase-multistart').checked;
  so.phases.diverse      = $('#so-phase-diverse').checked;
  so.phases.deflation    = $('#so-phase-deflation').checked;

  so.numRestarts   = readNumOrNull('#so-num-restarts');
  so.numDiverse    = readNumOrNull('#so-num-diverse');
  so.numDeflation  = readNumOrNull('#so-num-deflation');
  so.bgChunks      = readNumOrNull('#so-bg-chunks');
  so.bgChunkSize   = readNumOrNull('#so-bg-chunk-size');
  so.keepSearching = $('#so-keep-searching').checked;

  so.newtonMaxIter = readNumOrNull('#so-newton-maxiter');
  so.newtonTol     = readNumOrNull('#so-newton-tol');
  so.contTStart    = readNumOrNull('#so-cont-tstart');
  so.contGrow      = readNumOrNull('#so-cont-grow');

  so.deflationAlpha   = readNumOrNull('#so-defl-alpha');
  so.deflationP       = readNumOrNull('#so-defl-p');
  so.deflateFromValid = $('#so-defl-from-valid').checked;

  so.univalenceSamples = readNumOrNull('#so-uni-samples');
  so.identityTol       = readNumOrNull('#so-id-tol');
  so.showNonUnivalent  = $('#so-show-non-univalent').checked;
  so.showIdFailing     = $('#so-show-id-failing').checked;
  so.autoEscalate      = $('#so-auto-escalate').checked;

  so.seed = readNumOrNull('#so-seed');
}

// Clear every override field; checkboxes return to default state.
function resetSearchOptions() {
  ['#so-num-restarts', '#so-num-diverse', '#so-num-deflation',
   '#so-bg-chunks', '#so-bg-chunk-size',
   '#so-newton-maxiter', '#so-newton-tol', '#so-cont-tstart', '#so-cont-grow',
   '#so-defl-alpha', '#so-defl-p',
   '#so-uni-samples', '#so-id-tol', '#so-seed'].forEach(s => { $(s).value = ''; });
  ['#so-phase-direct', '#so-phase-continuation', '#so-phase-multistart',
   '#so-phase-diverse', '#so-phase-deflation', '#so-auto-escalate'
  ].forEach(s => { $(s).checked = true; });
  ['#so-keep-searching', '#so-defl-from-valid',
   '#so-show-non-univalent', '#so-show-id-failing'
  ].forEach(s => { $(s).checked = false; });
  readSearchOptions();
}

// Build the option-bag passed to QD.solveInverseQD. Layers overrides on top
// of an aggressiveness preset.
function buildSolverOptions(preset, { findAlternates = false } = {}) {
  const so = state.searchOptions;
  const opts = {
    numRestarts:      so.numRestarts   ?? preset.numRestarts,
    newton: {
      maxIter:   so.newtonMaxIter ?? preset.newton.maxIter,
      tolerance: so.newtonTol     ?? preset.newton.tolerance,
    },
    continuation: {
      tStart:     so.contTStart ?? preset.continuation.tStart,
      growFactor: so.contGrow   ?? preset.continuation.growFactor,
    },
    univalenceSamples: so.univalenceSamples ?? state.samples,
    identityTol:       so.identityTol       ?? 1e-6,
    findAlternates,
    usePhases:         { ...so.phases },
    deflationAlpha:    so.deflationAlpha ?? 1,
    deflationP:        so.deflationP     ?? 2,
    deflateFromValid:  so.deflateFromValid,
  };
  if (so.numDiverse   !== null) opts.numDiverseSeeds   = so.numDiverse;
  if (so.numDeflation !== null) opts.numDeflationSeeds = so.numDeflation;
  return opts;
}

// Build the option-bag passed to QD.searchAlternates.
function buildAltSearchOptions(preset, seed) {
  const so = state.searchOptions;
  return {
    numRestarts:       so.bgChunkSize ?? preset.bgAltChunkSize,
    seed,
    newton: {
      maxIter:   so.newtonMaxIter ?? preset.newton.maxIter,
      tolerance: so.newtonTol     ?? preset.newton.tolerance,
    },
    univalenceSamples: so.univalenceSamples ?? state.samples,
    identityTol:       so.identityTol       ?? 1e-6,
    deflateFromKnown:  true,
    deflationAlpha:    so.deflationAlpha ?? 1,
    deflationP:        so.deflationP     ?? 2,
  };
}

// ---------- Helpers ------------------------------------------------------
const subs = ['₀','₁','₂','₃','₄','₅','₆','₇','₈','₉'];
const sub  = n => String(n).split('').map(d => subs[+d] || d).join('');

function $(sel, parent = document) { return parent.querySelector(sel); }
function $$(sel, parent = document) { return Array.from(parent.querySelectorAll(sel)); }

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...args); }, ms);
  };
}

// ---------- Build hData from state --------------------------------------
function buildHData() {
  const poles = [];
  for (let j = 0; j < state.poles.length; j++) {
    const p = state.poles[j];
    const a = QD.Complex.parse(p.a);
    if (!a) return { error: `Pole ${j+1}: invalid value for a` };
    const principal = [];
    for (let s = 0; s < p.order; s++) {
      const c = QD.Complex.parse(p.residues[s] || '0');
      if (!c) return { error: `Pole ${j+1}: invalid value for C${sub(s+1)}` };
      principal.push(c);
    }
    poles.push({ a, principal });
  }
  // Polynomial part of h. Allowed in any "unbounded-like" mode where the
  // panel is meaningful (classical unbounded + both unbounded-LQD variants).
  // NB: the unbounded-LQD solvers currently DON'T match polynomial-h in
  // their (★) system — see solver-uqd-lqd.js header. The validation below
  // (in solveAndRender via buildNormalization) surfaces a clear error to
  // the user when they attempt to solve with a nonzero LQD polynomial part.
  const polyPart = [];
  if (modeAllowsPoly(state.mode) && state.polyDegree >= 0) {
    for (let l = 0; l <= state.polyDegree; l++) {
      const c = QD.Complex.parse(state.polyCoeffs[l] ?? '0');
      if (!c) return { error: `Poly coef C∞,${l}: invalid value` };
      polyPart.push(c);
    }
  }
  if (poles.length === 0 && polyPart.length === 0) return null;
  return { poles, polyPart };
}

function buildW0(hData) {
  if (state.w0Mode === 'manual') {
    const w0 = QD.Complex.parse(state.w0Manual);
    if (!w0) return { error: 'Invalid value for φ(0)' };
    return { w0 };
  }
  // centroid
  let sumRe = 0, sumIm = 0;
  for (const p of hData.poles) { sumRe += p.a.re; sumIm += p.a.im; }
  return { w0: { re: sumRe / hData.poles.length, im: sumIm / hData.poles.length } };
}

// Copy the normalization signal from `norm` into a solver-options object,
// preserving the (unbounded, c) | (w0) | (lqd, w0) distinction. Used at every
// call site that hands off to QD.solveInverseQD.
function applyNormToOpts(opts, norm) {
  modeDescriptor().applyNorm(opts, norm);
  return opts;
}

function buildNormalization(hData) {
  return modeDescriptor().buildNorm(hData, state);
}

// ---------------------------------------------------------------------------
// PrimarySolution publish helper: forward state.current to QD.PrimarySolution
// so cross-tab readers (Schwarz, Sphere, Param-slice) can subscribe instead
// of reaching into state.current directly. ui.js remains the canonical
// writer; this is a published mirror.
// ---------------------------------------------------------------------------
function publishPrimarySolution() {
  if (!QD.PrimarySolution) return;          // tolerate missing module (test contexts)
  QD.PrimarySolution.publish(state.current);
}

// ===========================================================================
// Polar (magnitude / argument) helpers and slider-range bookkeeping
// ===========================================================================

// Slider max for |C| is cached per residue so it persists across re-renders
// and grows automatically when the user types a larger value.
const magSliderMax = {};

function residueKey(poleIdx, s) {
  return `pole-${poleIdx}-residue-${s}`;
}

function magMaxFor(key, mag) {
  // Default starting max is 5; grow when needed; never shrink automatically.
  const current = magSliderMax[key] ?? 5;
  const target = mag > current * 0.95 ? Math.max(current, Math.ceil(mag * 1.5)) : current;
  magSliderMax[key] = target;
  return target;
}

// Format an argument value (radians) as a multiple of π for the slider readout.
function fmtArg(arg) {
  return (arg / Math.PI).toFixed(3) + 'π';
}

// ---------- Render the pole controls ------------------------------------
function renderPolesList() {
  const list = $('#poles-list');
  list.innerHTML = '';

  state.poles.forEach((pole, idx) => {
    // Each pole is a collapsible <details>, collapsed by default. The summary
    // shows the pole index + its location so collapsed poles stay identifiable.
    // Event delegation (#poles-list) targets `.pole` via closest(), so a
    // <details class="pole"> works unchanged.
    const div = document.createElement('details');
    div.className = 'pole';
    div.dataset.idx = idx;
    div.innerHTML = `
      <summary class="pole-header">
        <span class="pole-num">Pole ${idx + 1}</span>
        <span class="pole-loc">a = ${escapeHTML(pole.a)}</span>
        <button type="button" class="small danger" data-action="remove" title="Remove this pole">×</button>
      </summary>
      <div class="row">
        <label>a${sub(idx+1)} =
          <input type="text" class="cnum" data-field="a" value="${escapeAttr(pole.a)}"
                 aria-label="Pole ${idx + 1} location (complex)">
        </label>
      </div>
      <div class="row">
        <label>Order:
          <input type="number" min="1" max="6" value="${pole.order}" data-field="order" style="width: 56px;"
                 aria-label="Pole ${idx + 1} order">
        </label>
      </div>
      <div class="residues"></div>
    `;
    const residuesEl = $('.residues', div);
    for (let s = 0; s < pole.order; s++) {
      const cval = Complex.parse(pole.residues[s] || '0') || { re: 0, im: 0 };
      const mag = Math.hypot(cval.re, cval.im);
      const arg = Math.atan2(cval.im, cval.re);
      const key = residueKey(idx, s);
      const magMax = magMaxFor(key, mag);

      const block = document.createElement('div');
      block.className = 'residue-block';
      block.dataset.s = s;
      block.innerHTML = `
        <div class="residue-row">
          <span class="label-fixed">C${sub(idx+1)}${sub(s+1)}</span>
          =
          <input type="text" class="cnum residue" data-field="residue" data-s="${s}" value="${escapeAttr(pole.residues[s] || '')}"
                 aria-label="Pole ${idx + 1} residue C${idx + 1},${s + 1} (complex)">
        </div>
        <div class="slider1d-row">
          <label>|C|</label>
          <input type="range" class="slider1d slider1d-mag" data-s="${s}"
                 min="0" max="${magMax}" step="any" value="${mag}"
                 aria-label="Pole ${idx + 1} residue ${s + 1} magnitude">
          <span class="slider1d-val mag-val">${mag.toFixed(3)}</span>
        </div>
        <div class="slider1d-row">
          <label>arg</label>
          <input type="range" class="slider1d slider1d-arg" data-s="${s}"
                 min="${-Math.PI}" max="${Math.PI}" step="any" value="${arg}"
                 aria-label="Pole ${idx + 1} residue ${s + 1} argument">
          <span class="slider1d-val arg-val">${fmtArg(arg)}</span>
        </div>
      `;
      residuesEl.appendChild(block);
    }
    list.appendChild(div);
  });
  if (typeof refreshHText === 'function') refreshHText();
}

// Render the polynomial-part coefficient list. One block per C_{∞,l} for
// l = 0..polyDegree, with magnitude/argument sliders matching the residue
// rows. Visible in any mode where polynomial-h is meaningful (classical
// unbounded + both unbounded-LQD variants — see modeAllowsPoly).
function renderPolyCoefList() {
  const list = $('#poly-coefs-list');
  if (!list) return;
  list.innerHTML = '';
  const deg = state.polyDegree;
  if (!modeAllowsPoly(state.mode) || deg < 0) return;

  // Ensure polyCoeffs has at least deg+1 entries (pad with '0').
  while (state.polyCoeffs.length < deg + 1) state.polyCoeffs.push('0');
  state.polyCoeffs.length = deg + 1;          // truncate any extras

  for (let l = 0; l <= deg; l++) {
    const cval = QD.Complex.parse(state.polyCoeffs[l] || '0') || { re: 0, im: 0 };
    const mag = Math.hypot(cval.re, cval.im);
    const arg = Math.atan2(cval.im, cval.re);
    const key = `poly-coef-${l}`;
    const magMax = magMaxFor(key, mag);
    const block = document.createElement('div');
    block.className = 'residue-block';
    block.dataset.polyL = l;
    block.innerHTML = `
      <div class="residue-row">
        <span class="label-fixed">C<sub>∞,${l}</sub></span>
        =
        <input type="text" class="cnum poly-coef" data-poly-l="${l}" value="${escapeAttr(state.polyCoeffs[l] || '')}"
               aria-label="Polynomial-part coefficient C∞,${l} (complex)">
      </div>
      <div class="slider1d-row">
        <label>|C|</label>
        <input type="range" class="slider1d slider1d-poly-mag" data-poly-l="${l}"
               min="0" max="${magMax}" step="any" value="${mag}"
               aria-label="Polynomial coefficient ${l} magnitude">
        <span class="slider1d-val poly-mag-val">${mag.toFixed(3)}</span>
      </div>
      <div class="slider1d-row">
        <label>arg</label>
        <input type="range" class="slider1d slider1d-poly-arg" data-poly-l="${l}"
               min="${-Math.PI}" max="${Math.PI}" step="any" value="${arg}"
               aria-label="Polynomial coefficient ${l} argument">
        <span class="slider1d-val poly-arg-val">${fmtArg(arg)}</span>
      </div>
    `;
    list.appendChild(block);
  }
  if (typeof refreshHText === 'function') refreshHText();
}

function escapeAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }

// ---------- Read controls into state -------------------------------------
// (readPolesFromDOM + markInvalid removed in D8 — both became dead after the
// structured-grid refactor; pole data is now read directly via the grid
// model rather than walking the DOM, and parse-error highlighting is owned
// by #h-text-msg instead of a per-input badge.)

// ---------- Adding / removing poles --------------------------------------
function addPole() {
  state.poles.push({ a: '0', order: 1, residues: ['1'] });
  renderPolesList();
  scheduleSolve();
}
// Add a simple pole (order 1, coefficient 1) at a specific w-plane point.
// Used by the plot's double-click gesture (plot.onAddPole). Mirrors addPole()
// but stamps the clicked position and marks the config as custom (a placed
// pole is a user edit, like a drag).
function addPoleAt(w) {
  state.poles.push({ a: QD.Complex.toString(w, 4), order: 1, residues: ['1'] });
  markAsCustom();
  renderPolesList();
  scheduleSolve();
}
function removePoleAt(idx) {
  state.poles.splice(idx, 1);
  // No defensive "insert a default if empty" — an empty pole list is a valid
  // user intent (e.g. h = polynomial-only in unbounded mode). The solver
  // surfaces "no poles entered" if appropriate. Without this, clicking × on
  // the last remaining pole silently re-inserts a default and looks like
  // "delete did nothing while h-text picked up 1/w".
  renderPolesList();
  scheduleSolve();
}

// ---------- Solving (debounced) ------------------------------------------
// Debounce dropped from 250 ms → 60 ms after P0.2 moved solveAndRender off
// the main thread (the worker absorbs the cost; the debounce only needs to
// coalesce keystroke bursts).
const scheduleSolve = debounce(() => { solveAndRender(); }, 60);

// Snappier path used while a slider is being dragged: rAF-throttled, warm-
// starts from the previous solution, skips multistart / continuation /
// alternate-search, and renders without re-fitting the view.
let _quickSolveRaf = null;
function scheduleQuickSolve() {
  if (_quickSolveRaf) return;
  _quickSolveRaf = requestAnimationFrame(() => {
    _quickSolveRaf = null;
    quickSolveAndRender();
  });
}

function quickSolveAndRender() {
  const built = buildHData();
  if (!built || built.error) return;
  const norm = buildNormalization(built);
  if (norm.error) return;

  const preset = PRESETS[state.aggressiveness];
  const unbounded = !!norm.unbounded;
  const desc = modeDescriptor();
  const expectedFamilyTag = desc.familyTag;

  // Select the Family backend so the rest of the quick-solve path is
  // family-agnostic. Warm-start when the previous solution matches family
  // tag, branch structure, and bounded/unbounded mode; otherwise fresh init.
  const family = QD.selectFamily(norm);
  let initPhi = null;
  const prev = state.current && state.current.success && state.current.primary
             ? state.current.primary.phi : null;
  if (prev &&
      prev.family === expectedFamilyTag &&
      !!prev.unbounded === unbounded &&
      prev.branches.length === built.poles.length &&
      prev.branches.every((br, j) => br.A.length === built.poles[j].principal.length)) {
    initPhi = QD.clonePhi(prev);
    desc.warmStartUpdate(initPhi, norm);
  } else {
    initPhi = family.initialGuess(built, norm);
  }

  state.altSearchToken++;
  state.altSearchActive = false;
  $('#alt-search-indicator').classList.add('hidden');

  // §23 (mid-drag) regime switch. The warm-start below stays within the CURRENT
  // family, but a drag can push the boundary across the origin and flip the
  // singular ↔ non-singular regime. The debounced full solve (which carries
  // autoSwitchSingular) won't fire until the drag pauses, so when the
  // current-family result can't represent the live pole config we run the
  // auto-switching solve INLINE (main thread — a one-off at the crossing; later
  // frames warm-start cheaply in the new regime) and reflect the new family.
  // Returns true iff it committed a switched result. Scoped to the four PQD
  // modes via isPqdAuto; built/norm/preset are captured from the enclosing call.
  const isPqdAuto = state.autoSwitchSingular && /^pqd-/.test(state.mode);
  function tryRegimeSwitch() {
    const swOpts = buildSolverOptions(preset, { findAlternates: false });
    applyNormToOpts(swOpts, norm);
    swOpts.autoSwitchSingular = true;
    let swRes = null;
    try { swRes = QD.solveInverseQD(built, swOpts); } catch (e) { swRes = null; }
    if (!(swRes && swRes.regimeSwitched && swRes.success && swRes.primary && swRes.primary.phi)) {
      return false;
    }
    reflectFamilyMode(swRes.primary.phi.family);
    swRes.hData = built;
    swRes.w0Used = (swRes.primary.phi && swRes.primary.phi.w0) || norm.w0;
    swRes.cUsed  = norm.c;
    swRes.unbounded = !!norm.unbounded;
    state.current = swRes;
    state.selectedSolutionIdx = 0;
    publishPrimarySolution();
    showSolution(swRes.primary, built, /*isPrimary=*/ false);
    refreshAlternatesPanel();
    return true;
  }

  let result;
  try {
    // newtonSolve auto-dispatches Family from initPhi.family — works for QD/LQD.
    result = QD.newtonSolve(initPhi, built, { ...preset.newton, maxIter: 30 });
  } catch (e) { return; }

  if (!result.success) {
    // Warm-start diverged. A mid-drag regime crossing can make the current
    // family's Newton fail outright (especially singular → non-singular as 0
    // leaves Ω), so for PQD auto-switch modes attempt the inline regime switch
    // before giving up; otherwise fall back to the debounced full solve.
    if (isPqdAuto && tryRegimeSwitch()) return;
    scheduleSolve();
    return;
  }

  const phi = family.canonicalizePhi(result.phi);
  const univalent = QD.isBoundaryUnivalent(phi, state.samples);
  const identity  = family.verifyQuadratureIdentity(phi, built, { numSamples: state.samples });
  const identityOK = identity.maxRelDiff < 1e-6;

  // The warm-start succeeded; is it a VALID solution consistent with the current
  // regime? "consistent" = univalent + identity + (origin Ω-membership matches
  // the singular/non-singular mode). Inconsistency catches BOTH a clean crossing
  // (origin membership flips) AND the invalid-ansatz case (the R# non-vanishing
  // guard trips → identityOK false because 0 is on ∂Ω / in Ω while the family
  // assumes otherwise) → switch inline. During normal valid dragging this is
  // consistent, so the cheap warm-start path is taken and no full solve runs.
  if (isPqdAuto) {
    const isSingularMode = state.mode.endsWith('-singular');
    const consistent = univalent && identityOK &&
                       QD.originInsideOmega(phi) === isSingularMode;
    // If a switch is warranted but didn't cleanly happen (auto-switch kept the
    // same regime, or neither regime is valid), fall through and commit the
    // current-family result as-is so the user still sees the live state.
    if (!consistent && tryRegimeSwitch()) return;
  }

  const sol = {
    ...result,
    phi,
    method: 'live',
    univalent,
    identity,
  };
  sol.identityOK = identityOK;

  state.current = {
    success: true,
    primary: sol,
    alternates: [],
    hData: built,
    w0Used: norm.w0 || (sol.phi && sol.phi.w0),
    cUsed:  norm.c,
    unbounded,
    attempts: [],
  };
  state.selectedSolutionIdx = 0;
  publishPrimarySolution();

  showSolution(sol, built, /*isPrimary=*/ false);
  refreshAlternatesPanel();
}

// Token that increments every time solveAndRender() is called. Used to
// discard stale worker results when the user edits faster than solves
// complete.
let _solveAndRenderToken = 0;

// solveAndRender — the main (debounced) solve pipeline. Steps:
//   1. buildHData() + buildNormalization() from the DOM; bail on parse errors.
//   2. Bump _solveAndRenderToken (stale-result guard) and run the solve on the
//      warm PrimarySolverWorker (falls back to a sync QD.solveInverseQD in the
//      no-worker / unit-test path). The worker preempts any in-flight solve.
//   3. Auto-escalate: if the standard preset failed and the mode allows it
//      (MODES[x].autoEscalate — LQDs opt out since non-existence is genuine),
//      retry once with the exhaustive preset.
//   4. After EVERY await, re-check myToken !== _solveAndRenderToken and bail if
//      a newer call superseded this one (prevents stale paints).
//   5. Stash the result on state.current (+ hData/w0Used/cUsed/unbounded) and
//      publishPrimarySolution() so the other tabs see it.
//   6. §23: if the solver auto-switched the PQD singular⇄non-singular regime,
//      reflectFamilyMode() updates the compact domain-type control WITHOUT
//      re-solving, and the alternate search uses the switched norm (normFromPhi).
//   7. showSolution → refreshAlternatesPanel → startBackgroundAltSearch →
//      scheduleGeomClassification (the async geometric-univalence card).
// Map a failed solve into one line of plain-language, mode-aware guidance the
// user can act on, prepended to the raw solver `reason:` dump (B7). The intent
// is to answer "what do I change?" rather than just reporting the failure.
function failureGuidance(mode) {
  const tips = [];
  if (state.aggressiveness !== 'exhaustive') {
    tips.push("try the “Try harder (exhaustive search)” button or raise Aggressiveness");
  }
  if (/^lqd-/.test(mode)) {
    // LQD existence is genuinely bounded (Thm 5.3.2 / 5.6.2): not every h
    // admits a log-weighted QD. Smaller residues / different c can help.
    tips.push("this h may have no log-weighted QD — try smaller residues, or adjust c");
  } else if (/^pqd-/.test(mode)) {
    // PQD realizability needs the residue magnitude above a threshold
    // (C > (pᵃ − w₀ᵃ)²/α²) and an interior w₀.
    tips.push("PQDs need a large-enough residue and an interior w₀ — try a bigger |C| or move w₀");
  } else {
    tips.push("move poles away from each other and the boundary, or adjust residue magnitudes");
  }
  return 'No quadrature domain found. Suggestions: ' + tips.join('; ') + '.';
}

function solveAndRender() {
  const built = buildHData();
  if (!built) {
    setStatus({ kind: 'err', text: 'No poles entered.' });
    return;
  }
  if (built.error) {
    setStatus({ kind: 'err', text: built.error });
    return;
  }

  const norm = buildNormalization(built);
  if (norm.error) {
    setStatus({ kind: 'err', text: norm.error });
    return;
  }

  const preset = PRESETS[state.aggressiveness];
  setStatus({ kind: 'info', text: 'Solving…' });
  showSolveBusy();                          // spinner + Cancel button (B3)
  writeUrlState();                          // keep the shareable URL in sync (B1)

  state.altSearchToken++;
  state.altSearchActive = false;
  $('#alt-search-indicator').classList.add('hidden');

  const myToken = ++_solveAndRenderToken;
  // The worker preempts any prior in-flight solve when called again; on the
  // main-thread fallback this is a no-op. Either way we re-check the token
  // after each await so a stale completion doesn't overwrite a newer state.
  const PSW = QD.PrimarySolverWorker;

  const runOne = (opts) => {
    if (PSW && typeof PSW.solve === 'function') return PSW.solve(built, opts);
    // Fallback (unit-test / no-worker environment): sync solve wrapped in a
    // microtask so the path is uniformly async.
    return Promise.resolve().then(() => QD.solveInverseQD(built, opts));
  };

  (async () => {
   // Outer try/finally guarantees the busy indicator (spinner + Cancel) is
   // cleared on every exit path — success, failure, solver error, or
   // supersession — but only by the solve that still owns the token, so a
   // newer in-flight solve keeps its own spinner up (B3).
   try {
    let result;
    try {
      const opts = buildSolverOptions(preset, { findAlternates: false });
      applyNormToOpts(opts, norm);
      // §23: in any PQD mode, let the solver auto-detect the singular ↔
      // non-singular transition (boundary crossing the origin) and re-dispatch
      // to the correct family. Scoped to the four PQD modes; gated by the toggle.
      opts.autoSwitchSingular = state.autoSwitchSingular && /^pqd-/.test(state.mode);
      result = await runOne(opts);
      if (myToken !== _solveAndRenderToken) return;   // superseded by a newer call

      // Auto-escalation: if standard pipeline failed, re-run with the
      // exhaustive preset before giving up. Toggleable in the search panel.
      //
      // Auto-escalation is per-family: see MODES[X].autoEscalate. LQDs skip
      // it because non-existence is genuine (Theorem 5.3.2 / 5.6.2 bounds).
      if (modeDescriptor().autoEscalate
          && (!result.success || !result.primary ||
              !(result.primary.univalent && result.primary.identityOK))
          && state.searchOptions.autoEscalate
          && state.aggressiveness !== 'exhaustive') {
        const exh = buildSolverOptions(PRESETS.exhaustive, { findAlternates: false });
        applyNormToOpts(exh, norm);
        const escalated = await runOne(exh);
        if (myToken !== _solveAndRenderToken) return;
        if (escalated.success) result = escalated;
      }
    } catch (e) {
      if (myToken !== _solveAndRenderToken) return;
      if (e && e.aborted) return;                     // user-initiated cancellation
      setStatus({ kind: 'err', text: 'Solver error: ' + (e && e.message || e) });
      return;
    }
    state.current = result;
    state.current.hData = built;
    state.current.w0Used = norm.w0 || (state.current.primary && state.current.primary.phi && state.current.primary.phi.w0);
    state.current.cUsed  = norm.c;
    state.current.unbounded = !!norm.unbounded;
    state.selectedSolutionIdx = 0;
    publishPrimarySolution();

    if (!result.success) {
      setStatus({
        kind: 'err',
        text: failureGuidance(state.mode) + '\n\n' +
              'Technical detail:\n' +
              '  reason: ' + result.error + '\n' +
              '  attempts: ' + (result.attempts ? result.attempts.length : 0),
      });
      plot.clear();
      $('#alternates-card').classList.add('hidden');
      renderRiemannMap(null);   // hide the φ(z) formula in the Domain-type tile
      // Geom/cusp sections live in the status panel; hide the whole panel on a
      // failed solve (no current solution to summarize).
      updateStatusPanelVisibility();
      // Bounded-PQD failures are often genuine NON-REALIZABILITY (the α-branch
      // folds), not solver weakness. Trace the branch off the critical path and
      // replace the generic message with the realizable-α verdict (failure-only,
      // idle, token-guarded — see scheduleRealizabilityDiagnostic).
      scheduleRealizabilityDiagnostic(built, norm, state.mode, myToken);
      // Try-harder button is always visible — nothing to toggle here.
      return;
    }

    // §23: if the solver auto-switched the PQD regime, reflect the actual
    // family in the UI (radio + cards) WITHOUT re-solving — we already have the
    // correct result. The visible radio flip + the status note in showSolution
    // are the user-facing indicators.
    let altNorm = norm;
    if (result.regimeSwitched && result.primary && result.primary.phi) {
      reflectFamilyMode(result.primary.phi.family);
      altNorm = QD.normFromPhi(result.primary.phi) || norm;
    }

    showSolution(result.primary, built, /*isPrimary=*/true);
    refreshAlternatesPanel();

    startBackgroundAltSearch(built, altNorm);
    scheduleGeomClassification(result.primary, myToken);
    scheduleCuspClassification(result.primary, myToken);
   } finally {
     if (myToken === _solveAndRenderToken) hideSolveBusy();
   }
  })();
}

// ---------- Solve busy-indicator (spinner + Cancel) ----------------------
// Shown for the duration of a primary solve. The Cancel button aborts the
// warm worker mid-solve and bumps the solve token so any late completion is
// treated as superseded (and therefore never paints).
function showSolveBusy() {
  const row = $('#solve-busy-row');
  if (row) row.classList.remove('hidden');
}
function hideSolveBusy() {
  const row = $('#solve-busy-row');
  if (row) row.classList.add('hidden');
}
function cancelSolve() {
  const PSW = QD.PrimarySolverWorker;
  if (PSW && typeof PSW.cancel === 'function') PSW.cancel();
  // Bump the token so the (rejected) in-flight promise is seen as superseded.
  _solveAndRenderToken++;
  // Also stop any background alternate search tied to this solve.
  state.altSearchToken++;
  state.altSearchActive = false;
  $('#alt-search-indicator').classList.add('hidden');
  hideSolveBusy();
  setStatus({ kind: 'warn', text: 'Solve cancelled.' });
}

// §25: classify the solved Ω by special univalence criteria (convex /
// star-like / spiral-like) AFTER the boundary has painted, off the critical
// path. The checks are cheap (≈360 order-2 Taylor evals) but the idle pass
// keeps the solve snappy; the `myToken === _solveAndRenderToken` guard discards
// results from a superseded solve. Result is stashed on the envelope and
// rendered into the dedicated card.
function scheduleGeomClassification(sol, token) {
  if (!sol || !sol.phi || !QD.classifyUnivalence) {
    renderGeomProps(null);
    return;
  }
  const run = () => {
    if (token !== _solveAndRenderToken) return;     // superseded by a newer solve
    let geom;
    try {
      geom = QD.classifyUnivalence(sol.phi, { samples: state.samples, univalent: sol.univalent });
    } catch (e) {
      renderGeomProps(null);
      return;
    }
    if (token !== _solveAndRenderToken) return;
    if (state.current) { state.current.geomProps = geom; publishPrimarySolution(); }
    renderGeomProps(geom);
  };
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 0));
  idle(run, { timeout: 200 });
}

// §25: render the geometric-properties card from a classifyUnivalence result.
function renderGeomProps(geom) {
  const content = $('#sp-geom-content');
  if (!content) return;
  if (!geom) { content.innerHTML = ''; return; }
  const yn = (v) => v ? '<span class="ok">✓ yes</span>' : '<span class="warn">✗ no</span>';
  const fmt = (x) => (typeof formatExp === 'function') ? formatExp(x) : (+x).toExponential(2);
  // Each criterion shows just "label: ✓/✗" inline; the quantitative detail
  // (the margin min Re(·), or the spiral angle) goes into a hover tooltip
  // (title=) so the panel stays uncluttered.
  const row = (label, ynHtml, tip) =>
    `<span class="geom-row" title="${escapeAttr(tip)}"><span class="key">${label}:</span> ${ynHtml}</span>`;
  const lines = [];

  // Convex (bounded only).
  if (geom.convex && geom.convex.na) {
    lines.push(row('convex', '<span class="key">n/a</span>', 'Convexity is reported only for bounded Ω.'));
  } else if (geom.convex && geom.convex.indeterminate) {
    lines.push(row('convex', '<span class="warn">indeterminate</span>', 'φ′ vanishes on ∂𝔻 (cusp / fold) — convexity indeterminate.'));
  } else if (geom.convex) {
    lines.push(row('convex', yn(geom.convex.is), 'min Re(1 + z·φ″/φ′) = ' + fmt(geom.convex.margin) + '   (convex ⇔ > 0)'));
  }

  // Star-like (w.r.t. center, or ∞ for unbounded).
  const starWrt = geom.bounded ? 'w₀' : '∞';
  lines.push(row('star-like (' + starWrt + ')', yn(geom.starLike.is),
    'min Re(z·φ′/(φ−c)) = ' + fmt(geom.starLike.margin) + '   (star-like ⇔ > 0)'));

  // Spiral-like — the optimal spiral angle λ / arc width goes in the tooltip.
  const sp = geom.spiralLike;
  const spTip = sp.is
    ? 'optimal spiral angle λ ≈ ' + sp.angleDeg.toFixed(1) + '°'
    : 'arg-arc width ' + (sp.arcWidth * 180 / Math.PI).toFixed(0) + '° ≥ 180° (not spiral-like)';
  lines.push(row('spiral-like', yn(sp.is), spTip));

  if (geom.notes && geom.notes.length) {
    lines.push(`<span class="key" style="font-style:italic;">${geom.notes.map(escapeHTML).join('<br>')}</span>`);
  }

  content.innerHTML = lines.join('<br>');
}

// Bounded-PQD realizability diagnostic. When a `pqd-bounded*` solve FAILS, the
// requested-α PQD often simply does not exist: with fixed quadrature data the
// univalent solution branch folds as α grows (the |w|^{2(α−1)} weight shrinks
// the realizable region), so "classically (α=1) solvable" does NOT imply the
// target-α PQD is realizable. QD.diagnosePQDRealizability traces the α-branch
// from α≈1 to the target and locates that fold. It is EXPENSIVE (tens of nested
// Newton solves), so it runs ONLY on failure, in an idle pass, then REPLACES the
// generic failure text with the realizable-α verdict. Token-guarded so a newer
// solve discards a stale result.
function scheduleRealizabilityDiagnostic(hData, norm, mode, token) {
  if (!/^pqd-bounded/.test(mode) || !QD.diagnosePQDRealizability) return;
  const alpha = (norm && norm.alpha) || state.alpha;
  if (!(alpha > 0) || Math.abs(alpha - 1) < 1e-6) return;
  const run = () => {
    if (token !== _solveAndRenderToken) return;       // superseded by a newer solve
    let d;
    try {
      d = QD.diagnosePQDRealizability(hData, {
        alpha,
        w0: norm && norm.w0,
        singular: mode === 'pqd-bounded-singular',
      });
    } catch (e) { return; }                            // keep the generic failure message
    if (token !== _solveAndRenderToken) return;
    const aStr = (+alpha).toPrecision(3).replace(/\.?0+$/, '');
    let verdict;
    if (d.reason === 'fold-below-target') {
      const amax = d.alphaMax.toFixed(2);
      const rel = alpha > 1 ? ('α ≲ ' + amax) : ('α ≳ ' + amax);
      verdict = 'No power-weighted (α = ' + aStr + ') quadrature domain exists for this data. '
        + 'The univalent solution branch folds at α ≈ ' + amax + ' — it is realizable only for '
        + rel + '. Lower α, or move/scale the poles.';
    } else if (d.reason === 'invalid-even-classical') {
      verdict = 'This quadrature data does not define a valid domain even classically (α = 1). '
        + 'Check the residue magnitudes and pole positions.';
    } else if (d.reason === 'non-univalent') {
      verdict = 'A solution exists at α = ' + aStr + ' but its boundary self-intersects '
        + '(not univalent), so it is not a valid domain.';
    } else if (d.reason === 'realizable') {
      verdict = 'A valid α = ' + aStr + ' domain appears to exist but the direct solve missed it — '
        + 'click “Try harder (exhaustive search)”.';
    } else {
      return;
    }
    setStatus({ kind: 'err', text: 'Realizability: ' + verdict });
  };
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 0));
  idle(run, { timeout: 400 });
}

// Boundary cusp detection: classify ∂Ω's cusps + their (p,q) type AFTER the
// boundary has painted, off the critical path (mirrors scheduleGeomClassification).
// The classifier (QD.classifyCusps) finds boundary-adjacent zeros of φ′, reads
// the order m and the (p,q) exponents from φ's exact Taylor coefficients, and
// cross-checks the leading exponent numerically. Result is stashed on the
// envelope (for cross-tab readers) and rendered into the card + plot markers.
function scheduleCuspClassification(sol, token) {
  if (!sol || !sol.phi || !QD.classifyCusps) {
    renderCusps(null);
    return;
  }
  const run = () => {
    if (token !== _solveAndRenderToken) return;     // superseded by a newer solve
    let res;
    try {
      res = QD.classifyCusps(sol.phi, { });
    } catch (e) {
      renderCusps(null);
      return;
    }
    if (token !== _solveAndRenderToken) return;
    if (state.current) { state.current.cuspProps = res; publishPrimarySolution(); }
    renderCusps(res);
    // Repaint so the cusp markers (drawn from state.current.cuspProps) appear.
    if (typeof plot !== 'undefined' && plot) plot.render();
  };
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 0));
  idle(run, { timeout: 200 });
}

// Render the boundary-singularities section of the status panel from a
// classifyCusps result.
function renderCusps(res) {
  const content = $('#sp-cusps-content');
  if (!content) return;
  if (!res) { content.innerHTML = ''; return; }
  const cusps = res.cusps || [];
  const lines = [];

  if (cusps.length === 0) {
    lines.push(`<span class="ok">✓ smooth boundary</span> <span class="key">(no cusps)</span>`);
    if (res.notes && res.notes.length) {
      lines.push(`<span class="key" style="font-style:italic;">${res.notes.map(escapeHTML).join('<br>')}</span>`);
    }
  } else {
    const nActual = cusps.filter(c => c.isCusp).length;
    lines.push(`<span class="key">${cusps.length} singular point${cusps.length === 1 ? '' : 's'} on ∂Ω (${nActual} cusp${nActual === 1 ? '' : 's'})</span>`);
    for (const c of cusps) {
      // ● filled = an actual boundary cusp; ○ hollow = incipient (φ′-zero near
      // but not on ∂𝔻 — the type it WOULD have at the bifurcation).
      const glyph = c.isCusp ? '<span class="warn">●</span>' : '<span class="key">○</span>';
      const typeStr = `(${c.type[0]},${c.type[1]})`;
      const where = `θ ≈ ${c.thetaDeg.toFixed(1)}°`;
      const detail = c.isCusp
        ? `<span class="key">m=${c.orderM}</span>`
        : `<span class="key">incipient, d=${Math.abs(c.dist).toFixed(3)}</span>`;
      lines.push(`${glyph} <span class="key">${where} — ${escapeHTML(c.typeLabel || (typeStr + ' cusp'))}</span> · ${detail}`);
    }
  }

  content.innerHTML = lines.join('<br>');
}

// ---------- Status panel (overlaid bottom-right of the plot) -------------
// The verdict badge + show/hide logic for the transparent #status-panel that
// hosts the geometric properties + boundary singularities. (The Riemann map
// φ(z) lives separately, at the bottom of the Domain-type tile — renderRiemannMap.)

// Map a solved solution to the valid/invalid verdict shown in the panel badge.
function qdValidityBadge(sol) {
  if (!sol)                              return { cls: 'err',  text: '✗ No solution' };
  if (sol.univalent && sol.identityOK)   return { cls: 'ok',   text: '✓ Valid quadrature domain' };
  if (!sol.univalent && !sol.identityOK) return { cls: 'err',  text: '✗ Spurious root (non-univalent + identity fails)' };
  if (!sol.univalent)                    return { cls: 'warn', text: '⚠ Boundary self-intersects (non-univalent)' };
  return { cls: 'warn', text: '⚠ Quadrature identity not satisfied' };
}
function renderValidityBadge(sol) {
  const el = $('#sp-badge');
  if (!el) return;
  const b = qdValidityBadge(sol);
  el.innerHTML = `<span class="${b.cls}">${escapeHTML(b.text)}</span>`;
}

// Show the panel only on the QD tab's inverse view, once there is a current
// solution. Hidden on the Schwarz/param-slice tabs and on the direct view.
function updateStatusPanelVisibility() {
  const panel = $('#status-panel');
  if (!panel) return;
  const tabBtn = document.querySelector('.tab-btn.active');
  const onQdTab = !tabBtn || tabBtn.dataset.tab === 'qd';   // QD is the default tab
  const inverseView = (state.viewMode || 'inverse') === 'inverse';
  const hasSol = !!(state.current && state.current.success);
  panel.classList.toggle('hidden', !(onQdTab && inverseView && hasSol));
}

// §23: silently switch the UI to the mode matching a solved phi's family
// (used after the solver auto-switches the PQD regime). Updates state.mode and
// the mode visuals (which re-sync the compact domain-type control) — but does
// NOT trigger a solve.
const FAMILY_TO_MODE = {
  powerQD:                 'pqd-bounded',
  powerQD_singular:        'pqd-bounded-singular',
  unboundedPQD:            'pqd-unbounded',
  unboundedPQD_singular:   'pqd-unbounded-singular',
};
function reflectFamilyMode(family) {
  const target = FAMILY_TO_MODE[family];
  if (!target || target === state.mode || !MODES[target]) return;
  state.mode = target;
  applyModeVisuals();   // also re-syncs the compact domain-type control
}

// ---------- Display a chosen solution on the plot ------------------------
// sol: the solution to draw (primary or a previewed alternate). isPrimary:
// true only for the primary solve — alternates being previewed pass false so
// they don't reframe the viewport. Auto-fit happens iff (state.autoFit &&
// isPrimary); it is NOT an "autoFit" flag despite some historical call sites.
function showSolution(sol, hData, isPrimary) {
  const boundary = QD.sampleBoundaryAdaptive(sol.phi, state.samples, Math.floor(state.samples * 1.5));
  const boundaryPts = boundary.map(p => p.w);
  const poles = hData.poles.map(p => p.a);

  plot.setData({
    boundaryPts,
    poles,
    w0: sol.phi.unbounded ? null : sol.phi.w0,
    univalent: !!sol.univalent,
    unbounded: !!sol.phi.unbounded,
    hData,
    phi: sol.phi,           // singular-LQD vector field reads q from here
  });

  if (state.autoFit && isPrimary) plot.fit();

  renderRiemannMap(sol.phi);

  // Build status
  const lines = [];
  // §23: if the solver auto-switched the singular ↔ non-singular regime
  // (boundary crossed the origin), lead with a clear indicator. Transient —
  // it clears on the next solve; the mode radio also visibly flips.
  if (state.current && state.current.regimeSwitched) {
    const toSing = state.current.switchedTo === 'singular';
    lines.push(`<span class="warn">⇄ Auto-switched to the ${toSing ? 'singular' : 'non-singular'} regime — the boundary crossed the origin (0 ${toSing ? '∈' : '∉'} Ω)</span>`);
  }
  // The valid/invalid verdict now lives in the status-panel badge (overlaid on
  // the plot, bottom-right); #status keeps the operational detail below.
  renderValidityBadge(sol);
  updateStatusPanelVisibility();
  lines.push(`<span class="key">method:</span> ${escapeHTML(sol.method || '?')}`);
  if (typeof sol.iterations === 'number') {
    lines.push(`<span class="key">Newton iterations:</span> ${sol.iterations}`);
  }
  if (sol.trace) {
    lines.push(`<span class="key">continuation steps:</span> ${sol.trace.length}`);
  }
  lines.push(`<span class="key">Newton residual:</span> ${formatExp(sol.residual)}`);
  lines.push(`<span class="key">degree of φ:</span> ${sol.phi.branches.reduce((a, b) => a + b.A.length, 0)}`);
  if (sol.identity) {
    const v = sol.identity;
    const cls = sol.identityOK ? 'ok' : 'err';
    // Test-function class: per-family verifier sets one of:
    //   v.unbounded     → 1/(w−b)^k for b ∈ K
    //   v.lqdSingular   → monomials w^k vanishing at 0 (k ≥ 1)
    //   default         → monomials w^k including k = 0
    const testClass = describeTestClass(v);
    lines.push(`<span class="key">identity check:</span> <span class="${cls}">max rel diff = ${formatExp(v.maxRelDiff)}</span>` +
               ` <span class="key">(${testClass})</span>`);
  }
  setStatus({ kind: 'raw', html: lines.join('<br>') });

  // Try-harder button is always visible; no per-solution toggle needed.
}

// Build the human-readable test-function-class string from a verifier result.
// Lives here (not on Family) because it's a UI display concern; the verifier
// flags are the source of truth.
function describeTestClass(v) {
  if (v.lqdUnboundedSingular) {
    const nb = v.testPoints ? v.testPoints.length : 0;
    return `w/(w − b)^k for k = 2…${v.maxDeg} at ${nb} test point${nb === 1 ? '' : 's'} in K (vanishing at 0 and ∞)`;
  }
  if (v.lqdUnbounded) {
    return `1/w, 1/w², …, 1/w^${v.maxDeg} (vanishing at ∞; required by L¹(ρ₀))`;
  }
  if (v.unbounded) {
    const nb = v.testPoints ? v.testPoints.length : 1;
    return `1/(w − b)^k for k = 1…${v.maxDeg} at ${nb} test point${nb === 1 ? '' : 's'} in K`;
  }
  if (v.lqdSingular) {
    return `monomials w¹…w^${v.maxDeg} (vanishing at 0; required by L¹(ρ₀))`;
  }
  return `monomials w⁰…w^${v.maxDeg}`;
}

// escapeHTML: delegates to QD.QoL.escapeHTML (HANDOFF #35 consolidation).
// Falls back to a local impl if qol.js failed to load.
function escapeHTML(s) {
  return (window.QD && window.QD.QoL && window.QD.QoL.escapeHTML)
    ? window.QD.QoL.escapeHTML(s)
    : String(s).replace(/[&<>]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]));
}
function formatExp(x) {
  if (x === null || x === undefined || !isFinite(x)) return '—';
  if (x === 0) return '0';
  return x.toExponential(3);
}

function setStatus(s) {
  const el = $('#status');
  if (s.kind === 'raw') { el.innerHTML = s.html; return; }
  const cls = s.kind === 'err' ? 'err' : s.kind === 'warn' ? 'warn' : s.kind === 'ok' ? 'ok' : '';
  el.innerHTML = cls ? `<span class="${cls}">${escapeHTML(s.text)}</span>` : escapeHTML(s.text);
}

// ---------- Riemann-map formula card ------------------------------------
// Renders (1) symbolic identity, (2) closed-form expression with values
// substituted, (3) parameters table. The LaTeX itself is generated by the
// pure, Node-testable QD.RiemannLatex.build(phi) (riemann-latex.js); this
// function only does the DOM rendering.
// Renders the solved Riemann map into the bottom of the Domain-type tile
// (#dm-riemann). The explicit NUMERICAL closed form is shown inline
// (#dm-riemann-numer); the SYMBOLIC identity is rendered into a sibling div
// (#dm-riemann-sym) that the "?" toggle reveals — it isn't shown by default.
// Hidden entirely until a solve produces a φ.
function renderRiemannMap(phi) {
  const box   = $('#dm-riemann');
  const numer = $('#dm-riemann-numer');
  const sym   = $('#dm-riemann-sym');
  if (!box || !numer) return;
  if (!phi) { box.classList.add('hidden'); return; }

  // Pure LaTeX generation lives in riemann-latex.js (Node-testable).
  const { symbolic, numeric } = QD.RiemannLatex.build(phi);
  numer.innerHTML = '';
  renderKatex(numer, numeric, true);
  if (sym) { sym.innerHTML = ''; renderKatex(sym, symbolic, true); }  // hidden until "?"
  box.classList.remove('hidden');
}

// Render LaTeX `expr` into the given element. Uses KaTeX if available;
// falls back to a plain-text placeholder if the CDN failed to load.
function renderKatex(el, expr, display) {
  if (typeof katex === 'undefined') {
    el.textContent = expr;
    return;
  }
  try {
    katex.render(expr, el, { displayMode: !!display, throwOnError: false });
  } catch (e) {
    el.textContent = expr;
  }
}

// ---------- Alternates panel ---------------------------------------------
function refreshAlternatesPanel() {
  const card = $('#alternates-card');
  const list = $('#alternates-list');
  list.innerHTML = '';

  const all = state.current.success
    ? [state.current.primary, ...(state.current.alternates || [])]
    : [];

  // Show the card whenever we have alternates OR a background search is
  // running, so the "searching…" spinner is visible even before any alt is
  // found. Otherwise hide it.
  if (all.length <= 1 && !state.altSearchActive) {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');

  if (all.length <= 1) {
    const note = document.createElement('div');
    note.style.cssText = 'font-size: 11px; color: #777;';
    note.textContent = 'No alternates found yet…';
    list.appendChild(note);
    return;
  }

  all.forEach((sol, i) => {
    const isSel = i === state.selectedSolutionIdx;
    const row = document.createElement('div');
    row.className = 'alt';
    const tag = i === 0 ? 'Primary' : `Alt ${i}`;
    const valid = sol.univalent && sol.identityOK;
    const flag = valid ? '✓' : (sol.univalent && !sol.identityOK ? '?' : '⚠');
    const desc = valid ? 'valid QD'
                       : (!sol.univalent ? 'non-univalent' : 'identity fails');
    row.innerHTML = `
      <span>
        <strong>${tag}</strong>
        <span style="color:#777"> · ${flag} ${desc}</span>
        <span style="color:#777"> · id ${formatExp(sol.identity ? sol.identity.maxRelDiff : null)}</span>
      </span>
      <button class="small ${isSel ? 'primary' : ''}" data-alt-idx="${i}">${isSel ? 'shown' : 'view'}</button>
    `;
    list.appendChild(row);
  });
}

function viewSolutionByIndex(i) {
  if (!state.current || !state.current.success) return;
  const all = [state.current.primary, ...(state.current.alternates || [])];
  if (i < 0 || i >= all.length) return;
  state.selectedSolutionIdx = i;
  showSolution(all[i], state.current.hData, /*isPrimary=*/i === 0);
  refreshAlternatesPanel();
}

// ---------- Background alternate search ---------------------------------
// Runs QD.searchAlternates on the dedicated AUX WORKER (A3) so each pass is
// off the main thread. Previously every chunk ran synchronously via
// setTimeout, janking the 2D plot. Each loop iteration awaits one worker pass,
// applies the acceptance filter, then yields briefly; the `myToken` guard
// stops the loop (and discards a late worker result) once a newer solve or
// search supersedes this one. Falls back to a main-thread microtask when the
// worker is unavailable (file:// origin / no Worker support).
function startBackgroundAltSearch(hData, norm) {
  const preset = PRESETS[state.aggressiveness];
  const so = state.searchOptions;
  const myToken = ++state.altSearchToken;
  state.altSearchActive = true;
  $('#alt-search-indicator').classList.remove('hidden');
  refreshAlternatesPanel();

  const bgChunks   = so.bgChunks   ?? preset.bgAltChunks;
  const keepGoing  = so.keepSearching;
  let chunk = 0;
  // Seed = user override if any, else time-based.
  let seed = so.seed !== null
    ? (so.seed >>> 0)
    : ((Date.now() ^ 0x9E3779B1) >>> 0);

  const PSW = QD.PrimarySolverWorker;
  const runChunk = (known, opts) =>
    (PSW && typeof PSW.searchAlternates === 'function')
      ? PSW.searchAlternates(hData, norm, known, opts)
      : Promise.resolve().then(() => QD.searchAlternates(hData, norm, known, opts));

  const stop = () => {
    if (myToken !== state.altSearchToken) return;   // a newer search owns the UI
    state.altSearchActive = false;
    $('#alt-search-indicator').classList.add('hidden');
    refreshAlternatesPanel();
  };

  (async () => {
    for (;;) {
      if (myToken !== state.altSearchToken) return;             // superseded
      if (!state.current || !state.current.success) { stop(); return; }
      if (!keepGoing && chunk >= bgChunks)          { stop(); return; }
      chunk++;

      let found = [];
      try {
        const known = [state.current.primary, ...(state.current.alternates || [])];
        found = await runChunk(known, buildAltSearchOptions(preset, seed));
      } catch (e) {
        if (e && e.aborted) return;                             // superseded mid-flight
        console.warn('alt search error:', e);
      }
      if (myToken !== state.altSearchToken) return;             // superseded while awaiting
      seed = (seed * 1664525 + 1013904223) >>> 0;

      if (found && found.length > 0) {
        // Acceptance criteria — by default, only valid QDs are shown. Toggle
        // overrides in the panel let the user surface partial / spurious
        // candidates for diagnostic purposes.
        const accept = found.filter(s => {
          if (s.univalent && s.identityOK) return true;
          if (so.showNonUnivalent && !s.univalent) return true;
          if (so.showIdFailing    && s.univalent && !s.identityOK) return true;
          return false;
        });
        if (accept.length > 0) {
          state.current.alternates = (state.current.alternates || []).concat(accept);
          publishPrimarySolution();
          refreshAlternatesPanel();
        }
      }

      await new Promise(r => setTimeout(r, 30));   // gentle yield between passes
    }
  })();
}

// ===========================================================================
// Canvas plotting — DomainPlot class lives in ui-domain-plot.js (P0 split).
// It receives its ui.js closures (state, modeDescriptor, formatTick, sub) via
// dependency injection. The installer call below resolves the class for use
// in the DOM wiring section further down.
// ===========================================================================


function formatTick(v, step) {
  // Choose precision based on step size
  const digits = Math.max(0, -Math.floor(Math.log10(step)));
  return Number(v.toFixed(digits)).toString();
}

// ---------- Wire everything up ------------------------------------------
// DomainPlot lives in ui-domain-plot.js; install with the ui.js closures
// it needs (state, modeDescriptor, formatTick, sub).
const DomainPlot = window.QD_UI.installDomainPlot({ state, modeDescriptor, formatTick, sub });
const plot = new DomainPlot($('#canvas'), $('#plot-readout'));
// Coalesce a burst of resize events (window drag) into one canvas resize per
// frame (A8). plot.resize() reallocates the canvas backing store + repaints,
// so running it on every raw resize event is wasteful.
let _resizeScheduled = false;
window.addEventListener('resize', () => {
  if (_resizeScheduled) return;
  _resizeScheduled = true;
  requestAnimationFrame(() => { _resizeScheduled = false; plot.resize(); });
});

// HANDOFF #34 (revised): re-render the QD plot whenever the QD tab becomes
// active. The 2D canvas is shared with Schwarz (CPU pyramid + orbit polyline)
// and Param-slice (image data); without this the user sees stale graphics
// from the previous tab until they pan, zoom, or re-solve.
//
// We MUST defer the render to a microtask so it runs AFTER every other
// synchronous tab-changed listener for this dispatch. In particular,
// schwarz-ui.js's exit branch (registered later in script load order)
// clears the 2D canvas via ctx.clearRect — if we render synchronously we
// fire first and Schwarz's clear immediately wipes the freshly-drawn
// pixels (the bug fixed here). Microtasks drain before the browser
// paints, so there is no flicker.
//
// Future tabs adding their own exit-clear would be vulnerable to the
// same listener-order trap; keep this microtask deferral.
document.addEventListener('tab-changed', e => {
  if (!e.detail || e.detail.tab !== 'qd') return;
  queueMicrotask(() => {
    // Stale-tab guard: a rapid qd → schwarz double-click would otherwise
    // briefly paint the QD canvas while the user is already on Schwarz.
    const active = document.querySelector('.tab-btn.active');
    if (!active || active.dataset.tab !== 'qd') return;
    plot.resize();
  });
});

// Click-and-drag of quadrature nodes on the plot. Live updates while
// dragging via quick-solve; on release run the full solver pipeline so
// alternates and background search get a proper pass at the new value.
plot.onPoleDrag = (idx, w) => {
  if (idx < 0 || idx >= state.poles.length) return;
  const text = QD.Complex.toString(w, 4);
  state.poles[idx].a = text;
  // Update the matching text input in the side panel (no slider for a_j).
  const aInput = document.querySelector(
    `#poles-list .pole[data-idx="${idx}"] input[data-field="a"]`);
  if (aInput) aInput.value = text;
  markAsCustom();
  scheduleQuickSolve();
};
plot.onPoleDragEnd = () => { scheduleSolve(); };

// Double-click on the plot drops a new simple pole (coefficient 1) at the
// clicked w. Inverse view only — the direct view hides this canvas, and the
// gesture only makes sense for the inverse problem (it edits h's poles).
plot.onAddPole = (w) => {
  if ((state.viewMode || 'inverse') !== 'inverse') return;
  addPoleAt(w);
};

renderPolesList();
renderPolyCoefList();
$('#poly-part-section').classList.toggle('hidden', !modeAllowsPoly(state.mode));

// Polynomial part of h is meaningful exactly in the three unbounded family
// panels. Keep this predicate centralized so refreshHText / parseAndApplyHText
// agree with what the mode descriptors expose (cards.poly).
function modeAllowsPoly(mode) {
  return mode === 'unbounded' ||
         mode === 'pqd-unbounded' ||
         mode === 'pqd-unbounded-singular' ||
         mode === 'lqd-unbounded' ||
         mode === 'lqd-unbounded-singular';
}

// ---------- Custom h(w) text input --------------------------------------
// The #h-text input is a two-way-coupled mirror of the structured pole grid
// and polynomial-part coefficient list. refreshHText() rebuilds the text
// from current state; parseAndApplyHText() goes the other direction via
// QD.parseH (Phase 1 strict PFD walker → Phase 2 general-rational fallback).
//
// Refresh is called from renderPolesList / renderPolyCoefList / setMode /
// applyPreset so the text mirrors structural state. The per-keystroke
// pole-residue text-field edits don't trigger a refresh (they'd cause
// double-translation churn while the user types); the next solve / preset
// / mode switch syncs the text box.
function refreshHText() {
  const inp = document.getElementById('h-text');
  if (!inp) return;
  try {
    const poles = state.poles.map(po => {
      const a = QD.Complex.parse(po.a) || { re: 0, im: 0 };
      const residues = po.residues.slice(0, po.order).map(r =>
        QD.Complex.parse(r) || { re: 0, im: 0 });
      return { a, order: po.order, residues };
    });
    let polyCoeffs = [];
    if (modeAllowsPoly(state.mode) && state.polyDegree >= 0) {
      polyCoeffs = state.polyCoeffs.slice(0, state.polyDegree + 1).map(s =>
        QD.Complex.parse(s) || { re: 0, im: 0 });
    }
    inp.value = QD.formatH({ poles, polyCoeffs });
    setHTextMsg('');
  } catch (e) {
    // Defensive: never let formatter errors break the panel.
  }
}

function setHTextMsg(msg, kind) {
  const el = document.getElementById('h-text-msg');
  if (!el) return;
  el.textContent = msg || '';
  el.style.color = (kind === 'warn') ? '#9a6a00' : '#b53030';
}

function parseAndApplyHText() {
  const inp = document.getElementById('h-text');
  if (!inp) return;
  const expr = inp.value.trim();
  if (!expr) { setHTextMsg('Enter an expression in w.'); return; }
  let parsed;
  try {
    parsed = QD.parseH(expr, math, { mode: state.mode });
  } catch (e) {
    setHTextMsg(e.message || String(e));
    return;
  }

  // Convert parsed.poles (Complex-typed) back to the state's string form.
  if (parsed.poles.length === 0) {
    // Need at least one row in the grid so the user can extend it.
    state.poles = [{ a: '0', order: 1, residues: ['0'] }];
  } else {
    state.poles = parsed.poles.map(p => ({
      a: QD.Complex.format(p.a),
      order: p.order,
      residues: p.residues.map(c => QD.Complex.format(c)),
    }));
  }

  if (modeAllowsPoly(state.mode)) {
    if (parsed.polyCoeffs.length > 0) {
      state.polyCoeffs = parsed.polyCoeffs.map(c => QD.Complex.format(c));
      state.polyDegree = parsed.polyCoeffs.length - 1;
    } else {
      state.polyDegree = -1;
      state.polyCoeffs = [];
    }
    syncPolyDegreeInput();
  }

  for (const k of Object.keys(magSliderMax)) delete magSliderMax[k];
  renderPolesList();
  renderPolyCoefList();
  markAsCustom();
  if (parsed.warnings && parsed.warnings.length) {
    setHTextMsg('Parsed with warning: ' + parsed.warnings[0], 'warn');
  } else {
    setHTextMsg('');
  }
  scheduleSolve();
}

// ---------- Preset dropdown ---------------------------------------------
function populatePresetDropdown() {
  const sel = $('#preset-select');
  const list = currentPresetList();
  sel.innerHTML = '<option value="">— custom —</option>' +
    list.map(p => `<option value="${p.id}">${escapeHTML(p.label)}</option>`).join('');
}

function applyPreset(id) {
  const p = currentPresetList().find(x => x.id === id);
  if (!p) return;
  state.poles = p.poles.map(po => ({
    a: po.a,
    order: po.order,
    residues: po.residues.slice(),
  }));
  if (state.mode === 'bounded') {
    state.w0Mode = 'auto';
    $('input[name="w0mode"][value="auto"]').checked = true;
    $('#w0-manual').disabled = true;
  } else if (state.mode === 'pqd-bounded' || state.mode === 'pqd-bounded-singular') {
    // α may be any real > 0 (α ≠ 1); default 2.
    let presetAlpha = +p.alpha;
    if (!(presetAlpha > 0) || presetAlpha === 1) presetAlpha = 2;
    state.alpha = presetAlpha;
    const inp = $('#alpha-input');
    if (inp) inp.value = String(presetAlpha);
    // Default to 'auto' (Centroid of poles) for ALL bounded PQD families,
    // singular included: buildNorm uses the live centroid (recomputed each solve,
    // so it tracks pole drags and stays interior) and validates w₀ ≠ 0, surfacing
    // a clear error if the centroid degenerates to the origin. The preset's w₀ is
    // pre-filled into the Manual field for users who switch to Manual.
    state.w0Manual = p.w0 || '1';
    $('#w0-manual').value = state.w0Manual;
    state.w0Mode = 'auto';
    $('input[name="w0mode"][value="auto"]').checked = true;
    $('#w0-manual').disabled = true;
  } else if (state.mode === 'lqd-bounded' || state.mode === 'lqd-bounded-singular') {
    // Default to 'auto' (Centroid of poles), like the other bounded families.
    // buildNorm validates w₀ ≠ 0 (LQD needs a non-origin w₀); the preset's w₀ is
    // pre-filled into the Manual field for users who switch to Manual.
    state.w0Mode = 'auto';
    state.w0Manual = p.w0 || '1';
    $('input[name="w0mode"][value="auto"]').checked = true;
    $('#w0-manual').disabled = true;
    $('#w0-manual').value = state.w0Manual;
    // Singular: reset q to '0' by default (the user can dial it via slider).
    if (state.mode === 'lqd-bounded-singular') {
      const presetQ = p.q || '0';
      setQ(presetQ);
    }
  } else {
    if (typeof p.c === 'number') setC(p.c);
    // Unbounded PQD presets carry α (any real > 0, α ≠ 1; default 2).
    if (state.mode === 'pqd-unbounded' || state.mode === 'pqd-unbounded-singular') {
      let presetAlpha = +p.alpha;
      if (!(presetAlpha > 0) || presetAlpha === 1) presetAlpha = 2;
      state.alpha = presetAlpha;
      const inp = $('#alpha-input');
      if (inp) inp.value = String(presetAlpha);
    }
    // Polynomial part: preset may provide polyCoeffs (string[]).
    if (Array.isArray(p.polyCoeffs)) {
      state.polyCoeffs = p.polyCoeffs.slice();
      state.polyDegree = p.polyCoeffs.length - 1;
    } else {
      state.polyDegree = -1;
      state.polyCoeffs = [];
    }
    syncPolyDegreeInput();
  }
  for (const k of Object.keys(magSliderMax)) delete magSliderMax[k];
  renderPolesList();
  renderPolyCoefList();
  scheduleSolve();
}

// Programmatic setter for q (complex) that keeps text input, |q| / arg sliders,
// and state in sync. Used by applyPreset and by the q-event handlers.
function setQ(qStr) {
  state.q = qStr;
  const qval = QD.Complex.parse(qStr) || { re: 0, im: 0 };
  const mag = Math.hypot(qval.re, qval.im);
  const arg = Math.atan2(qval.im, qval.re);
  const txt = $('#q-manual');
  if (txt) txt.value = qStr;
  const magS = $('#q-mag-slider');
  const argS = $('#q-arg-slider');
  if (magS) {
    if (mag > +magS.max) magS.max = (mag * 1.5).toFixed(3);
    magS.value = mag;
  }
  if (argS) argS.value = arg;
  const magL = $('#q-mag-val');
  const argL = $('#q-arg-val');
  if (magL) magL.textContent = mag.toFixed(3);
  if (argL) argL.textContent = fmtArg(arg);
}

// Programmatic setter for c that keeps slider, text input, and state in sync.
function setC(c) {
  state.c = c;
  const slider = $('#c-slider');
  const text   = $('#c-manual');
  if (slider) {
    if (c > +slider.max) slider.max = (c * 1.5).toFixed(3);
    slider.value = c;
  }
  if (text) text.value = c;   // the number input doubles as the readout
}

// Update every mode-dependent visual (normalization cards, α-card, hints,
// vector-field label, preset dropdown, polynomial UI) to match the current
// state.mode. Driven entirely by the per-mode descriptor (modeDescriptor() →
// the MODES table), so it scales to all ten modes without per-mode branches
// here — each descriptor declares which cards.{w0,c,poly,q,alpha} it shows.
// Preserves the user's pole data (a_j and C_{j,s}); only swaps chrome.
// Does NOT force the w₀ mode and does NOT trigger a solve — those are setMode's
// job. Factored out of setMode (§23) so the auto-switch reflector can update
// the UI to the solver-chosen family without kicking off a redundant re-solve.
// CANONICAL mode-refresh. INVARIANT: any code path that assigns `state.mode`
// programmatically MUST call this immediately after (or go through setMode, which
// does). It is the single source of truth for mode-dependent card visibility
// (#w0-card, #c-card, #alpha-card, #q-card, the poly section), α validation, the
// c input (via setC), the poly list, and the domain-type segmented control (via
// syncDomainModeControl). Bypassing it leaves stale UI until the next refresh
// (the historical _sendHToInverseTab c-card bug). It is idempotent — safe to call
// even when the mode is unchanged.
function applyModeVisuals() {
  const desc = modeDescriptor();
  // Card visibility from descriptor.
  $('#w0-card').classList.toggle('hidden',           !desc.cards.w0);
  $('#c-card').classList.toggle('hidden',            !desc.cards.c);
  $('#poly-part-section').classList.toggle('hidden', !desc.cards.poly);
  $('#q-card').classList.toggle('hidden',            !desc.cards.q);
  // α card: visible only in PQD modes. When hidden, force state.alpha back to 1
  // so the next mode-switch doesn't carry a stale PQD config; when shown, ensure
  // state.alpha is a valid PQD value (> 0, ≠ 1; default 2).
  $('#alpha-card').classList.toggle('hidden', !desc.cards.alpha);
  if (desc.cards.alpha) {
    if (!(state.alpha > 0) || state.alpha === 1) state.alpha = 2;
    const inp = $('#alpha-input');
    if (inp) inp.value = String(state.alpha);
  } else if (state.alpha !== 1) {
    state.alpha = 1;
    const inp = $('#alpha-input');
    if (inp) inp.value = '2';            // input default for next visit
  }
  // Hint elements: show only the one this mode names (if any).
  for (const hintId of ['lqd-hint', 'lqd-singular-hint', 'pqd-hint', 'pqd-singular-hint', 'pqd-unbounded-hint', 'pqd-unbounded-singular-hint']) {
    const el = $('#' + hintId);
    if (el) el.style.display = (desc.hint === hintId) ? '' : 'none';
  }
  const vfExt = $('#vf-external-opt');
  if (vfExt) vfExt.textContent = desc.externalFieldLabel;
  populatePresetDropdown();
  markAsCustom();
  setC(state.c);
  // Sync the polynomial UI with state.polyDegree.
  syncPolyDegreeInput();
  renderPolyCoefList();
  // Reflect the current mode into the compact domain-type control. Runs on
  // EVERY mode change — interactive, §23 auto-switch, preset, URL restore.
  syncDomainModeControl(state.mode);
}

// ---------- Compact 3-axis domain-type control --------------------------
// The 10 modes factor as {weight} × {bounded|unbounded} × {singular}. Classical
// has no singular variant. composeMode maps the three controls → a MODES key;
// decomposeMode is the inverse; syncDomainModeControl reflects state.mode back
// into the buttons + checkbox (called from applyModeVisuals).
function composeMode(weight, domain, singular) {
  if (weight === 'classical') return domain;            // 'bounded' | 'unbounded'
  return `${weight}-${domain}${singular ? '-singular' : ''}`;
}
function decomposeMode(mode) {
  if (mode === 'bounded' || mode === 'unbounded') {
    return { weight: 'classical', domain: mode, singular: false };
  }
  const m = /^(pqd|lqd)-(bounded|unbounded)(-singular)?$/.exec(mode);
  if (!m) return { weight: 'classical', domain: 'bounded', singular: false };
  return { weight: m[1], domain: m[2], singular: !!m[3] };
}
function syncDomainModeControl(mode) {
  const d = decomposeMode(mode);
  $$('#dm-weight .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.weight === d.weight));
  $$('#dm-domain .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.domain === d.domain));
  const sing = $('#dm-singular');
  if (sing) {
    const classical = d.weight === 'classical';   // Classical has no singular variant
    sing.checked = d.singular;
    sing.disabled = classical;
    sing.parentElement.style.opacity = classical ? '0.45' : '';
  }
}
// Read the three controls and switch to the composed mode.
function applyDomainModeControl() {
  const weight = ($('#dm-weight .seg-btn.active') || {}).dataset
    ? $('#dm-weight .seg-btn.active').dataset.weight : 'classical';
  const domain = ($('#dm-domain .seg-btn.active') || {}).dataset
    ? $('#dm-domain .seg-btn.active').dataset.domain : 'bounded';
  const sing = $('#dm-singular');
  const singular = !!(sing && sing.checked && weight !== 'classical');
  setMode(composeMode(weight, domain, singular));
}

function setMode(newMode) {
  if (!MODES[newMode]) return;
  if (state.mode === newMode) return;
  state.mode = newMode;
  applyModeVisuals();
  // All families default to 'auto' (Centroid of poles) — including LQD and the
  // singular families. buildNorm computes the centroid each solve and validates
  // w₀ ≠ 0 where required (LQD / singular), surfacing a clear error if it
  // degenerates; the user can switch to Manual at any time.
  scheduleSolve();
}

function syncPolyDegreeInput() {
  const inp = $('#poly-degree');
  if (inp) inp.value = state.polyDegree;
}

// Selecting a preset loads it; the user editing anything afterward reverts
// the dropdown to "— custom —".
function markAsCustom() { $('#preset-select').value = ''; }

// Per-pole event delegation. Handles three kinds of `input` events:
//   • text fields for a_j, order, and C_{j,s}
//   • magnitude (|C|) range sliders
//   • argument (arg) range sliders
// Slider changes write back to the C_{j,s} text field and trigger a solve;
// text-field changes update both sliders to match.
$('#poles-list').addEventListener('input', e => {
  const t = e.target;
  const poleDiv = t.closest('.pole');
  if (!poleDiv) return;
  const idx = +poleDiv.dataset.idx;
  const pole = state.poles[idx];

  // Any manual edit reverts the preset dropdown to "— custom —".
  markAsCustom();

  // --- mag / arg sliders ---
  if (t.classList.contains('slider1d-mag') || t.classList.contains('slider1d-arg')) {
    const sIdx = +t.dataset.s;
    const block = t.closest('.residue-block');
    const magSlider = $('.slider1d-mag', block);
    const argSlider = $('.slider1d-arg', block);
    const mag = +magSlider.value;
    const arg = +argSlider.value;
    $('.mag-val', block).textContent = mag.toFixed(3);
    $('.arg-val', block).textContent = fmtArg(arg);
    const c = { re: mag * Math.cos(arg), im: mag * Math.sin(arg) };
    const text = Complex.toString(c, 4);
    pole.residues[sIdx] = text;
    $('.residue', block).value = text;
    scheduleQuickSolve();   // live update during drag
    return;
  }

  // --- text inputs ---
  const field = t.dataset.field;
  if (field === 'a') {
    pole.a = t.value;
  }
  else if (field === 'order') {
    const newOrder = Math.max(1, Math.min(6, +t.value || 1));
    pole.order = newOrder;
    while (pole.residues.length < newOrder) pole.residues.push('0');
    pole.residues.length = newOrder;
    renderPolesList();
  }
  else if (field === 'residue') {
    const sIdx = +t.dataset.s;
    pole.residues[sIdx] = t.value;
    // Sync the two sliders to the parsed value.
    const c = Complex.parse(t.value);
    if (c) {
      const mag = Math.hypot(c.re, c.im);
      const arg = Math.atan2(c.im, c.re);
      const block = t.closest('.residue-block');
      const magSlider = $('.slider1d-mag', block);
      const argSlider = $('.slider1d-arg', block);
      const key = residueKey(idx, sIdx);
      const newMax = magMaxFor(key, mag);
      if (newMax > +magSlider.max) magSlider.max = newMax;
      magSlider.value = mag;
      argSlider.value = arg;
      $('.mag-val', block).textContent = mag.toFixed(3);
      $('.arg-val', block).textContent = fmtArg(arg);
    }
  }
  scheduleSolve();
});
$('#poles-list').addEventListener('click', e => {
  // Use closest() so the handler still fires if the click lands on a child
  // of the remove button (e.g. an inner glyph element).
  const removeBtn = e.target.closest('[data-action="remove"]');
  if (!removeBtn) return;
  const poleDiv = removeBtn.closest('.pole');
  if (!poleDiv) return;
  markAsCustom();
  removePoleAt(+poleDiv.dataset.idx);
});

// When a slider drag ENDS (mouseup), re-run the full solver to refresh
// alternates and kick off the background search again.
$('#poles-list').addEventListener('change', e => {
  if (e.target.classList.contains('slider1d-mag') ||
      e.target.classList.contains('slider1d-arg')) {
    scheduleSolve();
  }
});
$('#add-pole').addEventListener('click', () => { markAsCustom(); addPole(); });

// ---------- View-mode toggle (HANDOFF #30) ------------------------------
// Inverse | direct segmented control at the top of the QD tab. The inverse
// view is the existing QD/LQD UI (wrapped in #qd-inverse-content in
// index.html); the direct view is the former Direct-problem tab UI,
// relocated into #controls-direct (now a sibling of #qd-inverse-content
// inside #controls-qd). Direct UI is lazy-mounted on first switch.
function mountViewToggle() {
  const qdRoot = document.getElementById('controls-qd');
  if (!qdRoot) return;
  const card = document.createElement('section');
  card.id = 'qd-view-toggle';
  card.className = 'card';
  card.innerHTML = `
    <div class="segmented" role="tablist" aria-label="View mode">
      <button class="seg-btn active" data-view="inverse" type="button">inverse</button>
      <button class="seg-btn"        data-view="direct"  type="button">direct</button>
    </div>
  `;
  // Insert as the first child of #controls-qd, BEFORE #qd-inverse-content.
  qdRoot.insertBefore(card, qdRoot.firstChild);
  card.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => setViewMode(btn.dataset.view));
  });
}

function setViewMode(mode) {
  if (mode !== 'inverse' && mode !== 'direct') return;
  if (mode === state.viewMode) return;
  state.viewMode = mode;
  // Toggle segmented-control highlight.
  document.querySelectorAll('#qd-view-toggle .seg-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === mode);
  });
  const inv = document.getElementById('qd-inverse-content');
  const dir = document.getElementById('controls-direct');
  if (inv) inv.style.display = (mode === 'inverse') ? '' : 'none';
  if (dir) dir.style.display = (mode === 'direct')  ? '' : 'none';
  if (mode === 'direct') {
    // Lazy-mount Direct UI on first switch.
    if (!state.directMounted && window.QD && QD.Direct && QD.Direct._mountUI) {
      QD.Direct._mountUI();
      state.directMounted = true;
    }
    if (window.QD && QD.Direct && QD.Direct._activate) QD.Direct._activate();
  }
  updateStatusPanelVisibility();   // panel shows only on the inverse view
}

mountViewToggle();

// -----------------------------------------------------------------------------
// QoL: attach "?" help buttons to the inverse-tab cards (HANDOFF #33).
// Static cards in index.html; lazy-mounted cards (Direct, Schwarz, Param-slice)
// wire their own help inside their respective ui modules.
// -----------------------------------------------------------------------------
function mountQolHelp() {
  if (!window.QD || !window.QD.QoL || !window.QD.QoL.attachHelp) return;
  const H = window.QD.QoL.attachHelp;
  const headerOf = (cardSelector) => {
    const card = document.querySelector(cardSelector);
    return card ? card.querySelector('h2') : null;
  };
  // Domain type
  H(headerOf('#domain-mode-card'),
    `<b>Domain type.</b> The quadrature identity Ω must satisfy.
     <b>QD</b>: classical (unweighted). <b>PQD</b>: power weight
     |w|<sup>2(α−1)</sup> (α on the card below). <b>LQD</b>: log weight 1/|w|².
     <b>Bounded</b> = finite Ω; <b>unbounded</b> = Ω reaches ∞.
     <b>Singular</b> = 0 ∈ Ω (φ gains a Blaschke factor); non-singular = 0 ∉ Ω.
     Classical QD has no singular variant.`);
  // Quadrature function h(w)
  H(headerOf('#h-card'),
    `<b>Quadrature data h(w).</b> Sum of rational and polynomial terms.
     Edit poles + residues structurally below, or paste a math.js expression
     in the textbox at the top. The inverse solver finds Ω whose
     quadrature data matches this h.`);
  H(headerOf('#q-card'),
    `<b>Residue at the origin (q).</b> For <i>singular LQDs</i> (0 ∈ Ω), q is a
     free parameter — the residue of the log-weighted Schwarz function at w=0 —
     linked to the finite poles and any polynomial part of h by a closed-form
     constraint. (Singular PQDs need no q: the |w|<sup>2(α−1)</sup> weight makes
     the quadrature data unique.)`);
  H(headerOf('#w0-card'),
    `<b>Riemann map center φ(0).</b> The image of the disk center 0 ∈ 𝔻; with c
     it fixes the gauge of φ. Bounded families: a free parameter (set it
     manually, or leave on Auto for the pole centroid). On Auto the centroid is
     recomputed continuously as you drag a pole, so it stays inside the domain.
     Unbounded families: implicit, not editable.`);
  H(headerOf('#c-card'),
    `<b>Conformal radius c = φ'(∞).</b> Scales the Riemann map at infinity for
     unbounded families; with w₀ it fixes the gauge of φ. Unbounded QDs form a
     one-parameter family in c — sweep the slider to explore it; past the
     critical c the simply-connected QD ceases to exist (the solver flags this).`);
  H(headerOf('#solver-settings-card'),
    `<b>Solver settings.</b> The <i>Aggressiveness</i> preset
     (Quick / Standard / Thorough) balances Newton iterations, identity-check
     samples, and how many alternate branches are sought; fine-tune via
     <i>Search options</i>. Also here: the boundary-sample count, the
     vector-field overlay (Pólya h̄(w), or the family-specific external /
     equilibrium field), the critical-set overlay, and <i>Auto-switch
     singular ⇄ non-singular PQD</i> — which re-solves in the correct family
     when a PQD boundary crosses the origin.`);
  H(headerOf('#search-options-card'),
    `<b>Search options.</b> Each phase is a distinct strategy for finding a φ
     consistent with h(w). Direct = single Newton from the initial guess;
     continuation = parameter-homotopy from a related solved scenario;
     multistart = many random seeds; diverse + deflation = explicit
     branch-finding.`);
  H(headerOf('#status-card'),
    `<b>Status.</b> Live readout of the solver: convergence diagnostics,
     identity residual, univalence, and which branches succeeded.`);
  H(document.querySelector('#sp-geom summary'),
    `<b>Geometric properties.</b> Special univalence classes of the solved Ω,
     checked asynchronously after each solve. <i>Star-like</i>: every ray from
     the center (w₀ for bounded; ∞ for unbounded) stays in Ω
     — Re(z·φ′/(φ−w₀)) &gt; 0. <i>Convex</i> (bounded): Re(1 + z·φ″/φ′) &gt; 0.
     <i>Spiral-like</i>: a log-spiral generalization of star-like; λ is the
     optimal spiral angle. The hierarchy is convex ⟹ star-like ⟹ spiral-like,
     all ⟹ univalent.`);
  H(document.querySelector('#sp-cusps summary'),
    `<b>Boundary singularities.</b> Cusps of ∂Ω, found asynchronously after each
     solve. A cusp sits where the Riemann map's derivative vanishes on the unit
     circle, φ′(e^{iθ}) = 0; the order m of that zero fixes the local
     <i>type</i> (p,q) = (m+1, m+2): m = 1 is the ordinary 3⁄2-power (2,3) cusp.
     A filled ● / magenta triangle marks an actual cusp; a hollow ○ marks an
     <i>incipient</i> one — a φ′-zero near but not yet on ∂𝔻, shown with its
     distance d (a "how close to a cusp" gauge). The (p,q) type is read exactly
     from φ's Taylor coefficients and cross-checked numerically.`);
  // (The Riemann-map symbolic identity is shown via the "?" toggle next to the
  // numerical φ(z) in the Domain-type tile — no separate help popover.)
  H(headerOf('#alternates-card'),
    `<b>Alternate solutions.</b> When more than one φ satisfies the same h
     (multiple branches), the solver lists them here. Click an alternate to
     promote it to the primary.`);
}
mountQolHelp();

// Relocate the advanced "Search options" card to the BOTTOM of the inverse
// sidebar — it's rarely touched, so it shouldn't sit between the everyday
// controls. (Done in JS rather than in markup to keep the source order readable
// and the move trivially reversible.)
{
  const soCard = document.getElementById('search-options-card');
  const host = document.getElementById('qd-inverse-content');
  if (soCard && host) host.appendChild(soCard);
}

// QoL: copy button on the h(w) text input (HANDOFF #33).
(function mountHTextCopyButton() {
  if (!window.QD || !window.QD.QoL || !window.QD.QoL.copyButton) return;
  const parseBtn = document.getElementById('h-parse');
  if (!parseBtn) return;
  const copy = window.QD.QoL.copyButton(() => {
    const inp = document.getElementById('h-text');
    return inp ? inp.value : '';
  }, { title: 'Copy h(w) text' });
  copy.style.marginLeft = '6px';
  parseBtn.parentNode.insertBefore(copy, parseBtn.nextSibling);
})();

// Domain-type toggle
// Compact domain-type control: weight + domain segmented buttons + singular
// checkbox all route through applyDomainModeControl() → setMode().
$$('#dm-weight .seg-btn').forEach(b => b.addEventListener('click', () => {
  $$('#dm-weight .seg-btn').forEach(x => x.classList.toggle('active', x === b));
  // Classical has no singular variant — clear it before composing the mode.
  if (b.dataset.weight === 'classical') { const s = $('#dm-singular'); if (s) s.checked = false; }
  applyDomainModeControl();
}));
$$('#dm-domain .seg-btn').forEach(b => b.addEventListener('click', () => {
  $$('#dm-domain .seg-btn').forEach(x => x.classList.toggle('active', x === b));
  applyDomainModeControl();
}));
{
  const sing = $('#dm-singular');
  if (sing) sing.addEventListener('change', applyDomainModeControl);
}
// Reflect the initial mode into the control NOW so the singular checkbox starts
// disabled under the default classical mode (it was toggleable until the first
// mode change otherwise).
syncDomainModeControl(state.mode);

// Relocate the conformal-radius card (#c-card) to sit directly below the
// Riemann-map formula inside the Domain-type tile. Its mode-driven visibility
// (applyModeVisuals toggles `.hidden`) is id-based, so the move is transparent.
{
  const cCard = document.getElementById('c-card');
  const dmRiemann = document.getElementById('dm-riemann');
  if (cCard && dmRiemann) dmRiemann.insertAdjacentElement('afterend', cCard);
}

// "?" toggle that reveals/hides the symbolic Riemann-map identity inline.
{
  const tog = $('#dm-riemann-sym-toggle');
  const sym = $('#dm-riemann-sym');
  if (tog && sym) tog.addEventListener('click', () => sym.classList.toggle('hidden'));
}

// Preset dropdown
populatePresetDropdown();
// Reflect the default load as a *named* preset rather than "— custom —": the
// initial state (bounded, h = 1/w) is exactly the 'unit-disk' preset, so show
// that label as the starting point. Setting .value to a non-existent option is
// a no-op, so this is safe if the preset list ever changes. (B2: orientation.)
{
  const sel = $('#preset-select');
  if (sel && currentPresetList().some(p => p.id === 'unit-disk')) sel.value = 'unit-disk';
}
$('#preset-select').addEventListener('change', e => {
  if (e.target.value) applyPreset(e.target.value);
});

// Custom h(w) parse button + Enter-to-parse on the text input.
$('#h-parse').addEventListener('click', () => parseAndApplyHText());
$('#h-text').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); parseAndApplyHText(); }
});

// w0 mode (bounded only)
$$('input[name="w0mode"]').forEach(r => r.addEventListener('change', e => {
  state.w0Mode = e.target.value;
  $('#w0-manual').disabled = state.w0Mode !== 'manual';
  scheduleSolve();
}));
$('#w0-manual').addEventListener('input', e => {
  state.w0Manual = e.target.value;
  if (state.w0Mode === 'manual') scheduleSolve();
});

// α input (PQD mode): free-entry number, any real α > 0 (α ≠ 1), plus
// quick-pick buttons (½, 2, 3). Routes Newton to Family.powerQD via the
// pqd-bounded mode's buildNorm/applyNorm.
const alphaInputEl = $('#alpha-input');
if (alphaInputEl) {
  alphaInputEl.addEventListener('input', e => {
    const a = +e.target.value;
    if (a > 0) { state.alpha = a; markAsCustom(); scheduleSolve(); }
  });
}
$$('.alpha-quick').forEach(btn => btn.addEventListener('click', () => {
  const a = +btn.getAttribute('data-alpha');
  if (!(a > 0)) return;
  state.alpha = a;
  if (alphaInputEl) alphaInputEl.value = String(a);
  markAsCustom();
  scheduleSolve();
}));

// Conformal radius c (unbounded only): slider drives quick solve, manual
// text drives full solve.
$('#c-slider').addEventListener('input', e => {
  const c = +e.target.value;
  state.c = c;
  $('#c-manual').value = c;   // the number input IS the readout (no #c-val span)
  markAsCustom();
  scheduleQuickSolve();
});
$('#c-slider').addEventListener('change', () => { scheduleSolve(); });
$('#c-manual').addEventListener('input', e => {
  const c = +e.target.value;
  if (!(c > 0) || !isFinite(c)) return;
  setC(c);
  markAsCustom();
  scheduleSolve();
});

// Singular-LQD charge q (complex). Text input drives full solve; |q| / arg
// sliders drive the snappy warm-start path.
const qManualInp = $('#q-manual');
if (qManualInp) qManualInp.addEventListener('input', e => {
  const parsed = QD.Complex.parse(e.target.value);
  if (!parsed) return;
  setQ(e.target.value);
  markAsCustom();
  scheduleSolve();
});
const qMagS = $('#q-mag-slider');
const qArgS = $('#q-arg-slider');
function readQFromSliders() {
  const mag = +qMagS.value, arg = +qArgS.value;
  const c = { re: mag * Math.cos(arg), im: mag * Math.sin(arg) };
  const text = QD.Complex.toString(c, 4);
  state.q = text;
  $('#q-manual').value = text;
  $('#q-mag-val').textContent = mag.toFixed(3);
  $('#q-arg-val').textContent = fmtArg(arg);
}
if (qMagS) {
  qMagS.addEventListener('input', () => { readQFromSliders(); markAsCustom(); scheduleQuickSolve(); });
  qMagS.addEventListener('change', () => scheduleSolve());
}
if (qArgS) {
  qArgS.addEventListener('input', () => { readQFromSliders(); markAsCustom(); scheduleQuickSolve(); });
  qArgS.addEventListener('change', () => scheduleSolve());
}

// Polynomial part of h (unbounded mode)
$('#poly-degree').addEventListener('input', e => {
  const d = parseInt(e.target.value, 10);
  if (isNaN(d) || d < -1 || d > 6) return;
  state.polyDegree = d;
  if (d >= 0) {
    while (state.polyCoeffs.length < d + 1) state.polyCoeffs.push('0');
    state.polyCoeffs.length = d + 1;
  } else {
    // d = -1: clear coeffs but preserve them in case the user wants to come back?
    // For simplicity, just leave state.polyCoeffs as-is (render hides it).
  }
  markAsCustom();
  renderPolyCoefList();
  scheduleSolve();
});

// Per-coef events on the polynomial section.
$('#poly-coefs-list').addEventListener('input', e => {
  const t = e.target;
  const block = t.closest('.residue-block');
  if (!block) return;
  const l = +block.dataset.polyL;

  if (t.classList.contains('slider1d-poly-mag') || t.classList.contains('slider1d-poly-arg')) {
    const magSlider = $('.slider1d-poly-mag', block);
    const argSlider = $('.slider1d-poly-arg', block);
    const mag = +magSlider.value;
    const arg = +argSlider.value;
    $('.poly-mag-val', block).textContent = mag.toFixed(3);
    $('.poly-arg-val', block).textContent = fmtArg(arg);
    const c = { re: mag * Math.cos(arg), im: mag * Math.sin(arg) };
    const text = QD.Complex.toString(c, 4);
    state.polyCoeffs[l] = text;
    $('.poly-coef', block).value = text;
    markAsCustom();
    scheduleQuickSolve();
    return;
  }

  if (t.classList.contains('poly-coef')) {
    state.polyCoeffs[l] = t.value;
    const c = QD.Complex.parse(t.value);
    if (c) {
      const mag = Math.hypot(c.re, c.im);
      const arg = Math.atan2(c.im, c.re);
      const magSlider = $('.slider1d-poly-mag', block);
      const argSlider = $('.slider1d-poly-arg', block);
      const key = `poly-coef-${l}`;
      const newMax = magMaxFor(key, mag);
      if (newMax > +magSlider.max) magSlider.max = newMax;
      magSlider.value = mag;
      argSlider.value = arg;
      $('.poly-mag-val', block).textContent = mag.toFixed(3);
      $('.poly-arg-val', block).textContent = fmtArg(arg);
    }
    markAsCustom();
    scheduleSolve();
  }
});

// Slider drag end → full solve for the polynomial section.
$('#poly-coefs-list').addEventListener('change', e => {
  if (e.target.classList.contains('slider1d-poly-mag') ||
      e.target.classList.contains('slider1d-poly-arg')) {
    scheduleSolve();
  }
});

// solver settings
$('#samples').addEventListener('input', e => {
  state.samples = Math.max(50, Math.min(5000, +e.target.value || 500));
  // Re-render current solution with new sample count.
  if (state.current && state.current.success) {
    const all = [state.current.primary, ...(state.current.alternates || [])];
    showSolution(all[state.selectedSolutionIdx] || all[0], state.current.hData,
                 state.selectedSolutionIdx === 0);
  }
});
$('#aggressiveness').addEventListener('change', e => {
  state.aggressiveness = e.target.value;
  scheduleSolve();
});
$('#auto-fit').addEventListener('change', e => {
  state.autoFit = e.target.checked;
});
$('#auto-switch-singular').addEventListener('change', e => {
  state.autoSwitchSingular = e.target.checked;
  scheduleSolve();   // re-solve so the change takes effect immediately
});
$('#vector-field-mode').addEventListener('change', e => {
  state.vectorFieldMode = e.target.value;
  plot.render();
});
$('#critical-set-toggle').addEventListener('change', e => {
  state.showCriticalSet = e.target.checked;
  plot.render();
});

// ---------- Search-options panel wiring ----------------------------------
// Every field updates state.searchOptions on `input`/`change`. Inputs that
// change solver behavior schedule a fresh solve; display-only toggles
// (showNonUnivalent / showIdFailing) only re-render the alternates panel.
(function wireSearchOptions() {
  const allInputs = [
    '#so-phase-direct', '#so-phase-continuation', '#so-phase-multistart',
    '#so-phase-diverse', '#so-phase-deflation',
    '#so-num-restarts', '#so-num-diverse', '#so-num-deflation',
    '#so-bg-chunks', '#so-bg-chunk-size', '#so-keep-searching',
    '#so-newton-maxiter', '#so-newton-tol', '#so-cont-tstart', '#so-cont-grow',
    '#so-defl-alpha', '#so-defl-p', '#so-defl-from-valid',
    '#so-uni-samples', '#so-id-tol',
    '#so-show-non-univalent', '#so-show-id-failing', '#so-auto-escalate',
    '#so-seed',
  ];
  const displayOnly = new Set(['#so-show-non-univalent', '#so-show-id-failing']);

  allInputs.forEach(sel => {
    const el = $(sel);
    if (!el) return;
    const evt = el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(evt, () => {
      readSearchOptions();
      if (displayOnly.has(sel)) {
        refreshAlternatesPanel();
      } else {
        scheduleSolve();
      }
    });
  });

  $('#so-reset').addEventListener('click', () => {
    resetSearchOptions();
    scheduleSolve();
  });

  // Reseed button: just bumps the alt-search token and starts a fresh round
  // using the current primary, without re-solving.
  $('#so-reseed').addEventListener('click', () => {
    if (!state.current || !state.current.success) return;
    // Reconstruct the FULL norm from the solved phi so the alt-search re-selects
    // the same family. The old sparse {unbounded,c}|{w0} dropped alpha/lqd/
    // singular/q and misrouted every non-classical family to boundedQD.
    const norm = QD.normFromPhi(state.current.primary && state.current.primary.phi);
    if (!norm) return;
    startBackgroundAltSearch(state.current.hData, norm);
  });

  // Initial population.
  readSearchOptions();
})();

// Try-harder button: runs the "exhaustive" aggressiveness preset (which has
// a much larger multistart budget, tighter Newton, longer continuation, and
// implicitly more deflation rounds). Useful when the current default-level
// solve has flagged the primary as non-valid (spurious / non-univalent).
// Cancel an in-flight primary solve (B3).
{
  const cancelBtn = $('#solve-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', cancelSolve);
}

// Status-panel collapse toggle (collapses to just the verdict badge bar).
{
  const panel = $('#status-panel');
  const btn = $('#sp-collapse');
  const apply = () => {
    if (!panel) return;
    panel.classList.toggle('collapsed', !!state.statusPanelCollapsed);
    if (btn) btn.setAttribute('aria-expanded', state.statusPanelCollapsed ? 'false' : 'true');
  };
  if (btn) btn.addEventListener('click', () => {
    state.statusPanelCollapsed = !state.statusPanelCollapsed;
    apply();
  });
  apply();   // reflect the initial state
}

$('#try-harder-btn').addEventListener('click', () => {
  const btn = $('#try-harder-btn');
  const busy = $('#try-harder-busy');
  btn.disabled = true;
  busy.classList.remove('hidden');
  (async () => {
    try {
      const built = buildHData();
      if (!built || built.error) {
        setStatus({ kind: 'err', text: 'No valid input.' });
        return;
      }
      const norm = buildNormalization(built);
      if (norm.error) {
        setStatus({ kind: 'err', text: norm.error });
        return;
      }
      const preset = PRESETS.exhaustive;
      const opts = buildSolverOptions(preset, { findAlternates: true });
      applyNormToOpts(opts, norm);
      // Route through the worker when available; main-thread fallback runs
      // inline (the spinner above + the async wrap let it still paint).
      const PSW = QD.PrimarySolverWorker;
      const result = (PSW && typeof PSW.solve === 'function')
        ? await PSW.solve(built, opts)
        : QD.solveInverseQD(built, opts);
      state.current = result;
      state.current.hData = built;
      state.current.w0Used = norm.w0 || (state.current.primary && state.current.primary.phi && state.current.primary.phi.w0);
      state.current.cUsed  = norm.c;
      state.current.unbounded = !!norm.unbounded;
      state.selectedSolutionIdx = 0;
      publishPrimarySolution();
      if (!result.success) {
        setStatus({ kind: 'err',
          text: 'Exhaustive search still found no algebraic root.\n  reason: ' + result.error });
        return;
      }
      showSolution(result.primary, built, /*isPrimary=*/false);
      refreshAlternatesPanel();
    } catch (e) {
      if (e && e.aborted) return;
      setStatus({ kind: 'err', text: 'Try-harder error: ' + (e && e.message || e) });
    } finally {
      btn.disabled = false;
      busy.classList.add('hidden');
    }
  })();
});

// plot controls
$('#btn-fit').addEventListener('click', () => plot.fit());
$('#btn-reset').addEventListener('click', () => plot.reset());

// alternates panel: click to view
$('#alternates-list').addEventListener('click', e => {
  const idx = e.target.dataset.altIdx;
  if (idx !== undefined) viewSolutionByIndex(+idx);
});

// ===========================================================================
// URL/hash state (B1) — shareable, bookmarkable, reload-restorable config.
//
// We serialize the user-meaningful inputs (mode, the h(w) text, the
// normalization gauges w₀/c/α/q, aggressiveness, and the active tab) into
// location.hash. The h-text round-trips both poles AND the polynomial part
// (refreshHText → formatH), so it alone captures the full quadrature data;
// parseAndApplyHText rebuilds the structured grid from it on restore. We use
// history.replaceState (not assignment to location.hash) so writing the URL
// never pushes a back-button entry or re-navigates.
// ===========================================================================
function _activeTabId() {
  const el = document.querySelector('.tab-btn.active');
  return (el && el.dataset.tab) || 'qd';
}

let _writeUrlScheduled = false;
function writeUrlState() {
  // Coalesce bursts (a slider drag fires many solves) into one history write
  // per frame.
  if (_writeUrlScheduled) return;
  _writeUrlScheduled = true;
  const raf = (typeof requestAnimationFrame === 'function')
    ? requestAnimationFrame
    : (fn) => setTimeout(() => fn(), 16);
  raf(() => {
    _writeUrlScheduled = false;
    try {
      const p = new URLSearchParams();
      p.set('mode', state.mode);
      const hText = ($('#h-text') && $('#h-text').value || '').trim();
      if (hText) p.set('h', hText);
      if (state.w0Mode) p.set('w0m', state.w0Mode);
      if (state.w0Manual) p.set('w0', state.w0Manual);
      if (state.c != null) p.set('c', String(state.c));
      if (state.alpha != null && state.alpha !== 1) p.set('a', String(state.alpha));
      if (state.q && state.q !== '0') p.set('q', state.q);
      if (state.aggressiveness) p.set('agg', state.aggressiveness);
      const tab = _activeTabId();
      if (tab && tab !== 'qd') p.set('tab', tab);
      const hash = '#' + p.toString();
      // Avoid redundant history churn when nothing changed.
      if (hash !== location.hash) {
        history.replaceState(null, '', location.pathname + location.search + hash);
      }
    } catch (e) { /* never let URL bookkeeping break the app */ }
  });
}

// Restore state from location.hash on load. Returns true if a hash was applied
// (so the caller can skip the default-config solve). Sets mode + gauges FIRST,
// then the h-text, then parses it (which schedules the solve), then the tab.
function applyUrlState() {
  let hash = (location.hash || '').replace(/^#/, '');
  if (!hash) return false;
  let p;
  try { p = new URLSearchParams(hash); } catch (e) { return false; }
  if (![...p.keys()].length) return false;

  // 1. Mode (drives card visibility + which gauges matter). applyModeVisuals
  //    forces α back to 1 for non-PQD modes, so it must run BEFORE we set α.
  const mode = p.get('mode');
  if (mode && MODES[mode]) {
    state.mode = mode;
    applyModeVisuals();   // also syncs the compact domain-type control
  }
  // 2. Gauges.
  if (p.has('a')) {
    const a = +p.get('a');
    if (a > 0 && a !== 1) { state.alpha = a; const inp = $('#alpha-input'); if (inp) inp.value = String(a); }
  }
  if (p.has('c')) { const c = +p.get('c'); if (c > 0) setC(c); }
  if (p.has('w0m')) {
    const m = p.get('w0m');
    if (m === 'auto' || m === 'manual') {
      state.w0Mode = m;
      const r = document.querySelector(`input[name="w0mode"][value="${m}"]`);
      if (r) r.checked = true;
      const wManual = $('#w0-manual');
      if (wManual) wManual.disabled = (m !== 'manual');
    }
  }
  if (p.has('w0')) {
    state.w0Manual = p.get('w0');
    const wManual = $('#w0-manual');
    if (wManual) wManual.value = state.w0Manual;
  }
  if (p.has('q')) setQ(p.get('q'));
  if (p.has('agg') && PRESETS[p.get('agg')]) {
    state.aggressiveness = p.get('agg');
    const aggSel = $('#aggressiveness');
    if (aggSel) aggSel.value = state.aggressiveness;
  }
  // 3. h(w): set the text and parse it (rebuilds the pole grid + poly + solves).
  if (p.has('h')) {
    const inp = $('#h-text');
    if (inp) { inp.value = p.get('h'); parseAndApplyHText(); }
  }
  // 4. Active tab (deferred a tick so the QD solve kicks off first).
  const tab = p.get('tab');
  if (tab && tab !== 'qd') {
    const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
    if (btn) setTimeout(() => btn.click(), 0);
  }
  return true;
}

// Keep the URL in sync when the active tab changes (the QD-config writes
// happen via solveAndRender; this covers pure tab switches).
document.addEventListener('tab-changed', () => writeUrlState());
// Show/hide the bottom-right status panel with the QD tab (fires on every tab change).
document.addEventListener('tab-changed', () => updateStatusPanelVisibility());

// Initial solve — restore a shared/bookmarked config from the URL if present,
// otherwise solve the default state (B1).
if (applyUrlState()) {
  scheduleSolve();             // ensure a solve even if no h param was present
} else {
  solveAndRender();
}

// ---------- Hooks for the Direct view (within the QD tab) ----------------------------
// direct-ui.js calls these to (a) push a ∂Ω preview onto the shared canvas,
// (b) send a computed h back to the QD tab's inverse view and switch view modes.
window.QD = window.QD || {};
window.QD.Direct = window.QD.Direct || {};

window.QD.Direct._setPlotBoundary = function (boundaryPts, opts) {
  // Display the user's φ-boundary on the canvas. Accepts an `unbounded`
  // flag in opts so the bounded-vs-unbounded shading convention matches
  // what the inverse solver uses. opts.overlayBoundary, if present, is
  // drawn as a dashed gold curve over the main boundary (used by the
  // round-trip diagnostic to show the inverse-recovered φ).
  opts = opts || {};
  plot.setData({
    boundaryPts,
    poles: [],
    w0: boundaryPts.length ? boundaryPts[0] : { re: 0, im: 0 },
    univalent: !boundarySelfIntersectsSimple(boundaryPts),
    unbounded: !!opts.unbounded,
    overlayBoundary: opts.overlayBoundary || null,
    vfMode: 'off',
    hData: { poles: [] },
    phi: null,
  });
};

window.QD.Direct._setPlotOverlay = function (overlayBoundary) {
  // Append/replace the overlay boundary without disturbing the main one.
  if (!plot.data) return;
  plot.data.overlayBoundary = overlayBoundary || null;
  plot.render();
};

// Cheap O(N²) self-intersection check — sufficient for the preview.
function boundarySelfIntersectsSimple(pts) {
  const N = pts.length;
  if (N < 4) return false;
  for (let i = 0; i < N; i++) {
    const a1 = pts[i], a2 = pts[(i + 1) % N];
    for (let j = i + 2; j < N; j++) {
      if (j === N - 1 && i === 0) continue;
      const b1 = pts[j], b2 = pts[(j + 1) % N];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}
function segmentsIntersect(p1, p2, p3, p4) {
  function ccw(a, b, c) {
    return (c.im - a.im) * (b.re - a.re) > (b.im - a.im) * (c.re - a.re);
  }
  return ccw(p1, p3, p4) !== ccw(p2, p3, p4) &&
         ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}

window.QD.Direct._sendHToInverseTab = function (hData, opts) {
  // Populate the inverse-tab state from a Direct-computed h (+ the family params
  // carried in opts) and re-render, then switch to the inverse view.
  //
  // opts carries the FULL family identity: { unbounded?, alpha? (⇒ PQD), lqd?,
  // singular?, c?, q? }. We compose the matching inverse mode from it (so an
  // unbounded PQD lands in `pqd-unbounded`, NOT classical `unbounded`), set the
  // family parameters, then go through the canonical refresh.
  //
  // INVARIANT (see applyModeVisuals): any programmatic `state.mode` write MUST be
  // followed by applyModeVisuals() — the single source of truth for which
  // mode-dependent cards (#c-card, #alpha-card, #q-card, poly section, …) are
  // visible and for syncing the domain-type control. The earlier bug here set
  // state.mode + syncDomainModeControl only, leaving #c-card hidden until a
  // refresh; applyModeVisuals fixes that and is idempotent.
  opts = opts || {};
  const weight   = opts.alpha ? 'pqd' : (opts.lqd ? 'lqd' : 'classical');
  const domain   = opts.unbounded ? 'unbounded' : 'bounded';
  const singular = !!opts.singular && weight !== 'classical';
  const mode     = composeMode(weight, domain, singular);

  state.poles = hData.poles.map(p => ({
    a: QD.Complex.toString(p.a, 6),
    order: p.principal.length,
    residues: p.principal.map(c => QD.Complex.toString(c, 6)),
  }));

  // Family parameters (set BEFORE applyModeVisuals: it validates α against the
  // mode and repopulates the c input from state.c via setC).
  if (typeof opts.alpha === 'number' && opts.alpha > 0) state.alpha = opts.alpha;
  if (typeof opts.c === 'number' && opts.c > 0) state.c = opts.c;
  if (domain === 'unbounded') {
    const polyPart = hData.polyPart || [];
    state.polyDegree = polyPart.length - 1;
    state.polyCoeffs = polyPart.map(c => QD.Complex.toString(c, 6));
  } else {
    state.polyDegree = -1;
    state.polyCoeffs = [];
  }

  // Apply the mode + refresh ALL mode-dependent UI (cards, α/c population, poly
  // list, domain-type control) in one canonical call.
  state.mode = mode;
  applyModeVisuals();

  // q (LQD-singular origin pole) lives in the now-visible q-card.
  if (opts.q) setQ(QD.Complex.toString(opts.q, 6));

  renderPolesList();
  const ps = document.getElementById('preset-select');
  if (ps) ps.value = '';

  // Switch view-mode to inverse and re-solve (HANDOFF #30: the Direct UI is now a
  // view within the QD tab, so this is a view-mode switch rather than a tab switch).
  setViewMode('inverse');
  solveAndRender();
};

// =============================================================================
// Public hooks for the Parameter-slice tab.
//
// The slice tab needs two things from ui.js:
//   • snapshotScenario()              — read out the current { hData, norm, mode }
//   • loadScenarioIntoQdTab(s, mode)  — push a scenario back into state, re-solve,
//                                       and switch to the QD tab.
//
// We expose these on window.QD_UI so param-slice-ui.js can find them
// without having to be loaded after this file.
// =============================================================================
window.QD_UI = window.QD_UI || {};

window.QD_UI.snapshotScenario = function () {
  const built = buildHData();
  if (!built || built.error) return null;
  const norm = buildNormalization(built);
  if (norm.error) return null;
  // Defensive: ensure polyPart is always present (slice UI inspects it).
  if (!built.polyPart) built.polyPart = [];
  return { hData: built, norm, mode: state.mode };
};

window.QD_UI.loadScenarioIntoQdTab = function (scenario, mode) {
  if (!scenario || !scenario.hData) return;
  // Switch mode first (re-runs setMode's side-effects: card visibility,
  // preset dropdown, polynomial panel toggle). setMode is a no-op if the
  // mode hasn't changed.
  if (mode && mode !== state.mode) {
    setMode(mode);   // setMode → applyModeVisuals syncs the compact control
  }
  // Reflect hData into state.poles + state.polyDegree + state.polyCoeffs.
  const hData = scenario.hData;
  state.poles = hData.poles.map(p => ({
    a: QD.Complex.toString(p.a, 6),
    order: p.principal.length,
    residues: p.principal.map(c => QD.Complex.toString(c, 6)),
  }));
  const polyPart = hData.polyPart || [];
  state.polyDegree = polyPart.length - 1;
  state.polyCoeffs = polyPart.map(c => QD.Complex.toString(c, 6));

  // Reflect norm fields (c, q, w0) into state + DOM.
  const norm = scenario.norm || {};
  if (typeof norm.c === 'number' && norm.c > 0) {
    state.c = norm.c;
    const cInput  = $('#c-manual');
    const cSlider = $('#c-slider');
    if (cInput)  cInput.value  = norm.c.toString();
    if (cSlider) cSlider.value = norm.c.toString();
  }
  if (norm.q) {
    state.q = QD.Complex.toString(norm.q, 6);
    const qInput = $('#q-manual');
    if (qInput) qInput.value = state.q;
  }
  if (norm.w0) {
    state.w0Manual = QD.Complex.toString(norm.w0, 6);
    state.w0Mode = 'manual';
    const wManual = $('#w0-manual');
    const wRadio  = document.querySelector('input[name="w0mode"][value="manual"]');
    if (wManual) { wManual.value = state.w0Manual; wManual.disabled = false; }
    if (wRadio)  { wRadio.checked = true; }
  }

  syncPolyDegreeInput();
  renderPolesList();
  renderPolyCoefList();
  $('#poly-part-section').classList.toggle('hidden', !modeAllowsPoly(state.mode));
  markAsCustom();

  // Switch to the QD tab + run the full solver.
  const tabBtn = document.querySelector('.tab-btn[data-tab="qd"]');
  if (tabBtn) tabBtn.click();
  solveAndRender();
};
