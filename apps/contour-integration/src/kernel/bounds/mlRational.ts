// The certified arc bound: `|∫_arc f dz| ≤ θ·R·M(R)`, computed in exact ℚ.
//
// This is the app's thesis in one function. PLAN.md §3.2 argues it at length; the short version is
// that for a rational integrand the bound needs **no transcendental functions at all**:
//
//     |P(z)| ≤ Σ|aₖ|Rᵏ                      (triangle inequality)
//     |Q(z)| ≥ |b_q|R^q − Σ_{k<q}|bₖ|Rᵏ     (reverse triangle inequality)
//
// Everything there is `+ × ÷` on non-negative rationals, except the coefficient moduli `√(re²+im²)`
// — and those have exact rational bounds from `ratBound`. So the whole thing runs in BigInt ℚ, with
// no floating point, no directed-rounding argument, and no appeal to the accuracy of `Math`. Which
// matters, because ECMA-262 gives `Math.exp` and friends no ulp bound whatsoever, so an interval
// library built on them is a heuristic wearing a proof's clothes (research 04 §5).
//
// It also **derives the degree condition rather than asserting it**. `M(R) ~ (|a_p|/|b_q|)R^{p−q}`,
// so the bound behaves like `R^{p−q+1}`, which vanishes exactly when `deg Q ≥ deg P + 2`. The
// textbook hypothesis falls out of the arithmetic instead of being checked alongside it.
import { Frac, QiPoly, piUpper } from "@cas/exact";
import { dampedArcIntegral } from "./linearMinorant.js";
import { bound, refuse, type Certificate } from "@cas/rigor";
import { fracCmp, sqrtDown, sqrtUp } from "./ratBound.js";

/**
 * What happens to the bound as the limit parameter runs to its limit.
 *
 * **`"unestablished"` is not a fourth asymptotic regime; it is the absence of one.** A producer that
 * REFUSES has computed no bound, so it knows nothing about the limit — and the three values above are
 * each a claim. Saying `"vanishes"` there was measured to mark a refused row *satisfied*
 * (`1/(1+z²)` on the semicircle at `R = 0.5`: a `⚠` certificate beside `status = satisfied`, and a
 * headline saying the argument closes about `target = 0` where the true value is 0.9273), because the
 * one field the row's status was read from carried the degree gap's asymptotics rather than the
 * refusal's. Every refusal in this directory that reaches no bound answers `"unestablished"`; a
 * refusal that DID reach a bound and is merely reporting that it does not discharge keeps its true
 * asymptotics, since that is exactly what it established.
 */
export type ArcAsymptotics = "vanishes" | "bounded" | "diverges" | "unestablished";

/**
 * The name {@link ArcBound.evaluated} uses when the caller does not supply one.
 *
 * Every producer here is handed a RADIUS and no name — the ledger reads the geometry, not the
 * contour's parameter table — so the name is passed down from `ledger.ts`, which takes it off the
 * piece's own `Geom` (`radius: {param: "R"}`). This is the fallback for a piece whose geometry is a
 * literal, which over the 28-record corpus is none of them: it is reached by the sandbox, where a
 * hand-drawn arc has no parameter at all. `"R"` rather than `""` because it is the symbol these
 * producers' own sentences already print.
 */
export const DEFAULT_RADIUS_PARAM = "R";

