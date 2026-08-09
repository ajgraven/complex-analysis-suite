import { describe, expect, it } from "vitest";
import { encodeViewState } from "@cas/interchange";
import {
  APP_NS,
  decodeState,
  encodeState,
  type PlotterState,
} from "../src/state/viewState.js";
import { DEFAULT_ANIM } from "../src/ui/animate.js";

const S: PlotterState = {
  expr: "a*z*(1-z)+b",
  cx: 0.5,
  cy: -0.25,
  span: 3,
  colormap: 1,
  modulus: 3,
  enhance: 3,
  sectors: 8,
  crisp: 0,
  hueShift: 1.5,
  hueSign: -1,
  params: { a: [1.5, 0], b: [-0.25, 0.75] },
  anim: { t0: 0, t1: 1, speed: 0.5, loop: false },
};

describe("share-link view state", () => {
  it("round-trips through encode/decode", () => {
    const hash = encodeState(S);
    expect(hash.startsWith("#vs=")).toBe(true);
    expect(decodeState(hash)).toEqual(S);
  });

  it("rejects a foreign app namespace", () => {
    expect(decodeState(encodeViewState("cd", { expr: "z^2" }))).toBeNull();
  });

  it("returns null for an absent or malformed hash", () => {
    expect(decodeState("")).toBeNull();
    expect(decodeState("#other=1")).toBeNull();
  });

  it("fills defaults for missing numeric fields but keeps expr (and an absent params ⇒ {})", () => {
    expect(decodeState(encodeViewState(APP_NS, { expr: "1/z" }))).toEqual({
      expr: "1/z",
      cx: 0,
      cy: 0,
      span: 2,
      colormap: 0,
      modulus: 2,
      enhance: 0,
      sectors: 12,
      crisp: 1,
      hueShift: 0,
      hueSign: 1,
      params: {},
      anim: DEFAULT_ANIM,
    });
  });

  it("falls back to the default animation config field-by-field for a partial/absent anim", () => {
    expect(
      decodeState(encodeViewState(APP_NS, { expr: "z + t", anim: { speed: 3 } }))?.anim,
    ).toEqual({ ...DEFAULT_ANIM, speed: 3 });
    expect(decodeState(encodeViewState(APP_NS, { expr: "z" }))?.anim).toEqual(
      DEFAULT_ANIM,
    );
  });

  it("drops a payload with no expression", () => {
    expect(decodeState(encodeViewState(APP_NS, { cx: 1 }))).toBeNull();
  });

  it("keeps only well-formed [re, im] parameter entries (a stale link fails soft)", () => {
    const decoded = decodeState(
      encodeViewState(APP_NS, {
        expr: "a*z + b + k",
        params: {
          a: [1, 2], // ok
          b: [0.5], // wrong arity → dropped
          k: ["x", 1], // non-numeric → dropped
          m: [Infinity, 0], // non-finite → dropped
        },
      }),
    );
    expect(decoded?.params).toEqual({ a: [1, 2] });
  });
});
