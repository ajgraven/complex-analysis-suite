// The hover readout: what is under the pointer, and nothing the app cannot stand behind.
//
// M8 step 1.10, plan §1.10. A small block in the stage's top-left corner carrying `z`, `f(z)`,
// `|f|`, `arg f` in degrees, the piece the pointer is on, and — under a declaration — which
// determination the number was read in.
//
// **THE WHOLE MODULE IS THE REFUSAL.** Everything else here is four lines of arithmetic. A compiled
// integrand THROWS, and it returns `Infinity` and `NaN` at points a reader can reach with the
// pointer in one move: `1/z` at the origin is one drag from wherever the pointer is, and the origin
// is where a reader who is being taught about poles will aim first. `fmtNum` prints a non-finite
// number as `String(v)`, so the unguarded readout says `Infinity + NaNi` at exactly the moment the
// reader is looking for meaning. That is worse than a word, and not by a little: `Infinity` is a
// float64 token, and a reader who does not already know what a pole is reads it as the app's ANSWER
// — a number the argument established, in the same column and the same face as `2.0000`. A word
// cannot be mistaken for a value.
//
// The same rule one step on: `|f|` and `arg f` are DERIVED, so they may not be printed from an input
// that was just refused. `Math.atan2(NaN, NaN)` is `NaN` and `Math.hypot(Infinity, 1)` is
// `Infinity`, and both would print — a derived number is not more honest than the number it came
// from.
//
// **The determination is read off the RESOLUTION, never off `state.declaration`.** They come apart:
// a declaration naming a branch point that has since been removed leaves `resolveState` on the
// PLAIN route, integrating the box whole in the principal branch, while the state still carries a
// window (`test/cards.test.ts` pins the same split for the Integrand card's label). A readout keyed
// on the state would then announce a determination the numbers were not computed in. Reading the
// product also gets the SHEET for free, because `runDeclared` folds `BranchChoice.sheet` into the
// window before building it — so a spin of the sheet moves this row without this module knowing
// that sheets exist.
import { Frac } from "@cas/exact";

import type { DeclaredProduct } from "../kernel/branch/declared.js";
import type { Cx } from "../kernel/geom.js";
import type { ShellState, StateResolution } from "./state.js";
import { h, type Desc } from "./dom.js";
import { mathText } from "./math.js";
import { fmtNum } from "./format.js";
import type { Hover } from "./session.js";

export interface ReadoutInput {
  readonly hover: Hover;
  readonly state: ShellState;
  readonly resolution: StateResolution;
  /** The name of the contour piece under the pointer; null when the pointer is off the curve. */
  readonly pieceName: string | null;
}

/** One line. Pure, so the node gate can read the numbers rather than a rendering of them. */
export interface ReadoutRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

/** The minus sign the rest of the app writes — U+2212, as `fmtCx` and `format.ts` use. */
const MINUS = "−";

/**
 * Why there is no number here, in words the reader can act on.
 *
 * Each is the phrase the app ALREADY uses for that condition rather than a new one: `format.ts`
 * says `not a number` where a component is `NaN`, and `strip.ts`'s partial-sum readout says
 * `undefined` where one is infinite. Two surfaces disagreeing about what a pole is called would be
 * a second vocabulary for one fact.
 */
const THREW = "could not be evaluated here";
const NOT_A_NUMBER = "not a number";
const UNDEFINED = "undefined";
/** There is no `f` at all — an unparseable box, a refused declaration, no record open. */
const NO_INTEGRAND = "there is no integrand to evaluate";

/** `a + bi`, assembled from `fmtNum` so this column lines up with every other number in the shell. */
const cx = ([re, im]: Cx): string => `${fmtNum(re)} ${im < 0 ? MINUS : "+"} ${fmtNum(Math.abs(im))}i`;

/** What `f` gave at the pointer, or the reason it gave nothing. */
type Evaluated = { readonly ok: true; readonly value: Cx } | { readonly ok: false; readonly why: string };

/**
 * Evaluate, and refuse in three named ways rather than one.
 *
 * A THROW, a `NaN` and an `Infinity` are different facts about the integrand — an expression the
 * evaluator declined, a `0/0`, and a pole — and collapsing them into one sentence would take from
 * the reader the only diagnosis this block is in a position to offer.
 */
function evaluate(f: (z: Cx) => Cx, z: Cx): Evaluated {
  let value: Cx;
  try {
    value = f(z);
  } catch {
    return { ok: false, why: THREW };
  }
  if (Number.isNaN(value[0]) || Number.isNaN(value[1])) return { ok: false, why: NOT_A_NUMBER };
  if (!Number.isFinite(value[0]) || !Number.isFinite(value[1])) return { ok: false, why: UNDEFINED };
  return { ok: true, value };
}

/**
 * The integrand this resolution computed with, or null.
 *
 * A gallery run's `f` is the DECLARED determination for a branch record and the compiled AST
 * otherwise (`families/runFamily.ts`), which is the same function the ledger's numbers came from —
 * so the readout and the result card cannot be showing two different integrands.
 */
function evaluatorOf(resolution: StateResolution): ((z: Cx) => Cx) | null {
  switch (resolution.kind) {
    case "gallery":
      return resolution.run?.f ?? null;
    case "declared":
    case "plain":
      return resolution.f;
    case "declared-refused":
    case "empty":
      return null;
  }
}

/** The declared branch product behind the numbers, or null when the integrand is single-valued. */
function declaredOf(resolution: StateResolution): DeclaredProduct | null {
  switch (resolution.kind) {
    case "gallery":
      return resolution.run?.declared?.product ?? null;
    case "declared":
      return resolution.declared;
    case "declared-refused":
    case "plain":
    case "empty":
      return null;
  }
}

