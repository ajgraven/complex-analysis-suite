import { describe, it, expect } from "vitest";
import { PLACES, placeById } from "../src/places";
import { clampState, MAX_DEGREE } from "../src/state";
import { compileAlphabet } from "../src/engine/alphabet";
import { orbitSpace } from "../src/engine/orbits";
import { sweepChunk } from "../src/engine/sweep";

describe("the named places", () => {
  it("have distinct ids and are all reachable by id", () => {
    const ids = PLACES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(placeById(id)?.id).toBe(id);
    expect(placeById("nothing-like-this")).toBeUndefined();
  });

  it("every state is one the app can actually reach", () => {
    for (const place of PLACES) {
      expect(clampState(place.state), place.id).toEqual(place.state);
      expect(place.state.minDegree).toBeGreaterThanOrEqual(1);
      expect(place.state.maxDegree).toBeLessThanOrEqual(MAX_DEGREE);
      expect(place.state.halfHeight).toBeGreaterThan(0);
      const compiled = compileAlphabet(place.state.alphabet);
      expect("alphabet" in compiled, `${place.id}: ${JSON.stringify(place.state.alphabet)}`).toBe(true);
    }
  });

  it("every place actually has roots to show at the degrees it names", () => {
    // A place pointing at an empty window would be a caption with nothing under it. Checked by sweeping
    // its top degree and asking whether any root lands inside its view.
    for (const place of PLACES) {
      const compiled = compileAlphabet(place.state.alphabet);
      if (!("alphabet" in compiled)) throw new Error(place.id);
      const a = compiled.alphabet;
      // The WHOLE index space at a degree small enough to sweep here — sampling a prefix of it would
      // make an empty window look like a sampling artefact, which is how the first draft nearly let the
      // hexahole place through.
      const degree = Math.min(place.state.maxDegree, 12);
      const space = orbitSpace(a, degree);
      const swept = sweepChunk({
        spec: place.state.alphabet,
        degree,
        lo: 0,
        hi: space.total,
        circleDelta: place.state.circleDelta,
      });
      if ("error" in swept) throw new Error(swept.error);
      // The window the reader is shown, no wider (the stage's aspect gives about 1.6x in x).
      const halfW = place.state.halfHeight * 1.6;
      let inside = 0;
      for (let p = 0; p + 2 < swept.points.length; p += 3) {
        const x = swept.points[p];
        const y = swept.points[p + 1];
        for (const g of a.group) {
          const zx = g.rev ? x / (x * x + y * y) : x;
          const zy = g.rev ? -y / (x * x + y * y) : g.conj ? -y : y;
          const fx = g.neg ? -zx : zx;
          const fy = g.neg ? -zy : zy;
          if (Math.abs(fx - place.state.cx) < halfW && Math.abs(fy - place.state.cy) < place.state.halfHeight * 1.6) {
            inside++;
          }
        }
      }
      // Not merely non-empty: a place showing a handful of dots is a place showing nothing. The floor is
      // set from measurement at degree 12, which is where this test can afford to sweep; every place
      // loads HIGHER degrees, so the real picture is denser by a large factor. Measured at degree 14 (the
      // app's own range for the tightest places): zoom-story 345, egan-point 1,077, hexaholes 1,610,
      // dragon 1,675, and every other place above 3,000 — against 87, 268, 82 and 419 at degree 12. The
      // floor is 50 because the thinnest place at degree 12 has 87, and the point of this test is that a
      // place is not aimed at an EMPTY region; how sparse a deliberately deep zoom looks is the browser
      // suite's question, and `zoom-story` is deliberately sparse (the slides' own point is that the
      // cloud is discrete at that depth and fills in with the degree).
      expect(inside, `${place.id} has too little in its own window`).toBeGreaterThan(50);
    }
  });
});

describe("what a caption may claim", () => {
  it("a cited theorem carries its source; an uncited claim is the app's own ≈ description", () => {
    // The rigor rule (ADR-0046 decision 7). `fact` is someone's theorem and must say whose; `seen` is
    // what this picture shows at a finite degree and may cite nothing.
    for (const place of PLACES) {
      if (place.fact !== undefined) {
        expect(place.source, `${place.id} states a theorem with no source`).toBeDefined();
        expect((place.source ?? "").length).toBeGreaterThan(10);
      }
      expect(place.seen.length).toBeGreaterThan(20);
      expect(place.title.length).toBeGreaterThan(3);
    }
  });

  it("no `seen` description claims exactness — the picture is ≈ and only theorems are not", () => {
    // The word "exactly" and the symbol "=" belong to the `fact` field. A `seen` sentence saying the
    // picture proves something is the failure this guards.
    for (const place of PLACES) {
      expect(place.seen, place.id).not.toMatch(/\bprove[sd]?\b/i);
      expect(place.seen, place.id).not.toMatch(/\btheorem\b/i);
    }
  });

  it("the theorems that ARE cited are the ones the research found, named", () => {
    const sources = PLACES.map((p) => p.source ?? "").join(" ");
    for (const name of ["Bousch", "Odlyzko", "Michelen", "Calegari", "Bandt"]) {
      expect(sources, name).toContain(name);
    }
  });

  it("covers the article's own tour plus the two other alphabets with published theory", () => {
    const ids = PLACES.map((p) => p.id);
    for (const id of ["whole", "hole-at-1", "dragon", "zoom-story", "newman", "bandt", "hexaholes"]) {
      expect(ids).toContain(id);
    }
    // At least one place for each alphabet whose theory the captions quote.
    const presets = new Set(PLACES.map((p) => p.state.alphabet.preset));
    expect(presets.has("littlewood")).toBe(true);
    expect(presets.has("zero-one")).toBe(true);
    expect(presets.has("trinary")).toBe(true);
  });
});
