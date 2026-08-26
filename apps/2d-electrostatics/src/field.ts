// The complex potential W(z) = φ + iψ of superposed elementary singularities, and its field
// E(z) = W'(z) = Eₓ − iE_y (the paper's complex-field convention). Everything here is closed-form
// and holomorphic off the singularities, so E — and the drawn velocity conj(E) — evaluate EXACTLY.
// That single property is what the whole render path (a GPU shader + this JS twin, pinned against
// each other) is built on; M0 de-risks it.
//
// Conventions follow the author's paper "Complex Analysis as Two-Dimensional Electrostatics and
// Hydrodynamics" AT THE APP EDGE (the shared @cas/* packages stay convention-neutral, ADR-0006):
//   • a monopole coefficient c = q + iγ superposes a CHARGE q (real residue → source/sink) and a
//     VORTEX γ (imaginary residue → circulation); its streamlines are logarithmic spirals of pitch
//     arctan(γ/q). W = c·log(z−a), so the field is E = W' = c/(z−a).
//   • a doublet μ (complex: |μ| strength, arg μ axis) has W = μ/(z−a), E = −μ/(z−a)².
//   • the hydrodynamic velocity vector is v = conj(E) (Cauchy–Riemann: W' = u − iv).
// A local tuple-complex helper keeps this module self-contained and exactly mirror-able in GLSL; it
// is deliberately tiny and app-local (ADR-0007 — no premature extraction).

export type Complex = readonly [re: number, im: number];

const add = (a: Complex, b: Complex): Complex => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Complex, b: Complex): Complex => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
export const conj = (a: Complex): Complex => [a[0], -a[1]];
/** a / b. */
const div = (a: Complex, b: Complex): Complex => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
/** Principal branch of log. Multivalued (branch cut on the negative real axis); callers that contour
 *  ψ = Im W absorb the 2π jumps by contouring ψ/(2π/N). */
const clog = (a: Complex): Complex => [0.5 * Math.log(a[0] * a[0] + a[1] * a[1]), Math.atan2(a[1], a[0])];

export interface Monopole {
  readonly kind: "monopole";
  readonly at: Complex;
  /** c = q + iγ: real part = charge / source strength, imaginary part = vortex circulation. */
  readonly c: Complex;
}
export interface Doublet {
  readonly kind: "doublet";
  readonly at: Complex;
  /** μ (complex): |μ| = strength, arg μ = axis angle. W = μ/(z−a). */
  readonly mu: Complex;
}
export type Singularity = Monopole | Doublet;

export interface Field {
  /** The uniform-background contribution to the field E (a constant). For a stream of speed U at
   *  angle α, this is U·e^{−iα} (so W = U e^{−iα} z, E = W' = U e^{−iα}). */
  readonly uniform: Complex;
  readonly singularities: readonly Singularity[];
}

/** The uniform-stream field constant for speed `U` at angle `alpha` (radians). */
export const uniformFromSpeedAngle = (U: number, alpha: number): Complex => [
  U * Math.cos(alpha),
  -U * Math.sin(alpha),
];

// Floor |z−a|² so evaluation AT a singularity yields a huge-but-finite value rather than NaN; the
// renderer floors true singular pixels separately, and the JS twin skips the exact point.
const EPS2 = 1e-24;

/** The complex potential W(z) = φ + iψ. Multivalued through the log terms. */
export function potential(field: Field, z: Complex): Complex {
  let w: Complex = mul(field.uniform, z); // uniform term W = (U e^{−iα}) z
  for (const s of field.singularities) {
    const d: Complex = [z[0] - s.at[0], z[1] - s.at[1]];
    w = s.kind === "monopole" ? add(w, mul(s.c, clog(d))) : add(w, div(s.mu, d));
  }
  return w;
}

/** The complex field E(z) = W'(z) — exact and single-valued (no branch cut). */
export function fieldE(field: Field, z: Complex): Complex {
  let e: Complex = field.uniform;
  for (const s of field.singularities) {
    const d: Complex = [z[0] - s.at[0], z[1] - s.at[1]];
    if (d[0] * d[0] + d[1] * d[1] < EPS2) continue; // at the singular point — skip (render floors it)
    if (s.kind === "monopole") {
      e = add(e, div(s.c, d)); // W' = c/(z−a)
    } else {
      const d2 = mul(d, d);
      e = add(e, div([-s.mu[0], -s.mu[1]], d2)); // W' = −μ/(z−a)²
    }
  }
  return e;
}

/** The hydrodynamic velocity vector, as a complex number: v = conj(E) = u + iv. */
export const velocity = (field: Field, z: Complex): Complex => conj(fieldE(field, z));

/** A default demonstration field: a uniform stream with a source, a vortex, and a doublet — enough
 *  to show radial, circular, and spiral streamline structure at once (M0 render check). */
export const DEMO_FIELD: Field = {
  uniform: uniformFromSpeedAngle(0.6, 0),
  singularities: [
    { kind: "monopole", at: [-1.2, 0], c: [1, 0] }, // a source (charge)
    { kind: "monopole", at: [1.2, 0], c: [0, 1] }, // a vortex (circulation)
    { kind: "doublet", at: [0, 1.1], mu: [0.4, 0] }, // a doublet
  ],
};