/** A rational multiple of π as it would be written by hand: `0`, `π`, `−π`, `2π`, `5π/2`. */
function piMultiple(f: Frac): string {
  if (f.isZero()) return "0";
  const negative = f.n < 0n;
  const n = negative ? -f.n : f.n;
  const head = n === 1n ? "π" : `${n}π`;
  return `${negative ? MINUS : ""}${f.d === 1n ? head : `${head}/${f.d}`}`;
}

const TWO = Frac.of(2n);

/**
 * One factor's determination, as the interval it names.
 *
 * `DeclaredFactor.window` is the window's LOWER edge in multiples of π and the window is exactly one
 * turn wide, so the upper edge is `w + 2` and there is nothing to store. **This renderer reproduces
 * the two labels the Cuts card offers, character for character** — `arg ∈ [0, 2π)` at `w = 0` and
 * `arg ∈ [−π, π)` at `w = −1` — which is why there is no table of special cases here; the test pins
 * both strings against `cards/cuts.ts`'s `WINDOWS`.
 */
const windowLabel = (w: Frac): string => `arg ∈ [${piMultiple(w)}, ${piMultiple(w.add(TWO))})`;

/**
 * Which determination the numbers were read in — one row, however many factors there are.
 *
 * **A product may declare a DIFFERENT window per factor**, and D7 does: it writes `z^μ` in `[0, 2π)`
 * beside `(b − z)^ν` in the principal window, because the composite is continuous where the two
 * sub-cuts would each draw a seam. Showing the first factor's window as though it were the
 * product's would be a sentence about a determination the app is not using — so the differing case
 * says so and lists them in factor order, which is the order the product multiplies in.
 */
function determinationOf(product: DeclaredProduct): string {
  const windows = product.factors.map((factor) => factor.window);
  const first = windows[0];
  if (first === undefined) return NO_INTEGRAND;
  // Exact comparison through `Frac.equals`, never `toNumber`: a window is a decision about which
  // sheet the residues were read on, and two of them are the same window or they are not.
  if (windows.every((w) => w.equals(first))) return windowLabel(first);
  return `per factor: ${windows.map(windowLabel).join(", ")}`;
}

/**
 * The lines, as data.
 *
 * `[]` when the pointer is not over the stage — there is then no fact to report, and a block reading
 * `z —` would be a readout of nothing.
 */
export function readoutRows(input: ReadoutInput): readonly ReadoutRow[] {
  const z = input.hover.z;
  if (z === null) return [];

  const rows: ReadoutRow[] = [{ key: "z", label: "z", value: cx(z) }];

  const f = evaluatorOf(input.resolution);
  if (f === null) {
    // **No `|f|` and no `arg f` here, where a refused `f(z)` keeps both.** The difference is real:
    // a refusal at this point is a fact about the point, so the rows stay and the block does not
    // change height as the pointer crosses a pole; no integrand at all means there is no function
    // whose modulus a row could be about.
    rows.push({ key: "f", label: "f(z)", value: NO_INTEGRAND });
  } else {
    const got = evaluate(f, z);
    rows.push(
      { key: "f", label: "f(z)", value: got.ok ? cx(got.value) : got.why },
      { key: "abs", label: "|f|", value: got.ok ? fmtNum(Math.hypot(got.value[0], got.value[1])) : got.why },
      {
        key: "arg",
        label: "arg f",
        value: got.ok ? `${fmtNum((Math.atan2(got.value[1], got.value[0]) * 180) / Math.PI)}°` : got.why,
      },
    );
  }

  if (input.pieceName !== null) rows.push({ key: "piece", label: "piece", value: input.pieceName });

  const product = declaredOf(input.resolution);
  if (product !== null) rows.push({ key: "det", label: "determination", value: determinationOf(product) });

  return rows;
}

/**
 * The block, or `null` when there is nothing to show.
 *
 * **`aria-hidden`, deliberately.** It sits in the stage's overlay, over a canvas that carries the
 * stage's own generated description — so every fact here already reaches a screen-reader user by a
 * route that does not fire on pointer motion. Left exposed it would either be announced on every
 * move, which is noise a reader cannot escape while using the pointer, or announced never, which is
 * the same as this. It carries no control and no `tabindex` for the other half of that decision:
 * `aria-hidden` hides a focusable descendant from assistive technology while leaving it in the tab
 * order, which is the one combination that is worse than either.
 *
 * Plain text, not KaTeX: the labels are one or two glyphs, and typesetting them would put a
 * `.katex` subtree in a block that re-renders on every pointer move.
 */
export function readout(input: ReadoutInput): Desc | null {
  const rows = readoutRows(input);
  if (rows.length === 0) return null;
  return h(
    "div",
    { key: "readout", class: "readout2", "aria-hidden": true, "data-testid": "readout" },
    ...rows.map((row) =>
      h(
        "div",
        { key: row.key, class: "readoutRow" },
        h("span", { key: "l", class: "readoutLabel" }, row.label),
        // **Through `mathText`, because a piece NAME carries LaTeX.** Found in a browser: the row
        // read `piece the $R \to \infty$ semicircle` — the record's own name, printed as source.
        // `mathPlain` is the wrong tool here and says so in its own comment ("always a fallback
        // rather than a display choice"); the held-handle chip on this same overlay typesets, so
        // this does too. Every other row is plain and `splitMath` returns it unchanged, which is
        // why it is applied to all of them rather than to the one that needs it — a row that grows
        // a formula later must not have to remember.
        h("span", { key: "v", class: "num readoutValue" }, ...mathText(row.value, `v${row.key}`)),
      ),
    ),
  );
}
