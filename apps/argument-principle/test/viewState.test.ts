import { describe, expect, it } from "vitest";
import { encodeViewState } from "@cas/interchange";
import {
  APP_NS,
  DEFAULT_VIEW_STATE,
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
