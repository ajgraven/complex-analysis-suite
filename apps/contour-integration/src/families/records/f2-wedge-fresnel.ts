// F2 — `wedge-fresnel`, transcribed from `docs/contour-integration/gallery/tier-efg.md` §5, and the
// TWENTY-EIGHTH record: the gallery is complete.
//
// **F2 IS HERE FOR THE ARC BOUND, WHICH IS THE ONE PLACE IN THE TAXONOMY WHERE TEXTBOOKS CHEAT.**
// `|e^{−z²}| = e^{−R²cos 2θ}` tends to `1`, not to `0`, as `θ → π/4`, so plain ML gives `πR/4·1 → ∞`
// and proves nothing. The fix is the linear minorant `sin φ ≥ 2φ/π`, which turns the `R` out front
// into a `1/R`, and M5.2 built it: `kernel/bounds/linearMinorant.ts` is the single predicate Jordan
// (L3) and the wedge (L6) both discharge through, because `sin ψ ≥ 2ψ/π` and `cos φ ≥ 1 − 2φ/π` are
// the SAME inequality under `φ = π/2 − ψ`. So this record needs no new bound at all — it is the
// consumer that lemma was built for, two slices early.
//
// **ONE COMPLEX TARGET CARRYING BOTH REAL INTEGRALS.** The outgoing ray is `∫₀^R e^{ix²}dx`, whose
// real part is `∫cos(x²)` and whose imaginary part is `∫sin(x²)`, so the record declares two real
// unknowns and one coefficient row `[1, i]` — E3's shape, and for the same reason: the single
// complex identity realifies into two real equations and determines both. The famous equality
// `∫cos = ∫sin` is then visibly a COINCIDENCE of the wedge angle being `π/4`: at `n = 3` the two are
// `Γ(4/3)cos(π/6)` and `Γ(4/3)sin(π/6)`, and they differ.
//
// **AND THE RETURN RAY IMPORTS `Γ(1+1/n)`.** On `arg z = π/(2n)` we have `zⁿ = iRⁿ`, so `e^{izⁿ}`
// becomes the real `e^{−tⁿ}` and the ray is `−e^{iπ/(2n)}∫₀^∞e^{−tⁿ}dt`. That integral is
// `Γ(1+1/n)`, established by the real substitution `u = tⁿ` — not by this contour (research 03 §7's
// honesty note). ADR-0042's `knownValue` is the seat; E3 is the other consumer, and at `n = 2` the
// two records import the SAME number, since `Γ(3/2) = √π/2`.
//
// Two things the record must be honest about beyond the value. The target converges only
// CONDITIONALLY — `∫₀^∞|cos(x²)|dx = ∞` — which is a label on the result and not a footnote; and the
// wedge angle is `π/(2n)`, not `π/n`, which is finding D-1 (research 03 §0.3 states the wider range
// for `e^{−zⁿ}`, where the majorant then DIVERGES — measured 2.7e15 at `n = 2, R = 6`).
import { pt } from "../../engine/contour/model.js";
import type { Family } from "../schema.js";