export interface ArcBound {
  /** The radius the bound was evaluated at. */
  readonly R: Frac;
  /** `|∫_arc f dz| ≤ value`, exactly — present unless the bound could not be established at all. */
  readonly value?: Frac;
  readonly asymptotics: ArcAsymptotics;
  /**
   * The bound behaves like `R^exponent` — **or `e^{exponent·R^k}` for the exponential producers.**
   *
   * `stripSide.ts` writes `Re(a) + deg N − deg D`, the RATE in `e^{κR}`, and `gaussianSide.ts` writes
   * the rate in `e^{κR²}`; neither is a power of `R`, and a reader taking the field at the word
   * "power" about a strip side would be off by an exponential. **Only the SIGN is contractual**, and
   * it is the same sign in both readings: negative ⇒ the bound vanishes in the limit.
   */
  readonly exponent: number;
  /**
   * `deg Q − deg P`, the quantity the classical hypothesis is stated in.
   *
   * **Absent when the decay is not governed by a degree gap.** `wedgeArc.ts` bounds `λ·e^{w zⁿ}`,
   * which has no rational cofactor at all: its decay comes from `n`, carried in {@link exponent}.
   * Reporting `0` there would name a quantity that is not the hypothesis — and `0` is a meaningful
   * value elsewhere in this file (it is what makes Jordan's bound fail to vanish), so it could not
   * be read as "not applicable".
   */
  readonly degreeGap?: number;
  /**
   * The bound as three numbers a reader can watch move — M8 step 3.2.
   *
   * `param` is the contour parameter the bound was taken at, `at` its value there, `bound` the
   * numeric value of the certified bound.
   *
   * **Present exactly when a bound was ESTABLISHED, which is a strict superset of {@link value}.**
   * Measured over this directory: four producers put their bound in `value` (`mlArcBound`,
   * `jordanArcBound`, `wedgeArcBound`, `squareSideBound`) and five do not — `branchArc`'s two forms,
   * `logArc`, `stripSide` and `gaussianSide` compute `ρ^α`, `ln ρ` or `e^{κR}`, and `value` is
   * documented as an EXACT `Frac`, so each of them deliberately omits it and puts the float in its
   * own sentence. Those five are precisely the records whose bound a reader most wants to watch
   * shrink, so gating `evaluated` on `value` would have left tier D, E and F with nothing to scrub.
   * `bound` is a `number` for the same reason, and equals `value.toNumber()` wherever both exist.
   */
  readonly evaluated?: { readonly param: string; readonly at: number; readonly bound: number };
  readonly certificate: Certificate;
}

/** `Σ |aₖ| Rᵏ`, rounded UP — an upper bound on `|P(z)|` for `|z| = R`. */
export function coefficientUpperBound(p: QiPoly, R: Frac): Frac {
  let total = Frac.ZERO;
  let power = Frac.ONE;
  for (let k = 0; k <= p.degree(); k++) {
    const c = p.coeff(k);
    if (!c.isZero()) {
      const modulusSquared = c.re.mul(c.re).add(c.im.mul(c.im));
      total = total.add(sqrtUp(modulusSquared).mul(power));
    }
    power = power.mul(R);
  }
  return total;
}

/**
 * `|b_q|R^q − Σ_{k<q}|bₖ|Rᵏ`, rounded DOWN — a lower bound on `|Q(z)|` for `|z| = R`.
 *
 * A *positive* result does double duty: it certifies the bound, and it certifies that every root of
 * `Q` lies strictly inside `|z| = R`, since `Q` cannot vanish where `|Q| > 0`. The pole-enclosure
 * hypothesis and the arc bound come from the same inequality.
 */
export function denominatorLowerBound(q: QiPoly, R: Frac): Frac {
  const top = q.degree();
  if (top < 0) return Frac.ZERO;
  const lead = q.coeff(top);
  const leadModulusSquared = lead.re.mul(lead.re).add(lead.im.mul(lead.im));

  // R^top, then the leading term |b_q|·R^q. (An earlier version multiplied by R once more here,
  // inflating the denominator bound by a factor of R and so making M(R) too SMALL — a "bound" below
  // the true maximum, which is the dangerous direction. The sampled-max test caught it.)
  let power = Frac.ONE;
  for (let k = 0; k < top; k++) power = power.mul(R);
  let total = sqrtDown(leadModulusSquared).mul(power);

  power = Frac.ONE;
  for (let k = 0; k < top; k++) {
    const c = q.coeff(k);
    if (!c.isZero()) {
      const modulusSquared = c.re.mul(c.re).add(c.im.mul(c.im));
      total = total.sub(sqrtUp(modulusSquared).mul(power));
    }
    power = power.mul(R);
  }
  return total;
}

/** The lowest index with a non-zero coefficient — `ord₀ p`, the order of vanishing at the origin. */
export function orderAtZero(p: QiPoly): number {
  for (let k = 0; k <= p.degree(); k++) if (!p.coeff(k).isZero()) return k;
  return 0; // the zero polynomial; the caller has already refused that case
}

