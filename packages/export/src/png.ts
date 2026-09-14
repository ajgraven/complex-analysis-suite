// png.ts — PNG text metadata: embed reproducibility parameters into an exported PNG without touching
// a single image pixel. The chunk is spliced in just before the terminating `IEND` with a correct
// CRC-32. Ancillary chunks are ignored by image renderers but read by metadata viewers and by
// {@link readPngText} here — so an exported figure carries its own recipe (its permalink /
// parameters travel inside the picture).
//
// **TWO CHUNK TYPES, CHOSEN PER ENTRY, and a measurement is why.** `tEXt` is `keyword\0text` with
// both halves **Latin-1**, so any character above U+00FF became `?`. That is not a corner case in
// this suite: every consumer's `Software` string contains an em-dash, and Contour Integration stamps
// the figure's own verdict, where `= 2π√3/3` was being stored as `= 2??3/3` — the mathematical
// content destroyed, silently, in the one field whose job is to say what the figure claims. The
// coercion was documented rather than fixed, which made it look deliberate.
//
// So {@link injectPngText} now writes `iTXt` — PNG's UTF-8 text chunk — for any entry that needs it,
// and plain `tEXt` for one that does not. Existing consumers' ASCII values (URLs, keywords) are
// therefore byte-identical to before; only the entries that were being mangled change, and they
// change from wrong to right. {@link readPngText} reads both.
//
// Pure and dependency-free (no DOM), so it is unit-tested directly and can run anywhere. Convention-
// neutral (ADR-0006): this is byte manipulation — no `π`/`2πi`, indeed no mathematics, lives here.

/** PNG 8-byte signature. */
export const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** CRC-32 (ISO-HDLC, reflected poly 0xEDB88320) — the variant PNG chunk CRCs use. */
const CRC_TABLE = ((): Uint32Array => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 over a byte array (canonical check value: crc32("123456789") === 0xcbf43926). */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Latin-1 bytes of a string; characters outside U+00FF become '?' (`tEXt` is Latin-1 only). */
function latin1(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    out.push(code <= 0xff ? code : 0x3f);
  }
  return out;
}

/**
 * UTF-8 bytes of a string, hand-rolled.
 *
 * `TextEncoder` is a WHATWG global, not an ES one, and this package compiles against `lib: ES2022`
 * with no DOM and no Node types — deliberately, so that it "can run anywhere" as its header says.
 * Reaching for `lib: ["DOM"]` to get two globals would contradict that for the whole package, and it
 * already hand-rolls CRC-32 and Latin-1 rather than importing them. Iterating the string rather than
 * indexing it is what makes surrogate pairs (emoji, and anything above the BMP) come out as one code
 * point rather than two halves.
 */
function utf8(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else {
      out.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f),
        0x80 | (c & 0x3f),
      );
    }
  }
  return out;
}

/**
 * A string from UTF-8 bytes — the inverse of {@link utf8}, and the reader for an `iTXt` chunk.
 *
 * Malformed input yields U+FFFD and keeps going rather than throwing: the bytes may come from
 * another tool's chunk, and one bad sequence should cost that character, not the whole record.
 * "Malformed" includes the two forms a length check alone would let through — an OVERLONG encoding
 * (`C0 80` for NUL) and an encoded SURROGATE (`ED A0 80`) — because both decode to a plausible code
 * point, and a decoder that accepts them makes the sentence above false rather than merely loose.
 */
function fromUtf8(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const x = bytes[i];
    let c: number;
    let n: number;
    if (x < 0x80) {
      c = x;
      n = 1;
    } else if ((x & 0xe0) === 0xc0) {
      c = x & 0x1f;
      n = 2;
    } else if ((x & 0xf0) === 0xe0) {
      c = x & 0x0f;
      n = 3;
    } else if ((x & 0xf8) === 0xf0) {
      c = x & 0x07;
      n = 4;
    } else {
      out += "\ufffd";
      i += 1;
      continue;
    }
    if (i + n > bytes.length) {
      out += "\ufffd";
      break;
    }
    let ok = true;
    for (let k = 1; k < n; k++) {
      const y = bytes[i + k];
      if ((y & 0xc0) !== 0x80) {
        ok = false;
        break;
      }
      c = (c << 6) | (y & 0x3f);
    }
    // Minimum code point for this length, so an overlong form is rejected rather than decoded.
    const min = n === 1 ? 0 : n === 2 ? 0x80 : n === 3 ? 0x800 : 0x10000;
    const surrogate = c >= 0xd800 && c <= 0xdfff;
    if (!ok || c > 0x10ffff || c < min || surrogate) {
      out += "\ufffd";
      i += 1;
      continue;
    }
    out += String.fromCodePoint(c);
    i += n;
  }
  return out;
}

