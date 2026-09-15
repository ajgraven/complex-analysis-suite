// F1 — `wedge-rational-power`, transcribed from `docs/contour-integration/gallery/tier-efg.md` §4.
//
// **Tier F replaces translation symmetry by ROTATION, and F1 is the cheapest statement of it.**
// `f(ωz) = μ f(z)` with `ω = e^{2πi/n}` makes the return ray reproduce the outgoing one with factor
// `−ω·μ`, and for `f = 1/(1+zⁿ)` we have `ωⁿ = 1` so `μ = 1` and the factor is `−ω`. E1's strip and
// this wedge are the same argument under different symmetries: there the top side returned `−λ` times
// the bottom, here the second ray returns `−ω` times the first, and both divide by `1 + c`.
//
// **The angle must be EXACTLY `2π/n`, and that is the record's first trap.** At any other angle the
// return ray is not `ω` times the outgoing one and `f(ωz) = f(z)` is simply false, so there is no
// `reproduces` factor at all — the identity then relates the target to a *different, unknown*
// integral along an unrelated ray, and nothing can be solved. `wedgeTemplate` takes `n` rather than
// an angle for that reason, so the trap is unrepresentable rather than checked.
//
// **Its real job in the corpus is cross-provenance.** `2π/(3√3)` is also D3 at `(a, n) = (1, 3)` —
// computed by a KEYHOLE with a branch cut along `[0,∞)`, a `z^{a−1}` monodromy and a `−e^{2πia}`
// phase. F1's wedge has **no branch cut at all**, since `1/(1+zⁿ)` is single-valued. Two structurally
// different arguments, one with monodromy and one without, must produce the same number — and D3's
// own `integer-a-degenerate-keyhole` trap names this record as the repair, so the pair is not
// decoration: at `a = 1` the keyhole degenerates to `0/0` and refuses, and the wedge is what still
// closes.
//
// Two engine facts show through the fixtures. `1 + zⁿ` has poles in ℚ(i)(√d) at `n = 2, 3` and not at
// `n = 5, 7` (ℚ(ζ₁₀) has degree 4 over ℚ), so the first two reach a RADICAL closed form and the
// others a sine — which is why the goldens below are written `2π/(3√3)` and `(π/5)/sin(π/5)` rather
// than uniformly. And the sector arc sweeps `2π/n`, an angle no whitelist of nice multiples of π can
// enumerate; M5.4b's bounded-denominator reader is what lets `n = 5` and `n = 7` be measured at all.
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

