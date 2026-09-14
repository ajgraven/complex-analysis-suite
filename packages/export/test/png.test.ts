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

describe("iTXt: text above Latin-1", () => {
  // **`tEXt` IS LATIN-1, AND THAT WAS SILENTLY DESTROYING CONTENT.** Every consumer's `Software`
  // string carries an em-dash, and Contour Integration stamps a figure's own verdict, where
  // `= 2π√3/3` was being written as `= 2??3/3`. The coercion was documented rather than fixed, which
  // made it read as deliberate. `injectPngText` now picks `iTXt` per entry.
  it("round-trips text above the BMP, where a surrogate pair must survive as one code point", () => {
    // `utf8` iterates the string rather than indexing it, which is what makes this work; indexing
    // would encode each half of the surrogate pair separately and produce two replacement chars.
    const entries = { "cas:note": "𝔻* → ext(B) 🧮 ∮" };
    expect(readPngText(injectPngText(makePng(), entries))).toEqual(entries);
  });

  it("yields U+FFFD for a malformed sequence and keeps the rest of the record", () => {
    // The bytes may come from another tool; one bad sequence should cost that character, not the
    // whole entry, and certainly not throw.
    const name = [..."k"].map((c) => c.charCodeAt(0));
    const data = Uint8Array.from([...name, 0, 0, 0, 0, 0, 0xc3, 0x28, 0x41]);
    const chunk = pngChunk("iTXt", data);
    const base = makePng();
    const iend = base.length - 12;
    const out = new Uint8Array(base.length + chunk.length);
    out.set(base.subarray(0, iend), 0);
    out.set(chunk, iend);
    out.set(base.subarray(iend), iend + chunk.length);
    expect(readPngText(out).k).toBe("\ufffd(A");
  });

  it("refuses an OVERLONG form and an encoded SURROGATE, which a length check alone would accept", () => {
    // Both decode to a plausible code point — `C0 80` to NUL, `ED A0 80` to a lone surrogate — so a
    // decoder that takes them makes `fromUtf8`'s "malformed yields U+FFFD" claim false rather than
    // loose. Written as one chunk carrying `A`, the overlong NUL, `B`, the surrogate, `C`.
    const name = [..."k"].map((c) => c.charCodeAt(0));
    const body = [0x41, 0xc0, 0x80, 0x42, 0xed, 0xa0, 0x80, 0x43];
    const data = Uint8Array.from([...name, 0, 0, 0, 0, 0, ...body]);
    const chunk = pngChunk("iTXt", data);
    const base = makePng();
    const iend = base.length - 12;
    const out = new Uint8Array(base.length + chunk.length);
    out.set(base.subarray(0, iend), 0);
    out.set(chunk, iend);
    out.set(base.subarray(iend), iend + chunk.length);
    const back = readPngText(out).k;
    // One replacement per bad LEAD byte, the continuation bytes then being bad leads of their own.
    expect(back.startsWith("A\ufffd")).toBe(true);
    expect(back.endsWith("C")).toBe(true);
    expect(back).toContain("B");
    expect(back).not.toContain("\u0000");
    expect([...back].some((c) => { const p = c.codePointAt(0) ?? 0; return p >= 0xd800 && p <= 0xdfff; })).toBe(false);
  });

  it("round-trips mathematics, an em-dash and emoji unchanged", () => {
    const entries = {
      Software: "Contour Integration — Complex Analysis Suite",
      "cas:value": "= 2π√3/3",
      "cas:verdict": "⚠ This argument does not close: LEGALITY fails.",
      "cas:mixed": "Σ f(zₖ)·Δzₖ ≈ 6.28i",
    };
    const back = readPngText(injectPngText(makePng(), entries));
    expect(back).toEqual(entries);
  });

  it("keeps a pure-ASCII entry in `tEXt`, so existing consumers' bytes do not move", () => {
    const ascii = { Software: "Riemann Map", "cas:state": "#vs=abc-123_XYZ" };
    const png = injectPngText(makePng(), ascii);
    const types = new Set<string>();
    let pos = 8;
    const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
    while (pos + 8 <= png.length) {
      const len = dv.getUint32(pos);
      const t = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7]);
      types.add(t);
      if (t === "IEND") break;
      pos += 12 + len;
    }
    expect(types.has("tEXt")).toBe(true);
    expect(types.has("iTXt")).toBe(false);
    expect(readPngText(png)).toEqual(ascii);
  });

  it("writes `iTXt` only for the entries that need it, mixing both in one file", () => {
    const png = injectPngText(makePng(), { ascii: "plain", unicode: "π" });
    const seen = { tEXt: 0, iTXt: 0 };
    let pos = 8;
    const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
    while (pos + 8 <= png.length) {
      const len = dv.getUint32(pos);
      const t = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7]);
      if (t === "IEND") break;
      if (t === "tEXt") seen.tEXt += 1;
      if (t === "iTXt") seen.iTXt += 1;
      pos += 12 + len;
    }
    expect(seen).toEqual({ tEXt: 1, iTXt: 1 });
    expect(readPngText(png)).toEqual({ ascii: "plain", unicode: "π" });
  });

  it("reads an `iTXt` that carries a language tag and a translated keyword", () => {
    // Written the way another tool might, rather than the way this module writes: the reader scans
    // for the two nulls instead of assuming both fields are empty.
    const name = [..."Title"].map((c) => c.charCodeAt(0));
    const lang = [..."en"].map((c) => c.charCodeAt(0));
    const translated = [...new TextEncoder().encode("Título")];
    const body = [...new TextEncoder().encode("π/2")];
    const data = Uint8Array.from([...name, 0, 0, 0, ...lang, 0, ...translated, 0, ...body]);
    const chunk = pngChunk("iTXt", data);
    const base = makePng();
    // Splice it before IEND by hand.
    const iend = base.length - 12;
    const out = new Uint8Array(base.length + chunk.length);
    out.set(base.subarray(0, iend), 0);
    out.set(chunk, iend);
    out.set(base.subarray(iend), iend + chunk.length);
    expect(readPngText(out).Title).toBe("π/2");
  });

  it("leaves a COMPRESSED iTXt absent rather than present and wrong", () => {
    // zlib is deliberately not carried here, so a compressed chunk cannot be read. Absent is the
    // honest failure; a garbled value would be the dishonest one.
    const name = [..."Note"].map((c) => c.charCodeAt(0));
    const data = Uint8Array.from([...name, 0, 1, 0, 0, 0, 0x78, 0x9c, 0x01]);
    const chunk = pngChunk("iTXt", data);
    const base = makePng();
    const iend = base.length - 12;
    const out = new Uint8Array(base.length + chunk.length);
    out.set(base.subarray(0, iend), 0);
    out.set(chunk, iend);
    out.set(base.subarray(iend), iend + chunk.length);
    expect("Note" in readPngText(out)).toBe(false);
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

  it("carries non-Latin-1 text intact, in an `iTXt` chunk", () => {
    // **This test used to assert the OPPOSITE** — `"d≈1"` in, `"d?1"` out — pinning `tEXt`'s Latin-1
    // coercion as intended behaviour. It is not: the suite's `Software` strings all carry an
    // em-dash, and Contour Integration stamps a figure's own verdict, where `= 2π√3/3` was stored as
    // `= 2??3/3`. A test that documents a defect is how a defect survives six consumers.
    const out = injectPngText(makePng(), { note: "d≈1" });
    expect(readPngText(out).note).toBe("d≈1");
  });

  it("still coerces a non-Latin-1 KEYWORD, which the spec requires to be Latin-1", () => {
    // The text is free; the keyword is not. Every keyword in the suite is ASCII, and a caller who
    // passes one that is not gets the spec's answer rather than a silent rename.
    const out = readPngText(injectPngText(makePng(), { "π": "ok" }));
    expect(out["?"]).toBe("ok");
    expect("π" in out).toBe(false);
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
