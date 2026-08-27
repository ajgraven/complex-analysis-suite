// The closed-form Joukowski airfoil transplant (M2). Flow past an airfoil is flow past a circular
// cylinder pulled back through the Joukowski map z = J(ζ) = ζ + b²/ζ: the cylinder-plane potential is
// elementary (uniform + doublet + vortex), and the physical velocity is dW/dz = W'(ζ) / J'(ζ). The
// Kutta condition fixes the circulation so the velocity stays finite at the sharp trailing edge (where
// J'(b) = 0), which by Kutta–Joukowski gives the lift L = −ρUΓ (Γ is counterclockwise-positive, so a
// clockwise wing circulation Γ < 0 lifts up). Everything is closed-form, so it maps
// cleanly onto the same "evaluate the field exactly" render path as the free-singularity sandbox.
//
// Geometry: the cylinder passes through the critical point ζ = b (so its image has a sharp trailing
// edge). Its centre ζ₀ sets the shape — a negative real part gives thickness, a positive imaginary
// part gives camber — and its radius is fixed by R = |b − ζ₀|. Conventions match ../field.ts.

export type Complex = readonly [re: number, im: number];

const add = (a: Complex, b: Complex): Complex => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Complex, b: Complex): Complex => [a[0] - b[0], a[1] - b[1]];
const mul = (a: Complex, b: Complex): Complex => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a: Complex, b: Complex): Complex => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const scale = (a: Complex, s: number): Complex => [a[0] * s, a[1] * s];
const cabs = (a: Complex): number => Math.hypot(a[0], a[1]);
const clog = (a: Complex): Complex => [0.5 * Math.log(a[0] * a[0] + a[1] * a[1]), Math.atan2(a[1], a[0])];
const cexp = (a: Complex): Complex => {
  const r = Math.exp(a[0]);
  return [r * Math.cos(a[1]), r * Math.sin(a[1])];
};
/** Principal complex power a^p (real exponent). */
const cpow = (a: Complex, p: number): Complex => cexp(scale(clog(a), p));
/** Principal complex square root. */
function csqrt(a: Complex): Complex {
  const r = Math.hypot(a[0], a[1]);
  const re = Math.sqrt(Math.max((r + a[0]) * 0.5, 0));
  const im = Math.sqrt(Math.max((r - a[0]) * 0.5, 0));
  return [re, a[1] < 0 ? -im : im];
}

export interface AirfoilParams {
  /** Free-stream speed U. */
  readonly U: number;
  /** Angle of attack α (radians). */
  readonly alpha: number;
  /** Joukowski parameter b: critical points at ±b (images ±2b). */
  readonly b: number;
  /** Cylinder centre ζ₀ (real part → thickness, imaginary part → camber). */
  readonly center: Complex;
  /** Circulation Γ (use `kuttaCirculation` for the physical value). */
  readonly circulation: number;
  /** Kármán–Trefftz exponent n = 2 − τ/π (τ = trailing-edge angle). n = 2 (default) is Joukowski (a
   *  cusped trailing edge); n < 2 gives a finite trailing-edge wedge angle. */
  readonly n?: number;
}

/** Cylinder radius R = |b − ζ₀| (so the circle passes through the critical point ζ = b). */
export function cylinderRadius(p: AirfoilParams): number {
  return cabs([p.b - p.center[0], -p.center[1]]);
}

/** The camber angle φ₀ = arg(b − ζ₀) — the direction from the cylinder centre to the trailing-edge
 *  preimage. Zero for a symmetric (thickness-only) airfoil. */
export function camberAngle(p: AirfoilParams): number {
  return Math.atan2(-p.center[1], p.b - p.center[0]);
}

/** The Joukowski map z = J(ζ) = ζ + b²/ζ. */
export function joukowski(zeta: Complex, b: number): Complex {
  return add(zeta, div([b * b, 0], zeta));
}

/** dJ/dζ = 1 − b²/ζ². Vanishes at ζ = ±b (the critical points → sharp edges). */
export function joukowskiPrime(zeta: Complex, b: number): Complex {
  return sub([1, 0], div([b * b, 0], mul(zeta, zeta)));
}

/** The exterior branch of J⁻¹: ζ = ½(z + √(z²−4b²)), choosing the root with |ζ| ≥ b (outside the
 *  cylinder maps to outside the airfoil). */
export function joukowskiInv(z: Complex, b: number): Complex {
  const s = csqrt(sub(mul(z, z), [4 * b * b, 0]));
  const plus = scale(add(z, s), 0.5);
  return cabs(plus) >= b ? plus : scale(sub(z, s), 0.5);
}

// --- Kármán–Trefftz (finite trailing-edge angle; n = 2 recovers Joukowski) ---

/** The KT exponent n = 2 − τ/π for a trailing-edge wedge angle τ (radians). */
export function nFromTrailingEdgeAngle(tau: number): number {
  return 2 - tau / Math.PI;
}
/** The trailing-edge wedge angle τ = (2 − n)·π (radians). */
export function trailingEdgeAngle(n: number): number {
  return (2 - n) * Math.PI;
}

