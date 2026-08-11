import { describe, expect, it, beforeAll } from "vitest";
import {
  makeUnboundedLaurentSchwarz,
  makeBoundedSchwarz,
  type Complex,
  type UnboundedLaurentSchwarz,
  type BoundedSchwarz,
} from "../src/index.js";
import { runSigmaGLSL, runSigmaDerivGLSL, type SigmaPhi } from "../src/gpu/index.js";

/** Both engine families expose the same evaluator surface the parity loops use. */
type Engine = UnboundedLaurentSchwarz | BoundedSchwarz;

// BROWSER-MODE numeric parity harness for the GPU σ evaluator (S4b). Runs ONLY under `pnpm test:browser`
// (vitest.browser.config.ts) — a real headless-Chromium WebGL2 context — never in the default node gate.
//
// This is the piece the node structural guard structurally CANNOT be: it executes the ACTUAL float32
// GLSL the render path will emit (via runSigmaGLSL) and compares σ(w), point by point, to the float64
// CPU engine (makeUnboundedLaurentSchwarz) this package already golden-tests. If the lifted GLSL ever
// drifts from the CPU math — a dropped conj, a mis-packed uniform, a wrong branch term — THIS fails.
//
// Samples come from the EXACT round-trip identity the CPU tests use: pick z₀ in the exterior 𝔻*, set
// w = φ(z₀); then σ(w) = conj(F(z₀)) is known in closed form, and (for these UNIVALENT domains) both the
// CPU and GPU inverses recover the same exterior preimage z₀. So the test pins GPU σ against BOTH the CPU
// engine and the closed-form truth.

let gl: WebGL2RenderingContext;

beforeAll(() => {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("webgl2");
  if (!ctx) throw new Error("WebGL2 unavailable in this browser — cannot run the σ GLSL harness");
  gl = ctx;
});

const conj = (z: Complex): Complex => [z[0], -z[1]];
const dist = (a: Complex, b: Complex): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Exterior probes (|z₀| ≤ 2.3, unbounded family) and interior probes (|z₀| < 1, bounded family). Each
// domain's samples generate w = φ(z₀), where σ(w) = conj(F(z₀)) is known in closed form and the CPU/GPU
// inverses recover z₀. Each case carries its own CPU engine builder so bounded/unbounded compare against
// the RIGHT float64 engine; `phi` (with `family`) feeds the GPU uniforms.
const EXTERIOR: Complex[] = [[2, 0], [0, 2], [1.6, -1.2], [-2.2, 0.7]];
const INTERIOR: Complex[] = [[0.5, 0], [0, 0.4], [0.3, -0.2], [-0.4, 0.1]];

interface Case {
  name: string;
  phi: SigmaPhi;
  engine: () => Engine;
  samples: Complex[];
}

const CORPUS: Case[] = [
  // Unbounded-Laurent family: a pole-free deltoid + three pole-bearing QDs + a complex-c map (S5-C1).
  { name: "deltoid (pole-free)", phi: { c: 1, F: [[0, 0], [0, 0], [0.5, 0]] },
    engine: () => makeUnboundedLaurentSchwarz(1, [[0, 0], [0, 0], [0.5, 0]]), samples: EXTERIOR },
  { name: "single exterior pole", phi: { c: 1, F: [], branches: [{ z: [0.2, 0], A: [[0.3, 0]] }] },
    engine: () => makeUnboundedLaurentSchwarz(1, [], [{ z: [0.2, 0], A: [[0.3, 0]] }]), samples: EXTERIOR },
  { name: "complex order-2 pole",
    phi: { c: 1, F: [[0, 0], [0, 0.05]], branches: [{ z: [0.25, 0.1], A: [[0.12, 0], [0.05, -0.03]] }] },
    engine: () => makeUnboundedLaurentSchwarz(1, [[0, 0], [0, 0.05]], [{ z: [0.25, 0.1], A: [[0.12, 0], [0.05, -0.03]] }]),
    samples: EXTERIOR },
  { name: "two branches",
    phi: { c: 1, F: [], branches: [{ z: [0.2, 0], A: [[0.15, 0]] }, { z: [-0.1, 0.2], A: [[0.05, 0.1]] }] },
    engine: () => makeUnboundedLaurentSchwarz(1, [], [{ z: [0.2, 0], A: [[0.15, 0]] }, { z: [-0.1, 0.2], A: [[0.05, 0.1]] }]),
    samples: EXTERIOR },
  { name: "complex leading c", phi: { c: [1, 0.5], F: [[0, 0], [0, 0], [0.4, 0]] },
    engine: () => makeUnboundedLaurentSchwarz([1, 0.5], [[0, 0], [0, 0], [0.4, 0]]), samples: EXTERIOR },
  // Bounded family (S5-C2): the exact-inversion disk, a single-lobe domain, and a two-branch domain. The
  // GPU u_family=1 path (φ=w₀+branches, conj(w₀) in F, interior-branch Newton) must match makeBoundedSchwarz.
  { name: "bounded: unit disk", phi: { family: "bounded", w0: [0, 0], branches: [{ z: [0, 0], A: [[1, 0]] }] },
    engine: () => makeBoundedSchwarz([0, 0], [{ z: [0, 0], A: [[1, 0]] }]), samples: INTERIOR },
  { name: "bounded: single lobe", phi: { family: "bounded", w0: [0, 0], branches: [{ z: [0.3, 0], A: [[0.5, 0]] }] },
    engine: () => makeBoundedSchwarz([0, 0], [{ z: [0.3, 0], A: [[0.5, 0]] }]), samples: INTERIOR },
  { name: "bounded: two branches + centre",
    phi: { family: "bounded", w0: [0.1, -0.05], branches: [{ z: [0.2, 0], A: [[0.3, 0]] }, { z: [-0.15, 0.2], A: [[0.2, 0.05]] }] },
    engine: () => makeBoundedSchwarz([0.1, -0.05], [{ z: [0.2, 0], A: [[0.3, 0]] }, { z: [-0.15, 0.2], A: [[0.2, 0.05]] }]),
    samples: INTERIOR },
];

