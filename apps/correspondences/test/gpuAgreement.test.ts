import { describe, expect, it } from "vitest";
import { tupleAlgebra } from "@cas/core";
import { DELTOID, deltoidBoundary, pointInPolygon, type Complex } from "../src/deltoid.js";

// Guards the GPU deltoid shader's σ *algorithm* against the CPU engine. src/gpu.ts inverts φ with a
// COLD-seeded Newton (seed from w, never a warm/previous z) — the fix for the branch-drift "wings". The
// GLSL float32 numerics themselves are browser-validated (as @cas/gpu's dual-backend harness is: real
// GLSL needs a WebGL2 context). Here we mirror the shader's inverse strategy in TS — reusing the shared
// φ / φ' / F so only the cold-seed Newton is under test — and assert it (a) lands on the exterior branch
// and (b) reproduces DELTOID.sigma. If someone changes gpu.ts's inverse, keep this mirror in sync.
const A = tupleAlgebra;
const conj = (z: Complex): Complex => [z[0], -z[1]];

/** Mirror of gpu.ts `invertPhi`: cold-seed Newton for the exterior branch of φ⁻¹ (24 iters, 1e-6 tol). */
function coldInvert(w: Complex): Complex {
  const r = A.abs(w);
  let z: Complex = r > 1.3 ? w : [(w[0] * 1.3) / Math.max(r, 1e-6), (w[1] * 1.3) / Math.max(r, 1e-6)];
  for (let it = 0; it < 24; it++) {
    const fz = A.sub(DELTOID.evalPhi(z), w);
    if (A.abs(fz) < 1e-6) break;
    const dz = DELTOID.evalPhiDeriv(z);
    if (A.abs(dz) < 1e-30) break;
    z = A.sub(z, A.div(fz, dz));
    if (!A.isFinite(z) || A.abs(z) > 1e8) break;
  }
  return z;
}
const shaderSigma = (w: Complex): Complex => conj(DELTOID.evalF(coldInvert(w)));

// A spread of points across Ω (outside the deltoid), including the mid-radius region where the warm-seed
// Newton used to drift onto an interior branch.
const OMEGA_PROBES: Complex[] = [
  [2, 0],
  [0, 2],
  [1.2, 1.2],
  [-1.4, 0.6],
  [0.9, -1.5],
  [-1.7, -0.9],
  [2.0, 0.3],
  [-2.2, 0.1],
  [0.2, 1.9],
];

describe("GPU deltoid shader σ algorithm ↔ CPU engine agreement", () => {
  it("all probes are in Ω, cold-seed Newton lands on the exterior branch |z|>1, and σ matches the CPU engine", () => {
    const poly = deltoidBoundary(512);
    for (const w of OMEGA_PROBES) {
      expect(pointInPolygon(w, poly)).toBe(false); // w ∈ Ω
      const z = coldInvert(w);
      expect(Math.hypot(z[0], z[1])).toBeGreaterThan(1); // exterior branch — no drift
      const ref = DELTOID.sigma(w);
      expect(ref).not.toBeNull();
      if (ref) {
        const got = shaderSigma(w);
        expect(got[0]).toBeCloseTo(ref[0], 5);
        expect(got[1]).toBeCloseTo(ref[1], 5);
      }
    }
  });

  it("agrees with the CPU engine across a dense grid of Ω (no drift anywhere)", () => {
    const poly = deltoidBoundary(200);
    const N = 48;
    const halfSpan = 2.1;
    let checked = 0;
    let worst = 0;
    for (let py = 0; py < N; py++) {
      const wy = (0.5 - py / N) * 2 * halfSpan;
      for (let px = 0; px < N; px++) {
        const wx = (px / N - 0.5) * 2 * halfSpan;
        const w: Complex = [wx, wy];
        if (pointInPolygon(w, poly)) continue; // skip K
        const ref = DELTOID.sigma(w);
        if (!ref) continue;
        const got = shaderSigma(w);
        worst = Math.max(worst, Math.hypot(got[0] - ref[0], got[1] - ref[1]));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
    expect(worst).toBeLessThan(1e-4); // shader strategy reproduces the CPU σ everywhere in Ω
  });
});
