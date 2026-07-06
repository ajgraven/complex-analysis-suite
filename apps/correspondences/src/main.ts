// apps/correspondences — the anti-holomorphic correspondence / Schwarz-reflection mating tool
// (Phase 6, MIGRATION.md). This is the Phase-6 scaffold: a working Vite + TypeScript app wired to
// the shared packages (@cas/core, @cas/expr, @cas/gpu, @cas/interchange) the first two apps extracted.
// Milestone A (next) reproduces the deltoid Schwarz reflection from φ(ζ) = ζ + 1/(2ζ²).
import { parse } from "@cas/expr/parser";
import { makeComplexFn } from "@cas/expr/evaluate";
import { SCHEMA_ID } from "@cas/interchange";

// The deltoid's Laurent map φ(ζ) = ζ + 1/(2ζ²), written over @cas/expr's variable z. Evaluating it
// here confirms the expr pipeline the correspondence engine leans on (Milestone A builds σ from φ).
const DELTOID_PHI = "z + 1/(2*z^2)";

function mount(): void {
  const app = document.getElementById("app");
  if (!app) return;
  const phi = makeComplexFn(parse(DELTOID_PHI));
  const atOne = phi([1, 0], [0, 0]); // φ(1) = 1 + 1/2 = 1.5

  app.innerHTML = `
    <main>
      <h1>Correspondences</h1>
      <p class="tag">Anti-holomorphic correspondences &amp; Schwarz-reflection mating — Phase&nbsp;6 scaffold.</p>
      <p class="status">
        Wired to the shared packages. The deltoid map
        <code>&phi;(&zeta;) = &zeta; + 1/(2&zeta;&sup2;)</code> parses and evaluates via
        <code>@cas/expr</code> (&phi;(1) = ${atOne[0]}); the interchange format is
        <code>${SCHEMA_ID}</code>. Milestone&nbsp;A — reproduce the deltoid — is next.
      </p>
    </main>`;
}

mount();
