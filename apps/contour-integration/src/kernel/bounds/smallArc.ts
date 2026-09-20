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
 * How large a denominator a swept angle may have before it is not a nameable multiple of π, and the
 * widest sweep that is read at all.
 *
 * **A CAP, NOT A LIST — the twin of `ledger.ts`'s `MAX_PI_DENOMINATOR`/`MAX_PI_MULTIPLE`.** This
 * reader held eight fractions until the cap was measured here: `2/5, 1/5, 5/6, 1/12, 1/8, 3/2, 4/3`
 * all read `null`, and the large-arc lemma on a `2π/5` arc of `1/(1+z⁵)` refused *"the swept angle is
 * not a recognised rational multiple of π"* about an arc that is one. M5.4 replaced the list in the
 * ledger for exactly that reason and the repair landed in one of the two readers, so the two had
 * different domains. The uniqueness argument is the ledger's, unchanged: two distinct rationals with
 * denominators at most 12 differ by at least `1/144 = 7e-3`, so the `1e-12` window below admits one
 * candidate or none and the reading is a decision rather than a fit. Not imported from `ledger.ts`,
 * which imports this module — the rule is copied, and this copy names its twin.
 */
const MAX_PI_DENOMINATOR = 12n;
const MAX_PI_MULTIPLE = 4;

/**
 * The signed sweep `(θ₁ − θ₀)/π` as an exact rational, for the rational multiples templates produce.
 *
 * Signed, unlike the large-arc extent: the SIGN is the whole difference between indenting above and
 * indenting below, and it is what ties `±iπ·Res` to the `∓iε` prescription rather than to a picture.
 *
 * A ZERO sweep answers `null` rather than `0`, which is the one place this parts from the ledger's
 * `asPiMultiple`: there, zero has to be expressible so that `wedgeArcBound` can refuse an arc that
 * does not start on the real axis, and `arcExtent` drops it a line later. Here the only consumers are
 * two lemmas whose contribution would be a vacuous `i·0·Res`, so a degenerate arc is refused at the
 * reader.
 */
export function signedSweepOverPi(g: Resolved): Frac | null {
  if (g.kind !== "arc") return null;
  const sweep = (g.theta1 - g.theta0) / Math.PI;
  if (!Number.isFinite(sweep)) return null; // `BigInt(Math.round(NaN))` throws, so this one bites
  // A sweep records this clause as EQUIVALENT rather than as a gap, and keeps it: below `1e-12`,
  // `Math.round(sweep·d)` is `0` for every `d ≤ 12` — the smallest sweep that rounds to a non-zero
  // numerator is `1/24` — so the loop's own `n === 0n` already answers null. It states the intent
  // (a degenerate arc is refused HERE rather than by an accident of the arithmetic below) and it is
  // where this reader parts from the disposal pass's twin, which must be able to answer `0`.
  if (Math.abs(sweep) < 1e-12) return null;
  if (Math.abs(sweep) > MAX_PI_MULTIPLE) return null;
  for (let d = 1n; d <= MAX_PI_DENOMINATOR; d++) {
    const n = BigInt(Math.round(sweep * Number(d)));
    if (n === 0n) continue;
    if (Math.abs(sweep - Number(n) / Number(d)) < 1e-12) return Frac.of(n, d);
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
        // Not the lemma's house number: this claim is printed, and a reader has no table to look
        // `L4` up in. The name is the one the app's own vocabulary uses for it.
        "the indentation lemma",
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
