// Review LOW (finding 07): newtonSolve's singular-Jacobian RECOVERY branch nudged the iterate with the
// process-global, un-seedable Math.random — a non-deterministic solve branch in a research/repro tool, and a
// flaky-test hazard. Two fixes: (1) thread an optional `rng` through the Newton options (default Math.random
// for back-compat); (2) route the recovery inner solve through the overdetermined-capable solveLeastSquares —
// it was square-only solveLinearSystem, so for QD's overdetermined residual systems (more boundary equations
// than φ coefficients) recovery could never complete ("not square"). This file pins both: the rng is THREADED
// INTO the recovery branch, and recovery COMPLETES and is reproducible per seed.
//
// We force recovery deterministically with a stateful `jacobianFn` that returns an all-zero (⇒ singular)
// Jacobian on its FIRST call, tripping the main `leastSquaresWithCond` "singular" throw; the recovery nudge
// `v + (rng()−0.5)·noiseScale` then draws from the injected rng.
import { describe, it, expect, beforeAll } from "vitest";

let QD: any;
beforeAll(async () => {
  // One import wires the full solver graph (families self-register in load order) — same handle the
  // dispatch-order / identity-tol characterization tests use.
  ({ default: QD } = await import("../app/workers/solver-graph.mjs"));
});

// A classical bounded QD (disk of radius R): the canonical clean solve reused across the solver batteries.
const R = 1.4;
const diskHData = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: R * R, im: 0 }] }] };

/** A jacobianFn that is singular exactly once (all-zero, same shape ⇒ rank-deficient ⇒ the main solve throws
 *  "singular"), then the genuine finite-difference Jacobian — forcing the recovery branch on step 0. */
function singularOnce() {
  let calls = 0;
  return (vec: number[], evalF: any, eps: number, F?: any, mode?: any) => {
    const J = QD.numericalJacobian(vec, evalF, eps, F, mode);
    calls++;
    return calls === 1 ? J.map((row: number[]) => row.map(() => 0)) : J;
  };
}

/** Solve the disk, then perturb the converged φ so Newton must iterate (and hit the forced-singular step 0). */
function perturbedStart() {
  const base = QD.solveInverseQD(diskHData, {});
  expect(base.success).toBe(true);
  const vec = QD.packPhi(base.primary.phi);
  vec[0] += 0.1;
  return QD.unpackPhi(vec, base.primary.phi);
}

describe("newtonSolve — the singular-recovery RNG is seedable (threaded through options)", () => {
  it("consumes the injected rng on the recovery branch (before the fix this line was Math.random)", () => {
    const start = perturbedStart();
    let rngCalls = 0;
    const spyRng = () => {
      rngCalls++;
      return 0.7; // deterministic; only the fact of consumption matters here
    };
    QD.newtonSolve(start, diskHData, { maxIter: 3, jacobianFn: singularOnce(), rng: spyRng });
    expect(rngCalls).toBeGreaterThan(0); // the recovery nudge drew from the injected rng — it is threaded
  });

  it("defaults to Math.random (back-compat) when no rng is passed — recovery still runs, no crash", () => {
    const start = perturbedStart();
    const res = QD.newtonSolve(start, diskHData, { maxIter: 3, jacobianFn: singularOnce() });
    expect(res).toBeTruthy(); // the default-RNG recovery path completes without throwing
  });
});

describe("newtonSolve — singular recovery COMPLETES on an overdetermined system", () => {
  it("records a recovery event (not a 'not square' abort) and is reproducible per seed", () => {
    // QD residual Jacobians are overdetermined (more boundary equations than φ coefficients — the disk is
    // 5×4). The recovery inner solve must therefore be a LEAST-SQUARES solve; a square-only solver dies on
    // "not square", so recovery never records an event. This pins that recovery actually completes AND that
    // the threaded seed makes it reproducible (the post-nudge residual is a direct rng-sensitive observable).
    const start = perturbedStart();
    const run = (seed: number) =>
      QD.newtonSolve(start, diskHData, { maxIter: 6, jacobianFn: singularOnce(), rng: QD.mulberry32(seed) });
    const a1 = run(42);
    const a2 = run(42);
    const b = run(7);

    expect(a1.recoveryEvents?.length ?? 0).toBeGreaterThan(0); // recovery COMPLETED (least-squares inner solve)
    const draw = (r: any) => r.recoveryEvents[0].Fnorm; // residual at the rng-nudged iterate
    expect(draw(a1)).toBe(draw(a2)); // same seed ⇒ byte-identical recovery
    expect(draw(a1)).not.toBe(draw(b)); // different seed ⇒ different nudge
  });
});
