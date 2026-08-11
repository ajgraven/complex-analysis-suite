import { describe, expect, it } from "vitest";
import { injectPngText, readPngText, pngChunk, PNG_SIGNATURE } from "../src/export/pngMeta.js";

// A minimal but structurally valid PNG: signature + IHDR + IEND (pixel data irrelevant to the chunk
// splicing under test).
function fakePng(): Uint8Array {
  const ihdr = pngChunk("IHDR", new Uint8Array(13));
  const iend = pngChunk("IEND", new Uint8Array(0));
  const out = new Uint8Array(PNG_SIGNATURE.length + ihdr.length + iend.length);
  out.set(PNG_SIGNATURE, 0);
  out.set(ihdr, PNG_SIGNATURE.length);
  out.set(iend, PNG_SIGNATURE.length + ihdr.length);
  return out;
}

describe("PNG reproducibility metadata (G2/G7)", () => {
  it("round-trips an embedded state string through a tEXt chunk", () => {
    const permalink = "#vs=eyJ2IjoxLCJhcHAiOiJybSJ9";
    const withState = injectPngText(fakePng(), "cas:state", permalink);
    expect(withState.length).toBeGreaterThan(fakePng().length);
    expect(readPngText(withState, "cas:state")).toBe(permalink);
  });

  it("keeps multiple keywords independent", () => {
    let png = fakePng();
    png = injectPngText(png, "Software", "Riemann Map");
    png = injectPngText(png, "cas:state", "#vs=abc");
    expect(readPngText(png, "Software")).toBe("Riemann Map");
    expect(readPngText(png, "cas:state")).toBe("#vs=abc");
    expect(readPngText(png, "missing")).toBeNull();
  });

  it("preserves the signature and ends at IEND", () => {
    const png = injectPngText(fakePng(), "k", "v");
    expect(Array.from(png.subarray(0, 8))).toEqual(Array.from(PNG_SIGNATURE));
    // last chunk is still IEND
    const tail = String.fromCharCode(png[png.length - 8], png[png.length - 7], png[png.length - 6], png[png.length - 5]);
    expect(tail).toBe("IEND");
  });
});
