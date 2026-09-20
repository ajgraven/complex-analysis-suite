// Reading `parameters[].constraints` — the record's own statement of where its argument holds.
//
// The field was write-only prose until the 2026-09-20 review measured what that costs: D1 declares
// `alpha > 0, alpha < 1` and the slider ran −10 … 10, so dragging `α` to 1.5 put the app on a
// DIVERGENT integral, and D7's `mu` slider offered values at which the residue-at-infinity phase
// costs more arithmetic than a frame can hold. Outside the declared range a record has nothing to
// say, so the control stops going there.
//
// **THE READER IS TOTAL.** Every string in the corpus is either read into one of the four readings
// below or REFUSED by name, and `constraints.test.ts` enumerates all 27 distinct strings and
// requires each to be one or the other. A constraint that fell through to "no opinion" would be
// indistinguishable from one the reader understood and found vacuous, which is how the field became
// prose in the first place.
//
// Three of the four readings deliberately narrow NOTHING, and each for its own reason — see
// {@link ConstraintReading}.

/** A parameter's current value by name — `instantiate`'s `values`, which binds every parameter. */
export type ParameterValues = Readonly<Record<string, number>>;

/**
 * What one constraint string says about the parameter it names.
 *
 * - **`bound`** is a half-line, and the only reading that moves a slider's end.
 * - **`excluded`** is a measure-zero exclusion (`q != p`, `mu not in Z`). It cannot narrow an
 *   interval — removing a point from one leaves two — and a slider cannot express the hole anyway,
 *   so the record's own refusals are what report it (`alpha not in Z` makes D1's coefficient exactly
 *   zero, which the solve names).
 * - **`magnitude`** is a bound on `|x|` (`abs(a) > abs(b)`). It is a union of TWO rays, not an
 *   interval: at `a = 2, b = 1` the record admits `a < −1` as readily as `a > 1`, and narrowing to
 *   the ray the value happens to sit in would make the other half unreachable — a range that is
 *   false in the direction a reader is most likely to drag.
 * - **`domain`** (`isReal(a)`) restates `parameters[].domain`; a real slider carries it already.
 */
export type ConstraintReading =
  | {
      readonly kind: "bound";
      readonly side: "lower" | "upper";
      /** The bound itself, resolved at this binding — a literal, or another parameter's value. */
      readonly at: number;
      /** `>` and `<` are open; `>=` and `<=` are not. */
      readonly open: boolean;
    }
  | { readonly kind: "excluded" }
  | { readonly kind: "magnitude" }
  | { readonly kind: "domain" }
  | { readonly kind: "unreadable"; readonly reason: string };

const NAME = "[A-Za-z][A-Za-z0-9_]*";
const TERM = `(?:abs\\(${NAME}\\)|${NAME}|-?[0-9]+(?:\\.[0-9]+)?)`;
const COMPARISON = new RegExp(`^(${TERM})\\s*(>=|<=|!=|>|<)\\s*(${TERM})$`);
const NOT_IN_Z = new RegExp(`^(${NAME}) not in Z$`);
const IS_REAL = new RegExp(`^isReal\\((${NAME})\\)$`);

function absOf(term: string): string | null {
  const m = /^abs\((.*)\)$/.exec(term);
  return m === null ? null : m[1];
}

/**
 * Read one constraint, as a statement about `self`.
 *
 * A constraint naming a different parameter on the left is not this parameter's business and is
 * refused rather than guessed at: A1 declares `abs(a) > abs(b)` on `a` AND `abs(b) < abs(a)` on
 * `b`, i.e. the corpus writes the same fact twice, once per parameter, so a reader that tried to
 * invert the second would be doing work the record already did.
 */
