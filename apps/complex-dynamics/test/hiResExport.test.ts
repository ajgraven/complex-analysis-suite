import { describe, expect, it } from "vitest";
import { clampExportSize, ensurePngName, flipRowsInPlace } from "../src/hiResExport";

describe("clampExportSize", () => {
  it("passes an in-range size through unchanged", () => {
    expect(clampExportSize(2000, 8192)).toEqual({ size: 2000, clamped: false });
  });

  it("clamps a size above the GPU maximum", () => {
    expect(clampExportSize(8000, 4096)).toEqual({ size: 4096, clamped: true });
  });

  it("clamps a size below the minimum", () => {
    expect(clampExportSize(100, 8192)).toEqual({ size: 256, clamped: true });
  });

  it("floors a non-integer request", () => {
    expect(clampExportSize(2000.9, 8192).size).toBe(2000);
  });
});

describe("ensurePngName", () => {
  it("leaves an existing .png name (case-insensitive)", () => {
    expect(ensurePngName("ParamSpace.png")).toBe("ParamSpace.png");
    expect(ensurePngName("Foo.PNG")).toBe("Foo.PNG");
  });

  it("appends .png when missing", () => {
    expect(ensurePngName("foo")).toBe("foo.png");
  });

  it("strips characters illegal in filenames", () => {
    expect(ensurePngName("a/b:c*?.png")).toBe("a_b_c__.png");
  });

  it("falls back to plot.png for empty/whitespace input", () => {
    expect(ensurePngName("   ")).toBe("plot.png");
  });
});

describe("flipRowsInPlace", () => {
  /** An RGBA image whose every pixel encodes its own (row, col) — so a wrong flip is visible. */
  function makeImage(size: number): Uint8Array {
    const buf = new Uint8Array(size * size * 4);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const i = (r * size + c) * 4;
        buf[i] = r;
        buf[i + 1] = c;
        buf[i + 2] = (r * 31 + c * 7) & 0xff;
        buf[i + 3] = 255;
      }
    }
    return buf;
  }

  /** The allocate-a-second-buffer version this replaced — the reference for byte-identity. */
  function flipByCopy(src: Uint8Array, size: number): Uint8Array {
    const rowBytes = size * 4;
    const out = new Uint8Array(size * size * 4);
    for (let row = 0; row < size; row++) {
      const s = row * rowBytes;
      out.set(src.subarray(s, s + rowBytes), (size - 1 - row) * rowBytes);
    }
    return out;
  }

  it("is byte-identical to the copying flip it replaced, at even and odd sizes", () => {
    // The in-place swap must not change a single output byte — this is a memory fix, not a
    // rendering change. Odd sizes matter: the middle row is a fixed point the loop must skip.
    for (const size of [1, 2, 3, 4, 5, 8, 17, 64]) {
      const a = makeImage(size);
      const want = flipByCopy(a, size);
      flipRowsInPlace(a, size);
      expect(Array.from(a), `size ${size}`).toEqual(Array.from(want));
    }
  });

  it("moves the bottom GL row to the top image row", () => {
    // The whole reason the flip exists: readPixels row 0 is the BOTTOM of the picture.
    const size = 4;
    const buf = makeImage(size);
    flipRowsInPlace(buf, size);
    expect(buf[0]).toBe(size - 1); // image row 0 now carries the pixels tagged row 3
    expect(buf[(size - 1) * size * 4]).toBe(0); // …and the last image row carries row 0
  });

  it("is an involution — flipping twice restores the original", () => {
    const size = 7;
    const original = Array.from(makeImage(size));
    const buf = makeImage(size);
    flipRowsInPlace(buf, size);
    expect(Array.from(buf)).not.toEqual(original);
    flipRowsInPlace(buf, size);
    expect(Array.from(buf)).toEqual(original);
  });

  it("mutates the caller's buffer rather than returning a new one", () => {
    // Load-bearing: glPlot hands the SAME ArrayBuffer to ImageData via a Uint8ClampedArray view,
    // which is what keeps peak export memory at one buffer instead of two.
    const buf = makeImage(4);
    const before = buf.buffer;
    flipRowsInPlace(buf, 4);
    expect(buf.buffer).toBe(before);
    // …and that view really does see the flipped bytes.
    const view = new Uint8ClampedArray(buf.buffer);
    expect(view[0]).toBe(3);
  });

  it("rejects a buffer whose length does not match the size", () => {
    // Silently flipping a mis-sized buffer would scramble the export instead of failing.
    expect(() => flipRowsInPlace(new Uint8Array(4 * 4 * 4 - 4), 4)).toThrow(/expected 64 bytes/);
    expect(() => flipRowsInPlace(new Uint8Array(0), 2)).toThrow();
  });
});
