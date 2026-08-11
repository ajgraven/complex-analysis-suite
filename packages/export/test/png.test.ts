import { describe, it, expect } from "vitest";
import { PNG_SIGNATURE, crc32, pngChunk, injectPngText, readPngText } from "../src/png.js";

/** A structurally-walkable PNG: signature + IHDR + IDAT + IEND, each chunk with a correct CRC. */
function makePng(): Uint8Array {
  const ihdr = pngChunk("IHDR", Uint8Array.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]));
  const idat = pngChunk("IDAT", Uint8Array.from([1, 2, 3]));
  const iend = pngChunk("IEND", new Uint8Array(0));
  const out = new Uint8Array(PNG_SIGNATURE.length + ihdr.length + idat.length + iend.length);
  let off = 0;
  for (const part of [PNG_SIGNATURE, ihdr, idat, iend]) {
    out.set(part, off);
    off += part.length;
  }
  return out;
}

describe("crc32", () => {
  it("matches the canonical CRC-32 check value", () => {
    // "123456789" → 0xcbf43926 (the standard CRC-32/ISO-HDLC check value).
    const s = Uint8Array.from([..."123456789"].map((c) => c.charCodeAt(0)));
    expect(crc32(s)).toBe(0xcbf43926);
  });
});

describe("pngChunk", () => {
  it("frames [length][type][data][crc] with the CRC over type+data", () => {
    const data = Uint8Array.from([0xde, 0xad, 0xbe, 0xef]);
    const chunk = pngChunk("tEXt", data);
    const dv = new DataView(chunk.buffer);
    expect(dv.getUint32(0)).toBe(data.length); // length field excludes type + crc
    const type = String.fromCharCode(chunk[4], chunk[5], chunk[6], chunk[7]);
    expect(type).toBe("tEXt");
    const typeAndData = chunk.subarray(4, chunk.length - 4);
    expect(dv.getUint32(chunk.length - 4)).toBe(crc32(typeAndData));
  });
});

describe("injectPngText / readPngText", () => {
  it("round-trips tEXt entries and grows the file", () => {
    const png = makePng();
    const entries = {
      Software: "Complex Analysis Suite",
      "cas:params": "f(z)=z+z^2/2; zoom=0.75",
      "cas:state": "https://example/#vs=AbC123",
    };
    const out = injectPngText(png, entries);
    expect(out.length).toBeGreaterThan(png.length);
    expect(readPngText(out)).toEqual(entries);
  });

  it("keeps multiple keywords independent", () => {
    const png = injectPngText(makePng(), { Software: "Riemann Map", "cas:state": "#vs=abc" });
    const back = readPngText(png);
    expect(back.Software).toBe("Riemann Map");
    expect(back["cas:state"]).toBe("#vs=abc");
    expect(back.missing).toBeUndefined();
  });

  it("preserves the leading image bytes (metadata goes before IEND) and ends at IEND", () => {
    const png = makePng();
    const out = injectPngText(png, { A: "1" });
    const prefixLen = png.length - pngChunk("IEND", new Uint8Array(0)).length;
    expect(Array.from(out.subarray(0, prefixLen))).toEqual(Array.from(png.subarray(0, prefixLen)));
    const tail = String.fromCharCode(out[out.length - 8], out[out.length - 7], out[out.length - 6], out[out.length - 5]);
    expect(tail).toBe("IEND");
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
