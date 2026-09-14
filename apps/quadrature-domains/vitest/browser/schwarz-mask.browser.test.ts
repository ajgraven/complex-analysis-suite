import { beforeAll, describe, expect, it } from "vitest";

// The Schwarz fractal's in-Ω mask, against the float64 engine — in a real browser,
// because the property under test is a float32 GLSL one and the node gate cannot
// compile a shader.
//
// WHAT BROKE. inOmega() is a rasterised polygon mask; ψ = φ⁻¹ is exact and exists
// only on φ's image. Where they disagreed the shader asked sigma() for a point
// outside σ's domain; Newton then converged to a preimage on the WRONG SHEET
// (measured: 776 of 796 failures — it never once diverged), acceptZ correctly
// refused it, the 4-seed ladder had nothing to find, and the pixel was painted
// KIND_INV, rgb(180,90,90). Because the tiles are σ⁻ⁿ(∂Ω), an orbit grazing ∂Ω is
// exactly a pixel ON a tile boundary, so the failures read as salmon speckle along
// every tile edge — 796 / 810,000 on the cusped deltoid, and WORSE zoomed in
// (2,125 at 6×, 2,764 at 30×), the mask's error being fixed in world units while
// the screen pixel shrinks.
//
// WHAT IS PINNED. Two clauses, because either alone is satisfiable by a wrong fix:
//   • zero KIND_INV pixels — the artifact itself;
//   • agreement with the float64 CPU engine (exact polygon + exact ψ) — the guard
//     that the zero was not bought by biasing the classification. A fat enough
//     conservative stroke silences every dot and wrecks this number: at padFactor
//     5.0 a 1-texel dilation alone scored 98.87% at 6× against a 99.59% baseline.
let QD: {
  solveInverseQD: (h: unknown, o: unknown) => { success: boolean; error?: string; primary: { phi: unknown } };
  sampleBoundary: (phi: unknown, n: number) => { re: number; im: number }[];
  Schwarz: {
    buildSchwarzFromPhi: (phi: unknown, h: unknown, pts: unknown) => never;
    escapeTime: (w: unknown, sw: unknown, o: unknown) => { kind: string };
    createGPURenderer: (c: HTMLCanvasElement) => never;
  };
};

beforeAll(async () => {
  QD = (await import("../../app/solvers/solver.mjs")).default as never;
  for (const m of [
    "solver-faber", "seeds/seeds-qd", "solver-qd", "seeds/seeds-uqd", "solver-uqd",
    "solver-lqd-common", "seeds/seeds-lqd", "solver-lqd",
    "seeds/seeds-lqd-singular", "solver-lqd-singular",
    "seeds/seeds-uqd-lqd", "solver-uqd-lqd",
    "seeds/seeds-uqd-lqd-singular", "solver-uqd-lqd-singular",
    "solver-pqd-common", "seeds/seeds-pqd", "solver-pqd",
    "seeds/seeds-pqd-singular", "solver-pqd-singular",
    "seeds/seeds-uqd-pqd", "solver-uqd-pqd",
    "seeds/seeds-uqd-pqd-singular", "solver-uqd-pqd-singular",
  ]) await import(/* @vite-ignore */ "../../app/solvers/" + m + ".mjs");
  await import("../../app/schwarz/schwarz-common.mjs");
  await import("../../app/schwarz/schwarz-webgl.mjs");
});

type View = { label: string; cx: number; cy: number; half: number };

/** Solve one QD, bring up the real GPU renderer, hand back both engines. */
function setUp(hData: unknown, opts: unknown, size: number) {
  const r = QD.solveInverseQD(hData, opts);
  expect(r.success, r.error).toBe(true);
  const phi = r.primary.phi;
  const boundaryPts = QD.sampleBoundary(phi, 1024);
  const sw = QD.Schwarz.buildSchwarzFromPhi(phi, hData, boundaryPts) as unknown as {
    escapeR: number; isInOmega: (w: { re: number; im: number }) => boolean;
  };
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  document.body.appendChild(canvas);
  const gpu = QD.Schwarz.createGPURenderer(canvas) as unknown as {
    setPhi: (phi: unknown, o: unknown) => boolean;
    setColormap: (n: string) => void;
    render: (v: unknown, o: unknown) => void;
    capacityError: () => string | null;
  };
  expect(gpu, "WebGL2 unavailable — this suite needs a real browser").toBeTruthy();
  expect(gpu.setPhi(phi, { boundaryPts, escapeR: sw.escapeR }), gpu.capacityError() ?? "").toBe(true);
  gpu.setColormap("magma");
  return { sw, gpu, canvas };
}

/** The pixel classes the shader paints flat (kindToColor); anything else is an escape-time colour. */
function kindOf(r: number, g: number, b: number): string {
  if (r === 180 && g === 90 && b === 90) return "invalid";
  if (r === 80 && g === 80 && b === 90) return "escaped";
  if (r === 245 && g === 245 && b === 248) return "outside";
  if (r === 28 && g === 28 && b === 36) return "interior";
  return "fundamental";
}

