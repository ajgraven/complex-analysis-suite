// apps/polynomial-root-analysis — one polynomial and what acts on its roots (ADR-0047; plan:
// docs/polynomial-root-analysis/PLAN.md). PRA-0: the scaffold, mounted inside the suite's fatal-error
// boundary so a failure reaches the reader as a sentence rather than a blank page.
import "./styles/app.css";
import { runWithFatalBoundary } from "@cas/ui";
import { mountScaffold } from "./shell/scaffold.js";

runWithFatalBoundary(() => {
  const host = document.getElementById("app");
  if (!host) throw new Error("Polynomial Root Analysis: missing #app host element.");
  mountScaffold(host);
});
