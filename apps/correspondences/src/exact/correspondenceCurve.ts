// The EXACT deleted correspondence curve of an unbounded-Laurent map (roadmap #16). The Correspondences
// app's numeric branch engine (correspondence.ts) solves, per point and in floating point, the polynomial
// φ(w) = φ(η(z)) and deflates the trivial root w = η(z) by NUMERIC synthetic division — the step that can
// mislabel the trivial branch when two branches collide near a cusp. Here we do that deflation ONCE,
// EXACTLY, in ℚ(i), yielding the correspondence as a genuine bivariate polynomial C(w, z̄) = 0 with exact
// coefficients, plus the exact cusp locus (its discriminant in w). Per-point solving stays numeric (a hot
// render path — exact BigInt per pixel is a non-starter); what this buys is an exact, once-computed
// scaffold to seed and validate against, and certified cusp locations.
//
//   φ(w) = c·w + Σ_{l=0}^{m-1} F[l] / wˡ,   η(z) = 1/z̄,   z̄ =: the conjugate coordinate.
//
// φ(w) = φ(η(z)), cleared of the w- and z̄-denominators, is the degree-m (in w) polynomial
//   P(w, z̄) = (c·z̄)·wᵐ + (−c − Σ_{l≥1} F[l]·z̄^{l+1})·w^{m-1} + Σ_{k=1}^{m-1} (F[k]·z̄)·w^{m-1-k},
// whose trivial root w = η = 1/z̄ is the factor (z̄·w − 1). Dividing it out (exactly) leaves the
// degree-d = (m−1) deleted correspondence curve C(w, z̄); a d:d correspondence. See INTERCHANGE.md §5.
//
// Honest labelling (RISKS.md §3): the curve and its cusp locus are EXACT (=). The dynamics built on the
// correspondence — orbit trees, straightening, branch continuation through cusps — remain exploratory (≈).
import { discriminant, Gauss, integerPrimitive, primitivePoly, QiPoly, renderGaussMag } from "@cas/exact";

/** A single monomial g · wʲ · z̄ᵏ of the bivariate curve, used for rendering and numeric evaluation. */
interface CurveTerm {
  g: Gauss;
  j: number; // power of w
  k: number; // power of z̄
}

export interface ExactCorrespondenceCurve {
  /** d = m − 1: the degree in w, so the correspondence is d:d. */
  readonly wDegree: number;
  /** The content-cleared curve C(w, z̄): wCoeffs[j] is the coefficient of wʲ, a polynomial in z̄. */
  readonly wCoeffs: readonly QiPoly[];
  /** LaTeX of "C(w, z̄) = 0" (z̄ rendered as \bar{z}). */
  readonly latex: string;
  /** Plain-text of "C(w, z̄) = 0" (z̄ rendered as z̄). */
  readonly text: string;
  /** Numeric value of C(w, z̄) at complex w and z̄ (float [re, im]) — for on-curve cross-checks. */
  evalNumeric(w: readonly [number, number], zbar: readonly [number, number]): [number, number];
}

/** z̄ᵏ as a QiPoly. */
function varPow(k: number): QiPoly {
  const coeffs: Gauss[] = new Array<Gauss>(k + 1).fill(Gauss.ZERO);
  coeffs[k] = Gauss.ONE;
  return QiPoly.fromCoeffs(coeffs);
}

/**
 * Build P(w, z̄) as an array indexed by the power of w (P[j] = coefficient of wʲ, a z̄-polynomial), for
 * φ(w) = c·w + Σ_{l=0}^{m-1} F[l]/wˡ. Requires m ≥ 2 (a genuine multi-valued correspondence) and c ≠ 0.
 */
function buildFullPolynomial(c: Gauss, F: readonly Gauss[]): QiPoly[] {
  const m = F.length;
  if (m < 2) throw new Error("correspondenceCurve: need at least F[0], F[1] (m ≥ 2)");
  if (c.isZero()) throw new Error("correspondenceCurve: leading coefficient c must be nonzero");
  const zbar = QiPoly.variable();
  const P: QiPoly[] = new Array<QiPoly>(m + 1).fill(QiPoly.zero());
  // wᵐ : c·z̄
  P[m] = QiPoly.constant(c).mul(zbar);
  // w^{m-1} : −c − Σ_{l=1}^{m-1} F[l]·z̄^{l+1}
  let pm1 = QiPoly.constant(c.neg());
  for (let l = 1; l <= m - 1; l++) {
    const Fl = F[l] ?? Gauss.ZERO;
    if (!Fl.isZero()) pm1 = pm1.sub(QiPoly.constant(Fl).mul(varPow(l + 1)));
  }
  P[m - 1] = pm1;
  // w^{m-1-k} : F[k]·z̄, for k = 1..m-1
  for (let k = 1; k <= m - 1; k++) {
    const Fk = F[k] ?? Gauss.ZERO;
    P[m - 1 - k] = QiPoly.constant(Fk).mul(zbar);
  }
  return P;
}

/**
 * Divide the full polynomial P(w, z̄) by the trivial factor (z̄·w − 1) exactly, as polynomial long
 * division in w over the ring ℚ(i)[z̄]. The divisor's leading (in-w) coefficient is z̄, so each step
 * divides the current leading remainder by z̄ — which is exact precisely because w = 1/z̄ is a genuine
 * root (the reason the branch is called "deleted"). Returns the degree-(m−1) quotient's w-coefficients.
 */
