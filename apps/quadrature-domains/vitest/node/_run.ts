// Shared runner for the ported QD headless suite (refactor Stage B1).
//
// Each `app/test/<name>.test.js` is a CommonJS module exporting `async run()`. Historically
// `app/node-test.js` required all 26 and ran them SERIALLY in one child process, wrapped by a single
// `vitest/node-suite.test.ts` (execFileSync) — so the whole suite was one Vitest test on one core while
// everything else parallelised (finding QD-TEST-1). This helper instead lets each file run as its OWN
// Vitest spec (`vitest/node/<name>.test.ts`), so Vitest distributes them across workers, and a failure
// names the specific file instead of one opaque blob.
//
// Behaviour is UNCHANGED: the same `run()` executes against the same bootstrap globals + harness; we
// assert the file contributed at least its floor and added zero failing assertions — the same signal
// `node-test.js` computed. `app/node-test.js` is left intact for standalone `node app/node-test.js`.
import { beforeAll, expect, test } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

type Report = () => { pass: number; fail: number };

// Per-file assertion floors — moved verbatim from `app/node-test.js`. KEPT (not retired): decision D-4
// keeps the `harness.ok` wrapper, so each ported file is ONE Vitest test and its internal `ok()` count is
// invisible to Vitest's reporter. The floor still guards a file that silently early-returns (a stray
// `return`, a broken guard) from passing with ~0 assertions. Full rationale: app/node-test.js:53-91.
const FLOORS: Record<string, number> = {
  "solvers-1": 100, "solvers-2": 5, "solvers-3": 40, "solvers-4": 100, // B2 split; measured 187/10/71/183
  direct: 120, schwarz: 20, "param-slice": 15, sphere: 5,
  cusps: 5, "cusp-accuracy": 5, symmetry: 2, "thesis-examples": 8, faber: 8,
  riemann: 15, "parse-check": 3, "h-text-roundtrip": 15, worker: 3,
  "ui-inputs": 30, cmax: 3, observables: 5, "sym-core": 250, "sym-radical": 45,
  "qd-equations": 60, "qd-constraints": 16, "algebra-store": 220, "cas-export": 33,
  "expr-parser": 18, "define-subst": 36, "cardioid-uniqueness": 19,
};
const DEFAULT_FLOOR = 3;

/**
 * Register a Vitest spec that runs one `app/test/<name>.test.js` file against the shared vm-context
 * globals. `bootstrap.init()` is memoised (test/bootstrap.js `_initPromise`), so the beforeAll is a cheap
 * no-op after the first call in each worker. Requires are lazy (inside the hooks) to keep collection cheap.
 */
export function runNodeSuiteFile(name: string): void {
  beforeAll(async () => {
    const bootstrap = require("../../app/test/bootstrap") as { init: () => Promise<void> };
    await bootstrap.init();
  });

  test(`node-suite: ${name}.test.js`, async () => {
    const report = (require("../../app/test/harness") as { report: Report }).report;
    const before = report();
    // Required AFTER init() so the file's top-level `require('./bootstrap')` / global `loadInCtx()` reads resolve.
    const run = require(`../../app/test/${name}.test.js`) as () => Promise<void>;
    await run();
    const after = report();

    const contributed = after.pass + after.fail - (before.pass + before.fail);
    const floor = FLOORS[name] ?? DEFAULT_FLOOR;
    expect(
      contributed,
      `${name}.test.js contributed ${contributed} assertions (floor ${floor}) — a silent shrink?`,
    ).toBeGreaterThanOrEqual(floor);
    expect(after.fail - before.fail, `${name}.test.js recorded failing assertions`).toBe(0);
  });
}
