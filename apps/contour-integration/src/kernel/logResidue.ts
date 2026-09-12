// `Res(R(z)·log^m z, z₀)` — a rational function times a power of the logarithm, at a pole of any
// order.
//
// **`log` is inserted as a DEVICE, and the residue is where the device does its work.** Nothing in
// `∫₀^∞ R(x) log x dx` asks for a `log²`; D4 uses one because the multivaluedness of `log²` is what
// manufactures a surviving term. So this is not a decoration on `Res(R, z₀)` — at a double pole the
// answer mixes the two Laurent coefficients of `R` with the expansion of `log²` about `z₀`, and
// dropping either half gives a plausible wrong number.
//
// THE ARITHMETIC. Shift the pole to the origin, `z = z₀ + w`:
//
//     R(z₀ + w) = Σ_{k=−n}^{…} a_k w^k        (its principal part is `exactResidue.ts`'s, free)
//     log(z₀ + w) = L + u(w),   L = log z₀,   u(w) = log(1 + w/z₀) = Σ_{j≥1} (−1)^{j−1} w^j/(j z₀^j)
//
// and the residue is the `w^{−1}` coefficient of the product:
//
//     Res = Σ_{j=0}^{n−1} a_{−n+j} · c_{n−1−j},    c_p = [w^p](L + u)^m = Σ_t C(m,t) L^{m−t} [w^p]u^t
//
// At a simple pole that collapses to `Res(R, z₀)·(log z₀)^m`, which is the formula everyone knows;
// the general case is the same expression and no special-casing.
//
// **WHICH RING.** `L = ln|z₀| + i·arg z₀`, and on the unit circle the first term vanishes and the
// second is a rational multiple of `iπ`. So every `c_p`, and the residue itself, is a POLYNOMIAL IN
// π with Gaussian-rational coefficients — `Res(log²z/(1+z²)², i) = −π/4 + iπ²/16`. That is exactly
// the ring D4's system lives in (`kernel/ratPi.ts`), which is why the system and its right-hand side
// can be solved together without either leaving exact arithmetic.
//
// **THE DETERMINATION IS AN INPUT, NOT A CONVENTION.** `arg(−i)` is `3π/2` under the keyhole's
// `[0, 2π)` and `−π/2` under the principal determination; the two give different residues, and D4's
// answer is the difference. `argumentOfPole` decides it — guessed numerically, verified exactly —
// and is shared with `branchResidue.ts` so `z^α` and `log z` cannot drift apart about the same pole.
//
// **WHY NO NUMERIC CROSS-CHECK HERE.** Every other exact route in this app carries one, and this one
// is checked just as hard — in the tests, by a trapezoid quadrature of `(1/2πi)∮ R log^m dz` around
// each pole. It is not in production because a safe radius is a property of the whole pole
// configuration and not of the pole being asked about: a default small enough to be safe everywhere
// does not exist, and one that silently enclosed a second pole would turn a correct answer into a
// refusal. The test knows the configuration; this function does not.
import { Frac, Gauss, QiPoly, SqrtExt, seriesMul, type QiSeries } from "@cas/exact";
import { exact, refuse, type Certificate } from "@cas/rigor";
import { argumentOfPole } from "./branchResidue.js";
import { exactPoleAt } from "./exactResidue.js";
import { formatGauss } from "./formatExact.js";
import { RatPi, formatRatPi } from "./ratPi.js";

/** The branch factor `log^m z`, and the determination it is read in. */
export interface LogFactor {
  /** `m` in `log^m z`. `m = 0` is the plain rational residue and is allowed. */
  readonly power: number;
  /**
   * `arg z ∈ [lo·π, hi·π)`, as rational multiples of π.
   *
   * `[0, 2)` is the keyhole's `(0, 2π)`; `[−1, 1)` is the principal determination. D4's
   * `wrong-sign-of-the-shift` trap is about which of the two is meant.
   */
  readonly argRange: readonly [Frac, Frac];
}

export type LogAtPole =
  | { readonly ok: true; readonly value: RatPi; readonly argMultiple: Frac }
  | { readonly ok: false; readonly reason: string };

export type LogResidue =
  | {
      readonly ok: true;
      readonly value: RatPi;
      readonly order: number;
      /** `arg z₀ = argMultiple·π`, exactly. */
      readonly argMultiple: Frac;
      readonly certificate: Certificate;
    }
  | { readonly ok: false; readonly reason: string; readonly certificate: Certificate };

