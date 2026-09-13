// **ONE BRANCH FACTOR, DECLARED — the shape both a record and the sandbox hand in.**
//
// A record says `z^{α−1}` by writing strings in its `branch` block: an exponent, an `argRange`, an
// orientation, a position, a rational cofactor. `families/branchFactor.ts` resolves those against
// the fixture's bindings and then builds three things out of them — the `PowerFactor`/`LogFactor`
// the residue reader consumes, the `BranchChoice` the ledger and the picture read, and the
// `DeclaredProduct` both backends evaluate. This module is that last step, with the resolving taken
// away: given values that are already exact, produce the three.
//
// **Why it is extracted now and not before (ADR-0007).** It had one consumer until M5.1. The
// sandbox is the second: it declares the same factor from a picker and a text box rather than from a
// record's strings, and it needs the identical three outputs or its answer is not the answer the
// gallery pins. Building them twice is how the two drift — and the drift would be invisible, because
// each side would look self-consistent.
//
// **The multi-point builder is deliberately NOT extracted.** `multiFactorOf` produces a
// `MultiPowerFactor`, whose points carry EXACT positions as `SqrtExt` — D6's `±1`, D7's `0` and `b`.
// A sandbox branch point is a dragged float, and `simplestRational` of a dragged coordinate is a
// fraction with a sixteen-digit denominator: honest, and useless as a residue. So the sandbox gets
// the single-factor path, which needs no position at all (see {@link buildDeclaration}), and the
// multi-point case waits for a design that says where its exact positions come from. Extracting it
// now would be extraction ahead of demand, which is the rule this module is obeying.
import { Frac } from "@cas/exact";
import type { LogFactor } from "../logResidue.js";
import type { PowerFactor } from "../branchResidue.js";
import type { Cx } from "../geom.js";
import type { DeclaredProduct } from "./declared.js";
import { INFINITY, type BranchChoice, type BranchPoint } from "./model.js";

/**
 * The order of a declared factor, with the multiplicity a `log` needs.
 *
 * Not {@link BranchPoint.order}: that is the GEOMETRY's notion, where a log point is just "a log"
 * because admissibility only cares that its monodromy has infinite order — no bounded component may
 * carry it, whatever the multiplicity. Here `log³` and `log²` are different integrands, so the
 * multiplicity is present. Keeping them separate is why `D5` can share a cut system with `D4`.
 */
export type DeclaredOrder =
  | {
      readonly kind: "power";
      readonly alpha: Frac;
      /** `+1` for a factor written `(z − b)`, `−1` for `(b − z)` — the same number, not the same power. */
      readonly sign: 1 | -1;
    }
  | {
      readonly kind: "log";
      /** `m` in `log^m`: a multiplicity, so a positive integer. `log^{1/2}` is a different structure. */
      readonly power: number;
    };

/** One branch factor, in exact values — what a record resolves to and what the sandbox picks. */
export interface Declaration {
  /** `c` in `c·(…)^α·R(z)`. */
  readonly constant: Cx;
  /**
   * Where the branch point sits ON THE REAL AXIS.
   *
   * Real because that is all the single-factor engine can use: `powerAtPole` reads `z₀^α` about the
   * ORIGIN and takes the pole's exact value from the pole-finder, so the position enters only as the
   * cut's geometry and the picture's. An off-axis or off-origin branch point needs the multi-point
   * engine and its exact `SqrtExt` positions — see this module's header.
   */
  readonly at: number;
  /** `arg(s·(z − b)) ∈ [lo·π, hi·π)`. Declaring this IS declaring where the cut runs. */
  readonly window: readonly [Frac, Frac];
  readonly order: DeclaredOrder;
}

export type BuiltDeclaration =
  | {
      readonly ok: true;
      /** For `analyse`'s `power` / `log` slot — one or the other, never both. */
      readonly factor:
        | { readonly kind: "power"; readonly value: PowerFactor }
        | { readonly kind: "log"; readonly value: LogFactor };
      /** The cut system the determination implies. */
      readonly choice: BranchChoice;
      /** The same declaration as something both backends can evaluate and draw. */
      readonly declared: DeclaredProduct;
    }
  | { readonly ok: false; readonly reason: string };

