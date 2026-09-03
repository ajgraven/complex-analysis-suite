import { describe, it, expect } from "vitest";
import {
  encodeHydro,
  decodeHydro,
  encodeAirfoil,
  decodeAirfoil,
  encodeGallery,
  decodeGallery,
  AIRFOIL_ID,
  type HydroVS,
} from "../src/viewState.js";

const SAMPLE: HydroVS = {
  bodyId: "deltoid-ext",
  alphaDeg: -12,
  thickness: 0.18,
  camber: 0.04,
  teAngleDeg: 12,
  kutta: false,
  gamma: 1.5,
};

describe("unified hydro permalink (the one-page schema)", () => {
  it("round-trips the whole page state through #vs=", () => {
    expect(decodeHydro(encodeHydro(SAMPLE))).toEqual(SAMPLE);
  });

  it("encodes a #vs= fragment and decodes it out of a full URL", () => {
    const link = encodeHydro({ ...SAMPLE, bodyId: AIRFOIL_ID });
    expect(link.startsWith("#vs=")).toBe(true);
    expect(decodeHydro(`https://example.com/2d-hydrodynamics/${link}`)?.bodyId).toBe(AIRFOIL_ID);
  });

  it("rejects an empty hash and garbage", () => {
    expect(decodeHydro("")).toBeNull();
    expect(decodeHydro("#vs=not-base64!!")).toBeNull();
    expect(decodeHydro("#foo=bar")).toBeNull();
  });
});

describe("hydro permalink back-compat (ADR-0038: old ADR-0037 links still resolve)", () => {
  it("reads a legacy airfoil link into the airfoil body", () => {
    const legacy = encodeAirfoil({ thickness: 0.2, camber: 0.03, alphaDeg: 6, teAngleDeg: 8, kutta: true });
    const decoded = decodeHydro(legacy);
    expect(decoded).toEqual({
      bodyId: AIRFOIL_ID,
      thickness: 0.2,
      camber: 0.03,
      alphaDeg: 6,
      teAngleDeg: 8,
      kutta: true,
      gamma: 0,
    });
  });

  it("reads a legacy gallery link into the matching closed-form body", () => {
    const legacy = encodeGallery({ id: "ellipse-ext", alphaDeg: -8, gamma: 2.1 });
    const decoded = decodeHydro(legacy);
    expect(decoded?.bodyId).toBe("ellipse-ext");
    expect(decoded?.alphaDeg).toBe(-8);
    expect(decoded?.gamma).toBeCloseTo(2.1, 12);
  });

  it("reads a bare #<id> hub deep-link (angle + circulation reset)", () => {
    const decoded = decodeHydro("#star5-ext");
    expect(decoded?.bodyId).toBe("star5-ext");
    expect(decoded?.alphaDeg).toBe(0);
    expect(decoded?.gamma).toBe(0);
  });
});

// The legacy codecs stay exported (they are the spec of the ADR-0037 links the back-compat path reads);
// their own round-trips are still pinned.
describe("legacy airfoil / gallery codecs", () => {
  it("round-trips a legacy airfoil state", () => {
    const s = { thickness: 0.18, camber: 0.04, alphaDeg: 6.5, teAngleDeg: 12, kutta: false };
    expect(decodeAirfoil(encodeAirfoil(s))).toEqual(s);
  });

  it("round-trips a legacy gallery state", () => {
    const s = { id: "deltoid-ext", alphaDeg: -12, gamma: 1.5 };
    expect(decodeGallery(encodeGallery(s))).toEqual(s);
  });

  it("each legacy decoder rejects the other's payload", () => {
    expect(decodeAirfoil(encodeGallery({ id: "ellipse-ext", alphaDeg: 0, gamma: 0 }))).toBeNull();
    expect(decodeGallery(encodeAirfoil({ thickness: 0.1, camber: 0, alphaDeg: 0, teAngleDeg: 8, kutta: true }))).toBeNull();
    expect(decodeGallery("#ellipse-ext")).toBeNull();
  });
});
