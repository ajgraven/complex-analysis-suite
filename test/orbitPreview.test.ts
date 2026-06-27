import { describe, it, expect } from "vitest";
import { previewToPx, PREVIEW_HALF } from "../src/render/orbitPreview";

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
