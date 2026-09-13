// `Res(K·f, n)` where the kernel's pole and `f`'s COLLIDE — G1's `π cot(πz)/z²`, and tier G's
// hardest arithmetic.
//
// Everywhere else in this tier the two are disjoint: `kernelResidues` evaluates `f` at an integer
// where the kernel has a simple pole, and `kernelResidue.ts` evaluates the kernel at a pole of `f`
// where the kernel is regular. Here neither holds. `π cot(πz)/z²` is a perfectly good meromorphic
// function whose pole at 0 has order **1 + 2 = 3** — *orders add at a collision* — and the honest
// response is neither to refuse nor to pretend, but to compute the merged residue directly.
//
// ── THE LAURENT ROUTE, AND WHY IT IS THE MANDATED ONE ─────────────────────────────────────────────
// DESIGN §6.3 / research 03 §0.2 prefer the Laurent-coefficient route over the order-`m` derivative
// formula once `m ≥ 3`, because `(d/dz)^{m−1}` of a quotient explodes symbolically — and `m = 3` is
// exactly the first case where that matters, which is why G1 is also the entry that justifies the
// series layer. What makes it cheap is that the kernel's own expansion is EVEN:
//
//     π cot(πz) = 1/u + Σ_{k≥1} t_k π^{2k} u^{2k−1},   t_k = (−1)^k 2^{2k} B_{2k}/(2k)!
//     π csc(πz) = (−1)ⁿ [ 1/u + Σ_{k≥1} s_k π^{2k} u^{2k−1} ],  s_k = (−1)^{k−1}(2^{2k}−2)B_{2k}/(2k)!
//
// with `u = z − n` (cot is π-periodic, so its expansion is the SAME at every integer; csc alternates,
// which is where `(−1)ⁿ` comes from and why G3 costs nothing once G1 exists). Multiplying by
// `f = Σ_{j≥−m} c_j u^j` and reading the `u^{−1}` coefficient picks out `(2k−1) + j = −1`, so
//
//     Res(K·f, n) = c₀ + Σ_{k≥1} t_k π^{2k} · c_{−2k}
//
// — only the EVEN negative coefficients of `f` and its constant term contribute, and the sum is
// FINITE because `f` has a pole of order `m` (nothing below `c_{−m}` exists). At `f = 1/z²` that is
// one term: `t₁π² = −π²/3`, which is G1's whole answer.
//
// ── WHICH RING, AND WHY IT IS NOT THE ONE G2 SOLVES IN ────────────────────────────────────────────
// `t_k` is rational and the powers of π are even, so the value lands in **ℚ(i)(π)** — the log
// families' ring — and not in the exponential basis where G2's `coth` lives. That is the finding
// `solveResidueTerm.ts` records from the other side: a collision is a different RING rather than a
// harder case, and G1's cofactor `1/z²` has no pole but the collision, so its `ρ` is exactly zero and
// its whole identity lives here.
//
// Bernoulli numbers are computed here rather than in `@cas/exact` because this is their only
// consumer (ADR-0007), from `Σ_{j=0}^{m} C(m+1,j) B_j = 0` — exact in ℚ, no table to mistype.
import { Frac, Gauss, QiPoly } from "@cas/exact";
import { exact, refuse, type Certificate } from "@cas/rigor";
import { RatPi, formatRatPi } from "./ratPi.js";
import type { KernelKind } from "./summationKernel.js";

/** `B_0 … B_n`, exactly, from `Σ_{j=0}^{m} C(m+1,j) B_j = 0`. */
function bernoulli(n: number): Frac[] {
  const b: Frac[] = [Frac.ONE];
  for (let m = 1; m <= n; m++) {
    let acc = Frac.ZERO;
    let c = Frac.ONE; // C(m+1, 0)
    for (let j = 0; j < m; j++) {
      acc = acc.add(c.mul(b[j]));
      // C(m+1, j+1) = C(m+1, j) · (m+1−j)/(j+1)
      c = c.mul(Frac.of(BigInt(m + 1 - j), BigInt(j + 1)));
    }
    // The last binomial is C(m+1, m) = m+1.
    b.push(acc.neg().div(Frac.of(BigInt(m + 1))));
  }
  return b;
}

/**
 * `t_1 … t_K` — the kernel's Laurent coefficients above the simple pole, in units of `π^{2k}`.
 *
 * Memoised because the merged residue is recomputed on every drag of a contour, and the values do
 * not depend on anything about the record.
 */
const COEFFICIENTS = new Map<string, readonly Frac[]>();
/**
 * Exported for the CONFLUENCE invariant, which is its second consumer (ADR-0007).
 *
 * `a → 0` carries G2 onto G1 and G2's csc companion onto G3, and the rigorous form of that limit is
 * not an evaluation at a small `a`: `(π/a)coth(πa) − 1/a² = Σ_{k≥1} (−1)^k t_k π^{2k} a^{2k−2}`, so
 * the kernel's own Laurent coefficients ARE the Taylor coefficients of the non-colliding family's
 * closed form once its pole part is removed. The `a⁰` term is then exactly `−Res₀` — the collision
 * record's own answer — and the `a²` term is `Res₀` of the `1/z⁴` family, which is ζ(4)'s. One
 * identity, three invariants, and no limit taken numerically.
 */
