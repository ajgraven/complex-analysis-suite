// L4, the small-arc lemma — the one piece in the catalogue that does NOT vanish.
//
// An indentation over a simple pole contributes `iα·Res` in the limit `ρ → 0`, where `α` is the
// SIGNED swept angle. That is the whole content of the indented-contour method, and the two classical
// wrong answers are each one factor away from it: `2πi·Res` (the value of a FULL turn around an
// ENCLOSED pole — and this pole is not enclosed, it is detoured around) gives twice the truth, and
// "the small arc vanishes" gives zero.
//
// L4 IS FALSE AT A POLE OF ORDER ≥ 2, and that is not a technicality to wave through. There is no
// fractional residue for a double pole: `∫_{C_ρ} e^{iz}/z² dz = −2/ρ + O(1)`, which diverges, so the
// contour argument does not close and no principal value exists either. This refuses there.
//
// UNITS OF π. The contribution is `iα·Res` with `α` a rational multiple of π, so it is `π` times an
// element of the exponential basis — exactly like `2πi Σ Res`, which is `π · 2i Σ`. Working in those
// units is what lets the whole Pass-5 system stay exact without ever needing π itself.
import { Frac, Gauss, SqrtExt } from "@cas/exact";
import { LATEX } from "../notation.js";
import { exact, refuse, type Certificate } from "@cas/rigor";
import { ExpSum, formatExpSum, jordanExponent } from "../expSum.js";
import { formatFrac } from "../formatExact.js";
import type { Cx, Resolved } from "../geom.js";
import type { AlgebraicPole } from "../algebraic.js";

export interface SmallArcLimit {
  readonly at: Cx;
  /** The signed swept angle as a multiple of π: `−1` for a clockwise half-turn. */
  readonly sweptAnglePi: Frac;
  /** `iα·Res`, in units of π — i.e. `i·(α/π)·Res`. */
  readonly contribution: ExpSum;
  readonly certificate: Certificate;
}

export type SmallArcResult =
  | { readonly ok: true; readonly limit: SmallArcLimit }
  | { readonly ok: false; readonly certificate: Certificate };

/**
 * The signed sweep `(θ₁ − θ₀)/π` as an exact rational, for the rational multiples templates produce.
 *
 * Signed, unlike the large-arc extent: the SIGN is the whole difference between indenting above and
 * indenting below, and it is what ties `±iπ·Res` to the `∓iε` prescription rather than to a picture.
 */
export function signedSweepOverPi(g: Resolved): Frac | null {
  if (g.kind !== "arc") return null;
  const sweep = (g.theta1 - g.theta0) / Math.PI;
  for (const [n, d] of [
    [1n, 1n],
    [1n, 2n],
    [1n, 3n],
    [2n, 3n],
    [1n, 4n],
    [3n, 4n],
    [1n, 6n],
    [2n, 1n],
  ] as const) {
    const q = Number(n) / Number(d);
    if (Math.abs(sweep - q) < 1e-12) return Frac.of(n, d);
    if (Math.abs(sweep + q) < 1e-12) return Frac.of(-n, d);
  }
  return null;
}

/** How far a point may be from the arc's centre and still count as the point being indented. */
const CENTRE_TOLERANCE = 1e-12;

/**
 * The exact limit of an indentation, or a refusal naming what stopped it.
 *
 * `frequency` is the `a` of `g(z)·e^{iaz}` when the integrand has that shape, so the residue carries
 * its exponential factor; `undefined` for a purely rational integrand.
 */
export function smallArcLimit(
  geom: Resolved,
  poles: readonly AlgebraicPole[],
  frequency?: Frac,
): SmallArcResult {
  if (geom.kind !== "arc") {
    return { ok: false, certificate: refuse("the indentation lemma", "it applies to an arc") };
  }

  const sweptAnglePi = signedSweepOverPi(geom);
  if (sweptAnglePi === null) {
    return {
      ok: false,
      certificate: refuse(
        "the indentation lemma",
        "the swept angle is not a recognised rational multiple of $\\pi$, so $i\\alpha\\operatorname{Res}$ is not exact",
      ),
    };
  }

  const centre = geom.center;
  const at = poles.find(
    (p) => {
      const [x, y] = p.at.toTuple();
      return Math.hypot(x - centre[0], y - centre[1]) < CENTRE_TOLERANCE;
    },
  );
  if (at === undefined) {
    return {
      ok: false,
      certificate: refuse(
        "the indentation lemma",
        "no exactly-known pole sits at the centre of this arc, so there is nothing being indented",
      ),
    };
  }

  if (at.order !== 1) {
    return {
      ok: false,
      certificate: refuse(
        "L4",
        `the indented pole has order ${at.order}, and the indentation lemma is false for order $\\ge 2$ — ` +
          "the integral over the $\\rho$-arc grows like $\\rho^{1-m}$, so the limit does not exist and no principal value does either",
      ),
    };
  }

  const residue =
    frequency === undefined
      ? ExpSum.fromSqrtExt(at.residue)
      : ExpSum.of(at.residue, jordanExponent(frequency, at.at));

  // iα·Res in units of π is i·(α/π)·Res.
  const contribution = residue.scale(SqrtExt.fromGauss(new Gauss(Frac.ZERO, sweptAnglePi)));

  return {
    ok: true,
    limit: {
      at: at.at.toTuple(),
      sweptAnglePi,
      contribution,
      certificate: exact(
        `the indentation contributes $i\\alpha\\operatorname{Res} = \\pi(${formatExpSum(contribution, LATEX)})$, swept angle $\\alpha = ${formatFrac(sweptAnglePi, LATEX)}\\pi$`,
        "the indentation lemma at a simple pole; the sign comes from the signed swept angle $\\theta_1 - \\theta_0$",
      ),
    },
  };
}
