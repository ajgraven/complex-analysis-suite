// `Res(R(z)·log^m z, z₀)` — against the gallery's own numbers, and against an independent quadrature.
//
// The exact route and the numeric one share no arithmetic: one is BigInt rationals over ℚ(i)[π], the
// other a trapezoid quadrature of `(1/2πi)∮ R log^m dz` in float64. On a circle around a pole the
// trapezoid is spectrally accurate — it integrates each Laurent term exactly bar aliasing — so at
// ρ = 1/4 the two agree to machine precision or the exact route is wrong.
import { describe, expect, it } from "vitest";
import { Frac, Gauss, QiPoly } from "@cas/exact";
import { logAtPole, logResidue } from "../src/kernel/logResidue.js";
import { formatRatPi, RatPi } from "../src/kernel/ratPi.js";

const g = (re: number, im = 0): Gauss => Gauss.int(re, im);
const f = (n: number, d = 1): Frac => Frac.of(BigInt(n), BigInt(d));
/** `arg z ∈ [0, 2π)` — the keyhole's determination. */
const KEYHOLE: readonly [Frac, Frac] = [f(0), f(2)];
/** `arg z ∈ (−π, π]`, as this codebase spells it: the principal determination. */
const PRINCIPAL: readonly [Frac, Frac] = [f(-1), f(1)];

/** `1 + z²`, `(1 + z²)²`, … */
const onePlusZSquared = QiPoly.fromCoeffs([Gauss.ONE, Gauss.ZERO, Gauss.ONE]);
const ONE = QiPoly.constant(Gauss.ONE);

// ── the independent numeric route ────────────────────────────────────────────────────────────────

type C = readonly [number, number];
const cmul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cadd = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const cdiv = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const cpow = (a: C, k: number): C => {
  let acc: C = [1, 0];
  for (let j = 0; j < k; j++) acc = cmul(acc, a);
  return acc;
};

/** `log z` in the declared determination — the same input the exact route is given. */
const clog = (z: C, range: readonly [Frac, Frac]): C => {
  const lo = range[0].toNumber() * Math.PI;
  const hi = range[1].toNumber() * Math.PI;
  let theta = Math.atan2(z[1], z[0]);
  while (theta < lo) theta += 2 * Math.PI;
  while (theta >= hi) theta -= 2 * Math.PI;
  return [Math.log(Math.hypot(z[0], z[1])), theta];
};

const evalPoly = (p: QiPoly, z: C): C => {
  let acc: C = [0, 0];
  for (let k = p.degree(); k >= 0; k--) acc = cadd(cmul(acc, z), p.coeff(k).toTuple());
  return acc;
};

/** `(1/2πi)∮_{|z−z₀|=ρ} R(z)·log^m z dz`, by the trapezoid rule. */
function numericResidue(
  num: QiPoly,
  den: QiPoly,
  at: Gauss,
  m: number,
  range: readonly [Frac, Frac],
  rho = 0.25,
  samples = 4096,
): C {
  const centre = at.toTuple();
  let sum: C = [0, 0];
  for (let k = 0; k < samples; k++) {
    const theta = (2 * Math.PI * k) / samples;
    const w: C = [rho * Math.cos(theta), rho * Math.sin(theta)];
    const z = cadd(centre, w);
    const value = cmul(cdiv(evalPoly(num, z), evalPoly(den, z)), cpow(clog(z, range), m));
    // dz = i·w·dθ, and the 1/2πi cancels the i: (1/2π)∫ f·w dθ.
    sum = cadd(sum, cmul(value, w));
  }
  return [sum[0] / samples, sum[1] / samples];
}

const agreesNumerically = (
  value: RatPi,
  num: QiPoly,
  den: QiPoly,
  at: Gauss,
  m: number,
  range: readonly [Frac, Frac],
): void => {
  const [re, im] = value.toNumber();
  const [nre, nim] = numericResidue(num, den, at, m, range);
  const scale = Math.max(1, Math.abs(re), Math.abs(im));
  expect(Math.abs(nre - re) / scale).toBeLessThan(1e-12);
  expect(Math.abs(nim - im) / scale).toBeLessThan(1e-12);
};

const must = (r: ReturnType<typeof logResidue>): RatPi => {
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};

// ── the gallery's own numbers ────────────────────────────────────────────────────────────────────

