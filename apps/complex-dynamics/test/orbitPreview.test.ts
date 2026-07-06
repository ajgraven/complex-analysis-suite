import { describe, it, expect } from "vitest";
import { previewToPx, PREVIEW_HALF, juliaEscapeRgba } from "../src/render/orbitPreview";
import { parse } from "@cas/expr/parser";

describe("previewToPx", () => {
  const S = 140;

  it("maps the origin to the centre", () => {
    expect(previewToPx([0, 0], S)).toEqual([70, 70]);
  });

  it("maps the window edges (y is up, so +im is toward the top)", () => {
    expect(previewToPx([PREVIEW_HALF, 0], S)).toEqual([S, 70]);
    expect(previewToPx([-PREVIEW_HALF, 0], S)).toEqual([0, 70]);
    expect(previewToPx([0, PREVIEW_HALF], S)).toEqual([70, 0]);
    expect(previewToPx([0, -PREVIEW_HALF], S)).toEqual([70, S]);
  });
});

describe("juliaEscapeRgba", () => {
  it("c = 0: the centre is interior (dark), a far corner escapes (brighter)", () => {
    const f = parse("z^2+c");
    const esc = parse("abs(z)>2");
    const size = 9;
    const d = juliaEscapeRgba(f, esc, [0, 0], [0, 0], size, 40);
    const lum = (px: number, py: number): number => {
      const i = (py * size + px) * 4;
      return d[i] + d[i + 1] + d[i + 2];
    };
    // z₀ ≈ 0 stays bounded (dark interior); the corner |z₀| ≈ 3 escapes immediately (brighter).
    expect(lum(4, 4)).toBeLessThan(lum(0, 0));
    expect(d).toHaveLength(size * size * 4);
  });
});