/**
 * `|b_m|ρ^m − Σ_{k>m}|bₖ|ρᵏ` with `m = ord₀ Q`, rounded DOWN — a lower bound on `|Q|` for SMALL `ρ`.
 *
 * The mirror image of {@link denominatorLowerBound}, which only works for LARGE `ρ`: that one keeps
 * the leading term and subtracts the rest, which for `1 + z` at `ρ = 1/1000` gives `ρ − 1 < 0` and
 * refuses a bound that plainly exists. Near the origin it is the LOWEST term that dominates, so the
 * roles swap — `1 − ρ` here — and a positive result again does double duty, since it certifies that
 * no root of `Q` lies inside `|z| = ρ`.
 *
 * It was written beside its only consumer, the keyhole's inner circle (ADR-0007), and moved here
 * when `logArc.ts` became the second — which is the same rule read the other way round.
 */
export function denominatorLowerBoundNearZero(q: QiPoly, rho: Frac): Frac {
  const low = orderAtZero(q);
  if (q.degree() < 0) return Frac.ZERO;
  const modulus = (k: number): Frac => {
    const c = q.coeff(k);
    return c.re.mul(c.re).add(c.im.mul(c.im));
  };
  let power = Frac.ONE;
  for (let k = 0; k < low; k++) power = power.mul(rho);
  let total = sqrtDown(modulus(low)).mul(power);
  for (let k = low + 1; k <= q.degree(); k++) {
    power = power.mul(rho);
    if (!q.coeff(k).isZero()) total = total.sub(sqrtUp(modulus(k)).mul(power));
  }
  return total;
}

const positive = (f: Frac): boolean => f.n > 0n;

/**
 * The ML bound for `P/Q` on a circular arc of radius `R` subtending `piMultiple · π`.
 *
 * `piMultiple` is a rational because every arc in the gallery subtends a rational multiple of π —
 * a semicircle is `1`, a full circle `2`, a quarter `1/2`. The π itself comes from
 * `@cas/exact`'s certified bracket, so the arc length is bounded above without a floating constant
 * anywhere in the chain.
 */
export function mlArcBound(
  num: QiPoly,
  den: QiPoly,
  R: Frac,
  piMultiple: Frac,
  param = DEFAULT_RADIUS_PARAM,
): ArcBound {
  const degP = num.degree();
  const degQ = den.degree();
  const degreeGap = degQ - degP;
  const exponent = degP - degQ + 1;
  const asymptotics: ArcAsymptotics =
    exponent < 0 ? "vanishes" : exponent === 0 ? "bounded" : "diverges";

  if (!positive(R)) {
    return {
      R,
      asymptotics: "unestablished",
      exponent,
      degreeGap,
      certificate: refuse("the arc bound", "the radius must be positive"),
    };
  }

  const denLow = denominatorLowerBound(den, R);
  if (!positive(denLow)) {
    // Not a failure of the method: below the Cauchy root bound a pole may lie ON or outside the arc,
    // and then there is genuinely no bound of this form. Enlarging R is the repair. The asymptotics
    // are `"unestablished"` rather than the degree gap's: nothing here was bounded, so the limit is
    // not a thing this call knows about.
    return {
      R,
      asymptotics: "unestablished",
      exponent,
      degreeGap,
      certificate: refuse(
        `the arc bound at $R = ${R.toNumber()}$`,
        "the reverse triangle inequality gives no positive lower bound on $|Q|$ there, so a pole may lie on or outside the arc — take a larger $R$",
      ),
    };
  }

  const numHigh = coefficientUpperBound(num, R);
  const maxModulus = numHigh.div(denLow); // ≥ max |f| on |z| = R
  const value = piMultiple.mul(piUpper()).mul(R).mul(maxModulus);

  const claim = `the arc: $\\left|\\int f\\,dz\\right| \\le ${value.toNumber().toExponential(3)}$ at $R = ${R.toNumber()}$`;
  const evaluated = { param, at: R.toNumber(), bound: value.toNumber() };
  const because =
    asymptotics === "vanishes"
      ? `and $\\to 0$ as $R \\to \\infty$, since $\\deg Q - \\deg P = ${degreeGap} \\ge 2$ makes the bound $O(R^{${exponent}})$`
      : asymptotics === "bounded"
        ? `but it does not vanish: $\\deg Q - \\deg P = ${degreeGap}$, so the bound is $O(1)$ and this lemma establishes nothing in the limit`
        : `and it diverges as $R \\to \\infty$: $\\deg Q - \\deg P = ${degreeGap}$, so the bound is $O(R^{${exponent}})$`;

  return {
    R,
    value,
    evaluated,
    asymptotics,
    exponent,
    degreeGap,
    certificate:
      asymptotics === "vanishes"
        ? bound("≤", `${claim}, ${because}`, "an exact $\\mathbb{Q}$ coefficient bound; no floating point anywhere", {
            provenance: [
              { ok: true, text: "$|P| \\le \\sum_k |a_k| R^k$ by the triangle inequality, with each $|a_k|$ bounded above in $\\mathbb{Q}$" },
              { ok: true, text: `$|Q| \\ge ${denLow.toNumber().toExponential(3)} > 0$, which also certifies that every pole lies strictly inside $|z| = R$` },
              { ok: true, text: "$\\pi$ bounded above by a certified rational (Machin's formula and an alternating series)" },
            ],
          })
        : refuse(`${claim}, ${because}`, "an exact $\\mathbb{Q}$ coefficient bound — the bound holds, the lemma does not discharge", {
            provenance: [
              { ok: true, text: `the bound itself is valid at $R = ${R.toNumber()}$` },
              { ok: false, text: "but it does not tend to zero, so the lemma does not discharge" },
            ],
          }),
  };
}