describe("D4: Res(log²z/(1+z²)², ±i) — a DOUBLE pole, where both halves matter", () => {
  const den = onePlusZSquared.mul(onePlusZSquared);

  it("matches the record at z = i", () => {
    const r = logResidue(ONE, den, g(0, 1), { power: 2, argRange: KEYHOLE });
    expect(r.ok && r.order).toBe(2);
    expect(formatRatPi(must(r))).toBe("iπ²/16 − π/4");
    agreesNumerically(must(r), ONE, den, g(0, 1), 2, KEYHOLE);
  });

  it("matches the record at z = −i, where arg is 3π/2 and not −π/2", () => {
    const r = logResidue(ONE, den, g(0, -1), { power: 2, argRange: KEYHOLE });
    expect(formatRatPi(must(r))).toBe("−9iπ²/16 + 3π/4");
    agreesNumerically(must(r), ONE, den, g(0, -1), 2, KEYHOLE);
  });

  it("sums to the record's Σ = π/2 − iπ²/2", () => {
    const a = must(logResidue(ONE, den, g(0, 1), { power: 2, argRange: KEYHOLE }));
    const b = must(logResidue(ONE, den, g(0, -1), { power: 2, argRange: KEYHOLE }));
    expect(formatRatPi(a.add(b))).toBe("−iπ²/2 + π/2");
  });
});

describe("D4's third fixture and D5's prerequisite, from the same engine", () => {
  it("gives Σ = −iπ² for log² over 1 + z², which is D4's R = 1/(1+x²) row", () => {
    // The record: "Σ = −iπ² so Re(Σ) = 0 exactly. Bonus T0 = π/2."
    const a = must(logResidue(ONE, onePlusZSquared, g(0, 1), { power: 2, argRange: KEYHOLE }));
    const b = must(logResidue(ONE, onePlusZSquared, g(0, -1), { power: 2, argRange: KEYHOLE }));
    expect(formatRatPi(a)).toBe("iπ²/8");
    expect(formatRatPi(b)).toBe("−9iπ²/8");
    expect(formatRatPi(a.add(b))).toBe("−iπ²");
    agreesNumerically(a, ONE, onePlusZSquared, g(0, 1), 2, KEYHOLE);
    agreesNumerically(b, ONE, onePlusZSquared, g(0, -1), 2, KEYHOLE);
  });

  it("gives ΣRes = −π/2 for a PLAIN log, which the keyhole turns into ∫dx/(1+x²) = π/2", () => {
    // The plain-log identity is −2πi·T0 = 2πi ΣRes, so T0 = −ΣRes. The log integral is lost and the
    // bonus one is exactly right, which is the whole of the `plain-log-loses-the-log-integral` trap.
    const a = must(logResidue(ONE, onePlusZSquared, g(0, 1), { power: 1, argRange: KEYHOLE }));
    const b = must(logResidue(ONE, onePlusZSquared, g(0, -1), { power: 1, argRange: KEYHOLE }));
    expect(formatRatPi(a)).toBe("π/4");
    expect(formatRatPi(b)).toBe("−3π/4");
    expect(formatRatPi(a.add(b))).toBe("−π/2");
  });

  it("is the plain rational residue at m = 0", () => {
    const a = must(logResidue(ONE, onePlusZSquared, g(0, 1), { power: 0, argRange: KEYHOLE }));
    expect(formatRatPi(a)).toBe("−i/2");
  });
});

describe("the determination is an INPUT to the answer", () => {
  it("gives a different residue at −i under the principal branch", () => {
    // arg(−i) is 3π/2 in the keyhole's range and −π/2 in the principal one. Nothing warns you.
    const keyhole = must(logResidue(ONE, onePlusZSquared, g(0, -1), { power: 2, argRange: KEYHOLE }));
    const principal = must(logResidue(ONE, onePlusZSquared, g(0, -1), { power: 2, argRange: PRINCIPAL }));
    expect(formatRatPi(keyhole)).toBe("−9iπ²/8");
    expect(formatRatPi(principal)).toBe("−iπ²/8");
    // And the numeric route agrees with EACH, because it is given the same determination.
    agreesNumerically(keyhole, ONE, onePlusZSquared, g(0, -1), 2, KEYHOLE);
    agreesNumerically(principal, ONE, onePlusZSquared, g(0, -1), 2, PRINCIPAL);
  });

  it("reads log z₀ itself in the declared range", () => {
    const keyhole = logAtPole(g(0, -1), KEYHOLE);
    expect(keyhole.ok && formatRatPi(keyhole.value)).toBe("3iπ/2");
    const principal = logAtPole(g(0, -1), PRINCIPAL);
    expect(principal.ok && formatRatPi(principal.value)).toBe("−iπ/2");
  });
});

