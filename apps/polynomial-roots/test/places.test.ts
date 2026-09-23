import { describe, it, expect } from "vitest";
import { GROUPS, PLACES, placeById } from "../src/places";
import { decodeState, encodeState } from "../src/viewState";
import { clampState, MAX_DEGREE } from "../src/state";
import { compileAlphabet } from "../src/engine/alphabet";
import { orbitSpace } from "../src/engine/orbits";
import { sweepChunk } from "../src/engine/sweep";
import { walkGrid, walkSpec } from "../src/engine/limit/walk";
import { chooseEngine } from "../src/engine/limit/handover";
import { centreNumbers } from "../src/state";
import { runReference } from "../src/engine/deep/reference";

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
      if (place.state.engine !== "roots" && place.state.engine !== "auto") continue; // the other engines are checked below
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
          const centre = centreNumbers(place.state);
          if (Math.abs(fx - centre.cx) < halfW && Math.abs(fy - centre.cy) < place.state.halfHeight * 1.6) {
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

  it("every limit-set place shows a HOLE or an edge — a connected escaped region, not scattered noise", () => {
    // The root places above ask "are there roots here". PR-1's browser pass established that this is a
    // different question from "is there a picture" — the first hexahole place passed the root test and
    // rendered black. A limit-set place is checked on the second question, and a share alone would not
    // do it: 1.4% of a frame escaping could be one hole or it could be speckle along a boundary, and
    // only the first is what these captions promise. So the escaped cells are flood-filled and the
    // LARGEST CONNECTED region is what is measured. Its share of the walked frame, measured:
    // hexaholes 1.4% (the hole itself, 37 of 2,560 cells, about a tenth of the window across),
    // limit-littlewood 20.0% and limit-bandt 12.7% (the exterior and the real-axis hole, both of which
    // reach the frame edge). The floor is 1%, under the smallest of the three.
    for (const place of PLACES) {
      if (place.state.engine !== "limit") continue;
      const compiled = compileAlphabet(place.state.alphabet);
      if (!("alphabet" in compiled)) throw new Error(place.id);
      const depth = place.state.depth;
      const width = 64;
      const height = 40;
      const g = walkGrid(
        walkSpec(compiled.alphabet),
        {
          ...centreNumbers(place.state),
          halfWidth: place.state.halfHeight * 1.6,
          halfHeight: place.state.halfHeight,
        },
        width,
        height,
        { depth, computeAnnulus: place.state.annulus },
      );
      let inSet = 0;
      let walked = 0;
      const escaped = new Uint8Array(width * height);
      for (let i = 0; i < g.reach.length; i++) {
        if (g.status[i] !== 0) continue;
        walked++;
        if (g.reach[i] === depth + 1) inSet++;
        else escaped[i] = 1;
      }
      expect(walked, `${place.id} walked nothing`).toBeGreaterThan(400);
      expect(inSet, `${place.id} has nothing in the set`).toBeGreaterThan(0.05 * walked);
      expect(largestRegion(escaped, width, height) / walked, `${place.id} has no hole or edge`).toBeGreaterThan(0.01);
    }
  });

  it("every deep place has roots to draw, at the precision it names", () => {
    // The root sweep above cannot reach these: a deep place opens at a half-height of 1e-16 or below,
    // where no degree this suite can enumerate has a root. What must hold is that the DEEP walk finds
    // some — a deep place aimed at an empty neighbourhood would be the hexahole defect at thirty orders
    // of magnitude — and that its residual is the one its arithmetic promises.
    for (const place of PLACES) {
      if (place.state.engine !== "deep") continue;
      const chosen = chooseEngine({
        mode: place.state.engine,
        ...centreNumbers(place.state),
        halfHeight: place.state.halfHeight,
        maxDegree: place.state.maxDegree,
        annulus: place.state.annulus,
        pixels: 1024,
      });
      const run = runReference({
        alphabet: place.state.alphabet,
        cx: place.state.cx,
        cy: place.state.cy,
        halfHeight: place.state.halfHeight,
        aspect: 1.55,
        depth: chosen.deepDepth,
        precision: chosen.precision,
      });
      if ("error" in run) throw new Error(`${place.id}: ${run.error}`);
      expect(run.roots.length, `${place.id} has no roots in its own window`).toBeGreaterThan(20);
      expect(run.exhausted, `${place.id} ran out of budget`).toBe(false);
      const worst = Math.max(...run.roots.map((r) => r.residual));
      expect(worst, `${place.id} residual`).toBeLessThan(run.precision === "dd" ? 1e-30 : 1e-14);
    }
  });

  it("every place lands on the engine its caption describes", () => {
    // A place that says "the limit-set engine" and opens under the root engine would be a caption about
    // a picture the reader is not being shown. `auto` is allowed to agree with the place; what is not
    // allowed is for the state to name one engine and the handover to choose the other.
    for (const place of PLACES) {
      const chosen = chooseEngine({
        mode: place.state.engine,
        ...centreNumbers(place.state),
        halfHeight: place.state.halfHeight,
        maxDegree: place.state.maxDegree,
        annulus: place.state.annulus,
        pixels: 1024,
      });
      if (place.state.engine !== "auto") expect(chosen.engine, place.id).toBe(place.state.engine);
      const mentionsLimit = /limit-set engine|limit set/i.test(place.seen);
      // A STORY's caption describes its frames, not its first one: the zoom story opens on the cloud
      // and says the limit set arrives later, so its claim is checked against the last frame.
      const described = place.steps === undefined ? place.state : place.steps[place.steps.length - 1];
      const chosenThere = chooseEngine({
        mode: described.engine,
        ...centreNumbers(described),
        halfHeight: described.halfHeight,
        maxDegree: described.maxDegree,
        annulus: described.annulus,
        pixels: 1024,
      });
      if (mentionsLimit) expect(chosenThere.engine, `${place.id} describes the limit set`).toBe("limit");
    }
  });
});