export const f2WedgeFresnel: Family = {
  id: "wedge-fresnel",
  // Stated at general `n`, because the record runs there: the famous `∫cos = ∫sin` is the `n = 2`
  // case and a title naming only it would be false at the other fixture.
  title:
    "∫₀^∞ cos(xⁿ)dx = Γ(1+1/n)·cos(π/(2n)) — Fresnel at n = 2, with the hand-waved arc bound discharged",
  taxonomySection: "7",
  tier: "F",

  targets: [
    {
      id: "C",
      role: "primary",
      kind: "integral",
      variable: "x",
      lower: "0",
      upper: "inf",
      integrand: "cos(x^n)",
      // NOT a footnote. `∫₀^∞|cos(x²)|dx = ∞`, so the value is the limit of `∫₀^X` as `X → ∞`: any
      // rearrangement, any interchange with another limit, and any quadrature error estimate that
      // assumes absolute convergence is invalid.
      convergence: "conditional",
      symbols: {},
    },
    {
      id: "S",
      role: "bonus",
      kind: "integral",
      variable: "x",
      lower: "0",
      upper: "inf",
      integrand: "sin(x^n)",
      convergence: "conditional",
      symbols: {},
    },
  ],

  auxiliary: {
    integrand: "exp(i*z^n)",
    // As E3 and D4: the extraction IS the real/imaginary split of one complex identity, legitimate
    // because both unknowns are real.
    relation: "components",
    note: "the outgoing ray is ∫₀^R e^{ixⁿ}dx = C + iS, so one contour computes both real integrals at once; the return ray is where e^{izⁿ} becomes the real e^{−tⁿ}",
  },

  parameters: [{ name: "n", domain: "integer", constraints: ["n >= 2"] }],

  hypotheses: [
    {
      id: "entire-integrand",
      statement:
        "f(z) = e^{izⁿ} is entire: the singular set is EMPTY, S = 0, and the argument is Cauchy's theorem — as in E3",
      check: "structural:isEntire(exp(i*z^n))",
      onFail: "refuse",
    },
    {
      id: "wedge-angle-is-pi-over-2n",
      statement:
        "α = π/(2n): on the arc |e^{izⁿ}| = e^{−Rⁿ sin nθ}, and nθ ∈ [0, π/2] is exactly the range on which the linear minorant sin φ ≥ 2φ/π holds; it is also the angle at which the return ray becomes e^{−tⁿ}",
      check: "algebraic:eq(n*contour.wedgeAngle, pi/2)",
      onFail: "refuse",
    },
    {
      id: "return-ray-is-real-gaussian",
      statement:
        "on arg z = π/(2n), zⁿ = Rⁿe^{iπ/2} = iRⁿ, so e^{izⁿ} = e^{−tⁿ}; the return ray is −e^{iπ/(2n)}∫₀^R e^{−tⁿ}dt",
      check: "symbolic:eq(subs(exp(i*z^n), z, t*exp(i*pi/(2*n))), exp(-t^n))",
      onFail: "refuse",
    },
    {
      id: "gamma-value-is-imported",
      statement:
        "∫₀^∞ e^{−tⁿ}dt = Γ(1+1/n) is a REAL substitution (u = tⁿ), not a contour result — research 03 §7's honesty note. At n = 2 it is √π/2 = Γ(3/2), the same number E3 imports.",
      check: "provenance:external('Gamma(1+1/n)', method='real substitution u = t^n')",
      onFail: "warn",
    },
    {
      id: "target-convergence-is-conditional",
      statement:
        "∫₀^∞ cos(xⁿ)dx converges as an improper Riemann integral but NOT absolutely: ∫₀^∞|cos(xⁿ)|dx = ∞. Every downstream claim must carry that.",
      check: "analytic:absolutelyConvergent(target) == false",
      onFail: "warn",
    },
  ],

  contour: {
    template: "wedge",
    // R = 6 for the same reason E3's is: the return ray is compared against the imported value on
    // the ledger, and `∫_R^∞ e^{−tⁿ}dt` is the gap.
    limitParams: [{ name: "R", to: "inf", start: 6 }],
    // The sector's own geometry, frozen from `n` at instantiation — F1's move, and its note explains
    // why neither `derived` alone nor a literal could stand in for the ray's endpoint.
    derived: [
      { name: "wedgeAngle", expr: "pi/(2*n)" },
      { name: "wedgeX", expr: "cos(pi/(2*n))" },
      { name: "wedgeY", expr: "sin(pi/(2*n))" },
    ],
    pieces: [
      {
        id: "ray0",
        name: "the positive real axis",
        geom: { kind: "segment", from: pt(0, 0), to: pt({ param: "R" }, 0) },
        role: "target",
        coefficients: [
          { targetId: "C", coefficient: "1" },
          { targetId: "S", coefficient: "i" },
        ],
        colour: 0,
      },
      {
        id: "arc",
        name: "the $R \\to \\infty$ sector arc, angle $\\pi/(2n)$",
        geom: {
          kind: "arc",
          center: pt(0, 0),
          radius: { param: "R" },
          theta0: 0,
          theta1: { param: "wedgeAngle" },
        },
        role: "vanish",
        lemma: "L6",
        colour: 1,
      },
      {
        id: "ray1",
        name: "the return ray $\\arg z = \\pi/(2n)$",
        geom: {
          kind: "segment",
          from: pt({ param: "R", mul: { param: "wedgeX" } }, { param: "R", mul: { param: "wedgeY" } }),
          to: pt(0, 0),
        },
        role: "free",
        knownValue: {
          expr: "-exp(i*pi/(2*n))*gamma(1 + 1/n)",
          method:
            "on this ray $e^{iz^n} = e^{-t^n}$; $\\int_0^\\infty e^{-t^n}dt = \\Gamma(1+1/n)$ is imported (the real substitution $u = t^n$), and the leading minus is the reversed traversal",
          rigor: "=",
        },
        colour: 2,
      },
    ],
    orientation: "ccw",
    // NOTHING — e^{izⁿ} is entire. Like E3, this argument is Cauchy's theorem plus one bound.
    windings: [],
  },

  vanishingLemmas: [
    {
      piece: "arc",
      lemma: "L6",
      sideCondition:
        "on |z| = R, arg z = θ ∈ [0, π/(2n)]: |e^{izⁿ}| = e^(-R^n*sin(n*theta)), and sin φ >= 2*φ/pi for φ = n*θ ∈ [0, π/2] (Jordan's inequality; IDENTICAL to cos ψ >= 1 - 2*ψ/pi under φ = π/2 − ψ). Hence |int| <= R*int_0^(pi/(2*n)) e^(-R^n*2*n*theta/pi) dtheta = (pi/(2*n))*(1 - e^(-R^n))/R^(n-1) <= pi/(2*n*R^(n-1)) -> 0 for n > 1.",
      discharge:
        "symbolic:wedgeArcBound(f=exp(i*z^n), alpha=pi/(2*n), minorant='sin(phi) >= 2*phi/pi on [0,pi/2]', bound='pi/(2*n*R^(n-1))', requires=[n > 1])",
      rigorOfBound: "≤",
      rigorOfLimit: "=",
      rigorIfNumericOnly: "≈",
    },
  ],

  residueSelection: { rule: "inside", set: "0 < arg z < pi/(2*n) — EMPTY; e^{izⁿ} is entire" },

  closedForm: {
    expr: "-knownValue(ray1)",
    // The PRIMARY target is `C = ∫cos(x^n)`, which is real; `e^{iπ/(2n)}Γ(1+1/n)` is the combined
    // `C + iS`, and printing it as the claim put a complex number beside a real value. `C` is its
    // real part, `S = sin(pi/(2*n))*Gamma(1 + 1/n)` its imaginary one.
    // `gamma`, not `Gamma`: the app's parser spells the function in lower case and prints it `\Gamma`,
    // so this is a spelling normalisation and not a change of form (M8 step 0.4).
    simplified: "cos(pi/(2*n))*gamma(1 + 1/n)",
  },

  rigor: {
    policy: "min",
    inputs: [
      "hypotheses.*",
      "vanishingLemmas.*.rigor",
      "freePieces.*.knownValue.rigor",
      "residues.*.rigor",
      "target.convergenceClass",
    ],
  },

  traps: [
    {
      id: "arc-bound-hand-waved",
      detect: "structural:dischargeStartsWith(vanishingLemmas.arc, 'numeric:')",
      message:
        "This is THE hand-waved step of the classical Fresnel derivation. |e^{−z²}| = e^{−R²cos 2θ} → 1 as θ → π/4, so plain ML gives (πR/4)·1 → ∞ and establishes nothing. Only the linear minorant sin φ ≥ 2φ/π (equivalently cos ψ ≥ 1 − 2ψ/π) turns the R out front into a 1/R. A numeric-only discharge caps the whole result at ≈.",
    },
    {
      id: "arc-range-too-large",
      detect: "algebraic:gt(n*contour.wedgeAngle, pi/2)",
      message:
        "For f = e^{−zⁿ} the majorant R∫₀^α e^{−Rⁿcos nθ}dθ DIVERGES as soon as nα > π/2, because cos nθ goes negative and e^{−Rⁿcos nθ} blows up — measured 2.7e15 at n = 2, R = 6; 1.1e93 at n = 3; float64 overflow at n = 4. The admissible range is α ≤ π/(2n). (For f = e^{izⁿ} the modulus is e^{−Rⁿ sin nθ} and the range extends to α ≤ π/n — a different lemma instance, not the same one.) See finding D-1.",
    },
    {
      id: "absolute-convergence-assumed",
      detect: "analytic:absolutelyConvergent(target)",
      message:
        "∫₀^∞|cos(x²)|dx diverges. The value √(π/8) is the limit of ∫₀^X as X → ∞, which exists; any rearrangement, any interchange with another limit, and any quadrature error estimate that assumes absolute convergence is invalid. The restriction must travel with the verdict (DESIGN §3's restriction rule).",
    },
    {
      id: "gamma-claimed-as-contour-output",
      detect: "provenance:declaresExternal(closedForm, 'Gamma(1+1/n)')",
      message:
        "∫₀^∞e^{−xⁿ}dx = Γ(1+1/n) follows from the real substitution u = xⁿ, not from this contour. Its genuine contour sibling is ∫₀^∞e^{−e^{iφ}xⁿ}dx, which needs the wedge and |φ| < π/(2n). Claiming contour provenance for a calculus fact is the honesty failure research 03 §7 names.",
    },
    {
      id: "residues-expected",
      detect: "engine:requiresNonEmpty(residues)",
      message:
        "Same as E3: e^{izⁿ} is entire, S = 2πi·Σ(∅) = 0, and the empty residue sum is what the argument runs on.",
    },
    {
      id: "cos-equals-sin-assumed-general",
      detect: "algebraic:ne(cos(pi/(2*n)), sin(pi/(2*n)))",
      message:
        "∫₀^∞cos(xⁿ)dx = Γ(1+1/n)cos(π/(2n)) and ∫₀^∞sin(xⁿ)dx = Γ(1+1/n)sin(π/(2n)) are equal iff n = 2. The famous equality is a coincidence of the wedge angle being π/4, not a general fact — and this record determines BOTH unknowns, so the two can be compared rather than asserted.",
    },
  ],

  golden: [
    {
      params: { n: 2 },
      value: "sqrt(pi/8)",
      numeric: 0.62665706865775006,
      verifiedTo: 8.9e-16,
      method:
        "PRIMARY, handling the conditional convergence honestly: split at the sign changes x_k = √((k+½)π) into a strictly alternating series of smooth 80-pt Gauss–Legendre panels, then Cohen–Rodriguez Villegas–Zagier acceleration over 140 terms. INDEPENDENT CROSS-CHECK: 80-panel-per-oscillation quadrature to X = 40 plus the 5-term asymptotic tail from repeated integration by parts of ∫_{X²}^∞ cos u·u^{−1/2}/2 du (rel 2.4e-13); and at X = 60 (rel 5.0e-13).",
    },
    {
      params: { n: 3 },
      value: "gamma(4/3)*cos(pi/6)",
      numeric: 0.77334294207799015,
      verifiedTo: 7.2e-16,
      method: "alternating + CVZ, exercising the general n form where cos(π/(2n)) ≠ sin(π/(2n))",
    },
  ],
};
