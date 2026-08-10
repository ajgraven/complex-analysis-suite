import { describe, expect, it } from "vitest";
import {
  makeUnboundedLaurentSchwarz,
  escapeTime,
  pointInPolygon,
  type Complex,
  type UnboundedLaurentSchwarz,
} from "../src/index.js";

// Ground truth: the deltoid φ(z) = z + 1/(2 z²) — the classical unbounded-Laurent instance
// (c = 1, F₂ = ½). The golden identity σ(φ(z₀)) = conj(F(z₀)) pins the whole φ / φ⁻¹ / F / conj chain
// against hand-derivable values, and the branch tests pin the exterior-branch φ⁻¹ that σ needs.
const DELTOID = makeUnboundedLaurentSchwarz(1, [
  [0, 0],
  [0, 0],
  [0.5, 0],
]);

const boundary = (s: UnboundedLaurentSchwarz, n = 512): Complex[] => {
  const pts: Complex[] = [];
  for (let k = 0; k < n; k++) {
    const t = (2 * Math.PI * k) / n;
    pts.push(s.evalPhi([Math.cos(t), Math.sin(t)]));
  }
  return pts;
};

const near = (a: Complex, b: Complex, p = 9): void => {
  expect(a[0]).toBeCloseTo(b[0], p);
  expect(a[1]).toBeCloseTo(b[1], p);
};

const EXTERIOR: Complex[] = [
  [2, 0],
  [0, 2],
  [1.5, -1.3],
  [-2.4, 0.8],
];

describe("@cas/schwarz unbounded-Laurent σ (deltoid ground truth)", () => {
  it("evalPhi / evalF at known points", () => {
    near(DELTOID.evalPhi([1, 0]), [1.5, 0]); // cusp: 1 + 1/2
    near(DELTOID.evalPhi([2, 0]), [2.125, 0]); // 2 + 0.5/4
    near(DELTOID.evalPhi([0, 2]), [-0.125, 2]); // 2i + 0.5/(2i)²
    near(DELTOID.evalF([2, 0]), [2.5, 0]); // 0.5 + 2
    near(DELTOID.evalF([0, 2]), [-2, -0.5]); // 1/(2i) + 0.5(2i)²
  });

  it("evalPhiDeriv = 1 − 1/z³ (cusp at z = 1)", () => {
    near(DELTOID.evalPhiDeriv([1, 0]), [0, 0]);
    near(DELTOID.evalPhiDeriv([2, 0]), [0.875, 0]); // 1 − 1/8
  });

  it("evalFDeriv = z − 1/z² (deltoid F(z) = 1/z + ½z²; S5-B2)", () => {
    near(DELTOID.evalFDeriv([2, 0]), [1.75, 0]); // 2 − 1/4
    near(DELTOID.evalFDeriv([0, 2]), [0.25, 2]); // 2i − 1/(2i)² = 2i + ¼
    near(DELTOID.evalFDeriv([1, 0]), [0, 0]); // 1 − 1
  });

  it("σ(φ(z₀)) = conj(F(z₀)) — the exact round-trip identity", () => {
    for (const z0 of EXTERIOR) {
      const Fz0 = DELTOID.evalF(z0);
      const got = DELTOID.sigma(DELTOID.evalPhi(z0));
      expect(got).not.toBeNull();
      if (got) near(got, [Fz0[0], -Fz0[1]], 8);
    }
  });

  it("σ at the interchange golden points (S3a) — pins the exact frozen values the wire golden carries", () => {
    // The @cas/interchange deltoid-σ golden (goldens.ts QD_TO_CD_DELTOID_SIGMA_*) freezes σ(w₀) at
    // these points so CD's S4a reconstruction can reproduce them through its import path. Derivation
    // via the exact identity σ(φ(z₀)) = conj(F(z₀)) (both w₀ and σ(w₀) come out closed-form):
    //   z₀ = 2      ⇒ w₀ = φ(2)   = 2.125     , σ(w₀) = conj(F(2))   = conj(2.5)      = 2.5
    //   z₀ = 1 + i  ⇒ w₀ = φ(1+i) = 1 + 0.75i , σ(w₀) = conj(F(1+i)) = conj(0.5+0.5i) = 0.5 − 0.5i
    // The 1+i point exercises the anti-holomorphic conj: the imaginary part flips sign (+0.5 → −0.5).
    // These run the REAL numerical inverse (Newton + Durand–Kerner), not the closed-form shortcut.
    near(DELTOID.sigma([2.125, 0]) as Complex, [2.5, 0]);
    near(DELTOID.sigma([1, 0.75]) as Complex, [0.5, -0.5]);
  });

  it("invertPhi returns the exterior branch |z| > 1 for w ∈ Ω", () => {
    const poly = boundary(DELTOID);
    const probes: Complex[] = [
      [1.2, 1.2],
      [-1.4, 0.6],
      [0.9, -1.5],
      [2.0, 0.3],
    ];
    for (const w of probes) {
      expect(pointInPolygon(w, poly)).toBe(false); // w ∈ Ω (exterior of K)
      const z = DELTOID.invertPhi(w);
      expect(z).not.toBeNull();
      if (z) {
        expect(Math.hypot(z[0], z[1])).toBeGreaterThan(1); // exterior branch
        near(DELTOID.evalPhi(z), w, 7); // a genuine preimage
      }
    }
  });

  it("escapeTime: origin ∈ K → fundamental at n = 0; a far point escapes", () => {
    const poly = boundary(DELTOID);
    const isInOmega = (w: Complex): boolean => !pointInPolygon(w, poly);
    expect(pointInPolygon([0, 0], poly)).toBe(true);
    const inK = escapeTime(DELTOID, isInOmega, [0, 0], { maxIter: 64, escapeR: 50 });
    expect(inK.kind).toBe("fundamental");
    expect(inK.n).toBe(0);
    const far = escapeTime(DELTOID, isInOmega, [100, 0], { maxIter: 64, escapeR: 50 });
    expect(far.kind).toBe("escaped");
  });
});

