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
import { constraintLabel, roleLabel, type ConstraintId } from "../engine/vocabulary.js";
import type { PieceRole } from "../engine/contour/model.js";
import { rowKeys, type ContrastSide, type RowKey } from "../engine/contrast.js";
import { TEMPLATES } from "./templates.js";
import { compile, defaultState, resolveState, type ShellState } from "./state.js";

/** One rung: a state, and what it is in the ladder for. */
export interface ContrastCell {
  /** Stable across edits — the id a permalink and a test both name. */
  readonly id: string;
  /** The integral, as a reader would write it — typeset, in the `$…$` convention. */
  readonly label: string;
  /**
   * The same integral as a sentence, for the places that are SPOKEN rather than shown.
   *
   * **A twin rather than a derivation, and step 2.1 measured why.** The labels were Unicode text
   * until this step and `mathPlain` — which only strips the `$` — was a safe way to get an
   * `aria-label` from one. Typesetting them turned that into raw LaTeX in three accessible names:
   * the contrast column's Open button and the practice chooser's, where a screen reader would read
   * `\int_0^{\infty} \frac{\sin x}{x}\,dx` out as "backslash int". The app already pairs a value's
   * `latex` with its `text` everywhere else (step 0.4b); this is that pair, one level up.
   */
  readonly labelText: string;
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

/**
 * The sandbox cell: an expression on a template, which is the only way to close the wrong way.
 *
 * **`mode` and `record` are PINNED, and were inherited.** This spreads `defaultState`, whose mode is
 * the app's boot default — so a function whose name and whole purpose say *sandbox* was a sandbox
 * only for as long as the app happened to boot into one. M8's measurement for the A6 cold start
 * found it: flipping that default turned this cell, and the drill's rungs iii and iv, into gallery
 * states, taking 31 tests with them. A caller that means the sandbox says the sandbox.
 */
function sandboxCell(expr: string): ShellState {
  const contour = semicircleTemplate(3, "lower");
  return {
    ...defaultState(contour),
    mode: "sandbox",
    record: null,
    expr,
    contourSource: { template: "semicircleDown", shift: [0, 0] },
    sandboxContour: contour,
  };
}

// **`answer` is a VALUE, not prose, and `contrastGrid.test.ts` is why.** The test compares each
// declared answer against the engine's own text for that record's solved value — which is what makes
// the declaration falsifiable rather than decorative — so putting it in `$…$` breaks the identity and
// the cell starts asserting its own spelling. It is the one string in this file that is not rewritten
// for the reader, and the grid renders it as the text it is.
export const CONTRAST_CELLS: readonly ContrastCell[] = [
  {
    id: "rational",
    label: "$\\int_{-\\infty}^{\\infty} \\frac{dx}{x^2+1}$",
    labelText: "∫ dx/(x²+1)",
    note: "rational integrand; the arc vanishes by the ML-estimate",
    state: () => galleryCell(B1, { a: 0, b: 1 }),
  },
  {
    id: "oscillatory",
    label: "$\\int_{-\\infty}^{\\infty} \\frac{\\cos x}{x^2+1}\\,dx$",
    labelText: "∫ cos x/(x²+1) dx",
    // **Not "times a kernel".** In tier G a kernel is $\pi\cot\pi z$, the thing whose residues are
    // the sum; here it would mean $e^{ix}$. One word, two meanings, three cells apart.
    note: "the same contour, integrand multiplied by $e^{ix}$",
    state: () => galleryCell(B1, { a: 1, b: 1 }),
    differsAbove: {
      // **EXACTLY ONE ROW**, which is the ladder's whole premise and the pair worth having. The
      // contour, the pole, the winding and the target are word-for-word identical; what a reader
      // has to learn is a lemma, and the grid shows that it is a lemma and nothing else.
      rows: ["KILL/vanish#0"],
      because: "only the arc estimate changes: the ML-estimate becomes Jordan's lemma",
      answer: "π/e",
    },
  },
  {
    id: "wrong-way",
    label: "… closed downward",
    labelText: "… closed downward",
    note: "the same integrand, the arc taken through the other half-plane",
    state: () => sandboxCell("exp(i*z)/(1+z^2)"),
    differsAbove: {
      // The SAME row again — now failing. Research 02 §7's "let wrong contours fail informatively"
      // as a rung rather than a mode, and it costs nothing because M3's gate computes it already.
      rows: ["KILL/vanish#0"],
      alsoDiffers: [
        { key: "KILL/target#0", why: "the same piece is named differently in the sandbox and in the worked example" },
      ],
      because: "the same estimate now diverges: the sign of the exponent chooses the half-plane",
      closes: false,
      answer: null,
    },
  },
  {
    id: "forced-downward",
    label: "$\\int_{-\\infty}^{\\infty} \\frac{\\cos ax}{x^2+1}\\,dx$, $a < 0$",
    labelText: "∫ cos ax/(x²+1) dx, a < 0",
    note: "$a < 0$: the closing half-plane is the lower one",
    state: () => galleryCell(B1, { a: -1, b: 1 }),
    differsAbove: {
      rows: ["KILL/vanish#0"],
      alsoDiffers: [
        { key: "KILL/target#0", why: "crossing back from the sandbox to the record renames the same piece" },
      ],
      because: "the same estimate holds on the lower arc",
      closes: true,
      answer: "π/e",
    },
  },
  {
    id: "indented",
    label: "$\\int_0^{\\infty} \\frac{\\sin x}{x}\\,dx$",
    labelText: "∫₀^∞ sin x/x dx",
    note: "the pole moves onto the contour, and $\\oint_\\gamma f\\,dz$ stops being the answer",
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
      because: "no singularity is enclosed; the value comes from the indentation, $-i\\pi\\,\\operatorname{Res}(f, 0)$",
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

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The table the grid draws.
//
// Pure, so the layout decision that matters — WHICH ROW LINES UP WITH WHICH — is testable in node
// and not tangled with the DOM. `ui/accumulator.ts`'s split, and `figure.ts`'s.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** One ledger row as it appears in one column, or `null` where that argument has no such row. */
export interface ContrastEntry {
  readonly status: "satisfied" | "failed" | "unknown";
  readonly claim: string;
}

export interface ContrastTableRow {
  readonly key: RowKey;
  /** `Boundary terms · vanishing piece`, numbered `… 2` where the bucket repeats. */
  readonly label: string;
  /** One per cell, positionally. `null` is an absence, and is drawn as one. */
  readonly cells: readonly (ContrastEntry | null)[];
  /** Cell indices where this row IS the declared difference from the cell before it. */
  readonly highlight: readonly number[];
  /** Cell indices where this row's wording moves incidentally — shown, but not as the contrast. */
  readonly muted: readonly number[];
}

export interface ContrastTableCell {
  readonly id: string;
  readonly label: string;
  /** {@link ContrastCell.labelText} — what the column is called where it is spoken. */
  readonly labelText: string;
  readonly note: string;
  /** The record's solved answer where there is one, NOT the ledger's `∮`. */
  readonly answer: string | null;
  readonly closes: boolean;
  readonly failedAt: string | null;
  /** What the step into this cell isolates. `null` on the first. */
  readonly because: string | null;
}

export interface ContrastTable {
  readonly cells: readonly ContrastTableCell[];
  readonly rows: readonly ContrastTableRow[];
}

/**
 * Merge the columns' row orders into one, preserving EVERY column's own order.
 *
 * **First appearance across the columns is not good enough, and drawing the table is what showed
 * it.** C1 emits its rows as target, indentation, target, big arc, COVER; the four cells before it
 * emit target, arc, COVER. Taking keys in first-appearance order puts COVER down at cell 1 and then
 * has nowhere to put C1's second target and second arc but the very bottom, BELOW `COVER` — so the
 * column that the grid's last rung exists to explain reads in an order its own argument never had.
 *
 * This is a topological merge instead: each column contributes `kᵢ → kᵢ₊₁` edges, and Kahn's
 * algorithm emits a linear order satisfying all of them. Ties break by first appearance, so the
 * result is deterministic. Two columns that genuinely disagree about the order of two shared rows
 * would make a cycle, which cannot happen while the ledger emits rows in piece order and pieces are
 * ordered by the contour — and if it ever does, the remaining keys are appended in first-appearance
 * order rather than dropped, because a table missing a row is worse than one slightly out of order.
 */
function mergedRowOrder(keysPer: readonly (readonly RowKey[])[]): readonly RowKey[] {
  const first: RowKey[] = [];
  for (const keys of keysPer) for (const k of keys) if (!first.includes(k)) first.push(k);
  const rank = new Map(first.map((k, i) => [k, i]));

  const after = new Map<RowKey, Set<RowKey>>(first.map((k) => [k, new Set<RowKey>()]));
  const indegree = new Map<RowKey, number>(first.map((k) => [k, 0]));
  for (const keys of keysPer) {
    for (let i = 0; i + 1 < keys.length; i++) {
      const edges = after.get(keys[i]);
      if (edges === undefined || edges.has(keys[i + 1])) continue;
      edges.add(keys[i + 1]);
      indegree.set(keys[i + 1], (indegree.get(keys[i + 1]) ?? 0) + 1);
    }
  }

  const out: RowKey[] = [];
  const ready = first.filter((k) => indegree.get(k) === 0);
  while (ready.length > 0) {
    ready.sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
    const k = ready.shift();
    if (k === undefined) break;
    out.push(k);
    for (const next of after.get(k) ?? []) {
      const n = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, n);
      if (n === 0) ready.push(next);
    }
  }
  for (const k of first) if (!out.includes(k)) out.push(k); // a cycle: keep the row, lose the order
  return out;
}

/**
 * Build the grid.
 *
 * Rows are ordered by {@link mergedRowOrder}, so every column reads in its own argument's order.
 */
export function contrastTable(cells: readonly ContrastCell[] = CONTRAST_CELLS): ContrastTable {
  const sides = cells.map((c) => contrastSideOf(c.state()));
  const keysPer = sides.map((s) => (s === null ? [] : rowKeys(s.ledger.rows, s.pieces)));
  const order = mergedRowOrder(keysPer);

  // A bucket that repeats anywhere gets its ordinal shown; one that never does stays unnumbered,
  // because `KILL · vanish #0` on an argument with a single arc is noise.
  const bucketCount = new Map<string, number>();
  for (const key of order) {
    const bucket = key.slice(0, key.lastIndexOf("#"));
    bucketCount.set(bucket, (bucketCount.get(bucket) ?? 0) + 1);
  }

  const rows: ContrastTableRow[] = order.map((key) => {
    const hash = key.lastIndexOf("#");
    const bucket = key.slice(0, hash);
    const ordinal = Number(key.slice(hash + 1));
    const [constraint, role] = bucket.split("/");
    const repeated = (bucketCount.get(bucket) ?? 0) > 1;
    return {
      key,
      label: `${constraintLabel(constraint as ConstraintId)} · ${roleLabel(role as PieceRole | "argument")}${
        repeated ? ` ${ordinal + 1}` : ""
      }`,
      cells: sides.map((side, i) => {
        if (side === null) return null;
        const at = keysPer[i].indexOf(key);
        if (at < 0) return null;
        const row = side.ledger.rows[at];
        return { status: row.status, claim: row.claim };
      }),
      highlight: cells.flatMap((c, i) => ((c.differsAbove?.rows ?? []).includes(key) ? [i] : [])),
      muted: cells.flatMap((c, i) =>
        (c.differsAbove?.alsoDiffers ?? []).some((x) => x.key === key) ? [i] : [],
      ),
    };
  });

  return {
    cells: cells.map((c, i) => ({
      id: c.id,
      label: c.label,
      labelText: c.labelText,
      note: c.note,
      answer: sides[i]?.answer ?? null,
      closes: sides[i]?.ledger.closes ?? false,
      failedAt: sides[i]?.ledger.failedAt ?? null,
      because: c.differsAbove?.because ?? null,
    })),
    rows,
  };
}
