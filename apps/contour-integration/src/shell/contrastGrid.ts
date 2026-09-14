// **THE CONTRAST LADDER** — five arguments in an order where each differs from the one above it in
// a declared, verified set of ledger rows.
//
// Research 02 §13's contrasting cases, as gallery ORGANISATION rather than as lessons: a second
// ordering over material the app already computes, with no prose, no prompts and no new engine.
// What makes it belong in this app rather than in a slide deck is the declaration — each step says
// which rows change, and `test/contrastGrid.test.ts` derives the real difference set from the engine
// and requires it to match EXACTLY IN BOTH DIRECTIONS. An engine change that made B1 at `a = 0` cite
// Jordan fails that test; so does one that quietly starts changing a second row.
//
// **A CELL IS A `ShellState`, AND MEASURING IS WHY.** The plan had all five cells as record fixtures,
// including "B1 closed the wrong way". That state does not exist and cannot: B1's contour derives its
// closing side from `sgnA = if(a < 0, -1, 1)`, and a `derived` parameter is read-only precisely so
// the geometry cannot desync from its own definition — the record is incapable of being closed
// wrongly. The wrong-way cell is therefore a SANDBOX state, the same one M3's gate already pins. So
// the ladder spans both modes, which costs nothing and buys the milestone's gate clause 2 outright:
// a cell is a state, so a cell is a permalink, so every cell already travels under M6.2's
// round-trip-by-verdict test.

import { semicircleTemplate } from "../engine/contour/templates.js";
import type { ContrastSide, RowKey } from "../engine/contrast.js";
import { TEMPLATES } from "./templates.js";
import { compile, defaultState, resolveState, type ShellState } from "./state.js";

/** One rung: a state, and what it is in the ladder for. */
export interface ContrastCell {
  /** Stable across edits — the id a permalink and a test both name. */
  readonly id: string;
  /** The integral, as a reader would write it. */
  readonly label: string;
  /** One line on what this cell IS. Never a lesson: no prose layer (M7 §0). */
  readonly note: string;
  readonly state: () => ShellState;
  /** Declared difference from the cell above. Absent on the first. */
  readonly differsAbove?: ContrastStep;
}

/**
 * The declared difference between a cell and the one above it.
 *
 * `rows` is the whole set: a test requires that exactly these row keys differ and every other row
 * agrees. The remaining fields declare the differences that are NOT rows — which the measurement
 * found matter, because the step from B1 to C1 moves `pieceLimits` and the answer while every row it
 * shares stays satisfied.
 */
export interface ContrastStep {
  readonly rows: readonly RowKey[];
  /**
   * Rows whose WORDING moves without the argument doing so — declared, but not highlighted.
   *
   * Found by running the ladder rather than by thinking about it. Two kinds showed up and both are
   * artefacts of what the row is describing rather than of what changed: crossing from a record to
   * the sandbox renames the target piece (`the real segment [−R, R]` becomes `the real axis
   * [−R, R]`), and C1's LEGALITY row quotes the distance to the nearest singularity, which is
   * `1.00` for B1 and `0.0500` once there is an indentation.
   *
   * They are declared rather than ignored, because a difference the test does not account for is a
   * difference nobody is watching. They are kept out of `rows` because the grid highlights `rows`,
   * and pointing at a row that says the same thing in different words is how a contrast stops
   * meaning anything.
   *
   * **A status change may never be filed here** — `contrastGrid.test.ts` enforces it. If a row went
   * from satisfied to failed, the argument changed, and calling that incidental would be the one
   * loophole that empties this whole declaration of content.
   */
  readonly alsoDiffers?: readonly { readonly key: RowKey; readonly why: string }[];
  /** What the step isolates, in one line — shown beside the cell. */
  readonly because: string;
  /** Does the argument below close? Declared only when it differs from the one above. */
  readonly closes?: boolean;
  /** The pieces carrying a known non-vanishing limit, when that set changes. */
  readonly pieceLimits?: readonly string[];
  /** Declared when the answer moves, which is usually the point. */
  readonly answer?: string | null;
}

const B1 = "jordan-cosine-kernel";

/** A gallery cell: a record at a binding. The contour is the record's, so the state carries none. */
function galleryCell(record: string, bindings: Record<string, number>): ShellState {
  return {
    ...defaultState(TEMPLATES[0].build()),
    mode: "gallery",
    record,
    fixture: 0,
    bindings,
  };
}

/** The sandbox cell: an expression on a template, which is the only way to close the wrong way. */
function sandboxCell(expr: string): ShellState {
  const contour = semicircleTemplate(3, "lower");
  return {
    ...defaultState(contour),
    expr,
    contourSource: { template: "semicircleDown", shift: [0, 0] },
    sandboxContour: contour,
  };
}

