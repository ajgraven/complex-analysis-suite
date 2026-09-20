// Step 0.6 — what every record says about itself.
//
// The four-line standard is DATA: the identity is `targets` + `closedForm`, and the other three
// lines are `description`. These tests are about the corpus as a whole — that all 28 load, that the
// taxonomy really is eight groups, that the front row is a tour of them, and that the titles name
// integrals rather than punchlines.
import katex from "katex";
import { describe, expect, it } from "vitest";
import { evaluate, parse, type Complex } from "@cas/expr";
import { FAMILIES, loadFamilies } from "../src/families/index.js";
import { isVariant } from "../src/families/describe.js";
import { primaryGolden, runFamily } from "../src/families/runFamily.js";
import { TAXONOMY_SECTIONS, type CitationBook, type Golden } from "../src/families/schema.js";

const BOOKS: readonly CitationBook[] = [
  "Ahlfors",
  "Conway",
  "Stein–Shakarchi",
  "Brown–Churchill",
  "Marsden–Hoffman",
  "Needham",
  "Freitag–Busam",
  "Remmert",
];

describe("the corpus describes itself", () => {
  it("loads all 28 records and drops none", () => {
    const { families, violations } = loadFamilies();
    expect(violations).toEqual([]);
    expect(families.size).toBe(28);
    expect(FAMILIES.length).toBe(28);
  });

  it("uses exactly the eight groups, and every one is populated", () => {
    const used = new Set(FAMILIES.map((f) => f.taxonomySection));
    expect([...used].sort()).toEqual([...TAXONOMY_SECTIONS].sort());
  });

  it("has a front row of eight, one per group, ranked 1…8 without collision", () => {
    const front = FAMILIES.filter((f) => f.frontRow !== undefined);
    expect(front.length).toBe(8);
    expect(front.map((f) => f.frontRow).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // **One per group, and the ranks run in group order.** The plan's list of classics put D1 and D4
    // both among the keyholes, leaving the dogbones with no front-row entry at all; D6 takes rank 6
    // instead, so the row reads as the gallery's index rather than as a favourites list. An index
    // that skips a whole group is worse than one omitting a famous integral that is still one click
    // away inside its group.
    expect(new Set(front.map((f) => f.taxonomySection)).size).toBe(8);
    expect(
      [...front].sort((a, b) => (a.frontRow ?? 0) - (b.frontRow ?? 0)).map((f) => f.taxonomySection),
    ).toEqual([...TAXONOMY_SECTIONS]);
  });

  it("cites only books in the enum, always with a chapter or section, never an exercise", () => {
    for (const f of FAMILIES) {
      expect(f.description.citations.length, f.id).toBeGreaterThan(0);
      for (const c of f.description.citations) {
        expect(BOOKS, `${f.id}: ${c.book}`).toContain(c.book);
        expect(c.where.trim(), `${f.id}: ${c.book}`).not.toBe("");
        // The review marked every exercise it could not confirm; carrying one would be a claim the
        // gallery cannot support, and a reader who looks it up and finds nothing trusts the rest less.
        expect(c.where, `${f.id}: ${c.book}`).not.toMatch(/Exercise|Example/i);
      }
    }
  });

  it("titles the integral, not the punchline", () => {
    // The essay titles these replaced told a reader the lesson before the example. A title is a name.
    for (const f of FAMILIES) {
      for (const word of ["trap", "collide", "hand-waved", "switch", "ladder"]) {
        expect(f.title.toLowerCase(), `${f.id}`).not.toContain(word);
      }
      expect(f.title, f.id).not.toContain(" — ");
      expect(f.description.contour.trim(), f.id).not.toBe("");
      expect(f.description.point.trim(), f.id).not.toBe("");
    }
  });

  it("typesets: every `$…$` the card renders is balanced and is LaTeX KaTeX accepts", () => {
    // The same instrument `claims.test.ts` uses on the ledger's sentences, on the record's own.
    const bad: string[] = [];
    for (const f of FAMILIES) {
      const strings = [
        f.titleLatex,
        f.description.contour,
        f.description.point,
        ...f.description.citations.map((c) => c.text),
      ];
      for (const s of strings) {
        const parts = s.split("$");
        if ((parts.length & 1) === 0) {
          bad.push(`${f.id}: unbalanced $ in «${s}»`);
          continue;
        }
        for (let i = 1; i < parts.length; i += 2) {
          try {
            katex.renderToString(parts[i], { throwOnError: true, strict: "error" });
          } catch (e) {
            bad.push(`${f.id}: «${parts[i]}» — ${(e as Error).message}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("labels every variant fixture by what it IS, never by its flag", () => {
    let variants = 0;
    for (const f of FAMILIES) {
      for (const g of f.golden) {
        if (!isVariant(f, g)) {
          expect(g.label, `${f.id}: a binding fixture carries a label`).toBeUndefined();
          continue;
        }
        variants += 1;
        expect(g.label?.trim(), f.id).toBeTruthy();
        // **What is banned is the MACHINE rendering, not the word.** `the cosine companion` contains
        // the flag key `companion` and is exactly right; `halfRange = true` is what a reader must
        // never be offered. So: the label reads as prose — no `=`, and no camelCase identifier.
        expect(g.label ?? "", f.id).not.toMatch(/=/);
        expect(g.label ?? "", f.id).not.toMatch(/[a-z][A-Z]/);
      }
    }
    expect(variants).toBe(10);
  });
});

/**
 * **What the corpus SAYS about itself, checked against what the engine does with it.**
 *
 * The 2026-09-20 review measured four claims the records make and nothing read: the closed form
 * beside each fixture's number, the winding number declared per pole, the bonus clause loader
 * invariant 3 is built on, and the half-plane rule 19 records name. All four came out RIGHT — so
 * these are gaps rather than defects, and what they buy is that the next wrong one is caught by the
 * suite instead of by a reader. Each carries its own anti-vacuity count, because a filter that
 * silently emptied would otherwise pass over nothing.
 */
describe("the corpus agrees with the engine about itself", () => {
  /** A fixture's `params` as an `@cas/expr` scope; variant flags are not numbers and are dropped. */
  function scopeOf(params: Golden["params"]): Record<string, Complex> {
    const scope: Record<string, Complex> = {};
    for (const [name, value] of Object.entries(params)) {
      if (typeof value === "number") scope[name] = [value, 0];
    }
    return scope;
  }

  function evaluateAt(text: string, params: Golden["params"]): Complex {
    const got = evaluate(parse(text), [0, 0], [0, 0], undefined, scopeOf(params));
    if (!Array.isArray(got) || got.length !== 2) throw new Error(`not a complex value: ${String(got)}`);
    return got as Complex;
  }

  function want(g: Golden): Complex {
    return typeof g.numeric === "number" ? [g.numeric, 0] : [g.numeric[0], g.numeric[1]];
  }

  it("prints a closed form that IS the number beside it, at all 94 fixtures", () => {
    // **The M5.3d class — a right value under a wrong form — at the RECORD level.** `Golden.value`
    // is what `describe.ts`'s claim line and `latex.ts`'s identity line print verbatim, and the
    // golden corpus asserted `solved.text` only for the PRIMARY fixture, comparing numbers alone
    // everywhere else. So a wrong string beside a right number shipped on the card, in the
    // accessible name and in the front door's identity line, with nothing to catch it.
    const wrong: string[] = [];
    let checked = 0;
    for (const f of FAMILIES) {
      for (const g of f.golden) {
        const where = `${f.id} @ ${JSON.stringify(g.params)}`;
        let got: Complex;
        try {
          got = evaluateAt(g.value, g.params);
        } catch (e) {
          wrong.push(`${where}: "${g.value}" did not evaluate — ${(e as Error).message}`);
          continue;
        }
        checked += 1;
        const [re, im] = want(g);
        const scale = Math.max(1, Math.abs(re), Math.abs(im));
        if (Math.abs(got[0] - re) > 1e-9 * scale || Math.abs(got[1] - im) > 1e-9 * scale) {
          wrong.push(`${where}: "${g.value}" is ${got[0]} + ${got[1]}i, not ${re} + ${im}i`);
        }
      }
    }
    expect(wrong).toEqual([]);
    // Every one of them evaluates: there is no "unreadable" bucket for this to hide in.
    expect(checked).toBe(94);
    expect(checked).toBe(FAMILIES.reduce((n, f) => n + f.golden.length, 0));
  });

  it("declares winding numbers the engine agrees with, at every record's primary fixture", () => {
    // `contour.windings[]` is *"per-pole, not a prose blurb"* and `index.ts`'s loader says in so
    // many words that nothing evaluates them. For D6 the assertion `n(γ, ±ia) = 0` is the record's
    // entire point — its dogbone winds about the CUT and not about the poles the answer comes from
    // — so a record silently declaring the opposite would be a claim the engine contradicts.
    const wrong: string[] = [];
    let compared = 0;
    let nonZero = 0;
    const unreadable: string[] = [];
    for (const f of FAMILIES) {
      const g = primaryGolden(f);
      const r = runFamily(f, g);
      expect(r.ok, `${f.id} did not run`).toBe(true);
      if (!r.ok) continue;
      for (const w of f.contour.windings) {
        const where = `${f.id}: n(γ, ${w.pole})`;
        let at: Complex;
        let declaredN: Complex;
        try {
          at = evaluateAt(w.pole, g.params);
          declaredN = evaluateAt(w.n, g.params);
        } catch {
          // D3 names its poles as a FAMILY — `exp(i*pi*(2*k+1)/n)` over an index `k` the fixture
          // does not bind — which is the honest way to say "every n-th root of −1" and is the one
          // entry here that is not a point. Named, so the exception cannot grow silently.
          unreadable.push(where);
          continue;
        }
        compared += 1;
        if (declaredN[0] !== 0) nonZero += 1;
        const got = r.run.integral.windings.find(
          (x) => Math.hypot(x.at[0] - at[0], x.at[1] - at[1]) < 1e-7,
        );
        if (got === undefined) {
          wrong.push(`${where}: the engine has no pole at ${at[0]} + ${at[1]}i`);
          continue;
        }
        if (!got.decided) wrong.push(`${where}: the engine did not decide it`);
        else if (got.n !== declaredN[0]) wrong.push(`${where}: declared ${declaredN[0]}, engine says ${got.n}`);
      }
    }
    expect(wrong).toEqual([]);
    expect(unreadable).toEqual(["keyhole-x-to-the-n: n(γ, exp(i*pi*(2*k+1)/n))"]);
    expect(FAMILIES.reduce((n, f) => n + f.contour.windings.length, 0)).toBe(46);
    expect(compared).toBe(45);
    expect(nonZero).toBe(28);
  });

  it("declares no `bonus` at all — loader invariant 3's second clause is vacuous over the corpus", () => {
    // Not a defect and not dead code: `familyLoader.test.ts` exercises the clause on a synthetic
    // record, so the mechanism works. What does not exist is a corpus record that exercises it —
    // including D4 and D5, the log families it was bought from, whose affine lower-edge row lives
    // in `coefficients` rather than in `bonus`. The number is pinned so that a record acquiring one
    // is noticed and this test updated deliberately, rather than the clause quietly going live.
    const declaring = FAMILIES.filter((f) => f.contour.pieces.some((p) => p.bonus !== undefined));
    expect(declaring.map((f) => f.id)).toEqual([]);
  });

  it("names a half-plane the engine's own winding numbers agree with", () => {
    // `residueSelection.rule` is declared by every record and read by nothing but `targetTerms`.
    // The engine decides inclusion from the computed windings instead, which is the better source
    // — it follows a contour that has been dragged — but nothing compared the two, so a record
    // could name the wrong half-plane in silence. B1's is load-bearing: it closes UP or DOWN with
    // `sgn(a)`, and the rule is what a reader is told the choice was.
    const wrong: string[] = [];
    const checked: string[] = [];
    const emptied: string[] = [];
    for (const f of FAMILIES) {
      const rule = f.residueSelection.rule;
      if (rule !== "upperHalfPlane" && rule !== "lowerHalfPlane") continue;
      const g = primaryGolden(f);
      const r = runFamily(f, g);
      expect(r.ok, `${f.id} did not run`).toBe(true);
      if (!r.ok) continue;
      const weighted = r.run.integral.windings.filter((w) => w.decided && w.n !== 0);
      if (weighted.length === 0) {
        // C1 declares the half-plane AND an empty set — *"the whole answer is the indentation"* —
        // so an engine that weights nothing there is agreeing with it. Pinned by NAME rather than
        // skipped, because a record that silently stopped weighting anything would otherwise pass
        // this test by having nothing left to check.
        emptied.push(f.id);
        continue;
      }
      checked.push(f.id);
      const side = rule === "upperHalfPlane" ? 1 : -1;
      const strays = weighted.filter((w) => Math.sign(w.at[1]) !== side);
      if (strays.length > 0) {
        wrong.push(
          `${f.id}: declares '${rule}' but weights ${strays
            .map((w) => `${w.at[0]}${w.at[1] < 0 ? "" : "+"}${w.at[1]}i`)
            .join(", ")}`,
        );
      }
    }
    expect(wrong).toEqual([]);
    expect(emptied).toEqual(["indented-sinc"]);
    // The anti-vacuity count: a `rule` renamed would empty the filter and pass over nothing.
    expect(checked.length).toBeGreaterThanOrEqual(5);
  });
});
