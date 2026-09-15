// Step 0.6 — what every record says about itself.
//
// The four-line standard is DATA: the identity is `targets` + `closedForm`, and the other three
// lines are `description`. These tests are about the corpus as a whole — that all 28 load, that the
// taxonomy really is eight groups, that the front row is a tour of them, and that the titles name
// integrals rather than punchlines.
import katex from "katex";
import { describe, expect, it } from "vitest";
import { FAMILIES, loadFamilies } from "../src/families/index.js";
import { isVariant } from "../src/families/describe.js";
import { TAXONOMY_SECTIONS, type CitationBook } from "../src/families/schema.js";

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