// ---------------------------------------------------------------------------
// σ⁻¹ (F3a) — the multivalued Schwarz inverse used to grow the fundamental-domain tiling.
// σ⁻¹(w) = φ(F⁻¹(conj(w))): the exterior roots z (|z|>1) of F(z)=conj(w), mapped through φ. Mirrors the
// QD app's own σ⁻¹ goldens (apps/quadrature-domains/app/test/schwarz.test.js) which pin the ROBUST
// invariants — degree bound, ≥1 preimage, and the exact round-trip σ(σ⁻¹(w)) ≈ w — rather than a fragile
// exact count (the number of EXTERIOR roots varies with w even when the cleared polynomial degree is fixed).
describe("@cas/schwarz unbounded-Laurent σ⁻¹ (deltoid preimages, F3a)", () => {
  const contains = (set: Complex[], p: Complex, tol = 1e-6): boolean =>
    set.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < tol);

  it("σ⁻¹ recovers the forward preimage: φ(z₀) ∈ σ⁻¹(σ(φ(z₀))) — exact by construction", () => {
    // z₀ exterior ⇒ w₀ = φ(z₀), s = σ(w₀) = conj(F(z₀)); then F(z₀) = conj(s), z₀ is an exterior root of
    // F(z)=conj(s), so φ(z₀) = w₀ MUST appear in σ⁻¹(s). A rock-solid, family-agnostic membership test.
    for (const z0 of EXTERIOR) {
      const w0 = DELTOID.evalPhi(z0);
      const s = DELTOID.sigma(w0);
      expect(s, `σ null at z₀=${z0}`).not.toBeNull();
      if (!s) continue;
      const pre = DELTOID.sigmaInverse(s);
      expect(pre.length, `no preimage of σ(φ(${z0}))`).toBeGreaterThanOrEqual(1);
      expect(contains(pre, w0), `φ(${z0}) missing from σ⁻¹(σ(φ(${z0})))`).toBe(true);
    }
  });

  it("every σ⁻¹ preimage round-trips: σ(σ⁻¹(w)) ≈ w (the branch-slip guard is exact here)", () => {
    for (const z0 of EXTERIOR) {
      const w = DELTOID.sigma(DELTOID.evalPhi(z0)) as Complex;
      const pre = DELTOID.sigmaInverse(w);
      for (const p of pre) {
        const back = DELTOID.sigma(p);
        expect(back, `σ null on preimage ${p}`).not.toBeNull();
        if (back) near(back, w, 6);
      }
    }
  });

  it("σ⁻¹([2.5,0]) contains the cusp-side preimage [2.125,0] (the S3a interchange golden, inverted)", () => {
    // σ([2.125,0]) = [2.5,0] (the frozen S3a golden), so [2.125,0] ∈ σ⁻¹([2.5,0]). The deltoid clears to
    // the cubic 0.5·z³ − conj(w)·z + 1 = 0 ⇒ ≤ 3 roots, so ≤ 3 exterior preimages.
    const pre = DELTOID.sigmaInverse([2.5, 0]);
    expect(pre.length).toBeGreaterThanOrEqual(1);
    expect(pre.length).toBeLessThanOrEqual(3);
    expect(contains(pre, [2.125, 0])).toBe(true);
  });

  it("σ⁻¹ of a generic tiling point is non-empty and every preimage round-trips (branch-bearing SINGLE too)", () => {
    // Also exercises the pole-bearing Newton path (solveFNewton) on the SINGLE domain.
    for (const dom of [DELTOID, SINGLE]) {
      const w = dom.sigma(dom.evalPhi([1.7, 0.9])) as Complex;
      expect(w).not.toBeNull();
      const pre = dom.sigmaInverse(w);
      expect(pre.length).toBeGreaterThanOrEqual(1);
      for (const p of pre) near(dom.sigma(p) as Complex, w, 6);
    }
  });
});

