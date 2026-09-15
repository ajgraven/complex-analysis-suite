// Entry point.
//
// Booted inside `@cas/ui`'s fatal-error boundary (ADR-0032): the app mounts into a bare `<div id="app">`
// and builds a WebGL2 stage, so a driver without WebGL2 — or any throw during init — would otherwise
// leave a blank page with the reason only in the console. The boundary turns that into a named banner.
import { runWithFatalBoundary } from "@cas/ui";
import "katex/dist/katex.min.css";
import "@cas/ui/nav.css";
import { mountApp } from "./shell/app.js";
import { mountShell2 } from "./shell2/app.js";

/**
 * **`?shell=new` opens the shell being built; everything else opens the one that works.**
 *
 * M8 Phase 1 builds `src/shell2/` beside `src/shell/` and swaps the entry point at 1.12. The switch
 * is what lets every step in between be checked in a real browser without the app on this branch
 * ever being half-migrated — a reader who opens it sees the old shell until the new one is finished,
 * and the old one is never edited to accommodate the new one.
 */
runWithFatalBoundary(() => {
  const root = document.querySelector("#app");
  if (!root) throw new Error("the page has no #app element to mount into");
  if (new URLSearchParams(location.search).get("shell") === "new") mountShell2(root);
  else mountApp(root);
});
