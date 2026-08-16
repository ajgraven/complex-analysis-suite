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
});
