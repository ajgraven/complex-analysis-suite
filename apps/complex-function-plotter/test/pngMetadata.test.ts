import { describe, expect, it } from "vitest";
import { crc32, injectPngText, readPngText } from "../src/render/pngMetadata.js";

// Phase 6 / 6A (K3): PNG reproducibility metadata. The tEXt injector/reader is pure, so its contract is
// pinned here — the canonical CRC-32, a keyword→text round-trip, that the image bytes are untouched, the
// Latin-1 restriction, and graceful handling of a non-PNG. The end-to-end "an exported figure carries its
// share link" is proven by the headless export check.

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A minimal walkable PNG: signature + IHDR + IDAT + IEND. The chunk CRCs are dummies — the walker keys
 *  off the length fields, not CRC validity — which is all inject/read need. */
function chunk(type: string, data: number[]): number[] {
  const len = data.length;
  return [
    (len >>> 24) & 0xff,
    (len >>> 16) & 0xff,
    (len >>> 8) & 0xff,
    len & 0xff,
    ...[...type].map((c) => c.charCodeAt(0)),
    ...data,
    0,
    0,
    0,
    0, // CRC placeholder (unread by the walker)
  ];
}
function fakePng(): Uint8Array {
  return Uint8Array.from([
    ...SIG,
    ...chunk("IHDR", new Array(13).fill(7)),
    ...chunk("IDAT", [1, 2, 3, 4, 5]),
    ...chunk("IEND", []),
  ]);
}

describe("crc32", () => {
  it("matches the canonical PNG/zlib check value", () => {
    const bytes = Uint8Array.from([..."123456789"].map((c) => c.charCodeAt(0)));
    expect(crc32(bytes) >>> 0).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0); // empty → 0
  });
});

describe("injectPngText / readPngText", () => {
  it("round-trips keyword → text entries", () => {
    const stamped = injectPngText(fakePng(), {
      Software: "Complex Function Plotting Tool",
      "cfp:url": "https://x/#vs=eyJhIjoxfQ",
    });
    expect(readPngText(stamped)).toEqual({
      Software: "Complex Function Plotting Tool",
      "cfp:url": "https://x/#vs=eyJhIjoxfQ",
    });
  });

  it("does not touch the original image bytes (only inserts before IEND)", () => {
    const png = fakePng();
    const iend = png.length - 12; // IEND is a 12-byte trailer (len 0 + type + crc)
    const stamped = injectPngText(png, { k: "v" });
    // everything up to the IEND boundary is byte-identical...
    expect(Array.from(stamped.subarray(0, iend))).toEqual(
      Array.from(png.subarray(0, iend)),
    );
    // ...and the file still ends with the same IEND chunk, now longer by the inserted tEXt.
    expect(Array.from(stamped.subarray(stamped.length - 12))).toEqual(
      Array.from(png.subarray(iend)),
    );
    expect(stamped.length).toBeGreaterThan(png.length);
  });

  it("leaves a non-PNG unchanged and reads nothing from it", () => {
    const notPng = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(injectPngText(notPng, { k: "v" })).toBe(notPng); // same reference, untouched
    expect(readPngText(notPng)).toEqual({});
  });

  it("truncates an over-long keyword to 79 chars and coerces non-Latin-1 text to '?'", () => {
    const longKey = "k".repeat(200);
    const out = readPngText(injectPngText(fakePng(), { [longKey]: "αβ" }));
    const keys = Object.keys(out);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe("k".repeat(79)); // keyword clipped to the PNG max
    expect(out[keys[0]]).toBe("??"); // U+03B1/03B2 are outside Latin-1 → '?'
  });

  it("reads an empty map from a PNG with no tEXt chunks", () => {
    expect(readPngText(fakePng())).toEqual({});
  });
});
