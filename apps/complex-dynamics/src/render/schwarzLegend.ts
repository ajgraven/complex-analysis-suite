// schwarzLegend.ts — the σ pane's colour legend (ADR-0009 item 3, legend parity with the standard plots).
// Reuses the app's legend-* CSS classes (src/styles/main.css, via src/ui/plotLegend.ts) so the σ chip
// reads like the Parameter/Dynamical legends, but samples the σ COLORMAP tables (render/schwarzColormaps.ts)
// rather than CD's procedural palette — the ramp matches the on-screen σ field. Below the ramp it names
// the flat classification colours (escaped / non-escaping / off-branch) the shader paints, so the whole
// σ colour scheme is documented in one chip.
import { schwarzColormap } from "./schwarzColormaps";
import { SCHWARZ_FLAT_RGB } from "./schwarzView";

const rgbCss = (c: readonly [number, number, number]): string => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

/**
 * A CSS `linear-gradient` sampling the named σ colormap evenly (colour k at k/(n−1)) — the legend's ramp
 * bar. Falls back to the default palette for an unknown name (schwarzColormap never throws), so a stale
 * saved name can't break the legend.
 */
export function schwarzColormapGradientCss(name: string): string {
  const colors = schwarzColormap(name);
  const n = Math.max(1, colors.length - 1);
  const stops = colors.map((c, i) => `${rgbCss(c)} ${Math.round((i / n) * 100)}%`);
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

/** The flat-colour swatches shown under the ramp, in reading order. */
const FLAT_SWATCHES: ReadonlyArray<{ color: readonly [number, number, number]; label: string }> = [
  { color: SCHWARZ_FLAT_RGB.escaped, label: "escapes → ∞" },
  { color: SCHWARZ_FLAT_RGB.interior, label: "non-escaping" },
  { color: SCHWARZ_FLAT_RGB.invalid, label: "off-branch" },
];

/**
 * Render the σ legend into `el` (cleared first): a title ("Escape time · <scale>"), the colormap ramp
 * with "in K fast" / "near ∂Ω" end labels, then the flat-colour swatches. Pure DOM — no state; the caller
 * passes the current colormap name + a human scale-mode label.
 */
export function renderSchwarzLegend(
  el: HTMLElement,
  opts: { colormapName: string; scaleLabel: string },
): void {
  el.replaceChildren();
  const line = (cls: string, text?: string): HTMLDivElement => {
    const d = document.createElement("div");
    d.className = cls;
    if (text !== undefined) d.textContent = text;
    el.appendChild(d);
    return d;
  };

  line("legend-title", `Escape time · ${opts.scaleLabel}`);
  line("legend-bar").style.background = schwarzColormapGradientCss(opts.colormapName);
  const scale = line("legend-scale");
  const lo = document.createElement("span");
  lo.textContent = "in K fast";
  const hi = document.createElement("span");
  hi.textContent = "near ∂Ω";
  scale.append(lo, hi);

  for (const s of FLAT_SWATCHES) {
    const row = line("legend-interior"); // reuse the standard interior-swatch row layout
    const sw = document.createElement("span");
    sw.className = "legend-sw";
    sw.style.background = rgbCss(s.color);
    row.append(sw, document.createTextNode(s.label));
  }
}