/**
 * Jordan's lemma for `g(z)·e^{iaz}` on a semicircular arc: `|∫| ≤ (π/a)·max|g|`, **independent of R**.
 *
 * The whole content is `∫₀^π e^{−κ sinθ} dθ ≤ π/κ`, from `sin θ ≥ 2θ/π` on `[0, π/2]`. It beats the
 * plain ML bound by the entire factor `aR`, which is what weakens the hypothesis from
 * `g = O(|z|^{-1-ε})` to merely `g → 0` — and that gap is exactly what makes `∫ x sin x/(1+x²) dx`
 * reachable at all.
 *
 * **The sign of `a` is a hard branch, not a convention.** `|e^{iaz}| = e^{−a·Im z}` is bounded only
 * where `a·Im z ≥ 0`. Close the wrong way and there is no bound: the integrand grows like `e^{aR}`.
 * Reporting that plainly is the point — it is the app's demonstration that a wrong contour fails for
 * a reason, rather than merely failing.
 */
/** The semicircle's angular extent, in units of π — the range Jordan's bound is taken over. */
const SEMICIRCLE = Frac.ONE;

/**
 * The arc Jordan's bound is being asked about, in units of π — `wedgeArcBound`'s `WedgeArc` shape.
 *
 * Optional only so that a caller written before the extent was read still compiles; absent, the
 * bound REFUSES. It may not default to a semicircle, which is what it used to assume.
 */
export interface JordanArc {
  readonly from: Frac;
  readonly to: Frac;
}

/**
 * Is the arc contained in the half-plane the bound is being taken over?
 *
 * `[0, π]` for the upper half and `[−π, 0]` or `[π, 2π]` for the lower — the two windows a template
 * or a drag can produce. Orientation is irrelevant (a clockwise arc sweeps the same set), so the
 * endpoints are ordered first. A window outside those two is refused rather than reduced modulo 2π:
 * refusing is always sound, and an arc reaching `[2π, 3π]` is a shape no piece in the app draws.
 */
function containedInHalfPlane(arc: JordanArc, half: "upper" | "lower"): boolean {
  const lo = fracCmp(arc.from, arc.to) <= 0 ? arc.from : arc.to;
  const hi = fracCmp(arc.from, arc.to) <= 0 ? arc.to : arc.from;
  const within = (a: Frac, b: Frac): boolean => fracCmp(lo, a) >= 0 && fracCmp(hi, b) <= 0;
  return half === "upper"
    ? within(Frac.ZERO, Frac.ONE)
    : within(Frac.ONE.neg(), Frac.ZERO) || within(Frac.ONE, Frac.of(2n));
}

