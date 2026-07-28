// =============================================================================
// family-sweep.mjs -- one-parameter family sweep for the Figure card.
//
// Sweeps a single ParamRef (from param-slice-common's listAvailableParams) over
// a linspace of values, solving the inverse QD at each — warm-started from the
// previous VALID member for speed — and returns the boundary curves of the valid
// members plus HONEST counts of the rest. DOM-free: it takes a base scenario
// (QD_UI.snapshotScenario() → { hData, norm, mode }) and a ParamRef, and hands
// back geometry the Figure card colours by a ramp and DomainPlot.drawFamily draws.
//
// Honest labelling: solveOnePoint returns a φ ONLY for VALID members
// (param-slice-common.mjs). So this draws valid QDs only and COUNTS the
// non-univalent / unsolved members; the caller reports "K of N valid". Drawing
// the non-univalent members (e.g. dashed) is a deliberate later slice.
//
// `solve` and `sample` are injectable so the orchestration (warm-chaining, the
// counts, valid-only curve collection, yielding) is unit-testable without a real
// solver; production uses PS.solveOnePoint + QD.sampleBoundary.
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

// Sweep `ref` over `values` on `scenario`. Async: yields to the event loop every
// few solves so the UI stays responsive; honours an optional AbortSignal-like
// `{ aborted }`. Returns { curves:[{ value, t, pts|null, ok, cls }], counts }.
export async function sweepFamily(opts = {}) {
  const {
    scenario, ref, values, sampleN = 96, familyTag = null, onProgress, signal,
    solve = (PS && PS.solveOnePoint),
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
  if (!scenario || !ref || !values || !values.length || typeof solve !== 'function') {
    return { curves, counts };
  }

  let warm = null;   // chain warm-starts from the previous VALID member (a failed φ is a bad seed)
  const n = values.length;
  for (let i = 0; i < n; i++) {
    if (signal && signal.aborted) break;
    const value = values[i];
    const t = n > 1 ? i / (n - 1) : 0;
    let r = null;
    try { r = solve(scenario, [{ ref, value }], warm, tag); } catch (e) { r = null; }

    if (r && r.cls === VALID && r.phiSerialized) {
      let pts = null;
      try {
        const raw = typeof sample === 'function' ? sample(r.phiSerialized, sampleN) : null;
        if (raw && raw.length > 1) pts = raw.map((p) => ({ re: p.re, im: p.im }));
      } catch (e) { pts = null; }
      if (pts) {
        curves.push({ value, t, pts, ok: true });
        counts.valid++;
        warm = r.phiSerialized;
      } else {
        curves.push({ value, t, pts: null, ok: false, cls: 'sample-fail' });
        counts.unsolved++;
      }
    } else {
      const cls = r && r.cls;
      curves.push({ value, t, pts: null, ok: false, cls: cls || 'no-solve' });
      if (NONUNIV.has(cls)) counts.nonUnivalent++; else counts.unsolved++;
    }

    if (typeof onProgress === 'function' && (i % 3 === 0 || i === n - 1)) {
      try { onProgress(i + 1, n); } catch (e) { /* progress is best-effort */ }
    }
    if (i % 5 === 4) await new Promise((res) => setTimeout(res, 0));   // yield to keep the UI live
  }
  return { curves, counts };
}

export default { sweepFamily, linspace };
