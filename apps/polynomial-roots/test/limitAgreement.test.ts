import { describe, it, expect } from "vitest";
import { compileAlphabet } from "../src/engine/alphabet";
import type { Alphabet } from "../src/engine/alphabet";
import { walkGrid, walkSpec } from "../src/engine/limit/walk";
import { orbitSpace } from "../src/engine/orbits";
import { sweepChunk } from "../src/engine/sweep";
import { placeById } from "../src/places";
import { centreNumbers } from "../src/state";

const compile = (spec: Parameters<typeof compileAlphabet>[0]): Alphabet => {
  const r = compileAlphabet(spec);
  if ("error" in r) throw new Error(r.error);
  return r.alphabet;
};

/** Every degree-≤`d` root of the alphabet, rasterised into a `size × size` grid over the view. */
function rootMask(alphabet: Alphabet, spec: Parameters<typeof compileAlphabet>[0], maxDegree: number, half: number, size: number): Uint8Array {
  const lit = new Uint8Array(size * size);
  for (let degree = 1; degree <= maxDegree; degree++) {
    const space = orbitSpace(alphabet, degree);
    const swept = sweepChunk({ spec, degree, lo: 0, hi: space.total, circleDelta: 0.02 });
    if ("error" in swept) throw new Error(swept.error);
    for (let p = 0; p + 2 < swept.points.length; p += 3) {
      const x0 = swept.points[p];
      const y0 = swept.points[p + 1];
      // The representative's whole orbit, exactly as the stage's vertex shader draws it.
      for (const g of alphabet.group) {
        let x = x0;
        let y = y0;
        if (g.conj) y = -y;
        if (g.rev) {
          const d = x * x + y * y;
          x = x / d;
          y = -y / d;
        }
        if (g.neg) {
          x = -x;
          y = -y;
        }
        const i = Math.floor(((x + half) / (2 * half)) * size);
        const j = Math.floor(((y + half) / (2 * half)) * size);
        if (i >= 0 && j >= 0 && i < size && j < size) lit[j * size + i] = 1;
      }
    }
  }
  return lit;
}

describe("the two engines, on the same picture", () => {
  it("every pixel the root cloud lights is lit by the limit set — an inclusion, not a correlation", () => {
    // The plan's gate asked for a pixel-wise correlation. What is available is stronger and exact, and
    // it is worth having instead: the limit set at depth `D` is a SUPERSET of the limit set, which is
    // the closure of the root set (Bousch), so a pixel holding a root of any degree must be lit by the
    // walk. A correlation would have passed with a systematic offset, a wrong fold or a wrong aspect;
    // this fails on a single pixel.
    //
    // Measured over a 128² grid of [−1.45, 1.45]², band excluded, against the depth-28 walk: at EVERY
    // degree from 2 to 20 the coverage is 100.00%, not one root pixel missed — 4,460 root-lit pixels at
    // degree 14 (what this test can afford), 4,668 at 16 and 4,744 at 20. And the walk's own surplus
    // falls as the degree climbs — 5,702 pixels at degree 2, 1,874 at 12, 1,244 at 14, 960 at 20 — which
    // is the root cloud converging onto the limit set, the one thing a correlation could have shown and
    // did not need to.
    const spec = { preset: "littlewood" } as const;
    const alphabet = compile(spec);
    const size = 128;
    const half = 1.45;
    const maxDegree = 14;
    const lit = rootMask(alphabet, spec, maxDegree, half, size);
    const walked = walkGrid(walkSpec(alphabet), { cx: 0, cy: 0, halfWidth: half, halfHeight: half }, size, size, {
      depth: 28,
    });

    let rootLit = 0;
    let limitOnly = 0;
    const missed: string[] = [];
    for (let i = 0; i < lit.length; i++) {
      if (walked.status[i] !== 0) continue; // the band: the walk does not answer there
      const inLimit = walked.reach[i] === 29;
      if (lit[i] === 1) {
        rootLit++;
        if (!inLimit) missed.push(String(i));
      } else if (inLimit) {
        limitOnly++;
      }
    }
    expect(rootLit, "nothing was lit — the corpus is vacuous").toBeGreaterThan(1500);
    expect(missed.slice(0, 8).join(","), "root pixels the limit set does not cover").toBe("");
    // And the inclusion has to be STRICT, or the test would also pass if the walk lit everything or if
    // the two were the same computation twice.
    expect(limitOnly).toBeGreaterThan(800);
    expect(limitOnly).toBeLessThan(rootLit);
  });

  it("a wrong fold would break the inclusion — the test can fail", () => {
    // An inclusion test that nothing can violate is not evidence. The root mask is built with the
    // orbit's `1/z` image and compared against a walk over a DIFFERENT window, which must miss.
    const spec = { preset: "littlewood" } as const;
    const alphabet = compile(spec);
    const size = 64;
    const lit = rootMask(alphabet, spec, 10, 1.45, size);
    const shifted = walkGrid(walkSpec(alphabet), { cx: 0.3, cy: 0, halfWidth: 1.45, halfHeight: 1.45 }, size, size, {
      depth: 24,
    });
    let missed = 0;
    for (let i = 0; i < lit.length; i++) {
      if (shifted.status[i] !== 0) continue;
      if (lit[i] === 1 && shifted.reach[i] !== 25) missed++;
    }
    expect(missed).toBeGreaterThan(50);
  });
});

