// =============================================================================
// family-sweep.mjs -- one-parameter family sweep for the Figure card.
//
// Sweeps a single ParamRef (from param-slice-common's listAvailableParams) over
// a linspace of values, solving the inverse QD at each, and returns the boundary
// curves plus HONEST counts. DOM-free: takes a base scenario
// (QD_UI.snapshotScenario() → { hData, norm, mode }) and a ParamRef, and hands
// back geometry the Figure card colours by a ramp and DomainPlot.drawFamily draws.
//
// Two modes:
//   • default — the FAST valid-only path: PS.solveOnePoint, warm-chained from the
//     previous valid member (0.2–0.7 ms warm). solveOnePoint returns a φ for VALID
//     members only, so this draws valid QDs and COUNTS the rest ("K of N valid").
//   • includeNonUnivalent — solve each member DIRECTLY (defaultSolveDirect →
//     QD.solveInverseQD), which yields φ + full validity (univalence AND the
//     quadrature identity), so the INVALID members (self-intersecting OR
//     identity-failing) can be drawn dashed. Cold per member (no warm-start), so
//     it's the opt-in slower path.
//
// `solve` / `solveDirect` / `sample` are injectable so the orchestration is
// unit-testable without a real solver.
// =============================================================================
import PS from './param-slice/param-slice-common.mjs';
import _QD from './solver.mjs';
const QD = _QD;

// Evenly-spaced values across [min, max]; a single point when n <= 1.
export function linspace(min, max, n) {
  const N = Math.max(1, Math.floor(n));
  if (N <= 1) return [min];
  const out = [];
  for (let i = 0; i < N; i++) out.push(min + (max - min) * (i / (N - 1)));
  return out;
}

// Direct solve returning φ + its validity — BOTH univalence and the quadrature
// identity — for drawing the invalid members dashed (solveOnePoint hands back a
// φ for valid members only). identityOK is load-bearing: solveInverseQD's
// "best-of-the-bad" primary can be univalent yet fail the quadrature identity
// (solver.mjs sorts univalent candidates to the top when no valid QD exists),
// and such a member is NOT a quadrature domain, so it must never read as valid.
// The scenario→opts mapping MIRRORS param-slice-common's _solveScenarioBody
// (norm → w0/c/q/lqd/unbounded/singular/alpha); cold each call (no warm-start).
// Returns { phi, univalent, identityOK } or null.
export function defaultSolveDirect(scenario, ref, value) {
  if (!QD || typeof QD.solveInverseQD !== 'function' || !PS ||
      typeof PS.cloneScenario !== 'function' || typeof PS.applyParamInPlace !== 'function') return null;
  let s;
  try {
    s = PS.cloneScenario(scenario);
    PS.applyParamInPlace(s, ref, value);
  } catch (e) { return null; }
  const norm = s.norm || {};
  const opts = Object.assign({}, s.opts || {});
  if (norm.w0)            opts.w0 = norm.w0;
  if (norm.c != null)     opts.c  = norm.c;
  if (norm.q)             opts.q  = norm.q;
  if (norm.lqd)           opts.lqd = true;
  if (norm.unbounded)     opts.unbounded = true;
  if (norm.singular)      opts.singular = true;
  if (norm.alpha != null) opts.alpha = norm.alpha;
  let full = null;
  try { full = QD.solveInverseQD(s.hData, Object.assign({ bootstrapW0: false }, opts)); }
  catch (e) { return null; }
  const p = full && full.success && full.primary;
  // identityOK follows classifyResult's convention (identityOK !== false ⇒ OK):
  // undefined (identity check disabled) counts as OK; an explicit false is a
  // quadrature-identity failure, which the sweep loop treats as NOT a valid QD.
  return (p && p.phi)
    ? { phi: p.phi, univalent: !!p.univalent, identityOK: p.identityOK }
    : null;
}

