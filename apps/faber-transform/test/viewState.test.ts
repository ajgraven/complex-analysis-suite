// viewState round-trip + defensive decode.
import { describe, expect, it } from "vitest";
import { encodeViewState } from "@cas/interchange";
import {
  DEFAULT_VIEW_STATE,
  decodeFaberState,
  encodeFaberState,
  isFaberViewState,
} from "../src/viewState.js";

describe("viewState codec", () => {
  it("encodes to a #vs= fragment and round-trips", () => {
    const frag = encodeFaberState(DEFAULT_VIEW_STATE);
    expect(frag.startsWith("#vs=")).toBe(true);
    const back = decodeFaberState(frag);
    expect(back).toEqual(DEFAULT_VIEW_STATE);
  });

  it("round-trips a non-default monomial state", () => {
    const s = {
      ...DEFAULT_VIEW_STATE,
      phi: "ellipse",
      shape: 0.3,
      input: { kind: "monomial" as const, degree: 7 },
    };
    expect(decodeFaberState(encodeFaberState(s))).toEqual(s);
  });

  it("round-trips a pole input state", () => {
    const s = {
      ...DEFAULT_VIEW_STATE,
      phi: "deltoid",
      input: { kind: "pole" as const, re: 1.6, im: 0.8, order: 2 },
    };
    expect(decodeFaberState(encodeFaberState(s))).toEqual(s);
  });

  it("round-trips a custom-formula (symbolic φ) domain", () => {
    const s = {
      ...DEFAULT_VIEW_STATE,
      phi: "custom-formula",
      phiExpr: "z + 0.3/z^2 + 0.1/z^4",
    };
    expect(decodeFaberState(encodeFaberState(s))).toEqual(s);
  });

  it("guard requires a φ formula string for the custom-formula domain, and bounds its length", () => {
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, phi: "custom-formula" })).toBe(false); // no phiExpr
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, phi: "custom-formula", phiExpr: "" })).toBe(false);
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, phiExpr: "z".repeat(300) })).toBe(false); // over MAX_EXPR_LEN
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, phi: "custom-formula", phiExpr: "z + 1/z" })).toBe(true);
  });

  it("guard rejects a pole inside the unit disk or with a bad order", () => {
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, input: { kind: "pole", re: 0.5, im: 0.2, order: 1 } })).toBe(false);
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, input: { kind: "pole", re: 1.6, im: 0.8, order: 3 } })).toBe(false);
  });

  it("rejects an absent or foreign hash", () => {
    expect(decodeFaberState("")).toBeNull();
    expect(decodeFaberState("#vs=not-base64!!")).toBeNull();
    // A well-formed link stamped for another app (namespace "ap") must not open here.
    const foreign = encodeViewState("ap", { ...DEFAULT_VIEW_STATE });
    expect(decodeFaberState(foreign)).toBeNull();
  });

  it("guard rejects out-of-range or malformed degree", () => {
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, input: { kind: "monomial", degree: -1 } })).toBe(false);
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, input: { kind: "monomial", degree: 1000 } })).toBe(false);
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, input: { kind: "monomial", degree: 2.5 } })).toBe(false);
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, input: { kind: "expr", degree: 3 } })).toBe(false);
  });

  it("guard accepts the default", () => {
    expect(isFaberViewState(DEFAULT_VIEW_STATE)).toBe(true);
  });

  it("round-trips a coloring block", () => {
    const s = {
      ...DEFAULT_VIEW_STATE,
      coloring: { enhance: 3, sectors: 8, crisp: true, modulus: 2, modScale: 1.5 },
    };
    expect(decodeFaberState(encodeFaberState(s))).toEqual(s);
  });

  it("guard rejects a malformed coloring block", () => {
    const ok = { enhance: 1, sectors: 6, crisp: false, modulus: 0, modScale: 1 };
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, coloring: ok })).toBe(true);
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, coloring: { ...ok, enhance: 6 } })).toBe(false);
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, coloring: { ...ok, modulus: -1 } })).toBe(false);
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, coloring: { ...ok, sectors: 0 } })).toBe(false);
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, coloring: { ...ok, modScale: 0 } })).toBe(false);
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, coloring: { ...ok, crisp: "yes" } })).toBe(false);
  });

  it("round-trips a custom-polygon domain", () => {
    const s = {
      ...DEFAULT_VIEW_STATE,
      phi: "custom",
      customPolygon: [[1, 0], [-0.5, 1], [-1, -0.5], [0.4, -1]] as [number, number][],
    };
    expect(decodeFaberState(encodeFaberState(s))).toEqual(s);
  });

  it("round-trips the corner-suppression fields", () => {
    const s = {
      ...DEFAULT_VIEW_STATE,
      phi: "square",
      input: { kind: "monomial" as const, degree: 20 },
      suppressCorners: true,
      suppressStrength: 6,
    };
    expect(decodeFaberState(encodeFaberState(s))).toEqual(s);
  });

  it("guard rejects an out-of-range or non-integer suppression strength", () => {
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, suppressCorners: true, suppressStrength: 4 })).toBe(true);
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, suppressStrength: 1 })).toBe(false); // below MIN (m=1 over-corrects)
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, suppressStrength: 9 })).toBe(false); // above MAX
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, suppressStrength: 3.5 })).toBe(false); // non-integer
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, suppressCorners: "yes" })).toBe(false);
  });

  it("guard rejects a custom domain with no/short/out-of-bounds polygon", () => {
    const good: [number, number][] = [[1, 0], [-1, 1], [-1, -1]];
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, phi: "custom", customPolygon: good })).toBe(true);
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, phi: "custom" })).toBe(false); // custom needs a polygon
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, phi: "custom", customPolygon: [[1, 0], [0, 1]] })).toBe(false); // < 3
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, phi: "custom", customPolygon: [[1, 0], [0, 1], [999, 0]] })).toBe(false); // out of bounds
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, phi: "custom", customPolygon: [[1, 0], [0, 1], [0, Infinity]] })).toBe(false);
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, phi: "custom", customPolygon: [[1, 0], [1, 0], [0, 1]] })).toBe(false); // coincident vertices
    expect(isFaberViewState({ ...DEFAULT_VIEW_STATE, phi: "custom", customPolygon: [[1, 0], [0, 1], [-1, 0], [3, 0]] })).toBe(false); // one coord > 2
  });
});
