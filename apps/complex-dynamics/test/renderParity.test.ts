import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "@cas/expr/parser";
import { differentiate } from "@cas/expr/derivative";
import { buildFragmentShader } from "../src/render/shaderBuilder";
import { extractPolyPerturbation } from "../src/render/perturbationPoly";

// WP9 (review 2026-09-16). Four claims about what the two GPU paths agree on, and about what the
// deep-zoom paths are allowed to do, pinned where the node gate can see them: the shader source is
// a string, and the gating rules are source-level because driving them needs a real context.

const SRC = readFileSync(
  fileURLToPath(new URL("../src/render/glPlot.ts", import.meta.url)),
  "utf8",
);
const ESC = parse("abs(z) > 2");

/** The `LOG_DEGREE` constant the standard shader emits for `f`, given the degree passed in. */
function logDegreeOf(src: string): number {
  const m = /const float LOG_DEGREE = ([-\d.e]+)/.exec(src);
  if (!m) throw new Error("no LOG_DEGREE in the emitted shader");
  return Number(m[1]);
}

describe("R5 — both programs normalise the smooth escape time by the SAME degree", () => {
  // `_monicDegree` is null for anything that is not exactly z^d + c, so `z³ − z + c` emitted
  // LOG_DEGREE = log 2 in the standard shader while `perturbDegree()` handed the kernel 3. Toggling
  // perturbation re-banded the exterior — and log 3 is the correct one, since the smooth escape
  // time normalises by the polynomial's DEGREE.
  it("a general polynomial's degree reaches the standard shader, not just the kernel", () => {
    const f = parse("z^3-z+c");
    const poly = extractPolyPerturbation(f, [0, 0], 8);
    expect(poly?.degree).toBe(3); // what the kernel divides by (uPerturbDegree)

    // What `compile()` now passes: `_polyPerturb?.degree ?? _monicDegree`. `_monicDegree` is null here.
    const withFix = buildFragmentShader(
      f,
      ESC,
      "single",
      differentiate(f, "z"),
      differentiate(f, "c"),
      poly?.degree ?? null,
    );
    expect(logDegreeOf(withFix)).toBeCloseTo(Math.log(3), 12);

    // The anti-vacuity clause: passing the old value really does emit a different constant.
    const withoutFix = buildFragmentShader(
      f,
      ESC,
      "single",
      differentiate(f, "z"),
      differentiate(f, "c"),
      null,
    );
    expect(logDegreeOf(withoutFix)).toBeCloseTo(Math.log(2), 12);
  });

  it("compile() passes the general-polynomial degree when there is one", () => {
    // Source-level, because `compile` is private and needs a live context to call.
    expect(SRC).toContain("this._polyPerturb?.degree ?? this._monicDegree");
  });

  it("z^d + c is unaffected — its monic degree was always right", () => {
    for (const [src, d] of [
      ["z^2+c", 2],
      ["z^3+c", 3],
    ] as const) {
      const f = parse(src);
      const out = buildFragmentShader(
        f,
        ESC,
        "single",
        differentiate(f, "z"),
        differentiate(f, "c"),
        d,
      );
      expect(logDegreeOf(out)).toBeCloseTo(Math.log(d), 12);
    }
  });
});

describe("R4 — the deep-zoom paths have no projected coordinate, so they refuse to run under one", () => {
  // The df64 build does not even DECLARE uProjection, and the perturbation kernel's `dc` is the
  // plain linear pixel offset. Before this, the picture snapped back to the linear view past the
  // df64 threshold while the note still said "Poincaré disk view active", the pointer still
  // inverse-projected and the overlay stayed hidden.
  it("the df64 shader really does lack the projection uniform (the premise)", () => {
    const f = parse("z^2+c");
    const df64 = buildFragmentShader(
      f,
      ESC,
      "df64",
      differentiate(f, "z"),
      differentiate(f, "c"),
      2,
    );
    expect(df64).not.toContain("uProjection");
    const single = buildFragmentShader(
      f,
      ESC,
      "single",
      differentiate(f, "z"),
      differentiate(f, "c"),
      2,
    );
    expect(single).toContain("uProjection"); // …and the single build does — so this is a real gap
  });

  it("desiredPrecision and usePerturbation both bail out on a projection", () => {
    const body = (sig: string): string => {
      const at = SRC.indexOf(sig);
      expect(at, sig).toBeGreaterThan(0);
      return SRC.slice(at, SRC.indexOf("\n  }", at));
    };
    expect(body("private desiredPrecision(): Precision {")).toContain(
      'this._projection !== 0) return "single"',
    );
    expect(body("private usePerturbation(): boolean {")).toContain(
      "this._projection !== 0) return false",
    );
  });
});

describe("R9 — the BLA table is rebuilt by the octave, not by the frame", () => {
  // A table built for a LARGER |δc| stays valid for a smaller one (each level is accepted only if
  // its linearisation holds over the whole disc), so an exact zoom match was far stricter than
  // correctness needs — and it rebuilt + re-uploaded on every wheel notch.
  const COVERED = /const covered =[\s\S]*?;\n/.exec(SRC)?.[0] ?? "";

  it("the guard is a coverage test over maxC, not an equality test on zoom", () => {
    expect(COVERED).toContain("wantMaxC <= this.blaBuiltMaxC");
    expect(COVERED).toContain("wantMaxC >= this.blaBuiltMaxC / 2");
    expect(SRC).not.toContain("blaBuiltZoom");
  });

  /** The predicate itself, extracted so the table below tests arithmetic rather than a string. */
  const covered = (want: number, built: number, levels = 4): boolean =>
    levels > 0 && built > 0 && want <= built && want >= built / 2;

  it("reuses within an octave, rebuilds on the way out and past it", () => {
    const built = 1e-6;
    expect(covered(built, built)).toBe(true); // the same view
    expect(covered(built * 0.75, built)).toBe(true); // zoomed in a little
    expect(covered(built * 0.5, built)).toBe(true); // exactly one octave in
    expect(covered(built * 0.49, built)).toBe(false); // past it — needlessly conservative
    expect(covered(built * 1.01, built)).toBe(false); // zoomed OUT — no longer valid
    expect(covered(built, 0)).toBe(false); // no table yet
    expect(covered(built, built, 0)).toBe(false); // an empty table is not cover
  });
});
