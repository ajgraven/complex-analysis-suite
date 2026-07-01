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
        low: "far",
        high: "close to the edge",
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
        low: "orbit hugs the trap",
        high: "stays away",
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
        low: "period 1",
        high: "higher period",
        note: "interior by cycle period; exterior black",
      };
    case "multiplier":
      return {
        title: "Multiplier λ",
        visual: "wheel",
        note: "interior: hue = arg λ, brightness = |λ| (dark = superattracting)",
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
