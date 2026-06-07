'use strict';
// =============================================================================
// symmetry tests — QD.detectSymmetry (#9 / partial #11).
//
// Oracles are constructed φ's (no solve) whose symmetry groups are known in
// closed form. Each is a boundedQD φ(z) = Σ A_k z^k with A_k the branch
// coefficients (same construction as cusps.test.js):
//   • φ(z)=z                 → a disk: rotationally CONTINUOUS, all reflections.
//   • φ(z)=z+z⁴/4            → deltoid (3-cusp epicycloid): D_3 (order 3, 3 axes).
//   • φ(z)=z+0.3 z³          → φ(−z)=−φ(z): D_2 (order 2, 2 axes; real coeffs).
//   • φ(z)=z+z²/2            → cardioid: D_1 (order 1, single axis on the real line).
//   • φ(z)=z+0.3 z²+0.2i z³  → complex coeff breaks mirror & rotation: trivial.
// =============================================================================
require('./bootstrap');
loadInCtx('symmetry.js');   // page-only module (not in the bootstrap CORE list)

module.exports = async function run() {
  section('symmetry — QD.detectSymmetry');

  const detect = QD.detectSymmetry;
  ok('detectSymmetry exposed on QD', typeof detect === 'function');

  const mkBounded = (A) => ({
    family: 'boundedQD', w0: { re: 0, im: 0 }, unbounded: false,
    branches: [{ z: { re: 0, im: 0 }, A }],
  });
  const re = (x) => ({ re: x, im: 0 });

  // Disk: continuous rotational symmetry.
  {
    const s = detect(mkBounded([re(1)]));
    ok('disk: continuous', s.continuous === true, 'continuous=' + s.continuous);
    ok('disk: rotationalOrder = ∞', s.rotationalOrder === Infinity,
       'order=' + s.rotationalOrder);
  }

  // Deltoid: D_3 — rotational order 3 with three mirror axes.
  {
    const s = detect(mkBounded([re(1), re(0), re(0), re(0.25)]));
    ok('deltoid: rotationalOrder = 3', s.rotationalOrder === 3, 'order=' + s.rotationalOrder);
    ok('deltoid: three reflection axes', s.reflectionAxes.length === 3,
       'axes=' + s.reflectionAxes.length);
    ok('deltoid: not continuous', s.continuous === false);
  }

  // Z_2 cubic: φ(−z) = −φ(z) ⇒ order 2; real coeffs ⇒ D_2 (two axes).
  {
    const s = detect(mkBounded([re(1), re(0), re(0.3)]));
    ok('Z_2 cubic: rotationalOrder = 2', s.rotationalOrder === 2, 'order=' + s.rotationalOrder);
    ok('Z_2 cubic: two reflection axes', s.reflectionAxes.length === 2,
       'axes=' + s.reflectionAxes.length);
  }

  // Cardioid: D_1 — no rotation, a single mirror on the real axis.
  {
    const s = detect(mkBounded([re(1), re(0.5)]));
    ok('cardioid: rotationalOrder = 1', s.rotationalOrder === 1, 'order=' + s.rotationalOrder);
    ok('cardioid: exactly one reflection axis', s.reflectionAxes.length === 1,
       'axes=' + s.reflectionAxes.length);
    const ax = s.reflectionAxes[0];
    const onReal = ax != null && (Math.min(ax, Math.PI - ax) < 1e-2);
    ok('cardioid: mirror axis is the real line', onReal, 'axis=' + (ax != null ? ax.toFixed(4) : 'n/a'));
  }

  // Asymmetric: complex coefficient breaks every symmetry.
  {
    const s = detect(mkBounded([re(1), re(0.3), { re: 0, im: 0.2 }]));
    ok('asymmetric: rotationalOrder = 1', s.rotationalOrder === 1, 'order=' + s.rotationalOrder);
    ok('asymmetric: no reflection axes', s.reflectionAxes.length === 0,
       'axes=' + s.reflectionAxes.length);
    ok('asymmetric: confidence 0', s.confidence === 0, 'conf=' + s.confidence);
  }

  // Robustness: null φ → trivial, no throw.
  {
    const s = detect(null);
    ok('null φ → trivial', s && s.rotationalOrder === 1 && s.reflectionAxes.length === 0);
  }
};
