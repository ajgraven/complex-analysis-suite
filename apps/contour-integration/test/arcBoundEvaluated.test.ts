// The certified bound, as a number a reader can watch move — M8 step 3.2, unit 1.
//
// `ArcBound.evaluated` is `{param, at, bound}`: the contour parameter the bound was taken at, its
// value there, and the bound itself. A scrub writes `at` through `applyParam` and watches `bound`
// shrink, so the three have to be about the SAME thing — and none of that is checkable by looking at
// a rendered sentence, which is why the numbers are carried beside it.
//
// What this file pins is the sweep rather than one record: every certified bound the gallery
// produces has to carry the triple, `param` has to name a parameter the contour really has, `at` has
// to be that parameter's own value, and `bound` has to be the number the sentence prints. The last
// is the one that would catch a field filled from the wrong local — a bound computed at one radius
// and reported at another reads perfectly well.
import { describe, expect, it } from "vitest";

import { Frac, Gauss, QiPoly } from "@cas/exact";
import { circleTemplate } from "../src/engine/contour/templates.js";
import { renderArg } from "../src/engine/claims.js";
import { paramSymbol } from "../src/engine/vocabulary.js";
import { compile, defaultState, resolveState } from "../src/shell/state.js";
import { loadFamilies } from "../src/families/index.js";
import type { LedgerRow } from "../src/engine/ledger.js";
import type { Params, Piece } from "../src/engine/contour/model.js";
import { jordanArcBound, mlArcBound } from "../src/kernel/bounds/mlRational.js";
import { squareSideBound } from "../src/kernel/bounds/squareSide.js";
import { wedgeArcBound } from "../src/kernel/bounds/wedgeArc.js";

const RECORDS = [...loadFamilies().families.keys()];

interface Ran {
  readonly id: string;
  readonly rows: readonly LedgerRow[];
  readonly spec: readonly Piece[];
  readonly params: Params;
}

/** Every record at fixture 0, through the path the Derivation card takes (`test/steps.test.ts`). */
function runAll(): Ran[] {
  const base = defaultState(circleTemplate([0, 0], 1.5));
  const out: Ran[] = [];
  for (const id of RECORDS) {
    const state = { ...base, mode: "gallery" as const, record: id, fixture: 0 };
    const r = resolveState(state, compile(state.expr));
    if (r.kind !== "gallery" || r.run === null) continue;
    out.push({
      id,
      rows: r.run.ledger.rows,
      spec: r.run.contour.pieces,
      params: r.run.contour.params,
    });
  }
  return out;
}

const RAN = runAll();

/**
 * The rows a `kernel/bounds/` module disposed of with an {@link ArcBound}.
 *
 * A KILL row on a `vanish` piece whose claim is a certificate's own sentence — which is what the
 * boundary in `claims.ts` makes those rows look like, and what distinguishes them from the templated
 * KILL rows (`kill.no-lemma`, `kill.computed`) that report there was no bound to take.
 *
 * **L4 and L5 are excluded, and finding them here is how the line got drawn.** The three rows the
 * first sweep reported as missing a bound are `smallArcLimit`'s and `largeArcLimit`'s — the
 * indentation and the `zf(z) → L` arc — and neither is an `ArcBound` at all: they compute a
 * CONTRIBUTION (`iα·Res`, `iα·L`) that the argument then carries, not a quantity that shrinks. There
 * is nothing there for a scrub to watch, which is the content of those two lemmas rather than a gap
 * in this one.
 */
const CONTRIBUTES = new Set(["L4", "L5"]);

function disposalRows(ran: Ran): readonly LedgerRow[] {
  return ran.rows.filter(
    (row) =>
      row.constraint === "KILL" &&
      row.claimData.template === "certificate" &&
      ran.spec.some(
        (p) =>
          p.id === row.pieceId &&
          p.role === "vanish" &&
          !(p.lemma !== undefined && CONTRIBUTES.has(p.lemma)),
      ),
  );
}

