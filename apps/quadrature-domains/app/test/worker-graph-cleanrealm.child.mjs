// Child process for worker-graph-cleanrealm.test.js — runs in a PRISTINE Node
// realm. It deliberately does NOT load test/bootstrap, so globalThis carries
// none of the kernel globals (Complex, Taylor, QD, Schwarz, …) that the main
// suite leaks via `Object.assign(global, shared)` (test/bootstrap.js). A
// solver-graph module that references an un-imported kernel therefore throws
// here EXACTLY as it does in the browser's bundled worker — which has no such
// global — instead of being silently backfilled. This is the failure mode the
// whole bootstrap-based suite is structurally blind to (node-test.js:19: every
// *.test.js run() only reads already-resolved globals).
//
// It imports the production worker graph and runs one representative inverse
// solve per family, so a runtime-only ReferenceError in ANY shared helper (e.g.
// solver-pqd-common's accumulateWeightedLHS) surfaces. Prints "CLEANREALM_OK
// <n>" and exits 0 on success; throws (non-zero exit) on the first failure.
import assert from 'node:assert';

// Precondition: prove the realm really is unpolluted. If a future change makes
// the graph pull these in transitively, the guard would give false comfort —
// fail loudly instead.
for (const k of ['Complex', 'Taylor', 'QD', 'Schwarz']) {
  assert.strictEqual(
    typeof globalThis[k], 'undefined',
    `clean-realm precondition violated: globalThis.${k} is defined`,
  );
}

const { default: QD } = await import(new URL('../workers/solver-graph.mjs', import.meta.url));

// (label, hData, opts) — each traverses solveInverseQD → the family verifier,
// which is where the un-imported-kernel bug lived. Inputs are known-solvable
// (mirrored from the solvers-3 family battery); the point is that the CALL runs,
// not the numeric result.
const cases = [
  ['classic bounded QD', { poles: [{ a: { re: 0, im: 0 }, principal: [{ re: 0.3, im: 0 }] }] }, {}],
  ['powerQD (bounded PQD)', { poles: [{ a: { re: 3, im: 0 }, principal: [{ re: 3, im: 0 }] }] }, { alpha: 2 }],
  ['unboundedPQD', { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 1, im: 0 }] }] }, { unbounded: true, alpha: 2, c: 0.6 }],
  ['unbounded QD', { poles: [{ a: { re: 2, im: 0 }, principal: [{ re: 1, im: 0 }] }] }, { unbounded: true, c: 0.6 }],
];

for (const [label, hData, opts] of cases) {
  // Throws ReferenceError here if a graph helper forgot to import a kernel.
  const r = QD.solveInverseQD(hData, opts);
  assert.ok(r && r.success, `${label}: solve did not succeed (${r && r.error})`);
}

console.log(`CLEANREALM_OK ${cases.length}`);