// ---------------------------------------------------------------------------
// Pole-bearing unbounded QDs (Phase 2). φ gains finite-pole branch terms:
//   φ(z) = c·z + Σₗ F[l]/zˡ + Σⱼ Σₖ conj(A_{j,k})·u_j(z)ᵏ,   u_j(z) = z/(1 − conj(z_j)·z),  z_j ∈ 𝔻.
// Its Schwarz extension gains the reflected principal part (conj(u_j)ᵏ = 1/(z−z_j)ᵏ on |z|=1):
//   F(z) = c/z + Σₗ conj(F[l])·zˡ + Σⱼ Σₖ A_{j,k}/(z − z_j)ᵏ.
// Ported verbatim from the QD app's canonical σ (schwarz-common.mjs adaptUnbounded + the branch
// helpers). The deltoid path above (branches omitted) MUST stay byte-identical.
const conj = (z: Complex): Complex => [z[0], -z[1]];

// --- Hand-value domains (real coefficients → absolute arithmetic pins the branch FORMULAS, so a
//     dropped/garbled u^k or 1/(z−z_j)^k term fails outright — not just self-consistently). ---
// SINGLE order-1 pole: z_j=0.2, A₁=0.3 → φ(x)=x+0.3x/(1−0.2x), F(x)=1/x+0.3/(x−0.2).
const SINGLE = makeUnboundedLaurentSchwarz(1, [], [{ z: [0.2, 0], A: [[0.3, 0]] }]);
// HIGHER order-2 pole: z_j=0.5, A=[1,0.5] → pins the k=2 term (u² in φ, 1/(z−z_j)² in F).
const HIGHER_R = makeUnboundedLaurentSchwarz(1, [], [{ z: [0.5, 0], A: [[1, 0], [0.5, 0]] }]);
// TWO real branches → pins the Σⱼ sum.
const TWO_R = makeUnboundedLaurentSchwarz(1, [], [
  { z: [0.2, 0], A: [[0.3, 0]] },
  { z: [0.4, 0], A: [[0.5, 0]] },
]);

// --- Univalent, small-coefficient domains for the inverse-dependent checks (round-trip / invertPhi).
//     Large branch residues break exterior univalence; these stay φ ≈ c·z + perturbation so the
//     cold-seeded Newton inverse lands on the unique exterior preimage. ---
const CPLX = makeUnboundedLaurentSchwarz(1, [[0, 0], [0, 0.05]], [
  { z: [0.25, 0.1], A: [[0.12, 0], [0.05, -0.03]] },
]);
const TWO_S = makeUnboundedLaurentSchwarz(1, [], [
  { z: [0.2, 0], A: [[0.15, 0]] },
  { z: [-0.1, 0.2], A: [[0.05, 0.1]] },
]);
// Exterior probes, |z|≤2.3 — well inside every branch's φ-pole radius 1/|z_j| (≥3.5), so φ is
// univalent there and the inverse is unambiguous.
const EXT_BRANCH: Complex[] = [[2, 0], [0, 2], [1.6, -1.2], [-2.2, 0.7]];