/** The Kármán–Trefftz map z = n·b·[(ζ+b)ⁿ + (ζ−b)ⁿ] / [(ζ+b)ⁿ − (ζ−b)ⁿ]. */
export function ktMap(zeta: Complex, b: number, n: number): Complex {
  const A = cpow(add(zeta, [b, 0]), n);
  const B = cpow(sub(zeta, [b, 0]), n);
  return scale(div(add(A, B), sub(A, B)), n * b);
}

/** dK/dζ = 4n²b²(ζ²−b²)ⁿ⁻¹ / [(ζ+b)ⁿ − (ζ−b)ⁿ]². Vanishes at ζ = ±b (finite-angle corner). The
 *  numerator power is computed factored as (ζ+b)ⁿ⁻¹·(ζ−b)ⁿ⁻¹ — the principal (ζ²−b²)ⁿ⁻¹ takes the wrong
 *  branch wherever arg(ζ+b)+arg(ζ−b) leaves (−π, π] (the whole left-half exterior), off by e^{−2πi(n−1)}. */
export function ktMapPrime(zeta: Complex, b: number, n: number): Complex {
  const A = cpow(add(zeta, [b, 0]), n);
  const B = cpow(sub(zeta, [b, 0]), n);
  const amb = sub(A, B);
  const z2mb2pow = mul(cpow(add(zeta, [b, 0]), n - 1), cpow(sub(zeta, [b, 0]), n - 1));
  return div(scale(z2mb2pow, 4 * n * n * b * b), mul(amb, amb));
}

/** The exterior branch of the KT inverse: with m = ((z+nb)/(z−nb))^{1/n}, ζ = b(m+1)/(m−1). */
export function ktInverse(z: Complex, b: number, n: number): Complex {
  const m = cpow(div(add(z, [n * b, 0]), sub(z, [n * b, 0])), 1 / n);
  return scale(div(add(m, [1, 0]), sub(m, [1, 0])), b);
}

/** The cylinder-plane complex potential W(ζ) = U(e^{−iα}η + R²e^{iα}/η) − (iΓ/2π)log η, η = ζ − ζ₀. */
export function cylinderPotential(p: AirfoilParams, zeta: Complex): Complex {
  const R = cylinderRadius(p);
  const eta = sub(zeta, p.center);
  const ea: Complex = [Math.cos(p.alpha), -Math.sin(p.alpha)]; // e^{−iα}
  const eb: Complex = [Math.cos(p.alpha), Math.sin(p.alpha)]; // e^{+iα}
  const uniformDoublet = scale(add(mul(ea, eta), scale(div(eb, eta), R * R)), p.U);
  const vortex = mul([0, -p.circulation / (2 * Math.PI)], clog(eta)); // −(iΓ/2π) log η
  return add(uniformDoublet, vortex);
}

/** dW/dζ = U(e^{−iα} − R²e^{iα}/η²) − (iΓ/2π)/η. */
export function cylinderVelocity(p: AirfoilParams, zeta: Complex): Complex {
  const R = cylinderRadius(p);
  const eta = sub(zeta, p.center);
  const ea: Complex = [Math.cos(p.alpha), -Math.sin(p.alpha)];
  const eb: Complex = [Math.cos(p.alpha), Math.sin(p.alpha)];
  const uniformDoublet = scale(sub(ea, scale(div(eb, mul(eta, eta)), R * R)), p.U);
  const vortex = div([0, -p.circulation / (2 * Math.PI)], eta);
  return add(uniformDoublet, vortex);
}

/** The physical (airfoil-plane) complex velocity dW/dz = W'(ζ) / K'(ζ), ζ = K⁻¹(z). Uses the Joukowski
 *  path when n = 2 (the tested closed form) and Kármán–Trefftz otherwise. */
export function physicalVelocity(p: AirfoilParams, z: Complex): Complex {
  const n = p.n ?? 2;
  if (n === 2) {
    const zeta = joukowskiInv(z, p.b);
    return div(cylinderVelocity(p, zeta), joukowskiPrime(zeta, p.b));
  }
  const zeta = ktInverse(z, p.b, n);
  return div(cylinderVelocity(p, zeta), ktMapPrime(zeta, p.b, n));
}

/** The Kutta circulation: Γ = 4πUR·sin(φ₀ − α), which places the rear stagnation point at ζ = b so
 *  W'(b) = 0 cancels J'(b) = 0 and the trailing-edge velocity stays finite. Equivalent to the standard
 *  Γ = −4πUR·sin(α + β) with the camber angle β = −φ₀. */
export function kuttaCirculation(p: AirfoilParams): number {
  const R = cylinderRadius(p);
  return 4 * Math.PI * p.U * R * Math.sin(camberAngle(p) - p.alpha);
}

/** Lift per unit span by Kutta–Joukowski, L = −ρUΓ (ρ = 1 by default). The minus sign is the codebase's
 *  vortex convention: Γ (= p.circulation) is counterclockwise-positive, so the clockwise circulation
 *  (Γ < 0) a wing at positive angle of attack carries produces positive (upward) lift. */
export function lift(p: AirfoilParams, rho = 1): number {
  return -rho * p.U * p.circulation;
}

/** Convenience: the params with the Kutta circulation imposed. */
export function withKutta(p: AirfoilParams): AirfoilParams {
  return { ...p, circulation: kuttaCirculation(p) };
}
