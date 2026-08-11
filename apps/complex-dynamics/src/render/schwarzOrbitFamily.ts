// schwarzOrbitFamily.ts — seeds for the σ orbit-family cards (F4e sweep + F4c canonical), pure so they are
// golden-tested without a DOM. The traced orbits themselves come from schwarzOrbitAt (the existing tracer);
// this only produces the SEED points + their hue ramp. Ported (the seed branches) from QD's schwarz-forward.mjs
// (sampleSweepSeeds + canonicalSeeds), restricted to CD's two families.
import type { Complex } from "@cas/schwarz";
import type { SchwarzEngine } from "./schwarzView";
import type { SchwarzPhi } from "./schwarzPhiForm";

/** A named seed point (the label is shown in the card for canonical seeds). */
export interface SchwarzSeed {
  w: Complex;
  label: string;
}

/**
 * F4e — evenly-spaced seeds along a line or circle. `line`: n points from `from` to `to` (a single point
 * lands at the midpoint). `circle`: n points around `center` at `radius`. Pure.
 */
export function sweepSeeds(
  kind: "line" | "circle",
  params: { n: number; from?: Complex; to?: Complex; center?: Complex; radius?: number },
): Complex[] {
  const n = Math.max(0, params.n | 0);
  if (n === 0) return [];
  const out: Complex[] = [];
  if (kind === "line") {
    const a = params.from ?? [0, 0];
    const b = params.to ?? [0, 0];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  } else {
    const c = params.center ?? [0, 0];
    const r = params.radius ?? 1;
    for (let i = 0; i < n; i++) {
      const th = (2 * Math.PI * i) / n;
      out.push([c[0] + r * Math.cos(th), c[1] + r * Math.sin(th)]);
    }
  }
  return out;
}

/**
 * F4c — the map's per-family natural seed points, filtered to those in Ω:
 *   • bounded → the domain centre φ(0) = w₀;
 *   • unbounded-Laurent → the centroid of the σ-pole reflections φ(1/conj(z_j)) over the finite poles (none
 *     for a pole-free map like the deltoid — the returned list is then empty).
 * Pure over the engine + φ recipe + an in-Ω predicate.
 */
export function canonicalSchwarzSeeds(
  engine: SchwarzEngine,
  phi: SchwarzPhi,
  isInOmega: (w: Complex) => boolean,
): SchwarzSeed[] {
  const out: SchwarzSeed[] = [];
  const finite = (w: Complex): boolean => Number.isFinite(w[0]) && Number.isFinite(w[1]);
  const add = (w: Complex, label: string): void => {
    if (finite(w) && isInOmega(w)) out.push({ w, label });
  };
  if (phi.family === "bounded") {
    add(phi.w0 ?? [0, 0], "φ(0) = w₀");
  } else {
    // Centroid of the σ-pole reflections φ(1/conj(z_j)) = φ(z_j/|z_j|²) over the finite poles.
    let cx = 0;
    let cy = 0;
    let count = 0;
    for (const br of phi.branches) {
      const az2 = br.z[0] * br.z[0] + br.z[1] * br.z[1];
      if (az2 < 1e-24) continue;
      const w = engine.evalPhi([br.z[0] / az2, br.z[1] / az2]);
      if (!finite(w)) continue;
      cx += w[0];
      cy += w[1];
      count++;
    }
    if (count > 0) add([cx / count, cy / count], "pole centroid");
  }
  return out;
}

/** Family hue for member i of n — a rainbow ramp over 0…300° (stops short of wrapping red→red). */
export function familyHue(i: number, n: number): string {
  const t = n > 1 ? i / (n - 1) : 0;
  return `hsl(${Math.round(300 * t)}, 85%, 62%)`;
}
