import { describe, it, expect } from "vitest";
import { crc32, injectPngText, readPngText } from "../src/render/pngMetadata";

/** A structurally-walkable PNG (signature + IHDR + IDAT + IEND). CRCs are fake — the walker keys on
 *  chunk length + type, not CRC validity — which is all these tests need. */
function chunk(type: string, data: number[]): number[] {
  const len = data.length;
  return [
    (len >>> 24) & 0xff,
    (len >>> 16) & 0xff,
    (len >>> 8) & 0xff,
    len & 0xff,
    ...[...type].map((ch) => ch.charCodeAt(0)),
    ...data,
    0,
    0,
    0,
    0, // placeholder CRC
  ];
}
function makePng(): Uint8Array {
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
    ...chunk("IDAT", [1, 2, 3]),
    ...chunk("IEND", []),
  ]);
}

describe("crc32", () => {
  it("matches the canonical CRC-32 check value", () => {
    // "123456789" → 0xcbf43926 (the standard CRC-32/ISO-HDLC check value).
    const s = Uint8Array.from([...("123456789" as string)].map((c) => c.charCodeAt(0)));
    expect(crc32(s)).toBe(0xcbf43926);
  });
});

describe("injectPngText / readPngText", () => {
  it("round-trips tEXt entries and grows the file", () => {
    const png = makePng();
    const entries = {
      Software: "ComplexDynamicsJS",
      "cdjs:params": "f(z,c)=z^2+c; zoom=1e6",
      "cdjs:state": "http://example/#s=AbC123",
    };
    const out = injectPngText(png, entries);
    expect(out.length).toBeGreaterThan(png.length);
    expect(readPngText(out)).toEqual(entries);
  });

  it("preserves the leading image bytes (metadata goes before IEND)", () => {
    const png = makePng();
    const out = injectPngText(png, { A: "1" });
    // The signature + IHDR + IDAT prefix is unchanged; only new chunks + IEND follow.
    const prefixLen = png.length - chunk("IEND", []).length;
    expect(Array.from(out.subarray(0, prefixLen))).toEqual(Array.from(png.subarray(0, prefixLen)));
  });

  it("coerces non-Latin-1 text to '?' (tEXt is Latin-1)", () => {
    const out = injectPngText(makePng(), { note: "d≈1" });
    expect(readPngText(out).note).toBe("d?1");
  });

  it("leaves a non-PNG unchanged", () => {
    const junk = Uint8Array.from([1, 2, 3, 4]);
    expect(injectPngText(junk, { a: "b" })).toBe(junk);
    expect(readPngText(junk)).toEqual({});
  });

  it("no entries → no size change", () => {
    const png = makePng();
    expect(injectPngText(png, {}).length).toBe(png.length);
  });
});
