/**
 * Built-in fractal presets for the parameter space and the dynamical plane.
 *
 * Each named preset appears in both dictionaries; the dropdown in the UI is
 * driven by these keys. Values are CindyScript expressions (`f`, `escape`) and
 * complex-number literals (`c`, `z0`). See the README for the meaning of each
 * field and the supported CindyScript functions.
 */

import type { Vec2 } from "./arrays";

export interface Preset {
  /** Iteration function `f(z, c)` as a CindyScript expression. */
  f: string;
  /** Parameter value `c` as a complex literal (`a+b*i`). */
  c: string;
  /** Maximum iterations per pixel (kept as a string for direct CindyScript interpolation). */
  n: string;
  /** Number of orbit iterates to draw. */
  nplot: string;
  /** Escape predicate `escape(z, c)` as a CindyScript expression. */
  escape: string;
  /** Default zoom level. */
  zoom: number;
  /** Plot centre `[x, y]`. */
  center: Vec2;
  /**
   * Orbit start point (dynamical-plane presets only). A `string` literal in the
   * static presets; a `[re, im]` tuple when collected live from a plot.
   */
  z0?: string | Vec2;
  /**
   * Critical point of `f` (a root of ∂f/∂z = 0), used as the start of the
   * critical-orbit overlay. Defaults to 0, which is correct for the zⁿ+c /
   * Multibrot family; set it where the critical point is known and non-zero.
   */
  criticalPoint?: Vec2;
  /**
   * Coloring mode to switch to when this preset is loaded (a key of `MODES`, e.g. "period").
   * Used by rational families whose ∞ is not superattracting: escape-time colouring is meaningless
   * there (orbits converge to finite cycles), so they open in "period" instead of the default smooth.
   */
  mode?: string;
}

export type PresetName =
  | "mandelbrot"
  | "cubic"
  | "tricorn"
  | "multicorn"
  | "burning ship"
  | "butterfly"
  | "celtic"
  | "magnet"
  | "lambda"
  | "exponential map"
  | "teardrop Schwarz"
  | "exp Schwarz"
  | "biomorph"
  | "rational symmetric"
  | "rational V2"
  | "herman ring";

