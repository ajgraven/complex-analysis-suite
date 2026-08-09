import { describe, expect, it } from "vitest";
import { wordAt, filterCandidates, type Candidate } from "../src/ui/autocomplete.js";

// The autocomplete (catalog A5) is DOM + keyboard, but the token-under-caret and prefix-match logic is
// pure. Pin it here.

const cands: Candidate[] = [
  { name: "sin", fn: true },
  { name: "sinh", fn: true },
  { name: "sqrt", fn: true },
  { name: "pi", fn: false },
  { name: "phi", fn: false },
  { name: "γ", fn: false },
  { name: "z", fn: false },
];

describe("wordAt", () => {
  it("returns the identifier ending at the caret and its start index", () => {
    expect(wordAt("si", 2)).toEqual({ word: "si", start: 0 });
    expect(wordAt("z^2 + sq", 8)).toEqual({ word: "sq", start: 6 });
    expect(wordAt("sin(z", 5)).toEqual({ word: "z", start: 4 });
  });

  it("is empty right after a non-identifier character", () => {
    expect(wordAt("z^", 2)).toEqual({ word: "", start: 2 });
    expect(wordAt("sin(", 4)).toEqual({ word: "", start: 4 });
  });

  it("includes γ as an identifier character", () => {
    expect(wordAt("2*γ", 3)).toEqual({ word: "γ", start: 2 });
  });
});

describe("filterCandidates", () => {
  it("returns prefix matches (case-insensitive), shortest first", () => {
    expect(filterCandidates("si", cands).map((c) => c.name)).toEqual(["sin", "sinh"]);
    expect(filterCandidates("P", cands).map((c) => c.name)).toEqual(["pi", "phi"]);
  });

  it("returns nothing for an empty word or when the only match is already complete", () => {
    expect(filterCandidates("", cands)).toEqual([]);
    expect(filterCandidates("z", cands)).toEqual([]); // exact + only match ⇒ nothing to add
    expect(filterCandidates("phi", cands)).toEqual([]); // exact + only match
  });

  it("caps the number of results", () => {
    const many: Candidate[] = Array.from({ length: 20 }, (_, i) => ({
      name: `aa${i}`,
      fn: false,
    }));
    expect(filterCandidates("aa", many, 8)).toHaveLength(8);
  });
});
