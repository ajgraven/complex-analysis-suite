// @vitest-environment jsdom
//
// The hover readout — M8 step 1.10.
//
// **The subject is `readoutRows`, not the DOM.** The rows are data precisely so that the numbers can
// be asserted as numbers rather than scraped back out of a rendering of them; the one DOM section at
// the bottom asserts the things only a document can answer (the keys are distinct, the block is
// hidden from assistive technology, nothing in it takes a tab stop). The environment is jsdom for
// that section alone, the same docblock `test/cards.test.ts` and `test/bar.test.ts` carry.
//
// Every value pinned below was MEASURED first and then written down.
import { describe, expect, it } from "vitest";
import { Frac } from "@cas/exact";

import { addBranchPoint } from "../src/engine/branchEdit.js";
import { circleTemplate } from "../src/engine/contour/templates.js";
import type { Cx } from "../src/kernel/geom.js";
import { compile, defaultState, resolveState, type ShellState, type StateResolution } from "../src/shell/state.js";
import { patch } from "../src/shell2/dom.js";
import { readout, readoutRows, type ReadoutRow } from "../src/shell2/readout.js";
import { NO_HOVER } from "../src/shell2/session.js";

const sandbox = (over: Partial<ShellState> = {}): ShellState => ({
  ...defaultState(circleTemplate([0, 0], 1.5)),
  ...over,
});

const gallery = (record: string): ShellState => sandbox({ mode: "gallery", record });

const resolve = (state: ShellState): StateResolution => resolveState(state, compile(state.expr));

/** The rows for a state, with the pointer at `z` and optionally on a named piece. */
function rowsFor(state: ShellState, z: Cx | null, piece: string | null = null): readonly ReadoutRow[] {
  return readoutRows({ hover: { ...NO_HOVER, z }, state, resolution: resolve(state), pieceName: piece });
}

/** One row's value, by key — so an assertion names the row it is about. */
function valueOf(rows: readonly ReadoutRow[], key: string): string {
  const row = rows.find((r) => r.key === key);
  if (row === undefined) throw new Error(`no '${key}' row in [${rows.map((r) => r.key).join(", ")}]`);
  return row.value;
}

/** A sandbox with one branch point at the origin and a factor declared on it — D1's shape. */
function declaredState(window: readonly [Frac, Frac] = [Frac.ZERO, Frac.of(2n)]): ShellState {
  const base = sandbox({ expr: "1/(1+z)" });
  const branch = addBranchPoint(base.branch, [0, 0]);
  return {
    ...base,
    branch,
    beforeDeclaration: "z^(-0.5)/(1+z)",
    declaration: { pointId: branch.points[0].id, window, sign: 1, constant: [1, 0], logPower: 1 },
  };
}

describe("nothing under the pointer", () => {
  it("is no rows and no block", () => {
    // Not a block reading `z —`: with the pointer off the stage there is no fact to report, and a
    // readout of nothing is a claim that something is being hovered.
    const state = sandbox();
    expect(rowsFor(state, null)).toEqual([]);
    expect(readout({ hover: NO_HOVER, state, resolution: resolve(state), pieceName: null })).toBeNull();
  });
});

describe("the four numeric rows", () => {
  it("reads 1/z at 0.5 + 0.5i", () => {
    // MEASURED: 1/(0.5 + 0.5i) = 1 − i, so |f| = √2 and arg f = −45°. The degrees are the point of
    // the row — a reader matching the readout against the phase portrait's hue reads degrees, and
    // radians would leave them to do the conversion.
    const rows = rowsFor(sandbox(), [0.5, 0.5]);
    expect(rows.map((r) => r.key)).toEqual(["z", "f", "abs", "arg"]);
    expect(valueOf(rows, "z")).toBe("0.5000 + 0.5000i");
    expect(valueOf(rows, "f")).toBe("1.0000 − 1.0000i");
    expect(valueOf(rows, "abs")).toBe("1.4142");
    expect(valueOf(rows, "arg")).toBe("-45.0000°");
  });

  it("labels the rows in the order the plan asks for", () => {
    expect(rowsFor(sandbox(), [0.5, 0.5]).map((r) => r.label)).toEqual(["z", "f(z)", "|f|", "arg f"]);
  });
});