/** An angle in units of π, as a reader writes one: `0`, `\pi`, `-\pi`, `3\pi/2`. */
const piUnits = (f: Frac): string => {
  if (f.isZero()) return "0";
  const head = f.n === 1n ? "" : f.n === -1n ? "-" : `${f.n}`;
  return f.d === 1n ? `${head}\\pi` : `${head}\\pi/${f.d}`;
};

export function jordanArcBound(
  gNum: QiPoly,
  gDen: QiPoly,
  a: Frac,
  half: "upper" | "lower",
  R: Frac,
  param = DEFAULT_RADIUS_PARAM,
  arc?: JordanArc,
): ArcBound {
  const degreeGap = gDen.degree() - gNum.degree();
  const correctHalf = (a.n > 0n && half === "upper") || (a.n < 0n && half === "lower");

  if (a.isZero()) {
    return {
      R,
      asymptotics: "unestablished",
      exponent: 0,
      degreeGap,
      certificate: refuse(
        "Jordan's lemma",
        "it needs a non-zero frequency; at $a = 0$ the exponential is $1$ and the ML-estimate applies instead",
      ),
    };
  }

  // **THE ARC'S EXTENT IS PART OF THE HYPOTHESIS, NOT OF THE PICTURE.** `|e^{iaz}| = e^{-a\,Im z}` is
  // bounded on ONE half-plane, so a bound taken over `[0, π]` says nothing about an arc that leaves
  // it — and until this was read, the extent was assumed: a full circle at `R = 4` on
  // `e^{iz}/(1+z^2)` certified `≤ 2.094e-1` at level `≤`, where `∫|f||dz| = 1.841e+1`, 88× the
  // claimed bound, on an arc whose integrand grows like `e^R` over half its length. A SUB-arc of the
  // right half-plane stays sound — `∫_sub ≤ ∫_{[0,π]}` term by term, so the constant below still
  // dominates — which is why containment is the whole question and the extent is not otherwise used.
  if (arc === undefined) {
    return {
      R,
      asymptotics: "unestablished",
      exponent: -degreeGap,
      degreeGap,
      certificate: refuse(
        "Jordan's lemma",
        "it is stated on an arc inside one half-plane, and this arc's angular extent was not supplied — a bound taken over a half-turn is not a bound on an arc that leaves it",
      ),
    };
  }
  if (!containedInHalfPlane(arc, half)) {
    return {
      R,
      asymptotics: "unestablished",
      exponent: -degreeGap,
      degreeGap,
      certificate: refuse(
        `Jordan's lemma on the arc from $${piUnits(arc.from)}$ to $${piUnits(arc.to)}$`,
        `it is stated on an arc contained in the ${half} half-plane — $[0,\\pi]$ for the upper, $[-\\pi,0]$ or $[\\pi,2\\pi]$ for the lower — and this arc leaves it, where $|e^{iaz}|$ grows like $e^{|a|R}$ rather than being bounded`,
        {
          provenance: [
            { ok: false, text: `the arc sweeps $${piUnits(arc.from)}$ to $${piUnits(arc.to)}$, which is not inside the ${half} half-plane` },
            { ok: true, text: "suggested repair: split the arc at the real axis, and close each half through the half-plane its exponential decays in" },
          ],
        },
      ),
    };
  }

  if (!correctHalf) {
    return {
      R,
      asymptotics: "diverges",
      exponent: Number.POSITIVE_INFINITY,
      degreeGap,
      certificate: refuse(
        `the ${half} semicircle diverges for $a = ${a.toNumber()}$`,
        `$|e^{iaz}| = e^{-a\\,\\operatorname{Im} z}$ is bounded only where $a\\,\\operatorname{Im} z \\ge 0$, so on the ${half} half-plane it grows like $e^{|a|R}$ — the arc cannot be closed this way`,
        {
          provenance: [
            { ok: false, text: `$a = ${a.toNumber()}$ requires the ${a.n > 0n ? "upper" : "lower"} half-plane` },
            { ok: true, text: "suggested repair: close the contour through the other half-plane" },
          ],
        },
      ),
    };
  }

  const denLow = denominatorLowerBound(gDen, R);
  if (!positive(denLow)) {
    return {
      R,
      // Not the degree gap's verdict: `max|g|` was never bounded, so this call establishes nothing
      // about the limit — the same correction `mlArcBound` takes one refusal above.
      asymptotics: "unestablished",
      exponent: -degreeGap,
      degreeGap,
      certificate: refuse(
        `Jordan's bound at $R = ${R.toNumber()}$`,
        "no positive lower bound on $|Q|$ there — take a larger $R$",
      ),
    };
  }

  const maxG = coefficientUpperBound(gNum, R).div(denLow);
  const absA = a.n < 0n ? a.neg() : a;

  // **THE ONE PREDICATE (M5.2).** Jordan's whole content is `∫₀^π e^{−κ sinθ}dθ ≤ π/κ`, and that is
  // `dampedArcIntegral` at a range of π in the `sin` face — the SAME call the wedge lemma makes, in
  // the same module, so `sin ψ ≥ 2ψ/π` is asserted in exactly one place in the engine. The constant
  // is `1` here (the semicircle needs the symmetry fold), so this is byte-for-byte the bound it
  // replaces; `test/wedgeArc.test.ts` pins that it is.
  //
  // The range stays the WHOLE half-turn even for a sub-arc, and that is the conservative direction:
  // `∫_sub e^{−κ sin ψ} dψ ≤ ∫₀^π`, so the same constant dominates. The arc's own extent is spent on
  // the containment decision above and nowhere else.
  const damped = dampedArcIntegral(SEMICIRCLE, "sin");
  if (damped.constant === null) {
    return { R, asymptotics: "unestablished", exponent: 0, degreeGap, certificate: damped.certificate };
  }
  const value = damped.constant.mul(piUpper()).div(absA).mul(maxG);
  const asymptotics: ArcAsymptotics = degreeGap >= 1 ? "vanishes" : "bounded";
  // A half-turn is a semicircle and anything shorter is an arc. The word was "semicircle"
  // unconditionally, which printed "the upper semicircle" about a full circle.
  const sweep = arc.to.sub(arc.from);
  const isHalfTurn = Frac.of(sweep.n < 0n ? -sweep.n : sweep.n, sweep.d).equals(SEMICIRCLE);
  const shape = `the ${half} ${isHalfTurn ? "semicircle" : "arc"}`;

  return {
    R,
    value,
    evaluated: { param, at: R.toNumber(), bound: value.toNumber() },
    asymptotics,
    exponent: -degreeGap,
    degreeGap,
    certificate:
      asymptotics === "vanishes"
        ? bound(
            "≤",
            `${shape}: $\\left|\\int g(z)e^{iaz}\\,dz\\right| \\le (\\pi/|a|)\\max|g| \\le ${value.toNumber().toExponential(3)}$ at $R = ${R.toNumber()}$, and $\\to 0$ as $R \\to \\infty$ since $\\max|g| = O(R^{${-degreeGap}})$`,
            "Jordan's lemma, with $\\max|g|$ from the exact $\\mathbb{Q}$ coefficient bound",
            {
              provenance: [
                { ok: true, text: damped.certificate.claim },
                { ok: true, text: `established by: ${damped.certificate.method}` },
                { ok: true, text: "the bound is independent of $R$" },
                { ok: true, text: `$\\deg Q - \\deg P = ${degreeGap} \\ge 1$, so $\\max|g| \\to 0$` },
              ],
            },
          )
        : refuse(
            `Jordan's bound does not vanish: $\\max|g|$ stays $O(1)$ since $\\deg Q - \\deg P = ${degreeGap}$`,
            "Jordan's lemma — the bound holds, the lemma does not discharge",
          ),
  };
}

/** Exported for tests and for the ledger's display of the intermediate quantity. */
export const maxModulusBound = (num: QiPoly, den: QiPoly, R: Frac): Frac | null => {
  const low = denominatorLowerBound(den, R);
  return positive(low) ? coefficientUpperBound(num, R).div(low) : null;
};

export { fracCmp };
