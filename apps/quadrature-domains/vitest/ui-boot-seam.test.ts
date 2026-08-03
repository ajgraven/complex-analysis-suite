// The ui.mjs testability seam — refactor Phase 4 · D2 stage 1. ui.mjs was a 1.9k-line god-module that
// BOOTED ON IMPORT with 0 exports: `import './ui.mjs'` ran the whole QD-tab wiring against the DOM, so
// without the full QD HTML it THREW and could not be imported or characterized (B4 verified this and
// deferred the seam). The seam wraps the entire body in bootQdUi() and gates it on
// `typeof document !== 'undefined' && document.querySelector('#canvas')`, so the real app still boots on
// import (main.mjs's deferred module runs after index.html's <canvas id="canvas"> exists) while a bare
// import with no DOM is now side-effect-free.
//
// Node env (no `document`) exercises the importability directly: the guard's first clause is false, so
// bootQdUi() does not run and importing ui.mjs neither throws nor registers its QD_UI boot hooks. The
// source pin below locks the seam's shape (wrap + #canvas guard); the real app's full boot on a present
// #canvas is covered by the browser CI job, which loads the actual HTML.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = readFileSync(fileURLToPath(new URL("../app/ui.mjs", import.meta.url)), "utf8");

describe("ui.mjs is importable without booting (D2 seam)", () => {
  it("importing ui.mjs with no DOM does not throw and does not boot", async () => {
    // No `document` in the node env → the boot guard's first clause is false → bootQdUi() must not run.
    expect(typeof document, "this test must run without a DOM").toBe("undefined");
    const reg: any = await import("../app/ui-registry.mjs");
    // The boot registers these QD_UI hooks; they must be absent before (and, post-seam, after) import.
    expect(reg.QD_UI.snapshotScenario, "boot hook absent before boot").toBeUndefined();
    await import("../app/ui.mjs"); // THE SEAM: must not throw, must not boot
    expect(reg.QD_UI.snapshotScenario, "bootQdUi must NOT have run (no DOM)").toBeUndefined();
    expect(reg.QD_UI.loadScenarioIntoQdTab, "bootQdUi must NOT have run (no DOM)").toBeUndefined();
  });

  it("the whole body is wrapped in bootQdUi() and gated on the #canvas DOM anchor", () => {
    // Structure pin: if the wrapper or the guard is dropped, ui.mjs boots on import again and both this
    // seam and its importability regress. (The real-app boot on a present #canvas is covered by browser CI.)
    expect(SRC).toMatch(/function bootQdUi\(\)\s*\{/);
    expect(SRC).toMatch(/document\.querySelector\('#canvas'\)\)\s*bootQdUi\(\);/);
  });
});