describe("a certified bound, as three numbers", () => {
  it("runs the whole corpus, so the sweep below is not about one record", () => {
    expect(RECORDS.length).toBe(28);
    expect(RAN.length).toBe(28);
  });

  it("carries `evaluated` on every bound the gallery takes", () => {
    const missing: string[] = [];
    let covered = 0;
    for (const ran of RAN) {
      for (const row of disposalRows(ran)) {
        if (row.evaluated === undefined) missing.push(`${ran.id}: ${row.claim}`);
        else covered++;
      }
    }
    expect(missing).toEqual([]);
    // **THE ANTI-VACUITY CLAUSE, MEASURED.** The corpus takes this many certified bounds at fixture
    // 0 — a floor rather than an equality, since a record added later raises it and a record that
    // stops producing one is the regression this number exists to catch.
    expect(covered).toBeGreaterThanOrEqual(42);
  });

  it("names a parameter the contour actually has, at the value it actually holds", () => {
    const wrong: string[] = [];
    for (const ran of RAN) {
      for (const row of disposalRows(ran)) {
        const ev = row.evaluated;
        if (ev === undefined) continue;
        const param = ran.params[ev.param];
        if (param === undefined) {
          wrong.push(`${ran.id}/${row.pieceId ?? "?"}: no parameter '${ev.param}'`);
          continue;
        }
        // Exact equality, not a tolerance: `at` is READ from the same field the slider writes, and
        // anything that reconstructed it from the geometry — the square's half-width is `N + ½`, the
        // strip's abscissa is `−R` on one side — would land near it rather than on it. A scrub that
        // writes back a value half a unit off moves the contour on its first drag.
        if (param.value !== ev.at) {
          wrong.push(`${ran.id}/${row.pieceId ?? "?"}: ${ev.param} = ${param.value}, at = ${ev.at}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("reports the number the sentence prints", () => {
    const disagree: string[] = [];
    for (const ran of RAN) {
      for (const row of disposalRows(ran)) {
        const ev = row.evaluated;
        if (ev === undefined) continue;
        // Every producer in `kernel/bounds/` prints its bound as `toExponential(3)`, so this is the
        // one check that ties the field to the claim beside it without re-deriving either.
        if (!row.claim.includes(ev.bound.toExponential(3))) {
          disagree.push(`${ran.id}/${row.pieceId ?? "?"}: ${ev.bound.toExponential(3)} ∉ ${row.claim}`);
        }
      }
    }
    expect(disagree).toEqual([]);
  });

  it("accompanies `value` wherever a producer has one, and agrees with it", () => {
    // The four producers whose bound is EXACT in ℚ and therefore lands in `ArcBound.value`; the
    // other five compute `ρ^α`, `ln ρ` or `e^{κR}` and deliberately omit the field (see the type).
    // `value` is invisible from a ledger row, so the implication is checked where it is visible.
    const one = QiPoly.fromCoeffs([Gauss.ONE]);
    const quartic = QiPoly.fromCoeffs([Gauss.ONE, Gauss.ZERO, Gauss.ZERO, Gauss.ZERO, Gauss.ONE]);
    const quadratic = QiPoly.fromCoeffs([Gauss.ONE, Gauss.ZERO, Gauss.ONE]);
    const bounds = [
      mlArcBound(one, quartic, Frac.of(4n), Frac.ONE, "R"),
      jordanArcBound(one, quadratic, Frac.ONE, "upper", Frac.of(4n), "R"),
      wedgeArcBound({ w: Gauss.I, n: 2, lambda: Gauss.ONE }, Frac.of(4n), { from: Frac.ZERO, to: Frac.of(1n, 4n) }, "R"),
      squareSideBound("cot", one, quadratic, Frac.of(7n, 2n), "N"),
    ];
    for (const b of bounds) {
      expect(b.value).toBeDefined();
      expect(b.evaluated).toBeDefined();
      expect(b.evaluated?.bound).toBe(b.value?.toNumber());
    }
    // The square reports `N`, not the half-width it was handed — the difference the scrub depends on.
    expect(bounds[3]?.evaluated).toEqual({ param: "N", at: 3, bound: bounds[3]?.value?.toNumber() });
  });
});

describe("the `param` claim argument", () => {
  it("renders exactly as `number` does, so no sentence moves", () => {
    for (const value of [4, 3, 0.15, 1234.5, 0.04999999, -1, 1e-9, 6.283185307179586]) {
      for (const digits of [undefined, 3, 6]) {
        expect(
          renderArg({ kind: "param", name: "R", value, ...(digits === undefined ? {} : { digits }) }),
          `${value} @ ${String(digits)}`,
        ).toBe(renderArg({ kind: "number", value, ...(digits === undefined ? {} : { digits }) }));
      }
    }
  });

  it("is the one argument the split claim adds, and it agrees with `evaluated`", () => {
    // Where `certificateClaimAt` could lift the parameter out of the sentence, the argument and the
    // triple must be the same number under the same name — two routes to the scrub's target, and a
    // card is free to take either.
    let split = 0;
    for (const ran of RAN) {
      for (const row of disposalRows(ran)) {
        const arg = row.claimData.args.param;
        if (arg === undefined || arg.kind !== "param") continue;
        split++;
        expect(arg.name).toBe(row.evaluated?.param);
        expect(arg.value).toBe(row.evaluated?.at);
        // The split is a partition of the original sentence: head + the rendered value + tail.
        const head = row.claimData.args.head;
        const tail = row.claimData.args.tail;
        expect(head?.kind === "text" && tail?.kind === "text").toBe(true);
        expect(row.claim.endsWith(tail?.kind === "text" ? tail.text : "\u0000")).toBe(true);
        // **And the numeral the scrub replaces is the one the sentence calls by the parameter's
        // name.** Pinning the count alone could not see this: `gaussianSide` prints
        // `at $\operatorname{Re} z = 6$`, E3's abscissa IS `R`, and the first draft matched it on
        // the numeral — 18 rows across the corpus taking a scrub labelled `R` planted inside
        // *Re z*, and only on the right-hand side, because the left prints `= -6$`. The `split`
        // floor below rose by 18 and would have called that an improvement.
        const opener = head?.kind === "text" ? head.text.lastIndexOf("at $") : -1;
        expect(`${row.claim.slice(0, 40)}: ${opener >= 0}`).toBe(`${row.claim.slice(0, 40)}: true`);
        const lhs = head?.kind === "text" ? head.text.slice(opener + 4, head.text.length - 2) : "";
        expect(`${row.claim.slice(0, 40)}: ${lhs.trim()}`).toBe(
          `${row.claim.slice(0, 40)}: ${paramSymbol(arg.name)}`,
        );
      }
    }
    // **MEASURED: 26 of the corpus's 42 bounds, AND THE REASON IT IS NOT ALL OF THEM.** A `param`
    // argument renders through `toPrecision`, and four of the nine producers print their parameter
    // as `toExponential(3)` (`branchArc`'s two forms, `logArc`) or as a formatted fraction
    // (`gaussianSide`'s `at $\operatorname{Re} z = -1$`, which is not a parameter name at all) — so
    // those sentences keep the opaque form rather than being edited to suit the argument, and their
    // rows carry the number in `evaluated` alone. That is why the card reads `evaluated` and treats
    // this argument as the convenience it is. `gaussianSide` is in that list because the locator
    // now requires the `=`'s left-hand side to BE the parameter's symbol; it used to be in the list
    // only in this comment.
    // 26, not the 27 the first draft measured: the twenty-seventh was E3's right-hand vertical
    // side, matched on the numeral in *Re z*, which the symbol check above now refuses.
    expect(split).toBeGreaterThanOrEqual(26);
  });
});
