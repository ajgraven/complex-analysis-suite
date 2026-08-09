import { describe, expect, it } from "vitest";
import { parse } from "@cas/expr/parser";
import { calledFunctions } from "@cas/expr/ast";
import { precisionNote, PRECISION_NOTES } from "../src/ui/precision.js";

// The float32 precision badge (Phase 4, honest-labeling). The DOM wiring in main.ts is
// `precisionNote(calledFunctions(fAst))`; this pins the pure policy and that exact end-to-end path.

// The map → note path the app actually runs.
const noteFor = (src: string): ReturnType<typeof precisionNote> =>
  precisionNote(calledFunctions(parse(src)));

describe("precisionNote — the float32 special-function policy", () => {
  it("warns for ζ (materially lossy in float32)", () => {
    const note = noteFor("zeta(z)");
    expect(note?.fn).toBe("zeta");
    expect(note?.severity).toBe("warn");
    expect(note?.text.startsWith("≈")).toBe(true);
  });

  it("gives a mild note for Γ (single-precision near the poles)", () => {
    const note = noteFor("gamma(z) + c");
    expect(note?.fn).toBe("gamma");
    expect(note?.severity).toBe("note");
    expect(note?.text.startsWith("≈")).toBe(true);
  });

  it("returns null for a map that uses no limited builtin", () => {
    expect(noteFor("z^2 + c")).toBeNull();
    expect(noteFor("sin(z) + exp(z)")).toBeNull();
    expect(noteFor("a*z + b")).toBeNull();
  });

  it("shows the stronger ζ warning when a map uses both ζ and Γ", () => {
    // ζ dominates — its reflection evaluates Γ internally anyway, so the Γ caveat is subsumed.
    expect(noteFor("zeta(gamma(z))")?.fn).toBe("zeta");
    expect(noteFor("gamma(z) + zeta(z)")?.fn).toBe("zeta");
  });

  it("fires when the special function is nested deep in the expression", () => {
    expect(noteFor("1/zeta(z^2 + c)")?.fn).toBe("zeta");
    expect(noteFor("w = gamma(z); w + 1/w")?.fn).toBe("gamma");
  });
});

describe("PRECISION_NOTES table", () => {
  it("is ordered strongest-first (warn before note) so precisionNote picks the dominant one", () => {
    const firstNoteIdx = PRECISION_NOTES.findIndex((n) => n.severity === "note");
    const lastWarnIdx =
      PRECISION_NOTES.length -
      1 -
      [...PRECISION_NOTES].reverse().findIndex((n) => n.severity === "warn");
    expect(lastWarnIdx).toBeLessThan(firstNoteIdx);
  });

  it("accepts a plain iterable of names, not only a Set", () => {
    expect(precisionNote(["zeta"])?.fn).toBe("zeta");
    expect(precisionNote([])).toBeNull();
  });
});
