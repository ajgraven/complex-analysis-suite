import { describe, expect, it } from "vitest";
import { encodeViewState } from "@cas/interchange";
import {
  APP_NS,
  DEFAULT_VIEW_STATE,
  decodeRiemannState,
  encodeRiemannState,
  isRiemannViewState,
} from "../src/viewState.js";

// P0 for the single serializable view-state (S2): the object every §G export/permalink serializes.
// These pin the round-trip and the defensive decode (hostile / foreign / malformed links → null), the
// contract the whole export-and-reproducibility story depends on.

describe("riemann-map view-state (S2)", () => {
  it("round-trips the default state through a #vs= permalink", () => {
    const link = encodeRiemannState(DEFAULT_VIEW_STATE);
    expect(link.startsWith("#vs=")).toBe(true);
    const restored = decodeRiemannState(link);
    expect(restored).toEqual(DEFAULT_VIEW_STATE);
  });

  it("rejects a link stamped for another app", () => {
    const foreign = encodeViewState("cd", { ...DEFAULT_VIEW_STATE });
    expect(decodeRiemannState(foreign)).toBeNull();
  });

  it("rejects a same-app link whose payload is not a valid view-state", () => {
    const malformed = encodeViewState(APP_NS, { nonsense: 1 });
    expect(decodeRiemannState(malformed)).toBeNull();
  });

  it("returns null for an absent or garbled hash", () => {
    expect(decodeRiemannState("")).toBeNull();
    expect(decodeRiemannState("#vs=not-base64-json")).toBeNull();
  });

  it("isRiemannViewState guards the required shape", () => {
    expect(isRiemannViewState(DEFAULT_VIEW_STATE)).toBe(true);
    expect(isRiemannViewState({ map: { expr: "z" } })).toBe(false);
    expect(isRiemannViewState(null)).toBe(false);
  });

  it("carries an imported map's coefficients through the permalink (a self-contained figure)", () => {
    // An imported figure must survive reload / sharing: the coefficients ride IN render.imported, not only
    // in the transient "#s=" hand-off link (regression guard for the first-frame replaceState dropping them).
    const state = {
      ...DEFAULT_VIEW_STATE,
      render: {
        ...DEFAULT_VIEW_STATE.render,
        diskSource: "import",
        imported: {
          lead: [1, 0] as [number, number],
          coeffs: [[0, 0], [0, 0], [0.5, 0]] as [number, number][],
          app: "complex-dynamics",
        },
      },
    };
    const restored = decodeRiemannState(encodeRiemannState(state));
    expect(restored?.render.imported?.lead).toEqual([1, 0]);
    expect(restored?.render.imported?.coeffs).toEqual([[0, 0], [0, 0], [0.5, 0]]);
    expect(restored?.render.imported?.app).toBe("complex-dynamics");
  });

  it("carries a hand-drawn custom polygon through the permalink (Phase C — reopens the exact shape)", () => {
    const verts: [number, number][] = [
      [1, 0.2],
      [-0.8, 1],
      [-1, -1],
      [1.2, -0.6],
    ];
    const state = {
      ...DEFAULT_VIEW_STATE,
      render: { ...DEFAULT_VIEW_STATE.render, region: "custom", domain: "custom", customPolygon: verts },
    };
    const restored = decodeRiemannState(encodeRiemannState(state));
    expect(restored?.render.region).toBe("custom");
    expect(restored?.render.customPolygon).toEqual(verts);
  });
});
