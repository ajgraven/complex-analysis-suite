import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

// The QD package root (apps/quadrature-domains). We invoke the suite EXACTLY as the app's
// own `test` script does — `node app/node-test.js` from the package root — so behavior is
// byte-for-byte identical to running the suite standalone.
const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("QD headless suite (app/node-test.js) passes with 0 failures", () => {
  let stdout: string;
  try {
    stdout = execFileSync("node", ["app/node-test.js"], {
      cwd: pkgDir,
      encoding: "utf8",
      timeout: 590_000,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    // node-test.js exits non-zero on any failure. Surface its own output (which lists each
    // failing assertion) so the Vitest report is actionable.
    const e = err as { stdout?: string; stderr?: string };
    throw new Error(
      "QD node-test.js exited non-zero:\n" + (e.stdout ?? "") + (e.stderr ?? ""),
    );
  }

  // The runner's final line is the source of truth: "N passed, M failed".
  const tally = stdout.match(/(\d+) passed, (\d+) failed/);
  expect(tally, "expected a 'N passed, M failed' tally in node-test.js output").toBeTruthy();
  expect(stdout).toMatch(/\b0 failed\b/);
});
