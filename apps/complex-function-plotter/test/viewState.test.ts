import { describe, expect, it } from "vitest";
import { encodeViewState } from "@cas/interchange";
import {
  APP_NS,
  decodeState,
  encodeState,
  DEFAULT_V3D,
  type PlotterState,
} from "../src/state/viewState.js";
import { DEFAULT_ANIM } from "../src/ui/animate.js";
import { COLORMAPS } from "../src/render/colormaps.js";

const S: PlotterState = {
  expr: "a*z*(1-z)+b", // = the active (f) slot
  exprF: "a*z*(1-z)+b",
  exprG: "sin(z)",
  active: "f",
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
  v3d: {
    mode: "3d",
    azimuth: -1.2,
    elevation: 0.6,
    distance: 5,
    ortho: false,
    heightMode: 1,
    heightScale: 1.5,
    specular: true,
    opacity: 0.6,
  },
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
      exprF: "1/z", // a pre-A7 link's expr becomes slot f
      exprG: "1/z",
      active: "f",
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
      v3d: DEFAULT_V3D,
    });
  });

  it("round-trips the 3D view (mode + camera + height), defaults a pre-3D link, and clamps bad values", () => {
    expect(decodeState(encodeState(S))?.v3d).toEqual(S.v3d); // a shared landscape reopens framed
    // A pre-3D-persist link carries no v3d → the 2D default.
    expect(decodeState(encodeViewState(APP_NS, { expr: "z^2" }))?.v3d).toEqual(DEFAULT_V3D);
    // A stale / hand-edited v3d fails soft: unknown mode → 2d, out-of-range camera/height clamped.
    const bad = decodeState(
      encodeViewState(APP_NS, {
        expr: "z",
        v3d: { mode: "nope", distance: 999, heightMode: 9, opacity: 5 },
      }),
    );
    expect(bad?.v3d.mode).toBe("2d");
    expect(bad?.v3d.distance).toBe(60);
    expect(bad?.v3d.heightMode).toBe(2);
    expect(bad?.v3d.opacity).toBe(1); // clamped to [0.1, 1]
  });

  it("clamps out-of-range scalar fields to their live ranges (fail-soft)", () => {
    // A stale / hand-edited #vs= link must fail SOFT: span ≤ 0 flips the viewport, colormap indexes the
    // atlas LUT (6 rows), sectors has a live floor of 2. Guards the WP8 clamps — in particular the colormap
    // bound tracks the REAL LUT height (regression: it was a bogus 63, assuming a 64-row atlas that never existed).
    const lo = decodeState(
      encodeViewState(APP_NS, { expr: "z", span: 0, colormap: -5, sectors: 1 }),
    );
    expect(lo?.span).toBe(1e-9); // clamped up off the ≤ 0 singularity
    expect(lo?.colormap).toBe(0);
    expect(lo?.sectors).toBe(2); // floor matches the live guard / slider min
    const hi = decodeState(
      encodeViewState(APP_NS, { expr: "z", span: 1e12, colormap: 999, sectors: 100000 }),
    );
    expect(hi?.span).toBe(1e6);
    expect(hi?.colormap).toBe(COLORMAPS.length - 1); // never past the real LUT height
    expect(hi?.sectors).toBe(256);
  });

  it("round-trips the f/g slots, and a g-active link plots g", () => {
    const decoded = decodeState(
      encodeViewState(APP_NS, {
        expr: "sin(z)",
        exprF: "z^2",
        exprG: "sin(z)",
        active: "g",
      }),
    );
    expect(decoded?.exprF).toBe("z^2");
    expect(decoded?.exprG).toBe("sin(z)");
    expect(decoded?.active).toBe("g");
    expect(decoded?.expr).toBe("sin(z)"); // expr mirrors the active slot
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
