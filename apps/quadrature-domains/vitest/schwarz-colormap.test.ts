// @vitest-environment jsdom
//
// CPU↔GPU colormap parity for the Schwarz tab (Review QD-schwarz-b-A-01).
//
// The `cyclic` colormap diverged: the CPU painter (schwarz-paint.mjs `colormap`) folded escape-time
// position through `(t*6) % 1` of a single forward magma ramp — six hard-edged sawtooth bands — while
// the GPU (schwarz-webgl.mjs `pickColormap`) built ONE `magma ++ reverse(magma) ++ magma` ramp sampled
// linearly. Same escape-time field ⇒ visibly different images, breaking the painter header's explicit
// "CPU and GPU outputs render the same colors" invariant. The fix makes the CPU sample the SAME
// concatenated palette at plain `t`, so `cyclic` sits in the same interpStops(t, stops) relationship to
// the GPU LUT as every other palette. GLSL/LUT can't run in CI (Phase-0 P0-2), so this pins the palette
// DATA + the CPU mapping against the GPU's authoritative `pickColormap` stop list.
import { describe, it, expect, beforeAll } from "vitest";

let colormap: (name: string, t: number) => number[];
let pickColormap: (name: string) => number[][];

beforeAll(async () => {
  const QD: any = (await import("../app/solver.mjs")).default;
  // schwarz-webgl self-creates QD.Schwarz (`QD.Schwarz || (QD.Schwarz = {})`) and registers
  // Schwarz._glHelpers.pickColormap; neither it nor schwarz-paint pulls in the LQD graph, so the
  // colormap surface loads without the full solver-family chain.
  await import("../app/schwarz/schwarz-webgl.mjs"); // registers Schwarz._glHelpers.pickColormap
  await import("../app/schwarz/schwarz-paint.mjs"); // registers QD_UI.installSchwarzPaint
  const { QD_UI } = await import("../app/ui-registry.mjs");
  pickColormap = QD.Schwarz._glHelpers.pickColormap;
  // colormap/cpuComputeT are pure (no ctx use); install with a minimal stub context.
  const stub: any = {
    sState: {}, getCtx: () => null, syncCanvasSize: () => {}, worldToPixel: () => {},
    zToPixel: () => {}, activeRenderer: () => "cpu",
    KIND_FUND: 0, KIND_ESC: 1, KIND_INT: 2, KIND_INV: 3, KIND_OUTSIDE: 4,
  };
  colormap = (QD_UI as any).installSchwarzPaint(stub).colormap;
});

// Faithful replica of schwarz-paint's `interpStops` (piecewise-linear over the stop list),
// the same sampler the GPU LUT is built from — used to derive the expected GPU-side colour.
function interp(t: number, stops: number[][]): number[] {
  const n = stops.length - 1;
  const f = t * n;
  const i = Math.min(n - 1, Math.floor(f));
  const u = f - i;
  const a = stops[i], b = stops[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * u),
    Math.round(a[1] + (b[1] - a[1]) * u),
    Math.round(a[2] + (b[2] - a[2]) * u),
  ];
}

const SWEEP = [0, 0.07, 0.2, 0.33, 0.5, 0.66, 0.8, 0.93, 1];

describe("Schwarz cyclic colormap: CPU matches GPU (QD-schwarz-b-A-01)", () => {
  it("GPU pickColormap('cyclic') is the 27-stop magma fwd→reverse→fwd ramp", () => {
    const magma = pickColormap("magma");
    const expected = magma.concat(magma.slice().reverse(), magma);
    expect(pickColormap("cyclic")).toEqual(expected);
    expect(pickColormap("cyclic").length).toBe(magma.length * 3);
  });

  it("CPU colormap('cyclic', t) samples the SAME concatenated ramp as the GPU (no 6× sawtooth)", () => {
    const gpuCyclic = pickColormap("cyclic");
    for (const t of SWEEP) {
      expect(colormap("cyclic", t)).toEqual(interp(t, gpuCyclic));
    }
  });

  it("differs from the OLD (t*6)%1 sawtooth of a single magma ramp (the bug is gone)", () => {
    const magma = pickColormap("magma");
    // At least one sweep point must differ from the old sawtooth mapping.
    const anyDiff = SWEEP.some((t) => {
      const oldSawtooth = interp((t * 6) % 1, magma);
      const now = colormap("cyclic", t);
      return oldSawtooth.some((v, k) => v !== now[k]);
    });
    expect(anyDiff).toBe(true);
  });

  it("does not regress the other palettes (still interpStops(t, base))", () => {
    for (const name of ["magma", "viridis", "turbo", "grayscale"]) {
      const base = pickColormap(name);
      for (const t of SWEEP) {
        expect(colormap(name, t)).toEqual(interp(t, base));
      }
    }
  });
});
