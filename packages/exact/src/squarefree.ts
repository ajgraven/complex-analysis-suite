// Yun's squarefree decomposition over ℚ(i).
//
// `QiPoly.squarefreePart` collapses every multiplicity to one. This keeps them: it returns, for each
// `m`, the product of the irreducible factors that occur in `p` exactly `m` times, so
// `p = c · Π aₘ^m`.
//
// Why it matters more than it looks: it settles pole multiplicity **before any root is
// approximated**. A floating root-finder can only infer that a double root is a double root by
// noticing two roots came out close together — and two genuinely distinct roots `10⁻⁹` apart look
// identical to it. That inference is why the M1 pole report carries `orderCertain`. Here the
// multiplicity structure is a property of the polynomial, computed in exact arithmetic, and the
// inference disappears.
import { Gauss } from "./gaussian.js";
import { QiPoly } from "./qiPoly.js";

export interface SquarefreeFactor {
  /** The product of the irreducible factors occurring exactly `multiplicity` times. Monic. */
  readonly factor: QiPoly;
  readonly multiplicity: number;
}

/**
 * Yun's algorithm (characteristic zero).
 *
 * `a₀ = gcd(p, p′)` strips one power off every repeated factor; dividing it out leaves `b₁`, the
 * squarefree part, and the difference `dᵢ = cᵢ − bᵢ′` isolates successive multiplicities. Each step
 * costs one gcd and two exact divisions, and the loop runs at most (highest multiplicity) times —
 * far cheaper than factorisation, which it does not need and does not do.
 *
 * Returns factors with multiplicity ascending. A constant or zero input returns an empty list.
 */
export function yunSquarefree(p: QiPoly): SquarefreeFactor[] {
  if (p.degree() < 1) return [];

  const monic = p.monic();
  const a0 = monic.gcd(monic.derivative());
  let b = a0.degree() < 1 ? monic : monic.divExact(a0);
  let c = a0.degree() < 1 ? monic.derivative() : monic.derivative().divExact(a0);
  let d = c.sub(b.derivative());

  const out: SquarefreeFactor[] = [];
  for (let m = 1; b.degree() >= 1; m++) {
    const a = b.gcd(d);
    if (a.degree() >= 1) out.push({ factor: a, multiplicity: m });
    const bNext = a.degree() < 1 ? b : b.divExact(a);
    const cNext = a.degree() < 1 ? d : d.divExact(a);
    b = bNext;
    c = cNext;
    d = c.sub(b.derivative());
    // Defensive: the loop is bounded by the highest multiplicity, which is bounded by the degree.
    if (m > p.degree() + 1) break;
  }
  return out;
}

/**
 * The multiplicity of `root` in `p` — exactly, by repeated exact division by (var − root).
 *
 * `divExact` throws on a non-zero remainder, so the loop can only advance when the division really
 * was exact. That makes the count a fact about the polynomial rather than a tolerance decision.
 */
export function multiplicityAt(p: QiPoly, root: Gauss): number {
  if (p.isZero()) throw new Error("multiplicityAt: the zero polynomial");
  const linear = QiPoly.fromCoeffs([root.neg(), Gauss.ONE]);
  let m = 0;
  let q = p;
  while (q.degree() >= 1 && q.eval(root).isZero()) {
    q = q.divExact(linear);
    m++;
  }
  return m;
}
