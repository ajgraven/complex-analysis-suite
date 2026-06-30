/**
 * riemannSphere.ts — render a Julia set onto the Riemann sphere (orthographic stereographic view).
 *
 * The complex plane plus ∞ is the Riemann sphere; viewing a Julia set on it shows the whole
 * dynamical plane at once, including the behaviour at infinity. This is a self-contained CPU
 * snapshot (escape-time via the compiled closures), independent of the live WebGL render path — so
 * it doesn't entangle with df64 / perturbation / overlays / pan-zoom. A live interactive sphere
 * mode is a deferred enhancement.
 *
 * Projection: an orthographic view of the front hemisphere. The screen centre is the south pole
 * (z = 0), the rim is the equator (|z| = 1), and the hidden back hemisphere is the |z| > 1 side —
 * so the filled-set side of a z²+c Julia set faces the viewer. z²+c / polynomials with a
 * superattracting ∞ (where escape-time is the right colouring). Pure module. See FEATURE_RESEARCH §4.6.
 */
import type { Complex } from "../complex";
import type { Node } from "../expr/ast";
import { getComplexFn, getEscapeFn } from "../expr/evaluate";

/**
 * Screen pixel (px, py) of a size×size sphere view → the complex coordinate z it shows, or null
 * if the pixel lies outside the sphere's circular silhouette. Stereographic from the north pole:
 * centre → 0 (south pole), rim → |z| = 1 (equator).
 */
export function spherePixelToPlane(px: number, py: number, size: number): Complex | null {
  const u = ((px + 0.5) / size) * 2 - 1;
  const v = -(((py + 0.5) / size) * 2 - 1); // flip so +v is up
  const r2 = u * u + v * v;
  if (r2 > 1) return null;
  const d = 1 + Math.sqrt(1 - r2); // = 1 − Z for the front-hemisphere point (Z = −√(1−r²))
  return [u / d, v / d];
}

/** Smooth escape value t ∈ [0,1] → RGB (dark-blue fast-escape → white near the boundary). */
function shade(t: number): [number, number, number] {
  const c = Math.max(0, Math.min(1, t));
  return [Math.round(255 * c ** 1.6), Math.round(255 * c ** 0.9), Math.round(255 * c ** 0.5)];
}

const BG = 16; // background (off-sphere) grey

/**
 * Render the dynamical-plane Julia set of f(·, c) onto the sphere, returning a size×size RGBA
 * buffer (wrap in `new ImageData(buf, size, size)` to blit). In-set points are black, escaping
 * points are smooth-shaded, off-sphere pixels are the background grey.
 */
export function renderRiemannSphere(
  fAst: Node,
  escapeAst: Node,
  c: Complex,
  size: number,
  maxIter = 256,
  a: Complex = [0, 0],
): Uint8ClampedArray {
  const f = getComplexFn(fAst, a);
  const esc = getEscapeFn(escapeAst, fAst, a);
  const out = new Uint8ClampedArray(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const i = (py * size + px) * 4;
      out[i + 3] = 255;
      const z0 = spherePixelToPlane(px, py, size);
      if (!z0) {
        out[i] = out[i + 1] = out[i + 2] = BG;
        continue;
      }
      let z: Complex = z0;
      let k = 0;
      for (; k < maxIter; k++) {
        if (esc(z, c)) break;
        z = f(z, c);
        if (!Number.isFinite(z[0]) || !Number.isFinite(z[1])) break;
      }
      if (k >= maxIter) continue; // in-set → black (RGB already 0)
      const az = Math.hypot(z[0], z[1]);
      const t = (az > 1 ? k + 1 - Math.log(Math.log(az)) / Math.LN2 : k) / maxIter;
      const [r, g, b] = shade(t);
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
    }
  }
  return out;
}