describe("a value the app does not have", () => {
  it("names a NaN rather than printing one — and the pole of 1/z is one", () => {
    // **MEASURED, and not what the module was first written for:** `1/z` at the origin returns
    // `NaN + NaNi` from the compiled evaluator, not an infinity. Both refusals are therefore
    // reachable with the pointer, by two different expressions, and the readout distinguishes them.
    const rows = rowsFor(sandbox(), [0, 0]);
    expect(valueOf(rows, "z")).toBe("0.0000 + 0.0000i");
    expect(valueOf(rows, "f")).toBe("not a number");
    // The DERIVED rows do not launder it: `Math.hypot(NaN, NaN)` and `Math.atan2(NaN, NaN)` are both
    // `NaN`, and `fmtNum` prints a non-finite number as `String(v)` — so without the guard the two
    // rows below would read `NaN` and `NaN°`.
    expect(valueOf(rows, "abs")).toBe("not a number");
    expect(valueOf(rows, "arg")).toBe("not a number");
    // Whatever else it refuses, the pointer position is a fact and it is shown.
    expect(rows.map((r) => r.key)).toEqual(["z", "f", "abs", "arg"]);
  });

  it("says `undefined` for an infinity — MEASURED at log(z), z = 0", () => {
    const rows = rowsFor(sandbox({ expr: "log(z)" }), [0, 0]);
    expect(valueOf(rows, "f")).toBe("undefined");
    expect(valueOf(rows, "abs")).toBe("undefined");
    expect(valueOf(rows, "arg")).toBe("undefined");
    // The word is the one `strip.ts`'s partial-sum readout already uses for a non-finite value, and
    // `format.ts`'s is the one for a NaN. One condition, one vocabulary — and two conditions, two.
    expect(valueOf(rows, "f")).not.toBe("not a number");
  });

  it("catches an evaluator that THROWS", () => {
    // **The throw is real and the route to it is not.** MEASURED: `1/(z-q)` parses, compiles, and
    // then throws `ExprError: Unknown variable 'q'` on the first call — but `resolveState` samples
    // the integrand along the contour inside `analyse`, so it throws before any readout exists and
    // no state carrying that expression can reach these rows. What CAN reach here is an `f` that
    // throws only where the quadrature never sampled, which is most of the plane and all of where
    // the pointer spends its time. So the guard is exercised by substituting the evaluator into a
    // resolution the engine really built, rather than through a state the app cannot hold.
    const state = sandbox();
    const base = resolve(state);
    if (base.kind !== "plain") throw new Error(`expected the plain route, got ${base.kind}`);
    const resolution: StateResolution = {
      ...base,
      f: () => {
        throw new Error("Unknown variable 'q'");
      },
    };
    const rows = readoutRows({ hover: { ...NO_HOVER, z: [0.5, 0.5] }, state, resolution, pieceName: null });
    expect(valueOf(rows, "z")).toBe("0.5000 + 0.5000i");
    expect(valueOf(rows, "f")).toBe("could not be evaluated here");
    expect(valueOf(rows, "abs")).toBe("could not be evaluated here");
    expect(valueOf(rows, "arg")).toBe("could not be evaluated here");
    // The evaluator's own message never reaches the reader: it names a variable in a parser's
    // vocabulary, and an expression's fault belongs beside the box that holds it.
    expect(rows.some((r) => r.value.includes("Unknown variable"))).toBe(false);
  });
});

