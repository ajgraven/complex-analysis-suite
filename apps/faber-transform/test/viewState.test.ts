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

  it("round-trips a non-default state", () => {
    const s = {
      ...DEFAULT_VIEW_STATE,
      phi: "ellipse",
      shape: 0.3,
      input: { kind: "monomial" as const, degree: 7 },
    };
    expect(decodeFaberState(encodeFaberState(s))).toEqual(s);
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