describe("higher orders, checked against the quadrature rather than by hand", () => {
  const cases: readonly { name: string; den: QiPoly; at: Gauss; m: number }[] = [
    { name: "triple pole, log³", den: onePlusZSquared.pow(3), at: g(0, 1), m: 3 },
    { name: "triple pole, log²", den: onePlusZSquared.pow(3), at: g(0, 1), m: 2 },
    { name: "double pole, log³", den: onePlusZSquared.pow(2), at: g(0, -1), m: 3 },
    { name: "pole at −1, log²", den: QiPoly.fromCoeffs([Gauss.ONE, Gauss.ONE]), at: g(-1), m: 2 },
    { name: "pole at −1 doubled, log", den: QiPoly.fromCoeffs([Gauss.ONE, Gauss.ONE]).pow(2), at: g(-1), m: 1 },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const value = must(logResidue(ONE, c.den, c.at, { power: c.m, argRange: KEYHOLE }));
      agreesNumerically(value, ONE, c.den, c.at, c.m, KEYHOLE);
    });
  }

  it("carries a non-trivial numerator too", () => {
    // R = (z + 2)/(1 + z²)²: the principal part is no longer a bare reciprocal.
    const num = QiPoly.fromCoeffs([g(2), Gauss.ONE]);
    const den = onePlusZSquared.pow(2);
    const value = must(logResidue(num, den, g(0, 1), { power: 2, argRange: KEYHOLE }));
    agreesNumerically(value, num, den, g(0, 1), 2, KEYHOLE);
  });
});

describe("refusals, each naming what it saw", () => {
  it("refuses the origin, where log has a branch point and not a pole", () => {
    const r = logResidue(ONE, QiPoly.variable(), g(0), { power: 1, argRange: KEYHOLE });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/branch point at the origin/);
  });

  it("refuses a pole off the unit circle, because ℚ(i)(π) has no seat for ln|z₀|", () => {
    // R = 1/(z² + 4) has poles at ±2i. M4.5 gave the EXPONENT basis a logarithm, which is what lets
    // `z^α` read such a pole — but a log family's residues are polynomials in π, and dropping the
    // `ln 2` rather than refusing would return a confident wrong residue. D5's second gallery
    // fixture is exactly this integrand, and its answer `π log 2/4` says what the ring would need.
    const den = QiPoly.fromCoeffs([g(4), Gauss.ZERO, Gauss.ONE]);
    const r = logResidue(ONE, den, g(0, 2), { power: 2, argRange: KEYHOLE });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/ln\|z₀\| = ln 2/);
    expect(!r.ok && r.reason).toMatch(/no seat for a logarithm/);
  });

  it("refuses a point that is not a pole", () => {
    const r = logResidue(ONE, onePlusZSquared, g(1), { power: 1, argRange: KEYHOLE });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/is not a pole/);
  });

  it("refuses a removable singularity as loudly as a non-pole", () => {
    // (1 + z²)/(1 + z²)² is 1/(1+z²); at ±i it is still a pole, so use a genuine cancellation.
    const r = logResidue(onePlusZSquared, onePlusZSquared, g(0, 1), { power: 1, argRange: KEYHOLE });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/is not a pole/);
  });

  it("refuses a non-integer or negative power", () => {
    expect(logResidue(ONE, onePlusZSquared, g(0, 1), { power: -1, argRange: KEYHOLE }).ok).toBe(false);
    expect(logResidue(ONE, onePlusZSquared, g(0, 1), { power: 1.5, argRange: KEYHOLE }).ok).toBe(false);
  });

  it("refuses an argument range that is not one turn", () => {
    const r = logResidue(ONE, onePlusZSquared, g(0, 1), { power: 1, argRange: [f(0), f(1)] });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/covers exactly one turn/);
  });
});