export const f1WedgeRationalPower: Family = {
  id: "wedge-rational-power",
  title: "∫₀^∞ dx/(1+xⁿ) = (π/n)/sin(π/n): the 2π/n wedge",
  taxonomySection: "7",
  tier: "F",

  targets: [
    {
      id: "I",
      kind: "integral",
      variable: "x",
      lower: "0",
      upper: "inf",
      integrand: "1/(1 + x^n)",
      convergence: "absolute",
      symbols: {},
    },
  ],

  auxiliary: {
    integrand: "1/(1 + z^n)",
    // The outgoing ray IS the target: `f` is real and positive on `[0,∞)`, so no functional is taken.
    relation: "Re",
    note: "the return ray is the outgoing ray rotated by ω = e^{2πi/n}, and since f(ωz) = f(z) it contributes −ω times the target — so the solve divides by 1 − ω, whose |1 − ω| = 2 sin(π/n) is the sin(π/n) of the answer",
  },

  parameters: [{ name: "n", domain: "integer", constraints: ["n >= 2"] }],

  hypotheses: [
    {
      id: "rotational-quasi-symmetry",
      statement: "f(omega z) = mu f(z) with omega = exp(2 pi i/n) and mu = 1, because omega^n = 1",
      check: "symbolic:rotationalFactor(f, omega=exp(2*pi*i/n)) == 1",
      onFail: "refuse",
    },
    {
      id: "wedge-angle-exact",
      statement:
        "the wedge angle is exactly 2 pi/n — the rays must be related by the symmetry, and an approximate angle relates nothing",
      check: "algebraic:eq(contour.wedgeAngle, 2*pi/n)",
      onFail: "refuse",
    },
    {
      id: "no-pole-on-either-ray",
      statement:
        "1 + z^n = 0 has no root on arg z in {0, 2 pi/n}: the roots are exp(i pi (2k+1)/n) and none has argument 0 or 2 pi/n for n >= 2",
      check: "algebraic:noRootOnRays(1 + z^n, [0, 2*pi/n])",
      onFail: "refuse",
    },
    {
      id: "convergence-at-infinity",
      statement:
        "deg(denominator) − deg(numerator) = n >= 2, so the integral converges and L2 applies on the arc",
      check: "algebraic:ge(n, 2)",
      onFail: "refuse",
    },
    {
      id: "nondegenerate-solve",
      statement:
        "1 + c = 1 − omega != 0, i.e. n >= 2 (n = 1 makes omega = 1, and the integral genuinely diverges)",
      check: "algebraic:ne(1 - exp(2*pi*i/n), 0)",
      onFail: "refuse",
    },
  ],

  // NO `branch` BLOCK, and its absence is the point of the record. `1/(1+zⁿ)` is single-valued
  // rational, so there is no cut, no determination and no monodromy — and the same number comes out
  // as D3's keyhole, which has all three.

  contour: {
    template: "wedge",
    limitParams: [{ name: "R", to: "inf", start: 4 }],
    // The wedge's own geometry, computed from `n` at instantiation. `wedgeX`/`wedgeY` are the
    // COEFFICIENTS of the live `R` on the return ray: the affine `Scalar` had no seat for a product
    // of two parameters until M5.4a, and its note says why neither `derived` alone nor a literal
    // could stand in. They are frozen here and `R` is not, which is what keeps the form affine in
    // every parameter that can actually be dragged.
    derived: [
      { name: "wedgeAngle", expr: "2*pi/n" },
      { name: "wedgeX", expr: "cos(2*pi/n)" },
      { name: "wedgeY", expr: "sin(2*pi/n)" },
    ],
    pieces: [
      {
        id: "ray0",
        name: "the positive real axis",
        geom: { kind: "segment", from: pt(0, 0), to: pt({ param: "R" }, 0) },
        role: "target",
        colour: 0,
      },
      {
        id: "arc",
        name: "the $R \\to \\infty$ sector arc",
        geom: {
          kind: "arc",
          center: pt(0, 0),
          radius: { param: "R" },
          theta0: 0,
          theta1: { param: "wedgeAngle" },
        },
        role: "vanish",
        lemma: "L2",
        colour: 1,
      },
      {
        id: "ray1",
        name: "the return ray $\\arg z = 2\\pi/n$",
        geom: {
          kind: "segment",
          from: pt({ param: "R", mul: { param: "wedgeX" } }, { param: "R", mul: { param: "wedgeY" } }),
          to: pt(0, 0),
        },
        role: "reproduces",
        // Convention F, as E1's top side: the factor is the FULL multiplier of the target, reversal
        // included. It is `−ω·μ` and here `μ = 1`, which is exactly why this entry HIDES the bug the
        // gallery's `factor-omega-not-omega-mu` trap is about — the general member `z^{a−1}/(1+zⁿ)`
        // has `μ = ω^{a−1}` and factor `−ω^a`, and that member is D3.
        coefficients: [{ targetId: "I", coefficient: "-exp(2*pi*i/n)" }],
        colour: 2,
      },
    ],
    orientation: "ccw",
    windings: [{ pole: "exp(i*pi/n)", n: "1" }],
  },

  vanishingLemmas: [
    {
      piece: "arc",
      lemma: "L2",
      sideCondition:
        "|1 + z^n| >= R^n - 1 > 0 for R > 1, so |f| <= 1/(R^n - 1) on |z| = R; with arc length (2 pi/n) R this gives |int| <= (2 pi/n) R/(R^n - 1) = O(R^(1-n)) -> 0 for n >= 2",
      discharge:
        "symbolic:degreeBound(numerator=1, denominator=1+z^n) — the exact-ℚ ML bound of DESIGN §6.2; den(R) > 0 certifies both the bound and 'all poles strictly inside |z| = R'",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
  ],

  residueSelection: { rule: "inside", set: "0 < arg z < 2*pi/n" },

  // The one pole in the open sector is `e^{iπ/n}` — and at `n = 5, 7` it is not expressible in one
  // quadratic extension, so its residue is read structurally: `Res = −z₀/(n b₀)` with `z₀` named by
  // its exact ARGUMENT and never by a position (`kernel/cyclotomic.ts`).
  halfPlaneLadder: "cyclotomic",

  closedForm: {
    expr: "(2*pi*i/(1 - exp(2*pi*i/n))) * Res(1/(1+z^n), exp(i*pi/n))",
    simplified: "(pi/n)/sin(pi/n)",
  },

  rigor: {
    policy: "min",
    inputs: ["hypotheses.*", "vanishingLemmas.*.rigor", "residues.*.rigor", "solve.conditioning"],
  },

  traps: [
    {
      id: "wedge-angle-not-2pi-over-n",
      detect: "algebraic:ne(contour.wedgeAngle, 2*pi/n)",
      message:
        "At any other angle the return ray is not exp(2 pi i/n) times the outgoing ray and f(omega z) = f(z) is false, so the `reproduces` factor does not exist. There is nothing to solve for: the closed-contour identity relates the target to a DIFFERENT, unknown integral along an unrelated ray.",
    },
    {
      id: "n-equals-one",
      detect: "algebraic:eq(n, 1)",
      message:
        "n = 1 gives omega = 1 and 1 + c = 0: the two rays coincide and cancel. The structural division by zero is correct — the integral of dx/(1+x) over [0, inf) diverges logarithmically. Do not report a finite limit.",
    },
    {
      id: "factor-omega-not-omega-mu",
      detect: "structural:reproducesCoefficient != '-omega*mu'",
      message:
        "The factor is -omega*mu, not -omega. For the plain 1/(1+z^n) member mu = 1 and the two coincide, which is exactly why this entry hides the bug; the general member z^(a-1)/(1+z^n) has mu = omega^(a-1) and factor -omega^a, and that member is D3. Write -omega*mu so the generalisation is correct by construction.",
    },
    {
      id: "l2-used-where-degree-fails",
      detect: "algebraic:lt(n, 2)",
      message:
        "L2 needs |f| <= M/|z|^p with p > 1. At n = 1 the arc bound is O(1) and does not vanish; the arc is then an L5 case (z f(z) -> L gives i alpha L), not an L2 case.",
    },
    {
      id: "wrong-pole-counted",
      detect: "structural:residueOutsideSector",
      message:
        "1 + z^n has n roots on the unit circle; exactly ONE of them, exp(i pi/n), lies in the open sector. Counting the roots by |z| < R rather than by argument catches all n and multiplies the answer by n.",
    },
  ],

  golden: [
    {
      params: { n: 3 },
      // THE GALLERY WRITES THIS `2*pi/(3*sqrt(3))`, and it is the same number. The engine's normal
      // form is the family's own closed form `(pi/n)/sin(pi/n)`, uniform in n; the document simply
      // rendered `1/sin(pi/3)` as `2/sqrt(3)`, which the n = 5 and n = 7 fixtures cannot be written
      // in at all. Nothing here simplifies a sine into a radical, and nothing should.
      value: "(pi/3)/sin(pi/3)",
      numeric: 1.2091995761561452,
      verifiedTo: 1.8e-16,
      method:
        "x = 1/t folds [1, inf) onto [0,1], giving the integral of (1+t)/(1+t^3) on [0,1] — smooth, 64x48 composite Gauss–Legendre; cross-checked by truncation at X = 30 plus the exact tail series. The poles of 1 + z^3 ARE expressible in one quadratic extension, so this fixture takes the per-pole route while n = 5 and n = 7 take the structural one — and all three print the same shape",
    },
    {
      params: { n: 2 },
      value: "pi/2",
      numeric: 1.5707963267948966,
      verifiedTo: 5.7e-16,
      method:
        "the same folding. The degenerate-looking case that is not: the wedge is the upper half-plane, the return ray is the negative real axis, and −ω = 1 so the solve divides by 2",
    },
    {
      params: { n: 5 },
      value: "(pi/5)/sin(pi/5)",
      numeric: 1.068959332115595,
      verifiedTo: 4.2e-16,
      method:
        "the same folding. NOT reachable pole by pole: the roots of 1 + z^5 generate a degree-4 field, so the residue at exp(i pi/5) is read structurally and the answer carries a sine rather than a radical",
    },
    {
      params: { n: 7 },
      value: "(pi/7)/sin(pi/7)",
      numeric: 1.0343760552667964,
      verifiedTo: 6.4e-16,
      method: "the same folding; degree 6, so likewise structural",
    },
  ],
};