describe("@cas/schwarz unbounded-Laurent σ — pole-bearing branch term (Phase 2)", () => {
  it("evalPhi / evalF include the branch term — order-1 (hand-computed)", () => {
    near(SINGLE.evalPhi([2, 0]), [3, 0]); //  2 + 0.3·2/(1−0.4) = 2 + 1
    near(SINGLE.evalPhi([3, 0]), [5.25, 0]); //  3 + 0.3·3/0.4 = 3 + 2.25
    near(SINGLE.evalF([2, 0]), [2 / 3, 0]); //  1/2 + 0.3/1.8
    near(SINGLE.evalF([3, 0]), [1 / 3 + 0.3 / 2.8, 0]); //  1/3 + 0.3/2.8
  });

  it("evalPhi / evalF include the k=2 term — order-2 pole (hand-computed)", () => {
    //  z=3, z_j=0.5: u = 3/(1−1.5) = −6.  φ = 3 + 1·(−6) + 0.5·(−6)² = 3 − 6 + 18 = 15.
    near(HIGHER_R.evalPhi([3, 0]), [15, 0]);
    //  F = 1/3 + 1/(3−0.5) + 0.5/(3−0.5)² = 1/3 + 0.4 + 0.08.
    near(HIGHER_R.evalF([3, 0]), [1 / 3 + 0.4 + 0.08, 0]);
  });

  it("evalPhi / evalF sum over branches — Σⱼ (hand-computed)", () => {
    //  z=2: branch1 0.3·(2/0.6)=1, branch2 0.5·(2/0.2)=5  ⇒  φ = 2 + 6 = 8.
    near(TWO_R.evalPhi([2, 0]), [8, 0]);
    //  F = 1/2 + 0.3/(2−0.2) + 0.5/(2−0.4).
    near(TWO_R.evalF([2, 0]), [0.5 + 0.3 / 1.8 + 0.5 / 1.6, 0]);
  });

  it("boundary reflection identity F(z) = conj(φ(z)) on |z| = 1 (pins the Schwarz extension vs φ)", () => {
    for (const dom of [SINGLE, HIGHER_R, TWO_R, CPLX, TWO_S]) {
      for (let k = 0; k < 16; k++) {
        const t = (2 * Math.PI * (k + 0.5)) / 16;
        const z: Complex = [Math.cos(t), Math.sin(t)];
        near(dom.evalF(z), conj(dom.evalPhi(z)), 9);
      }
    }
  });

  it("evalFDeriv = d/dz evalF everywhere — finite-difference golden (incl. branch principal parts; S5-B2)", () => {
    // F is holomorphic off its poles (z = 0 and the z_j ∈ 𝔻), so the analytic F' must equal a central
    // finite difference of evalF at every exterior probe (|z| ≥ 1.6, far from all poles). This pins the
    // BRANCH derivative −Σ k·A/(z−z_j)^{k+1} — a dropped k factor or off-by-one power fails here.
    const fd = (dom: UnboundedLaurentSchwarz, z: Complex, h = 1e-6): Complex => {
      const fp = dom.evalF([z[0] + h, z[1]]);
      const fm = dom.evalF([z[0] - h, z[1]]);
      return [(fp[0] - fm[0]) / (2 * h), (fp[1] - fm[1]) / (2 * h)];
    };
    for (const dom of [DELTOID, SINGLE, HIGHER_R, TWO_R, CPLX, TWO_S]) {
      for (const z of EXT_BRANCH) {
        near(dom.evalFDeriv(z), fd(dom, z), 4); // central diff is O(h²); 4 digits is comfortably inside
      }
    }
  });

  it("σ(φ(z₀)) = conj(F(z₀)) — the exact round-trip identity, with poles", () => {
    for (const dom of [SINGLE, CPLX, TWO_S]) {
      for (const z0 of EXT_BRANCH) {
        const Fz0 = dom.evalF(z0);
        const got = dom.sigma(dom.evalPhi(z0));
        expect(got, `σ(φ(z₀)) null at z₀=${z0}`).not.toBeNull();
        if (got) near(got, [Fz0[0], -Fz0[1]], 7);
      }
    }
  });

  it("invertPhi recovers the exterior branch |z| > 1 for a pole-bearing φ", () => {
    for (const z0 of EXT_BRANCH) {
      const w = SINGLE.evalPhi(z0);
      const z = SINGLE.invertPhi(w);
      expect(z).not.toBeNull();
      if (z) {
        expect(Math.hypot(z[0], z[1])).toBeGreaterThan(1);
        near(SINGLE.evalPhi(z), w, 7);
      }
    }
  });

  it("branches omitted ≡ the pole-free engine (deltoid σ unchanged)", () => {
    const bare = makeUnboundedLaurentSchwarz(1, [[0, 0], [0, 0], [0.5, 0]], []);
    near(bare.sigma([2.125, 0]) as Complex, [2.5, 0]);
    near(bare.sigma([1, 0.75]) as Complex, [0.5, -0.5]);
  });
});

