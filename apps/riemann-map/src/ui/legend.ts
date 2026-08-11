// legend.ts — the per-plot colour legend chip (roadmap A4). CD parity: a small corner chip keyed to the
// current render mode + colormap, so every colouring says what it means. The ramp bar is built from the
// SAME colormap LUT the shader samples (render/colormaps.ts), so the legend matches the picture exactly.
// Pure model + a DOM renderer.
import { colormapGradientCss } from "../render/colormaps.js";

/** The phase-wheel bar (hue = arg), for the phase-family modes. */
const HUE_CSS = `linear-gradient(to right, ${Array.from({ length: 7 }, (_, i) => `hsl(${(360 * i) / 6} 85% 58%)`).join(", ")})`;

export interface LegendModel {
  readonly title: string;
  /** CSS `linear-gradient` for the bar, or null when the mode has no colour field (the grid mode). */
  readonly barCss: string | null;
  readonly low?: string;
  readonly high?: string;
}

/** The legend for a render mode + colormap. The `ramp` modes (|φ′|, log|φ′|) use the colormap. */
export function legendModel(modeId: string, colormapId: string): LegendModel {
  const ramp = (): string => colormapGradientCss(colormapId);
  switch (modeId) {
    case "disk-image":
      return { title: "arg φ′ — local rotation", barCss: HUE_CSS, low: "−π", high: "+π" };
    case "phase":
    case "phase-plain":
      return { title: "arg φ(z)", barCss: HUE_CSS, low: "−π", high: "+π" };
    case "conformal":
      return { title: "phase · |φ| contours", barCss: HUE_CSS, low: "−π", high: "+π" };
    case "checker":
      return { title: "|φ| checker · arg hue", barCss: HUE_CSS, low: "−π", high: "+π" };
    case "abs-deriv":
      return { title: "|φ′| — local scale", barCss: ramp(), low: "small", high: "large" };
    case "log-deriv":
      return { title: "log|φ′|", barCss: ramp(), low: "small", high: "large" };
    case "arg-deriv":
      return { title: "arg φ′ — rotation", barCss: HUE_CSS, low: "−π", high: "+π" };
    case "domain-map":
      return { title: "Ω → 𝔻 conformal grid", barCss: null };
    default:
      return { title: modeId, barCss: null };
  }
}

/** Render the legend model into `el` (a chip container). Hides it when `m` is null. */
export function renderLegend(el: HTMLElement, m: LegendModel | null): void {
  el.replaceChildren();
  if (!m) {
    el.style.display = "none";
    return;
  }
  el.style.display = "";
  const title = document.createElement("div");
  title.className = "legend-title";
  title.textContent = m.title;
  el.append(title);
  if (m.barCss) {
    const bar = document.createElement("div");
    bar.className = "legend-bar";
    bar.style.background = m.barCss;
    el.append(bar);
    if (m.low || m.high) {
      const scale = document.createElement("div");
      scale.className = "legend-scale";
      const lo = document.createElement("span");
      lo.textContent = m.low ?? "";
      const hi = document.createElement("span");
      hi.textContent = m.high ?? "";
      scale.append(lo, hi);
      el.append(scale);
    }
  }
}
