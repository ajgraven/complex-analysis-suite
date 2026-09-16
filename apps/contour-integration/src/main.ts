// Entry point.
//
// Booted inside `@cas/ui`'s fatal-error boundary (ADR-0032): the app mounts into a bare `<div id="app">`
// and builds a WebGL2 stage, so a driver without WebGL2 — or any throw during init — would otherwise
// leave a blank page with the reason only in the console. The boundary turns that into a named banner.
import { runWithFatalBoundary } from "@cas/ui";
import "katex/dist/katex.min.css";
import "@cas/ui/nav.css";
import { mountShell2 } from "./shell/app.js";

/**
 * **One shell — M8 step 1.12.**
 *
 * Phase 1 built `src/shell/` beside `src/shell/` and this file chose between them on `?shell=new`,
 * which is what let every step in between be checked in a real browser without the app on the branch
 * ever being half-migrated: a reader saw the old shell until the new one was finished, and the old
 * one was never edited to accommodate the new one. The new one is finished, so there is nothing left
 * to choose between — `src/shell/` has become `src/shell/` and the old shell is gone.
 */
runWithFatalBoundary(() => {
  const root = document.querySelector("#app");
  if (!root) throw new Error("the page has no #app element to mount into");
  mountShell2(root);
});
