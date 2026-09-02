import { describe, it, expect } from "vitest";
import { encodeAirfoil, decodeAirfoil, encodeGallery, decodeGallery } from "../src/viewState.js";

describe("airfoil permalink", () => {
  it("round-trips a full state through #vs=", () => {
    const s = { thickness: 0.18, camber: 0.04, alphaDeg: 6.5, teAngleDeg: 12, kutta: false };
    const decoded = decodeAirfoil(encodeAirfoil(s));
    expect(decoded).toEqual(s);
  });

  it("encodes a #vs= fragment and decodes it out of a full URL", () => {
    const link = encodeAirfoil({ thickness: 0.1, camber: 0, alphaDeg: 0, teAngleDeg: 8, kutta: true });
    expect(link.startsWith("#vs=")).toBe(true);
    expect(decodeAirfoil(`https://example.com/airfoil.html${link}`)?.kutta).toBe(true);
  });

  it("rejects a gallery payload, an empty hash, and garbage", () => {
    expect(decodeAirfoil(encodeGallery({ id: "ellipse-ext", alphaDeg: 0, gamma: 0 }))).toBeNull();
    expect(decodeAirfoil("")).toBeNull();
    expect(decodeAirfoil("#vs=not-base64!!")).toBeNull();
    expect(decodeAirfoil("#foo=bar")).toBeNull();
  });
});

describe("gallery permalink", () => {
  it("round-trips a full state through #vs=", () => {
    const s = { id: "deltoid-ext", alphaDeg: -12, gamma: 1.5 };
    expect(decodeGallery(encodeGallery(s))).toEqual(s);
  });

  it("rejects an airfoil payload and a bare #<id> hash (that path is handled in the page, not here)", () => {
    expect(decodeGallery(encodeAirfoil({ thickness: 0.1, camber: 0, alphaDeg: 0, teAngleDeg: 8, kutta: true }))).toBeNull();
    expect(decodeGallery("#ellipse-ext")).toBeNull();
  });
});