export const paramPresets: Record<PresetName, Preset> = {
  mandelbrot: {
    f: "z^2+c",
    c: "-.7-.4*i",
    n: "100",
    nplot: "7",
    escape: "abs(z)>2",
    zoom: 0.75,
    center: [-0.75, 0],
  },
  tricorn: {
    f: "conjugate(z^2)+c",
    c: ".1091+i*.502",
    n: "50",
    nplot: "6",
    escape: "abs(z)>2",
    zoom: 0.55,
    center: [-0.25, 0],
  },
  multicorn: {
    f: "conjugate(z^3)+c",
    c: "0+i*0.6",
    n: "60",
    nplot: "6",
    escape: "abs(z)>2",
    zoom: 0.6,
    center: [0, 0],
  },
  "burning ship": {
    f: "(abs(re(z))+i*abs(im(z)))^2-c",
    c: "1.6185+i*0.0471",
    n: "100",
    nplot: "6",
    escape: "abs(z)>2",
    center: [1.7, 0.05],
    zoom: 10,
  },
  butterfly: {
    f: "conjugate(z^2)+c*re(1/z)",
    c: ".252+i*0",
    n: "150",
    nplot: "6",
    escape: "abs(z)>4",
    center: [0, 0],
    zoom: 0.7,
  },
  "exponential map": {
    f: "c*e^(z-1)",
    c: "1+0*i",
    n: "25",
    nplot: "6",
    escape: "re(log(c)+z)>3000",
    center: [3.5, 0],
    zoom: 0.08,
  },
  "teardrop Schwarz": {
    f: "u=((27*c^2-3*c^(3/2)*(81*c-12*z)^(1/2)-18*c*z+2*z^2)/(2*z^2))^(1/3); psi=z*(u+1)/3+(z/3-2*c)/u-c;(1+c*psi)^3/psi",
    c: ".5+0*i",
    n: "100",
    nplot: "6",
    escape: "abs(z*c)>500",
    center: [0, 0],
    zoom: 0.9,
  },
  "exp Schwarz": {
    f: "c0 = c^2/z;c1 = lambertw(-c0);conjugate(c0/exp(c1+c^2/c1));",
    c: "1+0*i",
    n: "50",
    nplot: "6",
    escape: "abs(lambertw(-c^2/f(z,c)))>abs(c)",
    center: [1, 0],
    zoom: 0.5,
  },
  cubic: {
    f: "z^3+c",
    c: "0.3+0.3*i",
    n: "100",
    nplot: "7",
    escape: "abs(z)>2",
    zoom: 0.7,
    center: [0, 0],
  },
  celtic: {
    f: "abs(re(z^2))+i*im(z^2)+c",
    c: "-0.6+0.4*i",
    n: "100",
    nplot: "6",
    escape: "abs(z)>2",
    zoom: 0.6,
    center: [-0.4, 0],
  },
  magnet: {
    f: "((z^2+c-1)/(2*z+c-2))^2",
    c: "1.5+0.5*i",
    n: "100",
    nplot: "6",
    escape: "if(abs(z)>3,true,abs(z-1)<0.001)",
    zoom: 0.45,
    center: [1.5, 0],
  },
  lambda: {
    f: "c*z*(1-z)",
    c: "2+0.5*i",
    n: "100",
    nplot: "6",
    escape: "abs(z)>10",
    zoom: 0.4,
    center: [1, 0],
    criticalPoint: [0.5, 0],
  },
  biomorph: {
    f: "z^3+c",
    c: "0.5+0*i",
    n: "30",
    nplot: "6",
    escape: "if(abs(re(z))>10,true,abs(im(z))>10)",
    zoom: 0.6,
    center: [0, 0],
  },
  // Rational families: ∞ is NOT superattracting (orbits converge to finite cycles), so the picture
  // comes from the convergence/period colouring rather than escape-time. The free finite critical
  // point of each of these even-symmetric maps is 0 (the other is ∞), so the parameter plane iterates
  // the critical orbit of 0, exactly like z²+c. The escape test is only a divergence/NaN guard.
  "rational symmetric": {
    f: "(z^2+c)/(1+c*z^2)",
    c: "0.5+0.3*i",
    n: "120",
    nplot: "6",
    escape: "abs(z)>10000",
    mode: "period",
    zoom: 0.5,
    center: [0, 0],
  },
  "rational V2": {
    f: "(z^2+c)/(1-z^2)",
    c: "0.1+0.15*i",
    n: "120",
    nplot: "6",
    escape: "abs(z)>10000",
    mode: "period",
    zoom: 0.5,
    center: [0, 0],
  },
  // Herman ring: the Blaschke-product family e^{2πi·c}·z²(z−4)/(1−4z), parametrised by the rotation
  // τ = c. It keeps the unit circle invariant; at c = 0.6151732 the rotation number on it is the
  // golden mean and the invariant circle sits inside a Herman ring (an annular rotation domain
  // between the basins of the superattracting fixed points 0 and ∞). The free critical point ≈0.547
  // drives the parameter (τ) plane.
  "herman ring": {
    f: "e^(2*pi*i*c)*z^2*(z-4)/(1-4*z)",
    c: "0.6151732+0*i",
    n: "120",
    nplot: "6",
    escape: "abs(z)>1000",
    mode: "period",
    zoom: 1.1,
    center: [0.5, 0],
    criticalPoint: [0.5470656, 0],
  },
};