export function kernelSeries(kind: KernelKind, upTo: number): readonly Frac[] {
  const key = `${kind}:${upTo}`;
  const seen = COEFFICIENTS.get(key);
  if (seen !== undefined) return seen;
  const b = bernoulli(2 * upTo);
  const out: Frac[] = [];
  let factorial = Frac.ONE;
  for (let k = 1; k <= upTo; k++) {
    // (2k)! built incrementally, so no separate factorial routine can disagree with this one.
    factorial = factorial.mul(Frac.of(BigInt(2 * k - 1))).mul(Frac.of(BigInt(2 * k)));
    const twoPow = Frac.of(1n << BigInt(2 * k));
    const sign = k % 2 === 0 ? Frac.ONE : Frac.ONE.neg();
    const base = kind === "cot" ? twoPow : twoPow.sub(Frac.of(2n));
    // `cot` carries `(−1)^k` and `csc` carries `(−1)^{k−1}` — the one place the two series differ
    // beyond the `2^{2k} − 2`, and the reason `csc`'s leading term is `+π²/6` where `cot`'s is `−π²/3`.
    const signed = kind === "cot" ? sign : sign.neg();
    out.push(signed.mul(base).mul(b[2 * k]).div(factorial));
  }
  COEFFICIENTS.set(key, out);
  return out;
}

export type MergedResidueResult =
  | {
      readonly ok: true;
      /** `Res(K·f, n)`, exact in ℚ(i)(π). */
      readonly value: RatPi;
      /** `1 + m`: the kernel's simple pole plus `f`'s order-`m` one. Orders ADD at a collision. */
      readonly order: number;
      readonly certificate: Certificate;
    }
  | { readonly ok: false; readonly reason: string; readonly certificate: Certificate };

const no = (n: bigint, reason: string): MergedResidueResult => ({
  ok: false,
  reason,
  certificate: refuse(`Res(K·f, ${n})`, reason),
});

/**
 * The merged residue at the integer `n`, where `f = num/den` has a pole and the kernel has one too.
 *
 * Refuses when there is NO collision, rather than returning the ordinary `f(n)`: the two are
 * different computations and a caller that reached here by mistake should hear about it, not get a
 * plausible number from the wrong one.
 */
export function mergedResidue(
  kind: KernelKind,
  num: QiPoly,
  den: QiPoly,
  n: bigint,
): MergedResidueResult {
  const at = new Gauss(Frac.of(n), Frac.ZERO);
  // `shift(a)` gives `p(u + a)`, i.e. the Taylor coefficients about `a` — the primitive that turns
  // "the residue at `n`" into "a coefficient of a series about 0".
  if (den.isZero()) {
    // Asked FIRST: a zero polynomial shifts to an empty coefficient list, where the vanishing-order
    // loop below reports 0 and the message would then be "there is no collision" about a function
    // that is not a function.
    return no(n, "the cofactor's denominator is identically zero, so f is not a function there");
  }
  const d = den.shift(at).coeffs;
  let m = 0;
  while (m < d.length && d[m].isZero()) m += 1;
  if (m === 0) {
    return no(n, `the cofactor does not vanish at z = ${n}, so there is no collision to merge here`);
  }
  // `asSummationKernel` reduces `num/den` by their gcd, so a numerator vanishing at `n` — which would
  // lower the order — has already been cancelled and `m` is the true one.
  const nShifted = num.shift(at).coeffs;

  // `f = u^{−m} · (N(u)/D̃(u))`, and `D̃(0) ≠ 0` by construction, so the quotient is a power series.
  const tilde = d.slice(m);
  const need = m + 1; // coefficients `a_0 … a_m`, since `c_j = a_{j+m}`
  const a: Gauss[] = [];
  for (let i = 0; i < need; i++) {
    let acc = i < nShifted.length ? nShifted[i] : Gauss.ZERO;
    for (let j = 0; j < i; j++) {
      const t = i - j < tilde.length ? tilde[i - j] : Gauss.ZERO;
      acc = acc.sub(a[j].mul(t));
    }
    a.push(acc.div(tilde[0]));
  }

  // `Res = c₀ + Σ_k t_k π^{2k} c_{−2k}`, with `c_j = a_{j+m}`.
  const maxK = Math.floor(m / 2);
  const series = kernelSeries(kind, maxK);
  let value = RatPi.fromGauss(a[m]);
  for (let k = 1; k <= maxK; k++) {
    const c = a[m - 2 * k];
    if (c.isZero()) continue;
    const coefficient = series[k - 1];
    value = value.add(
      RatPi.piPower(2 * k, c.mul(new Gauss(coefficient, Frac.ZERO))),
    );
  }
  // `π csc(πz)` alternates; `π cot(πz)` is π-periodic and does not.
  if (kind === "csc" && ((n % 2n) + 2n) % 2n === 1n) value = value.neg();

  const order = 1 + m;
  return {
    ok: true,
    value,
    order,
    certificate: exact(
      `Res(K·f, ${n}) = ${formatRatPi(value)}, at a merged pole of order ${order}`,
      `orders ADD at a collision (the kernel's simple pole plus f's order-${m} one), and the residue ` +
        "comes from the Laurent route rather than the order-m derivative formula, which explodes " +
        "symbolically from m = 3 — the first case being exactly this one",
      {
        provenance: [
          {
            ok: true,
            text: `the kernel's expansion is EVEN — 1/u + Σ t_k π^{2k} u^{2k−1} — so only c₀ and the even negative coefficients of f contribute, and the sum is finite at k ≤ ${maxK}`,
          },
          {
            ok: true,
            text: "t_k is rational (Bernoulli, from Σ C(m+1,j) B_j = 0 in exact ℚ) and the powers of π are even, so the value lands in ℚ(i)(π) — a different RING from the exponential basis G2 solves in, not a harder case of it",
          },
        ],
      },
    ),
  };
}