// SwiftShader's WebGL2 arithmetic is float32-exact and σ here is pure arithmetic + a Newton solve (no
// transcendentals), so the GPU tracks the float64 CPU engine to float32 ε amplified by Newton's
// conditioning and by |σ| near a pole. MEASURED: 1.9e-7 (deltoid), 3–6e-8 (unbounded pole cases), and up
// to 1.5e-6 for the bounded single-lobe whose interior samples sit near F's pole (|σ|≈2.5, so ~6e-7
// RELATIVE — the same float32 ε, larger in absolute terms). This bound is tight enough to catch any gross
// formula/packing bug (which lands ≫ 1e-5) and loose enough for that near-pole float32 amplification.
const TOL = 3e-6;

describe("@cas/schwarz/gpu: GPU σ(w) matches the CPU engine at round-trip samples (browser WebGL2)", () => {
  it("has a WebGL2 context with float render-target readback (EXT_color_buffer_float)", () => {
    expect(gl).toBeTruthy();
    expect(gl.getExtension("EXT_color_buffer_float")).toBeTruthy();
  });

  it.each(CORPUS)("$name: GPU σ ≈ CPU σ ≈ conj(F(z₀))", ({ phi, engine, samples }) => {
    const cpu = engine();
    const ws = samples.map((z0) => cpu.evalPhi(z0));

    // Sanity on the sample generator: the CPU engine reproduces the closed-form σ(φ(z₀)) = conj(F(z₀)).
    // If this ever fails the fault is the sample, not the GPU — keeps the parity claim below honest.
    samples.forEach((z0, i) => {
      const cpuSigma = cpu.sigma(ws[i]);
      expect(cpuSigma, `CPU σ null at z₀=${z0}`).not.toBeNull();
      if (cpuSigma) expect(dist(cpuSigma, conj(cpu.evalF(z0))), `round-trip @ z₀=${z0}`).toBeLessThan(1e-7);
    });

    const gpu = runSigmaGLSL(gl, phi, ws);
    let maxErr = 0;
    samples.forEach((z0, i) => {
      const cpuSigma = cpu.sigma(ws[i]);
      const gpuSigma = gpu[i];
      expect(gpuSigma, `GPU σ null at z₀=${z0} (w=${ws[i]})`).not.toBeNull();
      if (gpuSigma && cpuSigma) maxErr = Math.max(maxErr, dist(gpuSigma, cpuSigma));
    });
    expect(maxErr, `max |GPU σ − CPU σ| over the probes`).toBeLessThan(TOL);
  });

  it.each(CORPUS)("$name: GPU |F'(z)|/|φ'(z)| ≈ CPU (σ distance-estimator factor, S5-B2)", ({ phi, engine, samples }) => {
    // The σ distance estimator (S5-B2) needs the per-step local scaling |F'(z)|/|φ'(z)| of the
    // anti-holomorphic σ. Pin the GLSL evalFDeriv against the CPU engine: at w = φ(z₀) the inverse is z₀,
    // so the CPU ratio at z₀ is ground truth. A dropped k factor or wrong power in the branch F' — the
    // exact bug the finite-difference golden guards on the CPU side — shows up here on the GPU side.
    const cpu = engine();
    const cpuRatio = (z0: Complex): number => {
      const fp = cpu.evalFDeriv(z0);
      const pp = cpu.evalPhiDeriv(z0);
      return Math.hypot(fp[0], fp[1]) / Math.hypot(pp[0], pp[1]);
    };
    const ws = samples.map((z0) => cpu.evalPhi(z0));
    const gpu = runSigmaDerivGLSL(gl, phi, ws);
    samples.forEach((z0, i) => {
      const g = gpu[i];
      expect(g, `GPU deriv-ratio null at z₀=${z0}`).not.toBeNull();
      if (g !== null) {
        const c = cpuRatio(z0);
        expect(Math.abs(g - c), `|GPU − CPU| ratio @ z₀=${z0} (cpu=${c})`).toBeLessThan(1e-3 * Math.max(1, c));
      }
    });
  });

  it("reports σ = null (ok=0) for a point in the deltoid hole K (w ∉ Ω)", () => {
    // The origin is in K (the bounded complement); φ⁻¹ has no exterior preimage, so the shader's Newton
    // ladder exhausts and returns ok=0. A GPU that mislabels this as escapable would break the render.
    const phi: SigmaPhi = { c: 1, F: [[0, 0], [0, 0], [0.5, 0]] };
    const [origin] = runSigmaGLSL(gl, phi, [[0, 0]]);
    expect(origin).toBeNull();
  });
});