export function readConstraint(text: string, self: string, values: ParameterValues): ConstraintReading {
  const src = text.trim().replace(/\s+/g, " ");

  const notInZ = NOT_IN_Z.exec(src);
  if (notInZ !== null) {
    return notInZ[1] === self
      ? { kind: "excluded" }
      : { kind: "unreadable", reason: `'${text}' is about '${notInZ[1]}', not '${self}'` };
  }

  const isReal = IS_REAL.exec(src);
  if (isReal !== null) {
    return isReal[1] === self
      ? { kind: "domain" }
      : { kind: "unreadable", reason: `'${text}' is about '${isReal[1]}', not '${self}'` };
  }

  const cmp = COMPARISON.exec(src);
  if (cmp === null) return { kind: "unreadable", reason: `'${text}' is not a comparison this reader knows` };
  const [, left, op, right] = cmp;

  const leftAbs = absOf(left);
  if ((leftAbs ?? left) !== self) {
    return { kind: "unreadable", reason: `'${text}' is about '${leftAbs ?? left}', not '${self}'` };
  }
  // `!=` first, so that `abs(a) != 1` is read as the measure-zero exclusion it is rather than as a
  // magnitude the reader would then have nothing to do with.
  if (op === "!=") return { kind: "excluded" };
  if (leftAbs !== null) return { kind: "magnitude" };

  const rightAbs = absOf(right);
  if (rightAbs !== null) {
    return { kind: "unreadable", reason: `'${text}' bounds '${self}' by a magnitude, which this reader does not resolve` };
  }
  let at: number;
  if (/^-?[0-9]/.test(right)) {
    at = Number(right);
  } else {
    const bound = values[right];
    if (bound === undefined) {
      return { kind: "unreadable", reason: `'${text}' names '${right}', which this instantiation does not bind` };
    }
    at = bound;
  }
  if (!Number.isFinite(at)) {
    return { kind: "unreadable", reason: `'${text}' resolves to a non-finite bound` };
  }
  return { kind: "bound", side: op === ">" || op === ">=" ? "lower" : "upper", at, open: op === ">" || op === "<" };
}

export interface NarrowedRange {
  readonly range: readonly [number, number];
  /** Every constraint the reader could not read, in the record's own words. */
  readonly unreadable: readonly string[];
}

/**
 * The widest range of a parameter the record has anything to say about.
 *
 * **An open bound is inset by one step of the control that reads this**, so the slider's endpoint
 * stop is the first value strictly inside the declared interval and no stop of it is outside. One
 * step rather than a relative epsilon because the step is what a reader can actually land on: a
 * margin finer than the control's granularity is a margin the control cannot express, and a coarser
 * one throws away values the record admits. On an integer lattice the step is 1, for the same
 * reason — `n > 2` means `n = 3`.
 *
 * The result still CONTAINS `value`, which is `buildParams`' standing rule and is what keeps a trap
 * fixture reachable: `Golden.params` goes in through `bindings`, not through the slider, and a
 * record whose fixture sits outside its own constraints must still open at it rather than at some
 * clamped neighbour of it. The widening is then visible — the slider reaches back to the bound.
 */
export function narrowRange(
  self: string,
  constraints: readonly string[],
  values: ParameterValues,
  fallback: readonly [number, number],
  value: number,
  step: (lo: number, hi: number) => number,
): NarrowedRange {
  let lo = fallback[0];
  let hi = fallback[1];
  let openLo = false;
  let openHi = false;
  const unreadable: string[] = [];
  for (const text of constraints) {
    const read = readConstraint(text, self, values);
    if (read.kind === "unreadable") {
      unreadable.push(read.reason);
      continue;
    }
    if (read.kind !== "bound") continue;
    // **AT AN EQUAL BOUND THE OPENNESS TIGHTENS.** This is an INTERSECTION, so a record declaring
    // both `a > 0` and `a >= 0` means `a > 0`. Taking the first-seen openness, or the last-seen,
    // would make the answer depend on the order the record happens to list them in — and which of
    // those two a strict `>` here would give is not a decision worth leaving to a comparison.
    //
    // No corpus record bounds the same parameter twice, which is how the sweep found this: the
    // mutant that drops the `||` survives everything the 28 records can ask.
    if (read.side === "lower" && read.at >= lo) {
      openLo = read.at > lo ? read.open : openLo || read.open;
      lo = read.at;
    } else if (read.side === "upper" && read.at <= hi) {
      openHi = read.at < hi ? read.open : openHi || read.open;
      hi = read.at;
    }
  }
  // Contradictory bounds are a finding about the record, not about the control; the default range
  // is kept so the app still opens and the record's own hypotheses are what report it.
  if (!(hi > lo)) return { range: fallback, unreadable };
  if (openLo || openHi) {
    const inset = step(lo, hi);
    if (openLo) lo += inset;
    if (openHi) hi -= inset;
    if (!(hi > lo)) return { range: fallback, unreadable };
  }
  return { range: [Math.min(lo, value), Math.max(hi, value)], unreadable };
}
