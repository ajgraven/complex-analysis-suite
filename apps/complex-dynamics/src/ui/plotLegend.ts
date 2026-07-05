/**
 * Renders the per-plot colour legend chip (a {@link LegendModel} from src/render/legend.ts) into a
 * small corner container. The gradient bar samples the live palette in JS (src/palettes.ts) so it
 * matches the on-screen ramp exactly, including the palette-rotation offset. Pure DOM — no state.
 */

import { paletteRGB, type GradientStop, type PaletteName } from "../palettes";
import type { LegendModel } from "../render/legend";

/** CSS `linear-gradient` sampling the palette (rotation offset folded in) — the legend's colour bar. */
function paletteGradientCss(palette: PaletteName, custom: GradientStop[], rotation: number): string {
  const steps = 12;
  const stops: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const rot = (((t + rotation) % 1) + 1) % 1; // match the shader's fract(t + offset)
    const [r, g, b] = paletteRGB(palette, rot, custom);
    stops.push(`rgb(${r}, ${g}, ${b}) ${Math.round(t * 100)}%`);
  }
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

/** Render `model` into the chip `el` (cleared first), using the current palette for a gradient bar. */
export function renderLegend(
  el: HTMLElement,
  model: LegendModel,
  palette: PaletteName,
  custom: GradientStop[],
  rotation: number,
): void {
  el.replaceChildren();
  const line = (cls: string, text?: string): HTMLDivElement => {
    const d = document.createElement("div");
    d.className = cls;
    if (text !== undefined) d.textContent = text;
    el.appendChild(d);
    return d;
  };

  line("legend-title", model.title);

  if (model.visual === "gradient") {
    line("legend-bar").style.background = paletteGradientCss(palette, custom, rotation);
    if (model.low !== undefined || model.high !== undefined) {
      const scale = line("legend-scale");
      const lo = document.createElement("span");
      lo.textContent = model.low ?? "";
      const hi = document.createElement("span");
      hi.textContent = model.high ?? "";
      scale.append(lo, hi);
    }
  } else if (model.visual === "wheel") {
    line("legend-wheel"); // the hue disc is a fixed conic-gradient in CSS
  }

  if (model.interior !== undefined) {
    const row = line("legend-interior");
    const sw = document.createElement("span");
    sw.className = "legend-sw"; // black swatch = the interior colour
    row.append(sw, document.createTextNode(model.interior));
  }

  if (model.note !== undefined) line("legend-note", model.note);
}
