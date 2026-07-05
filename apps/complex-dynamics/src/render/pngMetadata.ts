/**
 * Minimal PNG `tEXt` metadata injection — embeds reproducibility parameters into an exported PNG
 * without touching a single image pixel. A `tEXt` chunk is `keyword\0text` (both Latin-1), inserted
 * just before the terminating `IEND` chunk, with a correct CRC-32. Ancillary chunks are ignored by
 * image renderers but read by metadata viewers and by {@link readPngText} here.
 *
 * Pure and dependency-free (no DOM), so it is unit-tested directly and can run anywhere.
 */

/** PNG 8-byte signature. */
const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

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

/** Build one `tEXt` chunk: [length][type "tEXt"][keyword\0text][crc]. */
function textChunk(keyword: string, text: string): Uint8Array {
  const data = [...latin1(keyword.slice(0, 79)), 0, ...latin1(text)];
  const typeAndData = Uint8Array.from([0x74, 0x45, 0x58, 0x74, ...data]); // "tEXt" + data
  const chunk = new Uint8Array(4 + typeAndData.length + 4);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, data.length); // chunk length excludes the type + CRC fields
  chunk.set(typeAndData, 4);
  dv.setUint32(4 + typeAndData.length, crc32(typeAndData));
  return chunk;
}

/** Position of the `IEND` chunk's length field, or -1 if `png` is not a walkable PNG. */
function findIend(png: Uint8Array): number {
  for (let i = 0; i < 8; i++) if (png[i] !== SIG[i]) return -1; // not a PNG
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
 * Insert `tEXt` chunks (keyword → text) immediately before `IEND`, returning a NEW byte array. The
 * image is byte-for-byte identical; only invisible metadata is added. If `png` is not a valid PNG (or
 * has no IEND), it is returned unchanged.
 */
export function injectPngText(png: Uint8Array, entries: Record<string, string>): Uint8Array {
  const iend = findIend(png);
  if (iend < 0) return png;
  const chunks = Object.entries(entries).map(([k, v]) => textChunk(k, v));
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

/** Read back all `tEXt` keyword → text entries from a PNG (inverse of {@link injectPngText}). */
export function readPngText(png: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < 8; i++) if (png[i] !== SIG[i]) return out;
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let pos = 8;
  while (pos + 8 <= png.length) {
    const len = dv.getUint32(pos);
    const type = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7]);
    if (type === "IEND") break;
    if (type === "tEXt") {
      const data = png.subarray(pos + 8, pos + 8 + len);
      let sep = data.indexOf(0);
      if (sep < 0) sep = data.length;
      const keyword = String.fromCharCode(...data.subarray(0, sep));
      out[keyword] = String.fromCharCode(...data.subarray(Math.min(sep + 1, data.length)));
    }
    pos += 12 + len;
  }
  return out;
}