describe("the gallery's groups", () => {
  it("every place is in one of the four groups, and every group has places", () => {
    expect(GROUPS.map((g) => g.id)).toEqual(["tour", "dragons", "alphabets", "beyond"]);
    for (const place of PLACES) expect(GROUPS.map((g) => g.id), place.id).toContain(place.group);
    for (const group of GROUPS) {
      expect(PLACES.filter((p) => p.group === group.id).length, group.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("each group holds exactly the entries §2.3 files under it", () => {
    // The rule below catches a place whose STATE says what it is for; the headline dragon and Egan's
    // point are root-engine views with no lamp, so only the membership itself can pin them. The sweep
    // moved "dragon" into the tour and "newman" into "beyond" and the rule passed both.
    const members = (g: string) => PLACES.filter((p) => p.group === g).map((p) => p.id);
    expect(members("tour")).toEqual([
      "whole", "hole-at-1", "hole-at-i", "four-fifths", "four-fifths-i", "half-e-i-fifth", "feather-08-02", "zoom-story",
    ]);
    expect(members("dragons")).toEqual(["dragon", "egan-point", "dragon-inset", "dragon-theorem"]);
    expect(members("alphabets")).toEqual(["newman", "bandt", "hexaholes-region", "hexaholes", "cube-roots"]);
    expect(members("beyond")).toEqual(["limit-littlewood", "limit-bandt", "deep-zoom-story", "deep-float64-floor"]);
  });

  it("the engines' own places are 'past the last degree', and the dragons are together", () => {
    // Grouping by what an entry is FOR: a place whose state forces the limit or deep engine is about
    // what lies past a root solver's reach, whatever alphabet it uses — except the hexahole, which is a
    // feature of Bandt's set and sits with its alphabet.
    for (const place of PLACES) {
      const isDragon = place.state.lamp !== null || place.state.theorem;
      if (isDragon) expect(place.group, place.id).toBe("dragons");
      else if (place.state.engine === "deep") expect(place.group, place.id).toBe("beyond");
    }
  });
});

describe("the zoom story is a scrubber through the slide deck's own frames", () => {
  const story = placeById("zoom-story");

  it("has nine frames, each half the height of the last, at the deck's centre and degree", () => {
    // Height 0.62508 · 2^{−k}, k = 0 … 8. The deck quotes its last frame as 0.0024456; eight exact
    // halvings of 0.62508 give 0.0024417, 0.16% smaller, so the deck's own frames are not exact halvings
    // and this app keeps the ratio rather than the rounded figure.
    const steps = story?.steps;
    if (steps === undefined) throw new Error("the zoom story has no steps");
    expect(steps.length).toBe(9);
    expect(story?.state).toEqual(steps[0]);
    expect(2 * steps[0].halfHeight).toBeCloseTo(0.62508, 10);
    for (let k = 1; k < steps.length; k++) expect(steps[k].halfHeight / steps[k - 1].halfHeight).toBeCloseTo(0.5, 12);
    expect(2 * steps[8].halfHeight).toBeCloseTo(0.0024417, 7);
    for (const st of steps) {
      expect(centreNumbers(st)).toEqual({ cx: 0.42065, cy: 0.48354 });
      expect(st.maxDegree).toBe(20);
    }
  });

  it("hands over to the limit set at FRAME 4 — measured, and the caption's 'later frames' is that", () => {
    const engines = (story?.steps ?? []).map(
      (st) =>
        chooseEngine({
          mode: st.engine,
          ...centreNumbers(st),
          halfHeight: st.halfHeight,
          maxDegree: st.maxDegree,
          annulus: st.annulus,
          pixels: 1024,
        }).engine,
    );
    expect(engines).toEqual(["roots", "roots", "roots", "limit", "limit", "limit", "limit", "limit", "limit"]);
  });

  it("every frame is a permalink, and the link reopens that frame", () => {
    for (const st of story?.steps ?? []) {
      const back = decodeState(encodeState(st));
      if (back === null || "refused" in back) throw new Error("a frame's link did not open");
      expect(back.state.halfHeight / st.halfHeight).toBeCloseTo(1, 8);
      expect(back.state.cx).toBe(st.cx);
    }
  });
});

/** The largest 4-connected region of set cells — a flood fill, so speckle cannot pass for a hole. */
function largestRegion(mask: Uint8Array, width: number, height: number): number {
  const seen = new Uint8Array(mask.length);
  let best = 0;
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] === 0 || seen[start] === 1) continue;
    let size = 0;
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const at = stack.pop() as number;
      size++;
      const x = at % width;
      const y = (at - x) / width;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nat = ny * width + nx;
        if (mask[nat] === 1 && seen[nat] === 0) {
          seen[nat] = 1;
          stack.push(nat);
        }
      }
    }
    if (size > best) best = size;
  }
  return best;
}

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
      // PR-5's gate: no `=` in a sentence about the PICTURE. A `seen` caption may approximate or bound
      // (≈, ≤, <) and may name a map (x ↦ ±1 + zx) but may never write an equality, because nothing this
      // app draws is exact. `fact`, the cited theorem, is exempt — it is the one place an `=` is earned.
      // **Blunt on purpose.** Its first run caught three captions: two named a LOCATION ("around z = 1")
      // and one was a real overclaim — "the inner and outer edges at |z| = ½ and 2 are the picture's
      // own", an exact edge asserted of a finite-depth picture that only touches the circle |z| = ½ at a
      // point. A guard subtle enough to pass the first two would have had to understand the third.
      expect(place.seen, place.id).not.toMatch(/(^|[^≈≤≥<>!])=/);
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