/**
 * `log z₀` in the declared determination, as an element of ℚ(i)(π).
 *
 * On the unit circle `log z₀ = i·r·π` with `z₀ = e^{irπ}`, and `argumentOfPole` refuses off it —
 * `ln|z₀|` has no seat in any basis here until M4.5. D4's poles are `±i` and D5's the same, so the
 * whole of M4.3 sits on the circle; D5's second fixture `R = 1/(x²+4)` is the one that will need
 * the other half, and its answer `π log 2/4` says so on its face.
 */
export function logAtPole(at: Gauss, argRange: readonly [Frac, Frac]): LogAtPole {
  if (at.isZero()) {
    return { ok: false, reason: "log has a branch point at the origin, not a pole; it has no argument there" };
  }
  const argument = argumentOfPole(SqrtExt.fromGauss(at), argRange);
  if (!argument.ok) return argument;
  return {
    ok: true,
    value: RatPi.piPower(1, new Gauss(Frac.ZERO, argument.r)),
    argMultiple: argument.r,
  };
}

/** `C(m, t)`, exactly. */
function binomial(m: number, t: number): bigint {
  let c = 1n;
  for (let k = 0; k < t; k++) c = (c * BigInt(m - k)) / BigInt(k + 1);
  return c;
}

export function logResidue(
  num: QiPoly,
  den: QiPoly,
  at: Gauss,
  factor: LogFactor,
): LogResidue {
  const m = factor.power;
  if (!Number.isInteger(m) || m < 0) {
    const reason = `log^${m} is not a non-negative integer power, and a fractional one is a different branch structure`;
    return { ok: false, reason, certificate: refuse("the residue", reason) };
  }

  const L = logAtPole(at, factor.argRange);
  if (!L.ok) return { ok: false, reason: L.reason, certificate: refuse("the residue", L.reason) };

  const pole = exactPoleAt(num, den, at);
  if (pole === null) {
    const reason = `${formatGauss(at)} is not a pole of R (either R does not vanish there in the denominator, or the numerator cancels it)`;
    return { ok: false, reason, certificate: refuse("the residue", reason) };
  }
  const n = pole.order;

  // `u(w) = log(1 + w/z₀)`, to order `n − 1` — the only orders the residue can see.
  const inverse = at.inv();
  const u: Gauss[] = Array.from({ length: n }, () => Gauss.ZERO);
  let power = Gauss.ONE;
  for (let j = 1; j < n; j++) {
    power = power.mul(inverse);
    u[j] = power.mul(Gauss.rat(j % 2 === 1 ? 1n : -1n, BigInt(j)));
  }

  // `u^t` for every `t` that can reach a visible order. `u = O(w)`, so `u^t` starts at `w^t`.
  const highest = Math.min(m, n - 1);
  const uPowers: QiSeries[] = [Array.from({ length: n }, (_, k) => (k === 0 ? Gauss.ONE : Gauss.ZERO))];
  for (let t = 1; t <= highest; t++) uPowers.push(seriesMul(uPowers[t - 1], u, n));

  const lPowers: RatPi[] = [RatPi.ONE];
  for (let k = 1; k <= m; k++) lPowers.push(lPowers[k - 1].mul(L.value));

  const coefficientAt = (p: number): RatPi => {
    let acc = RatPi.ZERO;
    for (let t = 0; t <= Math.min(m, p); t++) {
      const c = uPowers[t][p];
      if (c === undefined || c.isZero()) continue;
      acc = acc.add(lPowers[m - t].mul(RatPi.fromGauss(c.mul(Gauss.int(binomial(m, t))))));
    }
    return acc;
  };

  let value = RatPi.ZERO;
  for (let j = 0; j < n; j++) {
    const a = pole.principalPart[j];
    if (a === undefined || a.isZero()) continue;
    value = value.add(RatPi.fromGauss(a).mul(coefficientAt(n - 1 - j)));
  }

  return {
    ok: true,
    value,
    order: n,
    argMultiple: L.argMultiple,
    certificate: exact(
      `Res(R(z)·log^${m} z, ${formatGauss(at)}) = ${formatRatPi(value)}`,
      "the Laurent principal part of R at z₀, convolved with the expansion of (log z₀ + log(1 + w/z₀))^m",
      {
        restriction: `arg z ∈ [${factor.argRange[0].n}/${factor.argRange[0].d}·π, ${factor.argRange[1].n}/${factor.argRange[1].d}·π)`,
        provenance: [
          {
            ok: true,
            text: `the pole has order ${n}, so ${n} Laurent coefficient(s) of R meet ${n} coefficient(s) of log^${m} — at order 2 the answer mixes both, and either half alone is a plausible wrong number`,
          },
          {
            ok: true,
            text: `log(${formatGauss(at)}) = ${formatRatPi(L.value)} in the declared determination, its argument verified exactly rather than read off atan2`,
          },
        ],
      },
    ),
  };
}
