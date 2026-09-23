import { describe, it, expect } from "vitest";
import { compileAlphabet } from "../src/engine/alphabet";
import type { Alphabet } from "../src/engine/alphabet";
import { ANNULUS_INNER, MAX_DEPTH, MIN_DEPTH, NODE_BUDGET, walkSpec } from "../src/engine/limit/walk";
import { buildWalkShader, clampDepth, STATUS_EXCLUDED, STATUS_EXHAUSTED, walkProgramKey, WALK_VERT } from "../src/engine/limit/walkGlsl";

const compile = (spec: Parameters<typeof compileAlphabet>[0]): Alphabet => {
  const r = compileAlphabet(spec);
  if ("error" in r) throw new Error(r.error);
  return r.alphabet;
};

describe("the generated walk shader", () => {
  it("bakes the alphabet in, because GLSL array sizes cannot be uniforms", () => {
    // The explicit stack is `vec2 sm[DEPTH + 1]`, and `DEPTH` is what the reader chose. That is the
    // constraint that decides generation over parameterisation; the alphabet riding along in the program
    // text is the consequence, and a welcome one — the compiler can fold it.
    const src = buildWalkShader(compile({ preset: "trinary" }), 20);
    expect(src).toContain("#define DEPTH 20");
    expect(src).toContain("#define NVAL 3");
    expect(src).toContain("const vec2 VAL[NVAL] = vec2[NVAL](vec2(-1.00000000, 0.00000000), vec2(0.00000000, 0.00000000), vec2(1.00000000, 0.00000000))");
    expect(src).toContain("vec2 sm[DEPTH + 1]");
    // No uniform array anywhere: the alphabet is not runtime data.
    expect(src).not.toMatch(/uniform[^;]*\[/);
  });

  it("carries a complex alphabet's imaginary parts, not just its real ones", () => {
    const src = buildWalkShader(compile({ preset: "custom", custom: "1, -1, i, -i" }), 12);
    expect(src).toContain("vec2(0.00000000, -1.00000000)");
    expect(src).toContain("vec2(0.00000000, 1.00000000)");
    expect(src).toContain("#define NVAL 4");
    // Only ONE leading representative: `{1, −1, i, −i}` is a group under multiplication, so every
    // non-zero value is a unit and every proper series is a unit multiple of one with `a_0` fixed.
    expect(src).toContain("#define NLEAD 1");
  });

  it("every number it emits is a legal GLSL float", () => {
    // An integer literal where a float is expected is a compile error, and a compile error in a
    // generated shader is only found by a browser. Checked here instead, over every preset.
    for (const spec of [
      { preset: "littlewood" },
      { preset: "zero-one" },
      { preset: "trinary" },
      { preset: "range", n: 3 },
      { preset: "roots-of-unity", n: 5 },
      { preset: "roots-of-unity", n: 12 },
    ] as const) {
      const src = buildWalkShader(compile(spec), 24);
      for (const line of src.split("\n")) {
        if (line.trimStart().startsWith("#define DEPTH") || line.trimStart().startsWith("#define NVAL")) continue;
        if (line.trimStart().startsWith("#define NLEAD") || line.trimStart().startsWith("#define MAXITER")) continue;
        for (const literal of line.match(/vec2\(\s*[^)]*\)/g) ?? []) {
          for (const part of literal.slice(5, -1).split(",")) {
            expect(part.trim(), `${JSON.stringify(spec)}: ${literal}`).toMatch(/[.eE]/);
          }
        }
      }
    }
  });

  it("gives a nine-digit integer its decimal point back", () => {
    // `toPrecision(9)` writes a decimal point for everything this app normally carries — which is why
    // the guard after it looks like dead code and a mutant removing it survives every other test. It is
    // not dead: nine integer digits exhaust the precision and the point disappears, and `vec2(123456789,
    // 0.0)` is a GLSL compile error the node gate cannot see. The custom alphabet accepts any finite
    // number, so the case is reachable by typing one.
    expect((123456789).toPrecision(9)).toBe("123456789");
    const src = buildWalkShader(compile({ preset: "custom", custom: "123456789, -1" }), 12);
    expect(src).toContain("vec2(123456789.0, 0.00000000)");
    expect(src).not.toContain("vec2(123456789, ");
  });

  it("holds the SAME constants the float64 walk does", () => {
    // The two backends are compared per pixel in the browser suite, and the browser suite is not in
    // `pnpm test`. A constant that drifted between the two would be a difference no node run could see,
    // so the shared numbers are asserted where they are cheap to assert.
    const src = buildWalkShader(compile({ preset: "littlewood" }), 30);
    expect(src).toContain(`#define BUDGET ${NODE_BUDGET.toPrecision(9)}`);
    expect(src).toContain(`#define BAND ${ANNULUS_INNER.toPrecision(9)}`);
    expect(src).toContain("#define MAXABS 1.00000000");
    // The loop bound cannot be reached: one iteration per node and at most one per backtrack.
    expect(src).toContain(`#define MAXITER ${2 * NODE_BUDGET + 30 + 4}`);
    expect(src).toContain(`fragColor = vec4(${STATUS_EXCLUDED.toPrecision(9)}, 0.0, 0.0, 1.0)`);
    expect(src).toContain(`fragColor = vec4(${STATUS_EXHAUSTED.toPrecision(9)}, 0.0, 0.0, 1.0)`);
    // Negative R is a status; the count it stands in for is never negative.
    expect(STATUS_EXCLUDED).toBeLessThan(0);
    expect(STATUS_EXHAUSTED).toBeLessThan(STATUS_EXCLUDED);
  });

  it("is deterministic, and its cache key separates exactly what changes it", () => {
    const tri = compile({ preset: "trinary" });
    const lit = compile({ preset: "littlewood" });
    expect(buildWalkShader(tri, 24)).toBe(buildWalkShader(tri, 24));
    expect(buildWalkShader(tri, 24)).not.toBe(buildWalkShader(tri, 25));
    expect(buildWalkShader(tri, 24)).not.toBe(buildWalkShader(lit, 24));
    expect(walkProgramKey(tri, 24)).not.toBe(walkProgramKey(tri, 25));
    expect(walkProgramKey(tri, 24)).not.toBe(walkProgramKey(lit, 24));
    expect(walkProgramKey(tri, 24)).toBe(walkProgramKey(compile({ preset: "trinary" }), 24));
    // A key that ignored the depth would leave a stale program under a moved slider — the Contour
    // Integration M5.1 defect, which recompiled on every frame for the mirror-image reason.
    expect(walkProgramKey(tri, 24)).toContain("24");
  });

  it("clamps the depth to what its own arrays can carry", () => {
    expect(clampDepth(0)).toBe(MIN_DEPTH);
    expect(clampDepth(1000)).toBe(MAX_DEPTH);
    expect(clampDepth(24.4)).toBe(24);
    expect(buildWalkShader(compile({ preset: "littlewood" }), 1000)).toContain(`#define DEPTH ${MAX_DEPTH}`);
  });

  it("the vertex half draws a fullscreen triangle with no attributes", () => {
    expect(WALK_VERT).toContain("gl_VertexID");
    expect(WALK_VERT).not.toContain("in vec");
  });

  it("the leading table is the alphabet's own unit reduction, not a guess", () => {
    for (const [preset, leading] of [
      ["littlewood", 1],
      ["zero-one", 1],
      ["trinary", 1],
    ] as const) {
      const alphabet = compile({ preset });
      expect(walkSpec(alphabet).leading.length >> 1, preset).toBe(leading);
      expect(buildWalkShader(alphabet, 16)).toContain(`#define NLEAD ${leading}`);
    }
    // `{−3 … 3}` has units `{±1}` and six non-zero values, so three representatives.
    const range = compile({ preset: "range", n: 3 });
    expect(walkSpec(range).leading.length >> 1).toBe(3);
    expect(buildWalkShader(range, 16)).toContain("#define NLEAD 3");

    // And the CONTENTS, not just the count. `{0, 1}` is the one preset where the leading table and the
    // head of the value table differ — `0` sorts first — so it is the only one that can tell an
    // emitted `LEAD` built from the wrong array apart, and without it a shader whose `a_0` is ZERO
    // compiles, links and draws a picture of the wrong family.
    expect(buildWalkShader(compile({ preset: "zero-one" }), 16)).toContain(
      "const vec2 LEAD[NLEAD] = vec2[NLEAD](vec2(1.00000000, 0.00000000));",
    );
    // The invariant behind it, over every preset: a proper polynomial has `a_0 ≠ 0`.
    for (const spec of [
      { preset: "littlewood" },
      { preset: "zero-one" },
      { preset: "trinary" },
      { preset: "range", n: 4 },
      { preset: "roots-of-unity", n: 6 },
      { preset: "custom", custom: "0, 1, -1, i" },
    ] as const) {
      const src = buildWalkShader(compile(spec), 12);
      const lead = /const vec2 LEAD\[NLEAD\] = vec2\[NLEAD\]\((.*)\);/.exec(src);
      expect(lead, JSON.stringify(spec)).not.toBeNull();
      for (const literal of (lead?.[1] ?? "").match(/vec2\([^)]*\)/g) ?? []) {
        const [re, im] = literal.slice(5, -1).split(",").map(Number);
        expect(Math.hypot(re, im), `${JSON.stringify(spec)}: ${literal}`).toBeGreaterThan(0);
      }
    }
  });
});