describe("no integrand at all", () => {
  it("shows the pointer and says there is nothing to evaluate", () => {
    // An unparseable box resolves to `empty`. MEASURED: two rows, and no `|f|` or `arg f` — there is
    // no function for a modulus to be the modulus OF, which is a different fact from a function that
    // declined at this point, where both rows stay.
    const rows = rowsFor(sandbox({ expr: "1/(1+z" }), [0.5, 0.5]);
    expect(rows.map((r) => r.key)).toEqual(["z", "f"]);
    expect(valueOf(rows, "z")).toBe("0.5000 + 0.5000i");
    expect(valueOf(rows, "f")).toBe("there is no integrand to evaluate");
  });

  it("does the same for a REFUSED declaration, and still names the piece", () => {
    // A branch point off the real axis refuses the single-factor engine, so the resolution is
    // `declared-refused` and there is no `f`. The piece under the pointer is geometry and survives.
    const base = sandbox({ expr: "1/(1+z)" });
    const branch = addBranchPoint(base.branch, [0, 1]);
    const state: ShellState = {
      ...base,
      branch,
      declaration: {
        pointId: branch.points[0].id,
        window: [Frac.ZERO, Frac.of(2n)],
        sign: 1,
        constant: [1, 0],
        logPower: 1,
      },
    };
    expect(resolve(state).kind).toBe("declared-refused");
    const rows = rowsFor(state, [0.5, 0.5], "outer circle");
    expect(rows.map((r) => r.key)).toEqual(["z", "f", "piece"]);
    expect(valueOf(rows, "piece")).toBe("outer circle");
    // And NO determination row: the window is in the state, but nothing was computed in it.
    expect(rows.some((r) => r.key === "det")).toBe(false);
  });
});

describe("the piece row", () => {
  it("appears only when the pointer is on a piece", () => {
    expect(rowsFor(sandbox(), [0.5, 0.5]).some((r) => r.key === "piece")).toBe(false);
    const rows = rowsFor(sandbox(), [0.5, 0.5], "the circle |z| = R");
    expect(valueOf(rows, "piece")).toBe("the circle |z| = R");
    // Last but for the determination — the piece is about the contour, and the rows above it are
    // about the integrand.
    expect(rows.map((r) => r.key)).toEqual(["z", "f", "abs", "arg", "piece"]);
  });
});

describe("the determination row", () => {
  it("is absent in the plain sandbox", () => {
    // Nothing is declared, so there is no window to report — and a row reading `principal` would be
    // a claim about a determination the reader never chose.
    expect(rowsFor(sandbox(), [0.5, 0.5]).some((r) => r.key === "det")).toBe(false);
  });

  it("reads the declared window, in the Cuts card's own words", () => {
    // These two strings are `shell2/cards/cuts.ts`'s `WINDOWS` labels character for character. They
    // are not special-cased in `readout.ts`: the generic renderer produces them, which is the reason
    // there is no table of exceptions here to drift out of step with that one.
    expect(valueOf(rowsFor(declaredState(), [0.5, 0.5]), "det")).toBe("arg ∈ [0, 2π)");
    expect(valueOf(rowsFor(declaredState([Frac.of(-1n), Frac.ONE]), [0.5, 0.5]), "det")).toBe("arg ∈ [−π, π)");
  });

  it("follows the SHEET, without knowing that sheets exist", () => {
    // `runDeclared` folds `BranchChoice.sheet` into the window before building the product, so
    // reading the product rather than the state gets the spinner for free. Sheet 1 is the same
    // determination one whole turn up — MEASURED: `arg ∈ [2π, 4π)`.
    const base = declaredState();
    const state: ShellState = { ...base, branch: { ...base.branch, sheet: 1 } };
    expect(valueOf(rowsFor(state, [0.5, 0.5]), "det")).toBe("arg ∈ [2π, 4π)");
  });

  it("reports a gallery record's determination", () => {
    // D1, the Mellin keyhole: one factor, `arg ∈ [0, 2π)` — the window whose wrong choice is that
    // record's own trap. D6 is one factor again, so one window and no list.
    expect(valueOf(rowsFor(gallery("mellin-keyhole"), [0.5, 0.5]), "det")).toBe("arg ∈ [0, 2π)");
    expect(valueOf(rowsFor(gallery("dogbone-inverse-sqrt"), [0.5, 0.5]), "det")).toBe("arg ∈ [0, 2π)");
  });

  it("SAYS SO when the factors' windows differ — D7 declares two", () => {
    // Not a hypothetical: D7 writes `z^μ` in `[0, 2π)` beside `(b − z)^ν` in the principal window,
    // because the composite is continuous where each sub-cut would draw a seam. MEASURED — and
    // showing the first factor's window alone would be a sentence about a determination the app is
    // not reading in.
    const rows = rowsFor(gallery("dogbone-two-fractional-powers"), [0.5, 0.5]);
    expect(valueOf(rows, "det")).toBe("per factor: arg ∈ [0, 2π), arg ∈ [−π, π)");
  });

  it("is the last row, after the piece", () => {
    const rows = rowsFor(gallery("mellin-keyhole"), [0.5, 0.5], "the outer circle");
    expect(rows.map((r) => r.key)).toEqual(["z", "f", "abs", "arg", "piece", "det"]);
  });
});