export const CONTRAST_CELLS: readonly ContrastCell[] = [
  {
    id: "rational",
    label: "∫ dx/(x²+1)",
    note: "the rational case: no frequency, so the arc dies by plain ML",
    state: () => galleryCell(B1, { a: 0, b: 1 }),
  },
  {
    id: "oscillatory",
    label: "∫ cos x/(x²+1) dx",
    note: "the same integrand times a kernel — and the same contour",
    state: () => galleryCell(B1, { a: 1, b: 1 }),
    differsAbove: {
      // **EXACTLY ONE ROW**, which is the ladder's whole premise and the pair worth having. The
      // contour, the pole, the winding and the target are word-for-word identical; what a reader
      // has to learn is a lemma, and the grid shows that it is a lemma and nothing else.
      rows: ["KILL/vanish#0"],
      because: "the arc's lemma, and only that: plain ML → Jordan",
      answer: "π/e",
    },
  },
  {
    id: "wrong-way",
    label: "… closed downward",
    note: "the same integrand, the arc taken through the other half-plane",
    state: () => sandboxCell("exp(i*z)/(1+z^2)"),
    differsAbove: {
      // The SAME row again — now failing. Research 02 §7's "let wrong contours fail informatively"
      // as a rung rather than a mode, and it costs nothing because M3's gate computes it already.
      rows: ["KILL/vanish#0"],
      alsoDiffers: [
        { key: "KILL/target#0", why: "the sandbox's template names the piece `the real axis`, the record `the real segment`" },
      ],
      because: "the same row, now DIVERGING — the bound is the thing that chooses the half-plane",
      closes: false,
      answer: null,
    },
  },
  {
    id: "forced-downward",
    label: "∫ cos x/(x²+1) dx, a < 0",
    note: "downward is now the RIGHT way — forced by the sign of a, never chosen",
    state: () => galleryCell(B1, { a: -1, b: 1 }),
    differsAbove: {
      rows: ["KILL/vanish#0"],
      alsoDiffers: [
        { key: "KILL/target#0", why: "crossing back from the sandbox to the record renames the same piece" },
      ],
      because: "the same row satisfied again, on the lower arc — `sgnA` derives the side from `a`",
      closes: true,
      answer: "π/e",
    },
  },
  {
    id: "indented",
    label: "∫ sin x/x dx",
    note: "the pole moves onto the contour, and ∮ stops being the answer",
    state: () => galleryCell("indented-sinc", {}),
    differsAbove: {
      // **FIVE THINGS MOVE, NOT THE PLAN'S TWO**, and they were measured rather than reasoned:
      // CATCH drops from one enclosed singularity to none; the target row SPLITS in two, because
      // the real axis is now the part either side of the indentation; a second vanish row appears
      // for the indentation itself; `pieceLimits` gains it; and the answer changes. The ledger's
      // own `∮` becomes 0 while the integral is π/2 — which is exactly the cell's lesson, and the
      // reason the grid shows the record's ANSWER rather than the ledger's value.
      rows: [
        "CATCH/argument#0",
        "KILL/target#0",
        "KILL/target#1",
        "KILL/vanish#0",
        "KILL/vanish#1",
      ],
      alsoDiffers: [
        { key: "LEGALITY/argument#1", why: "the row quotes the distance to the nearest singularity: 1.00, then 0.0500" },
      ],
      because: "no pole is enclosed at all: the whole value comes from the indentation's iα·Res",
      pieceLimits: ["indent"],
      answer: "π/2",
    },
  },
];

/**
 * Run a cell, as one side of a comparison.
 *
 * **Through `resolveState`, so a cell is the same computation the shell performs** — not a second
 * path that could agree with the app today and drift from it tomorrow. That is the same reason
 * `engine/analyse.ts` is shared between the gallery and the golden corpus (M3.5a).
 *
 * `answer` is the record's SOLVED value where there is one, and the ledger's `∮` otherwise. The
 * distinction is C1's: its `∮` is exactly 0 while the integral it determines is `π/2`.
 */
export function contrastSideOf(state: ShellState): ContrastSide | null {
  const res = resolveState(state, state.mode === "sandbox" ? compile(state.expr) : null);
  if (res.kind === "gallery") {
    if (res.run === null) return null;
    return {
      ledger: res.run.ledger,
      pieces: res.run.contour.pieces,
      answer: res.solved?.text ?? res.run.ledger.value?.text ?? null,
    };
  }
  if (res.kind === "plain" || res.kind === "declared") {
    return {
      ledger: res.analysis.ledger,
      pieces: state.contour.pieces,
      answer: res.analysis.ledger.value?.text ?? null,
    };
  }
  return null;
}