// Sweep `ref` over `values` on `scenario`. Async: yields every few solves so the
// UI stays responsive; honours an optional `{ aborted }` signal. Returns
// { curves:[{ value, t, pts|null, ok, nonUnivalent, cls }], counts }.
export async function sweepFamily(opts = {}) {
  const {
    scenario, ref, values, sampleN = 96, familyTag = null, onProgress, signal,
    includeNonUnivalent = false,
    solve = (PS && PS.solveOnePoint),
    solveDirect = defaultSolveDirect,
    sample = (QD && QD.sampleBoundary),
  } = opts;

  const tag = familyTag != null
    ? familyTag
    : (scenario && scenario.mode && PS && PS.MODE_FAMILY_TAG ? PS.MODE_FAMILY_TAG[scenario.mode] : null);
  const VALID = (PS && PS.CLASS_VALID) || 'valid';
  const NONUNIV = new Set([
    (PS && PS.CLASS_UNIVALENCE_FAIL) || 'univalence-fail',
    (PS && PS.CLASS_IDENTITY_FAIL) || 'identity-fail',
  ]);

  const counts = { total: (values && values.length) || 0, valid: 0, nonUnivalent: 0, unsolved: 0 };
  const curves = [];
  if (!scenario || !ref || !values || !values.length) return { curves, counts };

  const samplePts = (phi) => {
    try {
      const raw = typeof sample === 'function' ? sample(phi, sampleN) : null;
      return (raw && raw.length > 1) ? raw.map((p) => ({ re: p.re, im: p.im })) : null;
    } catch (e) { return null; }
  };

  let warm = null;   // fast-path warm-start chain from the previous VALID member
  const n = values.length;
  for (let i = 0; i < n; i++) {
    if (signal && signal.aborted) break;
    const value = values[i];
    const t = n > 1 ? i / (n - 1) : 0;

    let ok = false, nonUniv = false, phi = null;
    if (includeNonUnivalent && typeof solveDirect === 'function') {
      let d = null;
      try { d = solveDirect(scenario, ref, value); } catch (e) { d = null; }
      // Valid QD ⇔ univalent AND satisfies the quadrature identity — the same
      // predicate as the fast path's CLASS_VALID (univ && idOK). A univalent-but-
      // identity-failing member is drawn dashed like a self-intersecting one
      // (honest: it is NOT a quadrature domain), never counted or drawn as valid.
      if (d && d.phi) {
        const valid = !!d.univalent && d.identityOK !== false;
        phi = d.phi; ok = valid; nonUniv = !valid;
      }
    } else if (typeof solve === 'function') {
      let r = null;
      try { r = solve(scenario, [{ ref, value }], warm, tag); } catch (e) { r = null; }
      if (r && r.cls === VALID && r.phiSerialized) { phi = r.phiSerialized; ok = true; }
      else { nonUniv = NONUNIV.has(r && r.cls); }   // fast path can't draw these (no φ)
    }

    const pts = phi ? samplePts(phi) : null;
    if (ok && pts) {
      curves.push({ value, t, pts, ok: true, nonUnivalent: false });
      counts.valid++;
      if (!includeNonUnivalent) warm = phi;   // warm-chain the fast path only
    } else if (nonUniv) {
      curves.push({ value, t, pts, ok: false, nonUnivalent: true, cls: 'non-univalent' });
      counts.nonUnivalent++;
    } else {
      curves.push({ value, t, pts: null, ok: false, nonUnivalent: false, cls: 'unsolved' });
      counts.unsolved++;
    }

    if (typeof onProgress === 'function' && (i % 3 === 0 || i === n - 1)) {
      try { onProgress(i + 1, n); } catch (e) { /* progress is best-effort */ }
    }
    if (i % 5 === 4) await new Promise((res) => setTimeout(res, 0));   // yield
  }
  return { curves, counts };
}

export default { sweepFamily, linspace, defaultSolveDirect };
