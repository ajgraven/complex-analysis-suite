// apps/riemann-map — the research-grade Riemann-map / conformal-mapping studio (a new suite app).
//
// P0 (Genesis) is the empty, tested, deployable shell: it stands up the Vite/TS app, wires the shared
// @cas/* packages, and proves the single serializable view-state (S2) round-trips end-to-end. The
// custom-φ domain-coloring studio (S3/S4 + the render pipelines) lands in P1; every construction
// engine (§A) plugs into this shell thereafter.
import { makeComplexFn } from "@cas/expr/evaluate";
import { parse } from "@cas/expr/parser";
import {
  DEFAULT_VIEW_STATE,
  decodeRiemannState,
  encodeRiemannState,
  type RiemannViewState,
} from "./viewState.js";

/** Restore a view-state from the URL hash if present, else fall back to the default. */
function initialState(): RiemannViewState {
  const fromHash = decodeRiemannState(window.location.hash);
  return fromHash ?? DEFAULT_VIEW_STATE;
}

/** Render the P0 placeholder shell: names the app, its phase, and proves φ + view-state are wired. */
function mount(root: HTMLElement, state: RiemannViewState): void {
  // Prove the executable-map path is live: compile the default φ and evaluate it at a sample point.
  const phi = makeComplexFn(parse(state.map.expr));
  const [re, im] = phi([2, 0], [0, 0]); // z + 1/z at z = 2  ->  2.5
  const permalink = encodeRiemannState(state);

  const shell = document.createElement("main");
  shell.className = "shell";
  shell.innerHTML = `
    <span class="badge">Conformal maps · scaffold</span>
    <h1>Riemann Map</h1>
    <p class="tag">
      A research-grade Riemann-map &amp; conformal-mapping studio for the Complex Analysis Suite.
    </p>
    <p class="status">
      <strong>Phase&nbsp;0 — Genesis.</strong> The app scaffold, shared-package wiring, and the single
      serializable view-state are in place. The custom-&phi; domain-coloring studio arrives in Phase&nbsp;1.
    </p>
    <dl class="probe">
      <dt>Map &phi;</dt><dd><code>${state.map.expr}</code></dd>
      <dt>&phi;(2)</dt><dd><code>${re.toFixed(3)} ${im >= 0 ? "+" : "−"} ${Math.abs(im).toFixed(3)} i</code></dd>
      <dt>Permalink</dt><dd><code class="permalink">${permalink}</code></dd>
    </dl>
  `;
  root.replaceChildren(shell);
}

const app = document.getElementById("app");
if (app) mount(app, initialState());
