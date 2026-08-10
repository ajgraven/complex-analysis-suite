// legend.ts — the per-plot colour legend chip (roadmap A4). CD parity: a small corner chip keyed to the
// current render mode + colormap, so every colouring says what it means. The ramp bar is sampled from the
// SAME viridis polynomial the shader uses (render/shader.ts), so the legend matches the picture exactly.
// Pure model + a DOM renderer.

/** matplotlib-'viridis' polynomial — identical coefficients to the GLSL `viridis()` in render/shader.ts. */
const VIRIDIS: readonly (readonly [number, number, number])[] = [
  [0.2777, 0.0054, 0.3341],
  [0.1051, 1.4046, 1.3846],
  [-0.3309, 0.2148, 0.0951],
  [-4.6342, -5.7991, -19.3324],
  [6.2283, 14.1799, 56.6906],
  [4.7764, -13.7451, -65.353],
  [-5.4355, 4.6459, 26.3124],
];

function viridis(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    let v = VIRIDIS[6][k];
    for (let i = 5; i >= 0; i--) v = VIRIDIS[i][k] + x * v; // Horner, matching the shader's nesting
    out[k] = Math.round(255 * Math.min(1, Math.max(0, v)));
  }
  return out;
}

type BarKind = "viridis" | "grayscale" | "hue" | null;

/** CSS `linear-gradient` for the legend bar (sampled to match the shader ramp; hue = the phase wheel). */
function barCss(kind: BarKind): string {
  if (kind === null) return "";
  if (kind === "hue") {
    const stops = Array.from({ length: 7 }, (_, i) => `hsl(${(360 * i) / 6} 85% 58%)`);
    return `linear-gradient(to right, ${stops.join(", ")})`;
  }
  const N = 16;
  const stops: string[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const [r, g, b] = kind === "grayscale" ? [Math.round(255 * t), Math.round(255 * t), Math.round(255 * t)] : viridis(t);
    stops.push(`rgb(${r} ${g} ${b}) ${((100 * i) / N).toFixed(1)}%`);
  }
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

export interface LegendModel {
  readonly title: string;
  readonly bar: BarKind;
  readonly low?: string;
  readonly high?: string;
  /** A swatch for the interior set (e.g. K in the Julia-exterior mode), or absent. */
  readonly interior?: { label: string; color: string };
}

/** The legend for a render mode + colormap. `ramp` modes (|φ′|, log|φ′|, Julia) read the colormap. */
export function legendModel(modeId: string, colormapId: string): LegendModel {
  const ramp: BarKind = colormapId === "grayscale" ? "grayscale" : "viridis";
  switch (modeId) {
    case "phase":
    case "phase-plain":
      return { title: "arg φ(z)", bar: "hue", low: "−π", high: "+π" };
    case "conformal":
      return { title: "phase · |φ| contours", bar: "hue", low: "−π", high: "+π" };
    case "checker":
      return { title: "|φ| checker · arg hue", bar: "hue", low: "−π", high: "+π" };
    case "abs-deriv":
      return { title: "|φ′| — local scale", bar: ramp, low: "small", high: "large" };
    case "log-deriv":
      return { title: "log|φ′|", bar: ramp, low: "small", high: "large" };
    case "arg-deriv":
      return { title: "arg φ′ — rotation", bar: "hue", low: "−π", high: "+π" };
    case "julia":
      return { title: "Green's fn G(z)", bar: ramp, low: "near ∂K", high: "escapes fast", interior: { label: "K", color: "#050510" } };
    case "domain-map":
      return { title: "Ω → 𝔻 conformal grid", bar: null };
    default:
      return { title: modeId, bar: null };
  }
}

/** Render the legend model into `el` (a chip container). Clears it when `m` is null. */
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
  if (m.bar) {
    const bar = document.createElement("div");
    bar.className = "legend-bar";
    bar.style.background = barCss(m.bar);
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
  if (m.interior) {
    const row = document.createElement("div");
    row.className = "legend-interior";
    const sw = document.createElement("span");
    sw.className = "legend-sw";
    sw.style.background = m.interior.color;
    const lbl = document.createElement("span");
    lbl.textContent = m.interior.label;
    row.append(sw, lbl);
    el.append(row);
  }
}