function renderAndRead(
  gpu: { render: (v: unknown, o: unknown) => void },
  canvas: HTMLCanvasElement, v: View, maxIter: number,
) {
  const N = canvas.width;
  gpu.render({ cx: v.cx, cy: v.cy, cssW: N, cssH: N, scale: N / (2 * v.half) },
             { maxIter, scaleMode: "smooth" });
  const gl = canvas.getContext("webgl2") as WebGL2RenderingContext;
  const px = new Uint8Array(N * N * 4);
  gl.readPixels(0, 0, N, N, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return px;
}

function countInvalid(px: Uint8Array, N: number): number {
  let n = 0;
  for (let i = 0; i < N * N; i++) if (kindOf(px[i*4], px[i*4+1], px[i*4+2]) === "invalid") n++;
  return n;
}

// The deltoid of the bug report: h = w², unbounded, c = 0.5. c is EXTREMAL here —
// φ(z) = z/2 + 1/(4z²) has φ′ = 0 at z³ = 1, i.e. its three critical points sit
// exactly ON |z| = 1 (measured |φ′| = 3.6e-16 at θ = 120°), so ∂Ω is the cusped
// hypocycloid. That is the hardest domain in the family, not a corner case.
const DELTOID = { poles: [], polyPart: [{re:0,im:0},{re:0,im:0},{re:1,im:0}] };
const DELTOID_OPTS = { unbounded: true, c: 0.5 };
// h = 1.5/w + 0.5/w²: a bounded QD (family 0) cardioid. It exercises the OTHER
// side of the conservative stroke — the polygon is Ω, so the margin erodes where
// the unbounded one dilates, and a single shared colour would be wrong for one.
const CARDIOID = { poles: [{ a: {re:0,im:0}, principal: [{re:1.5,im:0},{re:0.5,im:0}] }] };

describe("Schwarz fractal: the in-Ω mask never claims a point ψ cannot invert", () => {
  it("paints no KIND_INV pixel on the cusped deltoid, at any zoom", () => {
    const N = 900;
    const { gpu, canvas } = setUp(DELTOID, DELTOID_OPTS, N);
    // 1× frames the whole tiling; 6× and 30× sit inside it, where the mask's
    // fixed world-space error covers progressively more screen pixels. Before the
    // fix these read 796 / 2125 / 2764.
    const views: View[] = [
      { label: "1x",  cx: 0,    cy: 0,   half: 2.2   },
      { label: "6x",  cx: 0,    cy: 0,   half: 0.36  },
      { label: "30x", cx: 0.62, cy: 0.3, half: 0.073 },
    ];
    for (const v of views) {
      expect(countInvalid(renderAndRead(gpu, canvas, v, 64), N), "deltoid @ " + v.label).toBe(0);
    }
  }, 120_000);

  it("paints no KIND_INV pixel on the bounded cardioid (the eroding margin)", () => {
    const N = 900;
    const { gpu, canvas } = setUp(CARDIOID, {}, N);
    // Before the fix: 22 at 1×, 2 at 6×.
    for (const v of [{ label: "1x", cx: 0, cy: 0, half: 2.6 },
                     { label: "6x", cx: 0, cy: 0, half: 0.42 }] as View[]) {
      expect(countInvalid(renderAndRead(gpu, canvas, v, 64), N), "cardioid @ " + v.label).toBe(0);
    }
  }, 120_000);

  it("agrees with the float64 engine on which class each pixel is", () => {
    // Anti-vacuity: zero KIND_INV is ALSO what a grossly over-dilated mask gives,
    // and that answer is wrong — it buys silence by misclassifying a band along
    // every tile edge. The float64 engine — exact polygon in-Ω test, exact ψ, no
    // mask anywhere — is the reference, and each floor below is placed to reject
    // all three of the states measured on this raster:
    //
    //              1×         6×
    //   this fix   99.9917%   99.7500%   ← must pass
    //   pre-fix    99.9050%   99.5909%   ← must fail (the mask that speckled)
    //   dilated    —          98.8660%   ← must fail (1 texel at the old pad 5.0)
    //
    // The floors sit between, so BOTH wrong answers fail even though each reports
    // a plausible-looking number. Chromium renders this suite on SwiftShader in CI
    // and locally alike, so these are reproducible rather than hardware-dependent.
    const N = 220;
    const { sw, gpu, canvas } = setUp(DELTOID, DELTOID_OPTS, N);
    for (const [v, floor] of [
      [{ label: "1x", cx: 0, cy: 0, half: 2.2  }, 0.9995],
      [{ label: "6x", cx: 0, cy: 0, half: 0.36 }, 0.9968],
    ] as [View, number][]) {
      const scale = N / (2 * v.half);
      const px = renderAndRead(gpu, canvas, v, 64);
      let agree = 0;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const w = { re: v.cx + (x - N/2 + 0.5) / scale, im: v.cy + (y - N/2 + 0.5) / scale };
        const cpu = sw.isInOmega(w)
          ? QD.Schwarz.escapeTime(w, sw, { maxIter: 64, escapeR: sw.escapeR }).kind
          : "outside";
        if (kindOf(px[i*4], px[i*4+1], px[i*4+2]) === cpu) agree++;
      }
      expect(agree / (N * N), "GPU↔CPU class agreement @ " + v.label).toBeGreaterThan(floor);
    }
  }, 240_000);
});
