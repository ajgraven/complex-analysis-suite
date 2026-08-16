import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { oklch, contrast, worstCvdDeltaE, worstNormalDeltaE } from "./palette-validator.js";

// ADR-0023 action item 4 — a CI gate over the categorical MARK token set. Identity in the z-plane is
// double-encoded (shape + colour); this asserts the COLOUR half stays colour-blind-safe if the tokens are
// ever edited. The z-plane trio ○ zero / ✕ pole / ◆ f′=0 is the real adjacency set (three marks that can
// sit side by side), validated in both themes. The rose ● target lives in the w-plane (a separate context).
//
// Thresholds mirror the house dataviz validator: OKLab ΔE (×100) over the Machado (2009) severity-1.0 CVD
// simulation, OKLCH lightness band + chroma floor, WCAG contrast. See palette-validator.ts.

const CSS = readFileSync(fileURLToPath(new URL("../src/styles/main.css", import.meta.url)), "utf8");

/** Pull the `#rrggbb` value of a CSS custom property out of a single selector block. */
function tokensOf(selector: string): Record<string, string> {
  const start = CSS.indexOf(selector);
  if (start < 0) throw new Error(`selector not found in main.css: ${selector}`);
  const block = CSS.slice(start, CSS.indexOf("}", start));
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) out[m[1]] = m[2];
  return out;
}

// Dark is the bare `:root` default; light is the explicit-choice block. (The prefers-colour-scheme media
// block mirrors the light values — covered by the "light matches media block" check below.)
const dark = tokensOf(":root {");
const light = tokensOf(':root[data-theme="light"] {');

const MODES = [
  // OKLCH lightness band + the surface the marks are drawn on (the pane background, --panel).
  { name: "dark", tok: dark, band: [0.48, 0.67] as const },
  { name: "light", tok: light, band: [0.43, 0.77] as const },
];

// Thresholds (dataviz validator): CVD target 8, floor 6; normal-vision hard floor 15; chroma floor 0.10.
const CVD_TARGET = 8.0;
const NORMAL_FLOOR = 15.0;
const CHROMA_FLOOR = 0.1;
const CONTRAST_MIN = 3.0; // WCAG 1.4.11 non-text contrast for the marks vs their surface

describe("accessible mark palette (ADR-0023 action item 4 — CI gate)", () => {
  for (const { name, tok, band } of MODES) {
    describe(`${name} theme`, () => {
      const trio = () => {
        for (const k of ["--zero", "--pole", "--crit", "--panel"]) {
          if (!tok[k]) throw new Error(`${name}: missing token ${k}`);
        }
        return { colors: [tok["--zero"], tok["--pole"], tok["--crit"]], surface: tok["--panel"] };
      };

      it("the z-plane trio ○/✕/◆ is colour-blind-separable (OKLab ΔE ≥ 8 under protan+deutan)", () => {
        const w = worstCvdDeltaE(trio().colors);
        expect(w.dE, `${name}: worst CVD pair ${trio().colors[w.i]}↔${trio().colors[w.j]} (${w.kind})`).toBeGreaterThanOrEqual(
          CVD_TARGET,
        );
      });

      it("the trio is separable for full-colour vision too (normal-vision ΔE floor ≥ 15)", () => {
        expect(worstNormalDeltaE(trio().colors)).toBeGreaterThanOrEqual(NORMAL_FLOOR);
      });

      it("each trio mark sits in the mode's OKLCH lightness band and clears the chroma floor", () => {
        for (const c of trio().colors) {
          const { L, C } = oklch(c);
          expect(L, `${name}: ${c} lightness`).toBeGreaterThanOrEqual(band[0]);
          expect(L, `${name}: ${c} lightness`).toBeLessThanOrEqual(band[1]);
          expect(C, `${name}: ${c} chroma`).toBeGreaterThanOrEqual(CHROMA_FLOOR);
        }
      });

      it("each trio mark meets non-text contrast (≥ 3:1) against the plane background", () => {
        const { colors, surface } = trio();
        for (const c of colors) {
          expect(contrast(c, surface), `${name}: ${c} vs ${surface}`).toBeGreaterThanOrEqual(CONTRAST_MIN);
        }
      });
    });
  }

  it("the light-theme tokens match the prefers-color-scheme media block (one source of truth)", () => {
    const media = tokensOf(':root:not([data-theme="dark"]) {');
    for (const k of ["--zero", "--pole", "--crit", "--target"]) {
      expect(media[k], `media block ${k}`).toBe(light[k]);
    }
  });
});