/** How far a cut ray is drawn before a geometric test clips it. Far enough to leave any picture. */
const REACH = 1e4;

/** The id the single branch point carries, in the geometry AND in the declared product. */
export const SINGLE_POINT_ID = "b";

/**
 * A window edge reduced into `[0, 2)` turns — the same ray, with the sheet count dropped.
 *
 * In units of π, so a full turn is 2. `Frac` has no `mod`, and floor-division on a negative
 * numerator is the usual place this kind of helper goes wrong, so it is written out.
 */
function turnsMod2(x: Frac): Frac {
  const two = Frac.of(2n);
  const q = x.div(two);
  // Floor of `q`, correct for negatives: BigInt division truncates toward zero.
  const t = q.n / q.d;
  const floor = q.n < 0n && t * q.d !== q.n ? t - 1n : t;
  return x.sub(two.mul(Frac.of(floor)));
}

/**
 * The cut system a determination implies.
 *
 * **The cut lies along the window's LOWER boundary**, because that is where the determination jumps:
 * `arg z ∈ [0, 2π)` puts it on ℝ₊ and `arg z ∈ (−π, π]` puts it on ℝ₋. So nothing states the cut's
 * position twice — declaring the determination is declaring where the cut runs, which is what makes
 * D1's `wrong-branch` trap structural rather than detected: ask for the principal determination and
 * the cut moves under the contour, and LEGALITY says so without being told to look.
 *
 * `at` stays a parameter even though {@link buildDeclaration} now refuses anything but the origin,
 * because the GEOMETRY is perfectly general — a cut from `b` to infinity is drawn the same way
 * wherever `b` is. What is origin-only is the residue reader, one layer up, and putting the
 * restriction there rather than here is what leaves this reusable when the multi-point case lands.
 *
 * One consequence worth writing down: a sweep that replaces `at` with `0` in the line below now
 * SURVIVES, and is recorded as equivalent rather than as a gap. It survives *because* of that
 * refusal — every call that reaches here has `d.at === 0`, so the two are the same value. Before the
 * refusal existed the same mutant also survived, and that was a real hole; the difference is the
 * reason, which is why it is written here rather than left to be rediscovered.
 */
function cutFromDetermination(at: number, lo: Frac, hi: Frac, order: BranchPoint["order"]): BranchChoice {
  // **BOTH THE RAY AND THE LABEL ARE READ MODULO WHOLE TURNS, because a SHEET is a whole-turn
  // offset** (M5.1d). Sheet 1 of the keyhole determination is `arg ∈ [2π, 4π)` — still the `[0, 2π)`
  // convention, one sheet up — and labelling it "custom" would invent a third convention out of a
  // bookkeeping integer.
  //
  // Reducing before the trigonometry rather than relying on 2π-periodicity is not fussiness: it is
  // the difference between "the cut does not move" being TRUE and being true to rounding. At sheet 3
  // `Math.sin(6π)` is `−7.3e-16` rather than `0`, so the ray tilts by a hair, and it tilts further
  // the higher the sheet. Reduced, the geometry is bit-identical on every sheet — which is what the
  // claim ought to mean in code and not only in prose.
  const base = turnsMod2(lo);
  const theta = base.toNumber() * Math.PI;
  const via: Cx = [at + REACH * Math.cos(theta), REACH * Math.sin(theta)];
  return {
    convention: base.isZero() ? "zeroToTwoPi" : turnsMod2(hi).equals(Frac.ONE) ? "principal" : "custom",
    points: [{ id: SINGLE_POINT_ID, at: [at, 0], order, label: `z = ${at}` }],
    cuts: [{ id: "Γ", from: SINGLE_POINT_ID, to: INFINITY, via: [via] }],
    basePoint: [at, 1],
    sheet: 0,
  };
}

