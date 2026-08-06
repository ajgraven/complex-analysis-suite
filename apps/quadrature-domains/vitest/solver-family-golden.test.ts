// Golden characterization net for the 10 solver families (QD-SOLV-4/5 / refactor C3).
//
// C3 will factor the ~17-key `QD.Family.<name>` record scaffolding + seed-arg convention into a
// `defineFamily(config)` factory, WITHOUT touching the per-family math (evalPhi / phiTaylorAt /
// computeTargetA / residual / …). This net pins, for every family, the exact numeric output of the
// three functions a shell refactor could silently rewire — `residual`, `packPhi`, `computeTargets` —
// evaluated on the deterministic `initialGuess` phi for a test-derived input. Vectors captured from the
// unmodified families (deterministic across runs); a shell refactor must reproduce them bit-for-(near)bit.
//
// hData/opts per family are taken from the existing solvers-*.test.js battery (referenced inline). Note
// `normalizeOpts({})` throws for 8/10 families — each needs its real opts bag (c/alpha/w0/q).
import { describe, it, expect, beforeAll } from "vitest";

// Numeric tolerance: catches any real math change (which shifts a value by >> 1e-6) while tolerating
// last-digit FP drift and the handful of structurally-zero "noise" slots (~1e-17..1e-34) captured as 0.
function expectClose(actual: number[], golden: number[], label: string): void {
  expect(actual.length, `${label} length`).toBe(golden.length);
  for (let i = 0; i < golden.length; i++) {
    const a = actual[i], e = golden[i];
    const ok = Math.abs(a - e) <= 1e-6 + 1e-6 * Math.abs(e);
    expect(ok, `${label}[${i}] = ${a}, expected ≈ ${e}`).toBe(true);
  }
}

// Flatten computeTargets() { A:[[c…]…], F:null|[c…], G?:[c…] } to a flat [re,im,…] number array.
function flattenTargets(T: any): number[] {
  const out: number[] = [];
  const pushComplexArray = (arr: any) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (Array.isArray(item)) for (const c of item) out.push(c.re, c.im); // A: branch → complex[]
      else if (item && typeof item === "object") out.push(item.re, item.im); // F/G: complex[]
    }
  };
  pushComplexArray(T.A);
  if (T.F) pushComplexArray(T.F);
  if (T.G) pushComplexArray(T.G);
  return out;
}

// name, source ref, hData + opts, and the golden residual / packPhi / flattened-targets vectors.
// Noise slots (imaginary parts ~1e-17..1e-34) are recorded as 0 — the tolerance absorbs them.
const FAMILIES = [
  { name: "boundedQD", ref: "solvers-1:679",
    hData: { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 1.96, im: 0 }] }] },
    opts: {},
    R: [0, 0, 0, 0, 0], P: [0, 0, 1.4, 0], T: [1.4, 0] },
  { name: "unboundedQD", ref: "solvers-1:690",
    hData: { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 1, im: 0 }] }] },
    opts: { unbounded: true, c: 0.6 },
    R: [-0.5494505495, 0, 0.04408652716, 0], P: [3.333333333, 0, 1.666666667, 0], T: [1.62258014, 0] },
  { name: "boundedLQD", ref: "solvers-4:514",
    hData: { poles: [{ a: { re: 1, im: 0 }, principal: [{ re: 0.5, im: 0 }] }] },
    opts: { lqd: true, w0: { re: 1, im: 0 } },
    R: [0, 0, 1.366666667, 0, 0], P: [0, 0, 1.666666667, 0], T: [0.3, 0] },
  { name: "unboundedLQD", ref: "solvers-4:588",
    hData: { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 1, im: 0 }] }] },
    opts: { lqd: true, unbounded: true, c: 0.6 },
    R: [-0.1883354172, 0, 0.01420729729, 0], P: [3.333333333, 0, 3.333333333, 0], T: [3.319126036, 0] },
  { name: "boundedLQD_singular", ref: "solvers-4:521",
    hData: { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 0.5, im: 0 }] }] },
    opts: { lqd: true, singular: true, w0: { re: 1, im: 0 }, q: { re: 0, im: 0 } },
    R: [9.456067789, 0, 0.8236707521, 0, 0.545192952, 0, 0, 0, 0],
    P: [0.8333333333, 0, -0.8333333333, 0, 1.2, 0, 0.8333333333, 0], T: [0.009662581227, 0] },
  { name: "unboundedLQD_singular", ref: "solvers-4:534",
    hData: { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 1, im: 0 }] }] },
    opts: { lqd: true, unbounded: true, singular: true, c: 0.6, q: { re: 0, im: 0 } },
    R: [-0.08845984078, 0, 0.03638446944, 0, 1.616902875, 0],
    P: [3.600622105, 0, 1.0605, 0, 3.32289232, 0], T: [3.286507851, 0] },
  { name: "powerQD", ref: "solvers-1:716",
    hData: { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 3, im: 0 }] }] },
    opts: { alpha: 2, w0: { re: 1, im: 0 } },
    R: [-2.6, 0, -6.240088648, 0, 0], P: [0.6666666667, 0, 0.3333333333, 0], T: [6.573421981, 0] },
  { name: "powerQD_singular", ref: "solvers-3:215",
    hData: { poles: [{ a: { re: 1, im: 0 }, principal: [{ re: 63 / 32, im: 0 }] }] },
    opts: { alpha: 2, singular: true, w0: { re: 1, im: 0 } },
    R: [0, 0, 1.398559685, 0, 0, 0, 0, 7.803512145, 0], P: [0, 0, 0.5, 0, 0.70156076, 0], T: [-0.6969989246, 0] },
  { name: "unboundedPQD", ref: "solvers-3:273",
    hData: { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 1, im: 0 }] }] },
    opts: { unbounded: true, alpha: 2, c: 2 },
    R: [2.333333333, 0, 0.3639350945, 0], P: [2, 0, 1, 0], T: [0.6360649055, 0] },
  { name: "unboundedPQD_singular", ref: "solvers-3:274",
    hData: { poles: [], polyPart: [{ re: 1, im: 0 }] },
    opts: { unbounded: true, singular: true, alpha: 2, c: 1 },
    R: [3, 0, 8, 0], P: [2, 0, 2, 0], T: [3, 0] },
];

let QD: any;
beforeAll(async () => {
  QD = (await import("../app/workers/solver-graph.mjs")).default;
});

describe("solver families — golden residual / packPhi / computeTargets (QD-SOLV-4/5, C3 net)", () => {
  it("all 10 families are registered", () => {
    for (const f of FAMILIES) expect(QD.Family[f.name], f.name).toBeTruthy();
  });

  for (const f of FAMILIES) {
    it(`${f.name} (${f.ref}): residual / packPhi / computeTargets match the golden vectors`, () => {
      const F = QD.Family[f.name];
      const norm = F.normalizeOpts(f.opts, f.hData);
      const phi0 = F.initialGuess(f.hData, norm);
      expectClose(F.residual(phi0, f.hData), f.R, `${f.name}.residual`);
      expectClose(F.packPhi(phi0), f.P, `${f.name}.packPhi`);
      expectClose(flattenTargets(F.computeTargets(phi0, f.hData)), f.T, `${f.name}.computeTargets`);
    });
  }
});