export const dynPresets: Record<PresetName, Preset> = {
  mandelbrot: {
    f: "z^2+c",
    c: ".2541-.0333*i",
    z0: ".2541-.0333*i",
    n: "100",
    nplot: "7",
    escape: "abs(z)>2",
    zoom: 0.65,
    center: [0, 0],
  },
  tricorn: {
    f: "conjugate(z^2)+c",
    c: ".2541-0.2302*i",
    z0: ".2541-0.2302*i",
    n: "50",
    nplot: "6",
    escape: "abs(z)>2",
    zoom: 0.65,
    center: [0, 0],
  },
  multicorn: {
    f: "conjugate(z^3)+c",
    c: "0.3+i*0.3",
    z0: "0.3+i*0.3",
    n: "60",
    nplot: "6",
    escape: "abs(z)>2",
    zoom: 0.7,
    center: [0, 0],
  },
  "burning ship": {
    f: "(abs(re(z))+i*abs(im(z)))^2-c",
    c: "-.8217+i*0.1233",
    z0: "-.8217+i*0.1233",
    n: "100",
    nplot: "6",
    escape: "abs(z)>2",
    center: [0, 0],
    zoom: 0.5,
  },
  butterfly: {
    f: "conjugate(z^2)+c*re(1/z)",
    c: "-.4547-i*.7733",
    z0: "-.4547-i*.7733",
    n: "150",
    nplot: "6",
    escape: "abs(z)>4",
    center: [0, 0],
    zoom: 0.9,
  },
  "exponential map": {
    f: "c*e^(z-1)",
    c: "1.418-i*.119",
    z0: "1.418-i*.119",
    n: "25",
    nplot: "6",
    escape: "re(log(c)+z)>3000",
    zoom: 0.13,
    center: [8, 0],
  },
  "teardrop Schwarz": {
    f: "u=((27*c^2-3*c^(3/2)*(81*c-12*z)^(1/2)-18*c*z+2*z^2)/(2*z^2))^(1/3); psi=z*(u+1)/3+(z/3-2*c)/u-c;(1+c*psi)^3/psi",
    c: ".5",
    z0: "4.3463+i*1.35",
    n: "50",
    nplot: "6",
    escape:
      "u=((27*c^2-3*c^(3/2)*(81*c-12*z)^(1/2)-18*c*z+2*z^2)/(2*z^2))^(1/3); abs(z*(u+1)/3+(z/3-2*c)/u-c)<1",
    center: [-1, 0],
    zoom: 0.09,
  },
  "exp Schwarz": {
    f: "c0 = c^2/z;c1 = lambertw(-c0);conjugate(c0/exp(c1+c^2/c1));",
    c: "2.92-.48*i",
    z0: "2.92-.48*i",
    n: "50",
    nplot: "6",
    escape: "if(re(z)<-5,true,if(abs(lambertw(-c^2/f(z,c)))>abs(c),true,false));",
    center: [6, 0],
    zoom: 0.15,
  },
  cubic: {
    f: "z^3+c",
    c: "0.3+0.3*i",
    z0: "0",
    n: "100",
    nplot: "7",
    escape: "abs(z)>2",
    zoom: 0.7,
    center: [0, 0],
  },
  celtic: {
    f: "abs(re(z^2))+i*im(z^2)+c",
    c: "-0.6+0.4*i",
    z0: "0",
    n: "100",
    nplot: "6",
    escape: "abs(z)>2",
    zoom: 0.6,
    center: [0, 0],
  },
  magnet: {
    f: "((z^2+c-1)/(2*z+c-2))^2",
    c: "1.5+0.5*i",
    z0: "0",
    n: "100",
    nplot: "6",
    escape: "if(abs(z)>3,true,abs(z-1)<0.001)",
    zoom: 0.5,
    center: [1, 0],
  },
  lambda: {
    f: "c*z*(1-z)",
    c: "2.5+0.3*i",
    z0: "0.5",
    n: "100",
    nplot: "6",
    escape: "abs(z)>10",
    zoom: 0.5,
    center: [0.5, 0],
    criticalPoint: [0.5, 0],
  },
  biomorph: {
    f: "z^3+c",
    c: "0.5+0*i",
    z0: "0",
    n: "30",
    nplot: "6",
    escape: "if(abs(re(z))>10,true,abs(im(z))>10)",
    zoom: 0.5,
    center: [0, 0],
  },
  "rational symmetric": {
    f: "(z^2+c)/(1+c*z^2)",
    c: "0.31+0.04*i",
    z0: "0",
    n: "120",
    nplot: "6",
    escape: "abs(z)>10000",
    mode: "period",
    zoom: 0.5,
    center: [0, 0],
  },
  "rational V2": {
    f: "(z^2+c)/(1-z^2)",
    c: "0.05+0.1*i",
    z0: "0",
    n: "120",
    nplot: "6",
    escape: "abs(z)>10000",
    mode: "period",
    zoom: 0.5,
    center: [0, 0],
  },
  "herman ring": {
    f: "e^(2*pi*i*c)*z^2*(z-4)/(1-4*z)",
    c: "0.6151732+0*i",
    z0: "1",
    n: "120",
    nplot: "6",
    escape: "abs(z)>1000",
    mode: "period",
    zoom: 0.32,
    center: [0, 0],
    criticalPoint: [0.5470656, 0],
  },
};

/** The preset names, in dropdown order. */
export const presetNames: PresetName[] = Object.keys(paramPresets) as PresetName[];