describe("the block", () => {
  const blockFor = (state: ShellState, z: Cx | null, piece: string | null = null) =>
    readout({ hover: { ...NO_HOVER, z }, state, resolution: resolve(state), pieceName: piece });

  it("patches into a document, with one keyed row per row", () => {
    // `patch` THROWS on two children sharing a key, so a collision is caught by rendering rather
    // than by an assertion about the description — which is the instrument the builder provides.
    const host = document.createElement("div");
    const state = gallery("dogbone-two-fractional-powers");
    const rows = rowsFor(state, [0.5, 0.5], "the upper edge");
    patch(host, [blockFor(state, [0.5, 0.5], "the upper edge")]);
    const block = host.querySelector(".readout2");
    expect(block).not.toBeNull();
    expect(block?.querySelectorAll(".readoutRow").length).toBe(rows.length);
    expect(block?.textContent ?? "").toContain("per factor");
    // Said twice: the description's own keys are distinct, and the render that would have thrown had
    // they not been.
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it("is hidden from assistive technology and takes no tab stop", () => {
    // It sits over a canvas that carries the stage's generated description, so every fact here
    // already reaches a screen-reader user by a route that does not fire on pointer motion.
    const host = document.createElement("div");
    patch(host, [blockFor(sandbox(), [0.5, 0.5])]);
    const block = host.querySelector(".readout2");
    // `"true"`, not an empty attribute: `dom.ts` writes an `aria-*` boolean as the string, because
    // `aria-hidden=""` is read as neither true nor false.
    expect(block?.getAttribute("aria-hidden")).toBe("true");
    expect(host.querySelectorAll("[tabindex]").length).toBe(0);
    expect(host.querySelectorAll("button, input, select, a, textarea").length).toBe(0);
  });

  it("keeps its nodes across a pointer move", () => {
    // The keys are stable, so the block is UPDATED rather than rebuilt sixty times a second — the
    // whole reason this shell has a keyed builder (M7.2's sweep: a rebuilt card destroys its
    // children, and nothing in the app rebuilds more often than a readout).
    const host = document.createElement("div");
    patch(host, [blockFor(sandbox(), [0.5, 0.5])]);
    const before = host.querySelector(".readout2");
    const beforeRow = host.querySelector(".readoutRow");
    patch(host, [blockFor(sandbox(), [0.25, -0.75])]);
    expect(host.querySelector(".readout2")).toBe(before);
    expect(host.querySelector(".readoutRow")).toBe(beforeRow);
    expect(host.querySelector(".readout2")?.textContent ?? "").toContain("0.2500");
  });

  it("is null with the pointer off the stage", () => {
    expect(blockFor(sandbox(), null)).toBeNull();
  });
});
