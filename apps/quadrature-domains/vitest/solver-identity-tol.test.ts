// Characterization net for refactor Phase 1 (finding QD-SOLV-6).
//
// The identity-check gate `identity.maxRelDiff < tol` was open-coded at three sites in solver.mjs
// with the default tolerance `1e-6` repeated as a bare literal each time:
//   • site A — _computeIdentity (options.identityTol ?? 1e-6), reached via solveInverseQD's attachIdentity
//   • site B — searchAlternates  (identityTol = 1e-6 destructure default)
//   • site C — liveSolveStep     (identity.maxRelDiff < 1e-6, hardcoded / non-overridable)
// The fix centralizes the literal into one named module constant `IDENTITY_TOL = 1e-6`, exposed on the
// QD namespace, WITHOUT changing any site's override semantics (site C stays non-overridable). The value
// is identical at every site, so this is behavior-preserving.
//
// What this file pins (all against the live solver graph, headless):
//   1. IDENTITY_TOL is exposed and equals 1e-6 — the single source of truth [passes only after the fix].
//   2. The default gate ACCEPTS a genuine QD at site A (solveInverseQD) and site C (liveSolveStep)
//      [green BEFORE and AFTER — these are the characterization anchors].
// The accept/REJECT boundary at the 1e-6 threshold is already pinned comprehensively by the node
// batteries (solvers-1..4 assert identityOK===true on genuine QDs and !identityOK on spurious roots,
// e.g. solvers-4 B-* / the "off" cases); this file adds the single-source-constant guarantee on top.
import { describe, it, expect, beforeAll } from "vitest";

let QD: any;
beforeAll(async () => {
  // One import wires the full solver graph (families self-register in load order). Same handle the
  // dispatch-order char test uses.
  ({ default: QD } = await import("../app/workers/solver-graph.mjs"));
});

// A classical bounded QD (a disk of radius R): the canonical genuine quadrature domain used across
// the solver batteries. Solves cleanly, so its verified identity residual sits far below 1e-6.
const R = 1.4;
const diskHData = { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: R * R, im: 0 }] }] };

describe("QD-SOLV-6 — the identity tolerance is one named source (IDENTITY_TOL)", () => {
  it("exposes IDENTITY_TOL === 1e-6 on the namespace (single source of truth)", () => {
    // After-only: documents the centralized constant the three sites now share.
    expect(QD.IDENTITY_TOL).toBe(1e-6);
  });
});

describe("QD-SOLV-6 — the default identity gate accepts a genuine QD (pinned before AND after)", () => {
  it("site A: solveInverseQD certifies the disk (primary.identityOK, residual < 1e-6)", () => {
    const res = QD.solveInverseQD(diskHData, {});
    expect(res.success).toBe(true);
    expect(res.primary.identityOK).toBe(true);
    // The gate is `maxRelDiff < tol`; a genuine solve lands well under the 1e-6 default.
    expect(res.primary.identity.maxRelDiff).toBeLessThan(1e-6);
  });

  it("site C: liveSolveStep warm-started on the disk reports identityOK", () => {
    const base = QD.solveInverseQD(diskHData, {});
    expect(base.success).toBe(true);
    const seed = QD.clonePhi(base.primary.phi);
    const live = QD.liveSolveStep(diskHData, seed, { newton: { maxIter: 30 }, numSamples: 96 });
    expect(live && live.success).toBe(true);
    expect(live.identityOK).toBe(true);
    expect(live.identity.maxRelDiff).toBeLessThan(1e-6);
  });
});
