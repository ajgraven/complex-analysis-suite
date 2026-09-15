// Entry point.
//
// Booted inside `@cas/ui`'s fatal-error boundary (ADR-0032): the app mounts into a bare `<div id="app">`
// and builds a WebGL2 stage, so a driver without WebGL2 — or any throw during init — would otherwise
// leave a blank page with the reason only in the console. The boundary turns that into a named banner.
import { runWithFatalBoundary } from "@cas/ui";
import "katex/dist/katex.min.css";
import "@cas/ui/nav.css";
import { mountApp } from "./shell/app.js";

runWithFatalBoundary(() => {
  const root = document.querySelector("#app");
  if (!root) throw new Error("the page has no #app element to mount into");
  mountApp(root);
});
