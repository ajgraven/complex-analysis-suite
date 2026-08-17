import { describe, expect, it } from "vitest";
import { encodeViewState } from "@cas/interchange";
import {
  APP_NS,
  DEFAULT_VIEW_STATE,
  DEFAULT_TARGET,
  DEFAULT_PEDAGOGY,
  decodeArgPrincipleState,
  encodeArgPrincipleState,
  isArgPrincipleViewState,
} from "../src/viewState.js";

// P0 for the single serializable view-state: the object every export/permalink serializes. These pin the
// round-trip and the defensive decode (hostile / foreign / malformed links → null), the contract the whole
// share-and-reproducibility story depends on.

describe("argument-principle view-state", () => {
  it("round-trips the default state through a #vs= permalink", () => {
    const link = encodeArgPrincipleState(DEFAULT_VIEW_STATE);
    expect(link.startsWith("#vs=")).toBe(true);
    expect(decodeArgPrincipleState(link)).toEqual(DEFAULT_VIEW_STATE);
  });

  it("rejects a link stamped for another app", () => {
    const foreign = encodeViewState("rm", { ...DEFAULT_VIEW_STATE });
    expect(decodeArgPrincipleState(foreign)).toBeNull();
  });

  it("rejects a same-app link whose payload is not a valid view-state", () => {
    const malformed = encodeViewState(APP_NS, { nonsense: 1 });
    expect(decodeArgPrincipleState(malformed)).toBeNull();
  });

  it("returns null for an absent or garbled hash", () => {
    expect(decodeArgPrincipleState("")).toBeNull();
    expect(decodeArgPrincipleState("#vs=not-base64-json")).toBeNull();
  });

  it("isArgPrincipleViewState guards the required shape", () => {
    expect(isArgPrincipleViewState(DEFAULT_VIEW_STATE)).toBe(true);
    expect(isArgPrincipleViewState({ map: { expr: "z" } })).toBe(false);
    expect(isArgPrincipleViewState(null)).toBe(false);
  });

  it("rejects a link whose resolution is out of range (hostile-link DoS guard)", () => {
    const huge = encodeViewState(APP_NS, {
      ...DEFAULT_VIEW_STATE,
      render: { ...DEFAULT_VIEW_STATE.render, resolution: 1e9 },
    });
    expect(decodeArgPrincipleState(huge)).toBeNull();
    const tiny = encodeViewState(APP_NS, {
      ...DEFAULT_VIEW_STATE,
      render: { ...DEFAULT_VIEW_STATE.render, resolution: 2 },
    });
    expect(decodeArgPrincipleState(tiny)).toBeNull();
  });

  it("rejects a path contour with malformed points, but round-trips a valid path", () => {
    const bad = encodeViewState(APP_NS, {
      ...DEFAULT_VIEW_STATE,
      contour: { kind: "path", centerRe: 0, centerIm: 0, radius: 1, points: [["a", "b"], [NaN, 0], [1, 2]] },
    });
    expect(decodeArgPrincipleState(bad)).toBeNull();
    const good = encodeViewState(APP_NS, {
      ...DEFAULT_VIEW_STATE,
      contour: {
        kind: "path",
        centerRe: 0,
        centerIm: 0,
        radius: 1,
        points: [
          [-1, -1],
          [1, -1],
          [0, 1],
        ],
      },
    });
    expect(decodeArgPrincipleState(good)?.contour.points?.length).toBe(3);
  });

  it("rejects a crafted path permalink with a runaway vertex count (self-DoS guard)", () => {
    // A hostile #vs= could carry millions of finite [x,y] vertices; cumulativeArg / logDerivCumulative
    // iterate every vertex each frame — the self-DoS sampleCircle caps for circles. Decode must reject an
    // over-long path (> MAX_RESOLUTION) just as it rejects malformed points.
    const huge = encodeViewState(APP_NS, {
      ...DEFAULT_VIEW_STATE,
      contour: {
        kind: "path",
        centerRe: 0,
        centerIm: 0,
        radius: 1,
        points: Array.from({ length: 5001 }, (_, i): [number, number] => [i, i]),
      },
    });
    expect(decodeArgPrincipleState(huge)).toBeNull();
  });

  it("back-fills target + pedagogy on an older permalink that predates them", () => {
    // The exact shape a pre-§11 link carried: no `target`, no `pedagogy`. It must still open, with the
    // new fields back-filled to their defaults and every original field untouched (share-link compat).
    const old = {
      map: DEFAULT_VIEW_STATE.map,
      zView: DEFAULT_VIEW_STATE.zView,
      wView: DEFAULT_VIEW_STATE.wView,
      contour: DEFAULT_VIEW_STATE.contour,
      render: DEFAULT_VIEW_STATE.render,
      conventions: DEFAULT_VIEW_STATE.conventions,
    };
    const restored = decodeArgPrincipleState(encodeViewState(APP_NS, old));
    expect(restored).not.toBeNull();
    expect(restored?.target).toEqual(DEFAULT_TARGET);
    expect(restored?.pedagogy).toEqual(DEFAULT_PEDAGOGY);
    expect(restored?.map.expr).toBe(DEFAULT_VIEW_STATE.map.expr);
    expect(restored?.contour.radius).toBe(DEFAULT_VIEW_STATE.contour.radius);
  });

  it("merges a partial pedagogy block toggle-by-toggle (forward-compat for future toggles)", () => {
    const partial = encodeViewState(APP_NS, {
      ...DEFAULT_VIEW_STATE,
      pedagogy: { showDecomposition: true }, // a link carrying only one toggle
    });
    const restored = decodeArgPrincipleState(partial);
    expect(restored?.pedagogy?.showDecomposition).toBe(true); // the carried value wins
    expect(restored?.pedagogy?.showArgGraph).toBe(DEFAULT_PEDAGOGY.showArgGraph); // the rest default in
  });

  it("rejects a link whose target is malformed", () => {
    const bad = encodeViewState(APP_NS, { ...DEFAULT_VIEW_STATE, target: { re: NaN, im: 0 } });
    expect(decodeArgPrincipleState(bad)).toBeNull();
  });

  it("preserves a carried non-default target through the permalink", () => {
    const restored = decodeArgPrincipleState(
      encodeArgPrincipleState({ ...DEFAULT_VIEW_STATE, target: { re: 1.5, im: -0.5 } }),
    );
    expect(restored?.target).toEqual({ re: 1.5, im: -0.5 });
  });

  it("preserves a custom contour + viewport through the permalink", () => {
    const state = {
      ...DEFAULT_VIEW_STATE,
      contour: { kind: "circle", centerRe: 0.5, centerIm: -0.2, radius: 0.8 },
      zView: { centerRe: 0.5, centerIm: -0.2, zoom: 1.6 },
    };
    const restored = decodeArgPrincipleState(encodeArgPrincipleState(state));
    expect(restored?.contour.radius).toBeCloseTo(0.8, 12);
    expect(restored?.zView.zoom).toBeCloseTo(1.6, 12);
  });
});