function deflateTrivial(P: readonly QiPoly[]): QiPoly[] {
  const m = P.length - 1;
  const rem: QiPoly[] = P.map((p) => p);
  const q: QiPoly[] = new Array<QiPoly>(m).fill(QiPoly.zero());
  for (let j = m; j >= 1; j--) {
    let qc: QiPoly;
    try {
      qc = (rem[j] ?? QiPoly.zero()).divideByVar(); // rem[j] / z̄
    } catch {
      throw new Error("correspondenceCurve: (z̄·w − 1) is not an exact factor (not a Laurent correspondence?)");
    }
    q[j - 1] = qc;
    // subtract qc·w^{j-1}·(z̄·w − 1): the wʲ term cancels rem[j] exactly; the w^{j-1} term adds qc.
    rem[j - 1] = (rem[j - 1] ?? QiPoly.zero()).add(qc);
  }
  if (!(rem[0] ?? QiPoly.zero()).isZero()) {
    throw new Error("correspondenceCurve: nonzero remainder after deflation (internal invariant violated)");
  }
  return q;
}

/** Flatten the curve into nonzero monomials g·wʲ·z̄ᵏ, sorted by (j desc, k desc) for stable rendering. */
function curveTerms(wCoeffs: readonly QiPoly[]): CurveTerm[] {
  const terms: CurveTerm[] = [];
  for (let j = 0; j < wCoeffs.length; j++) {
    const cj = wCoeffs[j];
    if (!cj) continue;
    for (let k = 0; k < cj.coeffs.length; k++) {
      const g = cj.coeff(k);
      if (!g.isZero()) terms.push({ g, j, k });
    }
  }
  terms.sort((s, t) => (t.j - s.j) || (t.k - s.k));
  return terms;
}

/** Render the whole curve "C(w, z̄) = 0". */
function renderCurve(wCoeffs: readonly QiPoly[], latex: boolean): string {
  const wSym = "w";
  const zSym = latex ? "\\bar{z}" : "z̄"; // z with a combining macron in plain text
  const pow = (base: string, e: number): string => {
    if (e === 0) return "";
    if (e === 1) return base;
    return latex ? `${base}^{${e}}` : `${base}^${e}`;
  };
  const terms = curveTerms(wCoeffs);
  if (terms.length === 0) return latex ? "0 = 0" : "0 = 0";
  let out = "";
  for (let idx = 0; idx < terms.length; idx++) {
    const { g, j, k } = terms[idx];
    const { sign, mag, isUnit } = renderGaussMag(g);
    // z̄ factor before w (matching the canonical form 2w² − z̄²w − z̄).
    const vars = [pow(zSym, k), pow(wSym, j)].filter((s) => s.length > 0);
    const varStr = latex ? vars.join("\\,") : vars.join(" ");
    // A coefficient of ±1 in front of at least one variable prints as just the sign (drop the "1").
    const showMag = !(isUnit && vars.length > 0);
    let body: string;
    if (!showMag) body = varStr;
    else if (vars.length === 0) body = mag;
    else body = latex ? `${mag}${varStr}` : `${mag} ${varStr}`;
    if (idx === 0) {
      out += sign < 0 ? `-${latex ? "" : " "}${body}` : body;
    } else {
      out += sign < 0 ? ` - ${body}` : ` + ${body}`;
    }
  }
  return `${out} = 0`;
}

/** Float [re,im] complex helpers for numeric evaluation. */
function cAdd(a: [number, number], b: [number, number]): [number, number] {
  return [a[0] + b[0], a[1] + b[1]];
}
function cMul(a: readonly [number, number], b: readonly [number, number]): [number, number] {
  return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
}
function cPow(a: readonly [number, number], e: number): [number, number] {
  let acc: [number, number] = [1, 0];
  for (let i = 0; i < e; i++) acc = cMul(acc, a);
  return acc;
}

/**
 * Build the exact deleted correspondence curve of φ(w) = c·w + Σ F[l]/wˡ (c, F Gaussian-rational). The
 * deltoid φ(z) = z + 1/(2z²) is (c, F) = (1, [0, 0, ½]); its curve is 2w² − z̄²·w − z̄.
 */
export function correspondenceCurve(c: Gauss, F: readonly Gauss[]): ExactCorrespondenceCurve {
  const P = buildFullPolynomial(c, F);
  const deflated = deflateTrivial(P);
  const wCoeffs = integerPrimitive(deflated);
  const wDegree = wCoeffs.length - 1;
  const terms = curveTerms(wCoeffs);
  return {
    wDegree,
    wCoeffs,
    latex: renderCurve(wCoeffs, true),
    text: renderCurve(wCoeffs, false),
    evalNumeric(w, zbar) {
      let acc: [number, number] = [0, 0];
      for (const { g, j, k } of terms) {
        const coef = g.toTuple();
        acc = cAdd(acc, cMul(cMul(coef, cPow(w, j)), cPow(zbar, k)));
      }
      return acc;
    },
  };
}

/**
 * The exact CUSP LOCUS of the correspondence: disc_w C(w, z̄) as a content-cleared polynomial in z̄, whose
 * roots are the z̄-values where two w-branches collide (the branch points / cusps). For the deltoid this is
 * z̄⁴ + 8z̄. A d < 2 correspondence has no branch collisions, so the locus is the constant 1 (empty).
 */
export function cuspLocus(curve: ExactCorrespondenceCurve): QiPoly {
  // disc_w C(w, z̄): the shared @cas/exact discriminant eliminates w (Sylvester + fraction-free Bareiss).
  // Only the ZERO SET matters here — where two w-branches collide — so content-clear to the canonical
  // generator. `discriminant` used to do this internally; it now returns the true discriminant (sign and
  // magnitude intact) and the normalization lives at the call site that wants it, matching how
  // `dynatomic.ts` already wraps `resultant`. Same value either way: disc_w(2w² − z̄²w − z̄) = z̄⁴ + 8z̄ is
  // already primitive.
  return primitivePoly(discriminant(curve.wCoeffs));
}