// ---------------------------------------------------------------------------
// Complex leading coefficient c (S5-C1). QD's real-c family never emits a complex c, but the engine now
// accepts one (a CD-native map). The Schwarz extension reflects the leading term to conj(c)/z — NOT c/z —
// so the boundary reflection identity F(z) = conj(φ(z)) on |z| = 1 is the golden that pins the conj(c):
// a c/z here (the pre-C1 code) fails this test for any non-real c. A number and its [re,0] tuple must also
// build the identical engine (backward-compat).
const CPLX_C = makeUnboundedLaurentSchwarz([1, 0.5], [[0, 0], [0, 0], [0.4, 0]]);

describe("@cas/schwarz unbounded-Laurent σ — complex leading coefficient c (S5-C1)", () => {
  it("boundary reflection F(z) = conj(φ(z)) on |z| = 1 — pins conj(c) in the F extension", () => {
    for (let k = 0; k < 24; k++) {
      const t = (2 * Math.PI * (k + 0.5)) / 24;
      const z: Complex = [Math.cos(t), Math.sin(t)];
      near(CPLX_C.evalF(z), conj(CPLX_C.evalPhi(z)), 9);
    }
  });

  it("σ = identity on ∂Ω and the round-trip σ(φ(z₀)) = conj(F(z₀)) hold with complex c", () => {
    for (const z0 of EXTERIOR) {
      const Fz0 = CPLX_C.evalF(z0);
      const got = CPLX_C.sigma(CPLX_C.evalPhi(z0));
      expect(got, `σ null at z₀=${z0}`).not.toBeNull();
      if (got) near(got, [Fz0[0], -Fz0[1]], 7);
    }
    // σ fixes the boundary ∂Ω = φ(|z|=1) (the defining reflection property, requires the conj(c) F).
    for (let k = 0; k < 12; k++) {
      const t = (2 * Math.PI * (k + 0.5)) / 12;
      const wOnBoundary = CPLX_C.evalPhi([Math.cos(t), Math.sin(t)]);
      near(CPLX_C.sigma(wOnBoundary) as Complex, wOnBoundary, 6);
    }
  });

  it("evalFDeriv = d/dz evalF with complex c — finite-difference (pins −conj(c)/z²)", () => {
    const fd = (z: Complex, h = 1e-6): Complex => {
      const fp = CPLX_C.evalF([z[0] + h, z[1]]);
      const fm = CPLX_C.evalF([z[0] - h, z[1]]);
      return [(fp[0] - fm[0]) / (2 * h), (fp[1] - fm[1]) / (2 * h)];
    };
    for (const z of EXTERIOR) near(CPLX_C.evalFDeriv(z), fd(z), 4);
  });

  it("a real number c and its [c, 0] tuple build the identical engine (backward-compat)", () => {
    const asNum = makeUnboundedLaurentSchwarz(1, [[0, 0], [0, 0], [0.5, 0]]);
    const asTuple = makeUnboundedLaurentSchwarz([1, 0], [[0, 0], [0, 0], [0.5, 0]]);
    for (const z of EXTERIOR) {
      near(asNum.evalPhi(z), asTuple.evalPhi(z), 12);
      near(asNum.evalF(z), asTuple.evalF(z), 12);
      near(asNum.evalFDeriv(z), asTuple.evalFDeriv(z), 12);
    }
  });
});
