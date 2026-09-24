// apps/polynomial-root-analysis — one polynomial and what acts on its roots (ADR-0047; plan:
// docs/polynomial-root-analysis/PLAN.md). Mounted inside the suite's fatal-error boundary so a failure
// reaches the reader as a sentence rather than a blank page.
import "./styles/app.css";
import { runWithFatalBoundary } from "@cas/ui";
import { mountApp } from "./shell/app.js";

runWithFatalBoundary(() => {
  const host = document.getElementById("app");
  if (!host) throw new Error("Polynomial Root Analysis: missing #app host element.");
  mountApp(host);
});
