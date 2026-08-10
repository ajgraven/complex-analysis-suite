// pngMeta.ts — embed / read reproducibility metadata in a PNG's tEXt chunks (catalog item G2/G7).
//
// The "the figure carries its own recipe" mechanism: after the canvas is encoded to PNG, we splice a
// tEXt chunk (keyword\0text, Latin-1) in front of IEND with a correct CRC-32, so re-opening the image
// restores the exact view (the permalink is stored as `cas:state`). Pure byte-manipulation → node-
// tested; the DOM export that produces the PNG lives in main.ts.

export const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function latin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/** Build a complete PNG chunk (length + type + data + CRC-32 over type+data). */
export function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = latin1(type);
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  dv.setUint32(8 + data.length, crc32(crcInput));
  return out;
}

/** Insert a tEXt chunk (keyword→text) immediately before IEND. Returns a new byte array. */
export function injectPngText(png: Uint8Array, keyword: string, text: string): Uint8Array {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let off = 8;
  let iendStart = png.length - 12; // fallback: standard IEND position
  while (off + 8 <= png.length) {
    const len = dv.getUint32(off);
    const type = String.fromCharCode(png[off + 4], png[off + 5], png[off + 6], png[off + 7]);
    if (type === "IEND") {
      iendStart = off;
      break;
    }
    off += 12 + len;
  }
  const kw = latin1(keyword);
  const tx = latin1(text);
  const data = new Uint8Array(kw.length + 1 + tx.length);
  data.set(kw, 0);
  data[kw.length] = 0;
  data.set(tx, kw.length + 1);
  const textChunk = pngChunk("tEXt", data);

  const out = new Uint8Array(png.length + textChunk.length);
  out.set(png.subarray(0, iendStart), 0);
  out.set(textChunk, iendStart);
  out.set(png.subarray(iendStart), iendStart + textChunk.length);
  return out;
}

/** Read the text of the first tEXt chunk with the given keyword, or null. */
export function readPngText(png: Uint8Array, keyword: string): string | null {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let off = 8;
  while (off + 8 <= png.length) {
    const len = dv.getUint32(off);
    const type = String.fromCharCode(png[off + 4], png[off + 5], png[off + 6], png[off + 7]);
    if (type === "tEXt") {
      const data = png.subarray(off + 8, off + 8 + len);
      const zero = data.indexOf(0);
      if (zero >= 0) {
        let kw = "";
        for (let i = 0; i < zero; i++) kw += String.fromCharCode(data[i]);
        if (kw === keyword) {
          let tx = "";
          for (let i = zero + 1; i < data.length; i++) tx += String.fromCharCode(data[i]);
          return tx;
        }
      }
    }
    if (type === "IEND") break;
    off += 12 + len;
  }
  return null;
}