/** Build one complete PNG chunk: [length][type][data][crc], with the CRC over type+data. */
export function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeAndData = Uint8Array.from([...latin1(type.slice(0, 4)), ...data]);
  const chunk = new Uint8Array(4 + typeAndData.length + 4);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, data.length); // chunk length excludes the type + CRC fields
  chunk.set(typeAndData, 4);
  dv.setUint32(4 + typeAndData.length, crc32(typeAndData));
  return chunk;
}

/** Whether every character of `s` fits Latin-1, and so survives a `tEXt` chunk unchanged. */
const isLatin1 = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 0xff) return false;
  return true;
};

/** Build one `tEXt` chunk from a keyword (PNG caps keywords at 79 bytes) and its Latin-1 text. */
function textChunk(keyword: string, text: string): Uint8Array {
  const data = Uint8Array.from([...latin1(keyword.slice(0, 79)), 0, ...latin1(text)]);
  return pngChunk("tEXt", data);
}

/**
 * Build one `iTXt` chunk — PNG's UTF-8 text — from a keyword and its text.
 *
 * Layout (PNG 1.2 §4.2.3.3): `keyword\0`, a compression flag, a compression method, a `\0`-terminated
 * language tag, a `\0`-terminated translated keyword, then the text to the end of the chunk. The flag
 * and the method are both `0` (uncompressed), and the language tag and translated keyword are empty —
 * the keyword is the machine-readable name and there is nothing to translate it into.
 *
 * The KEYWORD stays Latin-1, because the spec requires it to be; every keyword in the suite is ASCII.
 */
function utf8TextChunk(keyword: string, text: string): Uint8Array {
  const name = latin1(keyword.slice(0, 79));
  const body = utf8(text);
  const data = new Uint8Array(name.length + 1 + 1 + 1 + 1 + 1 + body.length);
  data.set(name, 0);
  // name \0 flag(0) method(0) language(\0) translated(\0) … then the UTF-8 text.
  data.set(body, name.length + 5);
  return pngChunk("iTXt", data);
}

/** Position of the `IEND` chunk's length field, or -1 if `png` is not a walkable PNG. */
function findIend(png: Uint8Array): number {
  for (let i = 0; i < 8; i++) if (png[i] !== PNG_SIGNATURE[i]) return -1; // not a PNG
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let pos = 8;
  while (pos + 8 <= png.length) {
    const len = dv.getUint32(pos); // PNG is big-endian (DataView default)
    const type = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7]);
    if (type === "IEND") return pos;
    pos += 12 + len; // length(4) + type(4) + data(len) + crc(4)
  }
  return -1;
}

/**
 * Insert one text chunk per entry immediately before `IEND`, returning a NEW byte array — `tEXt`
 * where the text is pure Latin-1 (so existing ASCII payloads are byte-identical to what they always
 * were) and `iTXt` where it is not. The image is byte-for-byte identical; only invisible metadata is
 * added. If `png` is not a valid PNG (or has no IEND), it is returned unchanged.
 */
export function injectPngText(png: Uint8Array, entries: Record<string, string>): Uint8Array {
  const iend = findIend(png);
  if (iend < 0) return png;
  // `tEXt` where it is lossless, `iTXt` where it is not — see this module's header for why the
  // choice is per entry rather than a flag on the call.
  const chunks = Object.entries(entries).map(([k, v]) =>
    isLatin1(v) ? textChunk(k, v) : utf8TextChunk(k, v),
  );
  const extra = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(png.length + extra);
  out.set(png.subarray(0, iend), 0);
  let off = iend;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  out.set(png.subarray(iend), off);
  return out;
}

/** Read back all text entries — `tEXt` (Latin-1) and `iTXt` (UTF-8) alike (inverse of {@link injectPngText}). */
export function readPngText(png: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < 8; i++) if (png[i] !== PNG_SIGNATURE[i]) return out;
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let pos = 8;
  while (pos + 8 <= png.length) {
    const len = dv.getUint32(pos);
    const type = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7]);
    if (type === "IEND") break;
    if (type === "tEXt" || type === "iTXt") {
      const data = png.subarray(pos + 8, pos + 8 + len);
      let sep = data.indexOf(0);
      if (sep < 0) sep = data.length;
      const keyword = String.fromCharCode(...data.subarray(0, sep));
      if (type === "tEXt") {
        out[keyword] = String.fromCharCode(...data.subarray(sep + 1));
      } else {
        // `iTXt`: after the keyword's null come the compression flag and method, then a
        // null-terminated language tag and a null-terminated translated keyword. Skipped by scanning
        // for those two nulls rather than assuming they are empty, so a chunk written by another
        // tool — which may well set a language — still reads.
        let q = sep + 3;
        const compressed = data[sep + 1] === 1;
        for (let skipped = 0; skipped < 2 && q < data.length; q++) {
          if (data[q] === 0) skipped += 1;
        }
        // A compressed `iTXt` needs zlib, which this module deliberately does not carry. Skipping it
        // leaves the key ABSENT rather than present and wrong, which is the honest failure.
        if (!compressed) out[keyword] = fromUtf8(data.subarray(q));
      }
    }
    pos += 12 + len;
  }
  return out;
}

