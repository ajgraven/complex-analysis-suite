import { describe, expect, it } from "vitest";
import { tupleAlgebra } from "@cas/core";
import { DELTOID, deltoidBoundary, pointInPolygon, type Complex } from "../src/deltoid.js";
import { familyMember } from "../src/family.js";

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

// ── Parameter family φ_a(z) = z + (a/2)/z² (paramGpu.ts). The GPU classifier's sigma_a inverts φ_a with
// the SAME cold-seed Newton, plus a |z|>1 exterior-branch guard (CORR-2): φ_a is univalent on {|z|>1} for
// the whole window (area theorem, |a|≤√2), so a preimage inside the unit disk is the WRONG branch and
// must count as "no exterior preimage" (bounded, not an escape) — exactly what the CPU engine signals by
// returning null. Below we mirror the shader's inline φ_a / φ_a' / F_a + inverse in TS and assert the
// engine and shader agree, INCLUDING on which points have no exterior preimage.
const halfA = (a: Complex): Complex => [a[0] / 2, a[1] / 2];
const phiA = (z: Complex, a: Complex): Complex => A.add(z, A.div(halfA(a), A.mul(z, z))); // z + (a/2)/z²
const dphiA = (z: Complex, a: Complex): Complex => A.sub([1, 0], A.div(a, A.mul(A.mul(z, z), z))); // 1 − a/z³
const fSchA = (z: Complex, a: Complex): Complex =>
  A.add(A.div([1, 0], z), A.mul(conj(halfA(a)), A.mul(z, z))); // 1/z + conj(a/2) z²

/** Mirror of paramGpu.ts invertPhi + sigma_a, WITH the CORR-2 exterior-branch guard. Returns null when
 *  the cold-seed Newton fails to converge or lands inside the unit disk (the wrong branch → not in Ω) —
 *  matching the CPU engine's null. The z≈0 guard mirrors the shader's NaN-from-cdiv-by-0 → ok=false
 *  (the TS algebra throws on an exact-zero divide where GLSL yields NaN). */
function shaderSigmaA(w: Complex, a: Complex): Complex | null {
  const r = A.abs(w);
  let z: Complex = r > 1.3 ? w : [(w[0] * 1.3) / Math.max(r, 1e-6), (w[1] * 1.3) / Math.max(r, 1e-6)];
  let ok = true;
  for (let it = 0; it < 24; it++) {
    if (A.abs(z) < 1e-12) { ok = false; break; }
    const fz = A.sub(phiA(z, a), w);
    if (A.abs(fz) < 1e-6) { ok = true; break; }
    const dz = dphiA(z, a);
    if (A.abs(dz) < 1e-30) { ok = false; break; }
    z = A.sub(z, A.div(fz, dz));
    if (!A.isFinite(z) || A.abs(z) > 1e8) { ok = false; break; }
    ok = A.abs(A.sub(phiA(z, a), w)) < 1e-4;
  }
  if (!ok) return null;
  if (A.abs(z) < 1 - 1e-4) return null; // interior branch → no exterior preimage (CORR-2)
  return conj(fSchA(z, a));
}

// The deltoid plus three off-axis members inside the univalence window |a| ≤ √2.
const A_VALUES: Complex[] = [
  [1, 0],
  [0.5, 0.3],
  [0, 0.8],
  [-0.7, 0.4],
];

describe("GPU parameter-family shader σ_a ↔ CPU engine agreement (CORR-2 exterior-branch guard)", () => {
  it("matches σ_a on exterior probes and agrees it's the wrong branch (both null) on interior probes", () => {
    for (const a of A_VALUES) {
      const cpu = familyMember(a).schwarz;
      for (const w of [[3, 0], [0, 3], [-2.5, 1], [2.2, -1.4]] as Complex[]) {
        const ref = cpu.sigma(w);
        const got = shaderSigmaA(w, a);
        expect(ref).not.toBeNull();
        expect(got).not.toBeNull();
        if (ref && got) expect(Math.hypot(got[0] - ref[0], got[1] - ref[1])).toBeLessThan(1e-4);
      }
      for (const w of [[0, 0.05], [0.1, 0], [0.05, -0.05]] as Complex[]) {
        expect(cpu.sigma(w)).toBeNull(); // in the hole — no exterior preimage
        expect(shaderSigmaA(w, a)).toBeNull(); // the guard rejects the interior root, matching the CPU
      }
    }
  });

  it("agrees with the CPU engine across a grid, with ZERO branch (null) disagreements", () => {
    for (const a of A_VALUES) {
      const cpu = familyMember(a).schwarz;
      const N = 32;
      const halfSpan = 3.0;
      let both = 0;
      let bothNull = 0;
      let worst = 0;
      let branchDisagree = 0;
      for (let py = 0; py < N; py++) {
        const wy = (0.5 - py / N) * 2 * halfSpan;
        for (let px = 0; px < N; px++) {
          const wx = (px / N - 0.5) * 2 * halfSpan;
          const w: Complex = [wx, wy];
          if (Math.hypot(wx, wy) < 1e-9) continue; // skip the singular origin (φ_a pole)
          const ref = cpu.sigma(w);
          const got = shaderSigmaA(w, a);
          if ((ref === null) !== (got === null)) {
            branchDisagree++;
            continue;
          }
          if (ref && got) {
            both++;
            worst = Math.max(worst, Math.hypot(got[0] - ref[0], got[1] - ref[1]));
          } else {
            bothNull++;
          }
        }
      }
      expect(both).toBeGreaterThan(800); // a large exterior sample matched σ_a
      expect(bothNull).toBeGreaterThan(20); // interior (no-preimage) points ARE exercised
      expect(worst).toBeLessThan(1e-4); // σ_a formula reproduced everywhere in Ω
      expect(branchDisagree).toBe(0); // CORR-2: no pixel where one says Ω and the other says hole
    }
  });
});
