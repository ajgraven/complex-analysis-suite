'use strict';
// =============================================================================
// observables tests — QD.boundaryObservables / harmonicMeasure / estimateAccuracy.
//
// These are the Tier-0 foundational primitives (computed from a solved φ): the
// boundary geometry (curvature, area, perimeter, centroid, moments), the
// harmonic-measure density on ∂Ω, and an accuracy estimate. The oracles are
// closed-form on the unit disk (φ(z)=z, every quantity is exact) plus a
// cusp-forming cardioid (curvature must spike at the near-cusp angle).
//
// Coverage:
//   §1 unit disk: area=π, perimeter=2π, κ≡1, centroid=0, M₀=π
//   §2 unit disk: harmonic-measure density ≡ 1/2π, ∮ρ ds ≈ 1
//   §3 unit disk: accuracy — high significant digits, not under-resolved
//   §4 cardioid (h=1.5/w+0.5/w², c=1.4, unbounded): κ spikes; argMaxκ matches
//      the nearest φ′-zero angle from QD.findCriticalPoints
// =============================================================================
require('./bootstrap');

// Page-only module — load into the shared vm exactly like cmax.test.js does.
loadInCtx('observables.js');

module.exports = async function run() {
  section('observables — boundary geometry / harmonic measure / accuracy');

  ok('boundaryObservables exposed', typeof QD.boundaryObservables === 'function');
  ok('harmonicMeasure exposed',     typeof QD.harmonicMeasure === 'function');
  ok('estimateAccuracy exposed',    typeof QD.estimateAccuracy === 'function');
  ok('minAbsPhiPrimeAngle exposed', typeof QD.minAbsPhiPrimeAngle === 'function');

  // Unit disk: h = R²/w with R = 1  ⇒  φ(z) = z, Ω = unit disk.
  const diskH = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 1, im: 0 }] }] };
  const disk = QD.solveInverseQD(diskH);
  ok('disk solve succeeded', disk && disk.success, disk && disk.error);

  if (disk && disk.success) {
    const phi = disk.primary.phi;

    // ---- §1 boundary observables on the disk -------------------------------
    const obs = QD.boundaryObservables(phi, { samples: 1024 });
    ok('§1 area ≈ π',         approxEq(obs.area, Math.PI, 1e-3), 'area=' + obs.area);
    ok('§1 perimeter ≈ 2π',   approxEq(obs.perimeter, 2 * Math.PI, 1e-3), 'perim=' + obs.perimeter);
    ok('§1 curvature ≡ 1',    approxEq(obs.maxCurvature, 1, 1e-6), 'maxκ=' + obs.maxCurvature);
    ok('§1 centroid ≈ 0',     approxEq(obs.centroid, { re: 0, im: 0 }, 1e-6),
       'centroid=(' + obs.centroid.re + ',' + obs.centroid.im + ')');
    ok('§1 M₀.re ≈ area (π)', approxEq(obs.moments[0].re, Math.PI, 1e-3), 'M0=' + obs.moments[0].re);
    // M₀ is the smooth contour integral (exact); signedArea is the polygon
    // shoelace — they agree only to O(1/N²) discretization, not machine precision.
    ok('§1 M₀ matches signed area', approxEq(obs.moments[0].re, obs.signedArea, 1e-3));

    // ---- §2 harmonic measure on the disk -----------------------------------
    const hm = QD.harmonicMeasure(phi, { samples: 720 });
    const uniform = 1 / (2 * Math.PI);
    ok('§2 density ≡ 1/2π (max)',  approxEq(hm.maxDensity, uniform, 1e-6),  'max=' + hm.maxDensity);
    ok('§2 density ≡ 1/2π (mean)', approxEq(hm.meanDensity, uniform, 1e-6), 'mean=' + hm.meanDensity);
    ok('§2 ∮ ρ ds ≈ 1',           approxEq(hm.integral, 1, 5e-3),          'integral=' + hm.integral);

    // ---- §3 accuracy on the disk -------------------------------------------
    const acc = QD.estimateAccuracy(phi, diskH, { samples: 512 });
    ok('§3 residual ≈ 0',          acc.residual != null && acc.residual < 1e-6, 'res=' + acc.residual);
    ok('§3 high significant digits', acc.significantDigits > 8, 'digits=' + acc.significantDigits);
    ok('§3 not flagged under-resolved', acc.underResolved === false);
    ok('§3 conditionEst finite or null',
       acc.conditionEst === null || isFinite(acc.conditionEst), 'cond=' + acc.conditionEst);

    // ---- §3b minAbsPhiPrimeAngle on the disk (|φ′| ≡ 1) ---------------------
    const mp = QD.minAbsPhiPrimeAngle(phi, 512);
    ok('§3b min|φ′| ≈ 1 on the disk', approxEq(mp.value, 1, 1e-9), 'min|φ′|=' + mp.value);
  }

  // ---- §4 cusp-forming cardioid: κ spikes at the near-cusp -----------------
  // Unbounded QD h = 1.5/w + 0.5/w² at c = 1.4 (below the cusp c* ≈ 1.46).
  {
    const hData = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 1.5, im: 0 }, { re: 0.5, im: 0 }] }], polyPart: [] };
    const res = QD.solveInverseQD(hData, { unbounded: true, c: 1.4, identitySamples: 4000 });
    ok('§4 cardioid solve succeeded', res && res.success, res && res.error);
    if (res && res.success) {
      const phi = res.primary.phi;
      const obs = QD.boundaryObservables(phi, { samples: 1440 });
      ok('§4 area finite & positive',      obs.area > 0 && isFinite(obs.area), 'area=' + obs.area);
      ok('§4 perimeter finite & positive', obs.perimeter > 0 && isFinite(obs.perimeter), 'perim=' + obs.perimeter);
      ok('§4 curvature spikes near the cusp (maxκ ≫ disk)',
         obs.maxCurvature > 3 && isFinite(obs.maxCurvature), 'maxκ=' + obs.maxCurvature);

      // Cross-check: the curvature-max angle matches the φ′-zero nearest ∂𝔻.
      if (typeof QD.findCriticalPoints === 'function') {
        const crit = QD.findCriticalPoints(phi);
        const pts = (crit && crit.points) || [];
        if (pts.length) {
          let best = pts[0];
          for (const p of pts) if (Math.abs(p.absZ - 1) < Math.abs(best.absZ - 1)) best = p;
          let aCrit = Math.atan2(best.z.im, best.z.re); if (aCrit < 0) aCrit += 2 * Math.PI;
          let d = Math.abs(aCrit - obs.argMaxCurvatureTheta);
          d = Math.min(d, 2 * Math.PI - d);             // wraparound
          // Below the cusp (c=1.4 < c*≈1.46) the φ′-zero is still off |z|=1, so
          // the boundary curvature peak sits a little off its angular projection;
          // they coincide as c→c*. A ~28° window is a robust "near the cusp" check.
          ok('§4 argMaxκ matches nearest φ′-zero angle', d < 0.5,
             'Δθ=' + d.toFixed(3) + ' (κ@' + obs.argMaxCurvatureTheta.toFixed(3) + ', crit@' + aCrit.toFixed(3) + ')');
        }
      }
    }
  }
};
