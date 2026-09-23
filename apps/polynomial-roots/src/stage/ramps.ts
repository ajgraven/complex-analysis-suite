// The two colour ramps, as positioned stops for `@cas/gpu/colormap`.
//
// `@cas/gpu`'s colormap module is explicit that it is the home of the ramp-BUILDING machinery and not a
// re-unification of palette data (Complex Dynamics' named palettes are GLSL polynomial fits, Quadrature
// Domains' are stop tables, and merging them would be a visual regression). These two are this app's own
// data, built through that machinery.
//
// **Density** is the plot's inherited look: black → dark red → orange → yellow → white, the ramp Baez's
// and Derbyshire's pictures use and the one a reader coming from the article will recognise. It is a
// heat ramp, which is not perceptually uniform and is not CVD-safe — a legitimate criticism of it, and
// the reason the degree ramp below is not one too. It is kept because this app's job is to show THAT
// picture, and because the quantity it carries is already equalised, so the ramp is not being asked to
// encode magnitude faithfully; it is being asked to make faint structure visible against black, which is
// what a luminance ramp from black to white does best.
//
// **Degree** answers a different question — "which degree put a root here?" — and that is categorical
// over a small ordered set, so it takes a perceptually ordered, CVD-safe sequential ramp (the
// non-rainbow rule ADR-0023 set for Argument Principle). Viridis is the suite's existing answer and this
// is its fourth independent home; the duplication is recorded rather than fixed from inside one app,
// because unifying palette DATA is exactly what `@cas/gpu/colormap` declines to do.
import type { ColorStop } from "@cas/gpu/colormap";

/** Baez/Derbyshire's density ramp: black → dark red → orange → yellow → white. */
export const DENSITY_STOPS: readonly ColorStop[] = [
  { t: 0.0, color: [0, 0, 0] },
  { t: 0.18, color: [40, 4, 22] },
  { t: 0.38, color: [120, 14, 30] },
  { t: 0.58, color: [204, 62, 18] },
  { t: 0.76, color: [243, 146, 25] },
  { t: 0.9, color: [252, 219, 108] },
  { t: 1.0, color: [255, 255, 255] },
];

/** Viridis, for colouring by degree — perceptually ordered and readable under colour-vision deficiency. */
export const DEGREE_STOPS: readonly ColorStop[] = [
  { t: 0.0, color: [68, 1, 84] },
  { t: 0.15, color: [72, 36, 117] },
  { t: 0.3, color: [65, 68, 135] },
  { t: 0.45, color: [53, 95, 141] },
  { t: 0.6, color: [42, 120, 142] },
  { t: 0.75, color: [33, 145, 140] },
  { t: 0.85, color: [53, 183, 121] },
  { t: 0.93, color: [145, 213, 66] },
  { t: 1.0, color: [253, 231, 37] },
];

/** The two ramps a reader can choose between, with the name shown in the legend. */
export const RAMPS = {
  density: { label: "Density", stops: DENSITY_STOPS },
  degree: { label: "Degree", stops: DEGREE_STOPS },
} as const;