/**
 * The three outputs one declared factor produces, or a reason it is not a factor.
 *
 * The refusals are the invariants the consuming engines assume and could not previously state:
 *
 * - **A window is exactly one turn wide.** `PowerFactor.argRange`'s own doc says so — a determination
 *   of `arg` covers one turn and no more — and nothing checked it. A width of 1 would make
 *   `argumentOfPole` answer for half the plane and refuse the rest, which reads as a residue bug.
 * - **A `log`'s multiplicity is a positive integer.** `logFactorOf` already refused this; the check
 *   moves here so both callers get it rather than one.
 *
 * - **The branch point is at the ORIGIN, and this is where that finally gets said.** A mutation
 *   sweep pinned `points[0].at` to `[0, 0]` regardless of what was declared and nothing noticed,
 *   which is how this was found: every single-factor record declares `at: "0"` (D1, D2, D4; D3 too),
 *   so a non-zero position was carried and never exercised. It is not merely untested — it is
 *   **wrong**. `branchResidue` is documented as `Res(z^α·R(z), z₀) = z₀^α·Res(R, z₀)`: literally
 *   `z^α`, about the origin, and {@link PowerFactor} carries no position for it to shift by. So a
 *   factor declared at `b ≠ 0` would draw its cut in the right place and read its residue about the
 *   wrong point — `z₀^α` where `(z₀ − b)^α` is meant — with nothing to warn you. The multi-point
 *   engine does carry exact positions and is the route for that case; here it refuses by name.
 *
 * Neither of the first two narrows what the corpus accepts: every record's window is `[0, 2]` or
 * `[−1, 1]`, and every log multiplicity is 2 or 3. Nor does the third: every record that takes this
 * builder declares its branch point at `0`, and D7's `at: "b"` goes to the multi-point builder.
 * `test/declaration.test.ts` pins that the extraction is a no-op for all seven of them, output by
 * output — and the extraction itself was checked more strongly still, by dumping every record's full
 * declaration before and after and diffing it byte for byte.
 */
export function buildDeclaration(d: Declaration): BuiltDeclaration {
  const [lo, hi] = d.window;
  if (d.at !== 0) {
    return {
      ok: false,
      reason:
        `the branch point is declared at z = ${d.at}, and the single-factor residue reader is about ` +
        "the ORIGIN: it computes Res(z^α·R, z₀) = z₀^α·Res(R, z₀), so a factor at b ≠ 0 would need " +
        "(z₀ − b)^α and there is nowhere in a PowerFactor to put b. A branch point away from the " +
        "origin needs the multi-point engine, which carries its positions exactly",
    };
  }
  if (!hi.sub(lo).equals(Frac.of(2n))) {
    return {
      ok: false,
      reason:
        `the argument window [${lo.n}/${lo.d}·π, ${hi.n}/${hi.d}·π) is ${hi.sub(lo).n}/${hi.sub(lo).d} ` +
        "turns wide; a determination of arg covers exactly one turn (width 2 in units of π), so this " +
        "one either leaves part of the plane undetermined or covers part of it twice",
    };
  }

  if (d.order.kind === "log") {
    const { power } = d.order;
    if (!Number.isInteger(power) || power < 1) {
      return { ok: false, reason: `log^${power} is not a positive integer power` };
    }
    return {
      ok: true,
      factor: { kind: "log", value: { power, argRange: [lo, hi] } },
      choice: cutFromDetermination(d.at, lo, hi, { kind: "log" }),
      declared: {
        constant: d.constant,
        factors: [{ kind: "log", id: SINGLE_POINT_ID, at: [d.at, 0], power, window: lo }],
      },
    };
  }

  const { alpha, sign } = d.order;
  return {
    ok: true,
    factor: { kind: "power", value: { alpha, argRange: [lo, hi] } },
    choice: cutFromDetermination(d.at, lo, hi, { kind: "power", alpha }),
    declared: {
      constant: d.constant,
      factors: [
        {
          kind: "power",
          // The SAME id the geometry's single point carries — one source of truth, so
          // `declaredReference` cannot key a map the cut system does not answer to. M5.0's review
          // found that bug the other way round and this is where it stays fixed.
          id: SINGLE_POINT_ID,
          at: [d.at, 0],
          alpha: alpha.toNumber(),
          sign,
          window: lo,
        },
      ],
    },
  };
}