describe("the hexaholes", () => {
  it("resolve at ω in a window 0.0005 tall — a hole that does not touch the frame", () => {
    // PR-2's gate. The place's own state, walked at the place's own depth: what must be there is an
    // INTERIOR hole, because an escaped region running off the edge of the frame is a boundary and any
    // view of the cloud's outside has one. Measured: 37 escaped texels of 2,560 walked, one connected
    // region, no cell of it on the frame, about a tenth of the window across.
    const place = placeById("hexaholes");
    expect(place?.state.engine).toBe("limit");
    if (place === undefined) throw new Error("the hexahole place is gone");
    const alphabet = compile(place.state.alphabet);
    const width = 64;
    const height = 40;
    const depth = place.state.depth;
    const g = walkGrid(
      walkSpec(alphabet),
      { ...centreNumbers(place.state), halfWidth: place.state.halfHeight * 1.6, halfHeight: place.state.halfHeight },
      width,
      height,
      { depth },
    );
    let onFrame = 0;
    let escaped = 0;
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        const at = j * width + i;
        expect(g.status[at], "the hexaholes are outside the excluded band").toBe(0);
        if (g.reach[at] === depth + 1) continue;
        escaped++;
        if (i === 0 || j === 0 || i === width - 1 || j === height - 1) onFrame++;
      }
    }
    expect(escaped).toBeGreaterThan(20);
    expect(escaped).toBeLessThan(200);
    expect(onFrame, "the escaped region runs off the frame, so it is an edge and not a hole").toBe(0);
  });

  it("fills in as the depth falls, because the picture is a superset at every finite depth", () => {
    // The hole is not a feature of the window; it is a feature of the depth. At depth 12 the
    // approximation is still coarse enough to cover it, and the reader sliding the depth down watches it
    // close. Measured at the place's window: 0 escaped texels at depth 12, 6 at 20, 37 at 40.
    const place = placeById("hexaholes");
    if (place === undefined) throw new Error("the hexahole place is gone");
    const spec = walkSpec(compile(place.state.alphabet));
    const view = {
      ...centreNumbers(place.state),
      halfWidth: place.state.halfHeight * 1.6,
      halfHeight: place.state.halfHeight,
    };
    const escapedAt = (depth: number): number => {
      const g = walkGrid(spec, view, 64, 40, { depth });
      let n = 0;
      for (let i = 0; i < g.reach.length; i++) if (g.status[i] === 0 && g.reach[i] !== depth + 1) n++;
      return n;
    };
    const shallow = escapedAt(12);
    const deep = escapedAt(place.state.depth);
    expect(shallow).toBeLessThan(deep);
    expect(deep).toBeGreaterThan(20);
  });
});
