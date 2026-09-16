/**
 * The per-plot colour legend: a pure description of what the colours mean for the current colouring
 * mode, which the UI (src/ui/plotLegend.ts) renders as a small corner chip. Kept data-only (no DOM)
 * so it is unit-testable and the wording stays in one place. `setName` is the plane's interior name
 * ("Mandelbrot set" / "filled Julia set" / "the set"), supplied by the caller.
 */

/** How the renderer draws the scale: a palette ramp, a hue wheel, or note-only. */
export type LegendVisual = "gradient" | "wheel" | "note";

export interface LegendModel {
  /** Short mode name shown at the top of the chip. */
  title: string;
  visual: LegendVisual;
  /** Gradient low / high end labels (for `visual === "gradient"`). */
  low?: string;
  high?: string;
  /** Interior swatch label (the interior renders black); omitted when the mode has no black interior. */
  interior?: string;
  /** One short explanatory line (mainly for the wheel / interior-structure modes). */
  note?: string;
}

/**
 * Describe the legend for a colouring `mode` (the `#mode` select value); `setName` is the plane's
 * interior name (e.g. "Mandelbrot set", "filled Julia set"). The escape-time family maps a scalar
 * onto the palette with a black interior; the interior-structure modes (period, multiplier) and
 * domain / Newton colouring use their own colour schemes.
 */
export function describeLegend(mode: string, setName: string): LegendModel {
  switch (mode) {
    case "escape":
    case "smooth":
    case "histogram":
      return {
        title: mode === "histogram" ? "Escape time (equalised)" : "Escape time",
        visual: "gradient",
        low: "escapes fast",
        high: "near the boundary",
        interior: setName,
      };
    case "distance":
    case "distanceAnalytic":
      return {
        title: "Distance to the set",
        visual: "gradient",
        // The ramp is the escape-time scalar `palette(s / uN)`, so these two ends are right. What the
        // legend never said is that the result is MULTIPLIED by a factor that falls to 0 at the
        // boundary (`de`, or `edge` for the screen-space variant) — which is the whole point of the
        // mode and why the filaments read dark. (WP1/R3.)
        low: "far",
        high: "close to the edge",
        note: "the boundary itself is darkened, picking out the filaments",
        interior: setName,
      };
    case "interiorDE":
      return {
        title: "Interior distance",
        visual: "gradient",
        low: "near the edge",
        high: "deep interior",
        note: "outside the set: black",
      };
    case "orbit":
      return {
        title: "Orbit trap",
        visual: "gradient",
        // shaderBuilder: `palette(1.0 - clamp(sqrt(trap) * 1.3, 0.0, 1.0))` — a SMALL closest
        // approach maps to the TOP of the ramp, so hugging the trap is the high end, not the low
        // one. The two labels were the wrong way round. (WP1/R3.)
        low: "orbit stays away",
        high: "hugs the trap",
        interior: setName,
      };
    case "stripe":
    case "triangle":
      return {
        title: mode === "stripe" ? "Stripe average" : "Triangle average",
        visual: "gradient",
        low: "low",
        high: "high orbit average",
        interior: setName,
      };
    case "decomposition":
      return {
        title: "Binary decomposition",
        visual: "gradient",
        low: "lower half-plane",
        high: "upper half-plane",
        interior: setName,
      };
    case "marty":
      return {
        title: "Marty (normality)",
        visual: "gradient",
        low: "stable",
        high: "on the Julia set",
        interior: setName,
      };
    case "period":
      return {
        title: "Attracting period",
        visual: "gradient",
        // No low/high: the shader is `palette(fract(period * 0.618))`, a hash that spreads periods
        // across the ramp so neighbouring components differ — it is deliberately NOT monotone in the
        // period, and labelling the ends "period 1 → higher period" claimed an order the picture does
        // not have. (WP1/R3.)
        note: "interior by cycle period — a distinct hue per period, not an ordered scale; exterior black",
      };
    case "multiplier":
      return {
        title: "Multiplier λ",
        visual: "wheel",
        // shaderBuilder: `val = sqrt(1.0 - mag)` — brightness FALLS as |λ| rises, so the
        // superattracting centre (|λ| = 0) is the bright end. The note said the opposite. (WP1/R3.)
        note: "interior: hue = arg λ (the internal angle); bright at the superattracting centre, dark toward the component edge (|λ| → 1)",
      };
    case "newtonBasins":
      return {
        title: "Newton basins",
        visual: "wheel",
        note: "hue = which root the orbit reaches; brighter = faster",
      };
    case "domain":
      return {
        title: "Domain colouring",
        visual: "wheel",
        note: "hue = arg f(z), brightness = |f|",
      };
    default:
      return {
        title: "Escape time",
        visual: "gradient",
        low: "escapes fast",
        high: "near the boundary",
        interior: setName,
      };
  }
}
