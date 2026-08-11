// legend.ts — the per-plot colour legend chip (roadmap A4). A small corner chip keyed to the current
// render mode, so the colouring says what it means. Pure model + a DOM renderer.

/** The phase-wheel bar (hue = arg), for the arg-φ′ colouring of the disk-image cells. */
const HUE_CSS = `linear-gradient(to right, ${Array.from({ length: 7 }, (_, i) => `hsl(${(360 * i) / 6} 85% 58%)`).join(", ")})`;

export interface LegendModel {
  readonly title: string;
  /** CSS `linear-gradient` for the bar, or null when the mode has no colour field (the grid mode). */
  readonly barCss: string | null;
  readonly low?: string;
  readonly high?: string;
}

/** The legend for a render mode. The disk-image cells are keyed by arg φ′ (a hue wheel); the numeric
 *  domain map is a plain conformal grid (no colour field). */
export function legendModel(modeId: string): LegendModel {
  if (modeId === "domain-map") return { title: "Ω → 𝔻 conformal grid", barCss: null };
  return { title: "arg φ′ — local rotation", barCss: HUE_CSS, low: "−π", high: "+π" };
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
