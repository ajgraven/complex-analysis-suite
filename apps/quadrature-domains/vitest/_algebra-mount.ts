// Reusable jsdom mount harness for the Algebra workspace (installAlgebra) — refactor Phase 2, QD-ALG-3.
//
// WHY: a family of algebra tests pin the sidebar by reading algebra-ui.mjs as text and regexing the
// HTML *string* it builds (section names/order, tooltips, labels). That guards the SOURCE, not the
// behaviour, so it would stay green through a decomposition that broke the rendered UI — and it breaks
// the moment the sidebar is built as data instead of a string (the D1a refactor this phase enables).
// This harness lets those tests assert the RENDERED DOM and real interactions instead.
//
// NOT a `.test.ts` file, so Vitest does not collect it (include = vitest/ ** /*.test.ts). Import it from
// a test file that declares `// @vitest-environment jsdom`; document/localStorage/CustomEvent are the
// importer's jsdom globals, touched only inside mountAlgebra() (call time), never at import time.
//
// Mounting is proven feasible headlessly because AlgebraCanvas renders with SVG (createElementNS), not a
// 2D/WebGL canvas context jsdom lacks. installAlgebra reads ~10 ctx props (all stubbed here) and mounts
// LAZILY behind the tab-lifecycle listener it registers — so mountAlgebra() fires a `tab-changed` event
// (what a real tab-button click dispatches) to trigger the build into #controls-algebra.

export interface AlgebraMount {
  /** The QD singleton namespace (kernels registered). */
  QD: any;
  /** The QD_UI registry (installAlgebra, PROV_UI, WORKFLOW_STEPS, …). */
  QD_UI: any;
  /** The ctx passed to installAlgebra (stubs + any overrides). */
  ctx: any;
  /** installAlgebra's return value ({ openWorkspace }). */
  api: any;
  /** #controls-algebra — the host the sidebar is built into. */
  container: HTMLElement;
  /** document.querySelector, scoped to the whole document (the panel is the only content). */
  $: (sel: string) => Element | null;
  /** document.querySelectorAll as an array. */
  $$: (sel: string) => Element[];
  /** Re-dispatch a `tab-changed` event (e.g. to leave and re-enter the tab). */
  dispatchTab: (tab: string) => void;
}

let booted = false;
let QD: any;
let QD_UI: any;

// One-time: import the kernels + UI that register onto the QD / QD_UI singletons. ESM caches these, so
// the flag only avoids re-awaiting; the singletons are shared across every test file in the worker.
// Order mirrors the node harness's algebra bootstrap (seeds before solvers, kernels before the store).
async function boot(): Promise<void> {
  if (booted) return;
  QD = (await import("../app/solver.mjs")).default as any;
  await import("../app/sym-core.mjs");
  await import("../app/sym-radical.mjs");
  await import("../app/faber-analysis.mjs");
  await import("../app/algebra/sym-worker.mjs");
  await import("../app/qd-equations.mjs");
  await import("../app/qd-constraints.mjs");
  await import("../app/algebra/cas-export.mjs");
  await import("../app/algebra/algebra-store.mjs");
  await import("../app/algebra/algebra-canvas.mjs");
  await import("../app/ui-strings.mjs");
  QD_UI = (await import("../app/ui-registry.mjs") as any).QD_UI;
  await import("../app/algebra/algebra-ui.mjs"); // IIFE side-effect: QD_UI.installAlgebra = installAlgebra
  booted = true;
}

/**
 * Mount the Algebra workspace into a fresh jsdom document and return handles to it.
 *
 * Call ONCE per test file (in `beforeAll`): installAlgebra adds a `tab-changed` listener to `document`
 * on every call, so repeated mounts in one document would stack handlers and multi-fire the build.
 * Each test FILE gets its own jsdom `document` (Vitest isolates environments per file), so listeners do
 * not leak across files.
 *
 * @param overrides shallow-merged onto the stub ctx — pass e.g. `{ ns: [...], c: 2 }` to feed the labels.
 * @param opts.withCanvas mount the real AlgebraCanvas (SVG node cards + selection → inspector). Default
 *        OFF: the scaffold gives a bare #algebra-graph and mountSurface no-ops (it needs #plot-area), so
 *        `canvas` stays null — exactly the sidebar-only environment every existing test relies on. Opt IN
 *        only for the op-runner / inspector nets, which need node selection to reach doSolveRadical et al.
 */
export async function mountAlgebra(
  overrides: Record<string, unknown> = {},
  opts: { withCanvas?: boolean } = {},
): Promise<AlgebraMount> {
  await boot();
  try { localStorage.clear(); } catch { /* private mode / unavailable */ }

  // Minimal scaffold: the tab button installAlgebra's openWorkspace clicks, the panel host it builds
  // into, and the graph host. Default = a bare #algebra-graph (mountSurface needs #plot-area, absent
  // here, so the canvas stays unmounted). withCanvas swaps in #plot-area so mountSurface builds the
  // real AlgebraCanvas (which creates its own #algebra-graph inside it). installAlgebra templates the rest.
  const graphHost = opts.withCanvas ? '<div id="plot-area"></div>' : '<div id="algebra-graph"></div>';
  document.body.innerHTML =
    '<button class="tab-btn" data-tab="algebra"></button>' +
    '<div id="controls-algebra"></div>' +
    graphHost;

  const $ = (sel: string) => document.querySelector(sel);
  const $$ = (sel: string) => Array.from(document.querySelectorAll(sel));
  const dispatchTab = (tab: string) =>
    document.dispatchEvent(new CustomEvent("tab-changed", { detail: { tab } }));

  // The ctx contract installAlgebra actually reads (grepped): $ + these. All side-effect-free stubs;
  // override per test where a value matters (e.g. ns/c drive provenance labels).
  const ctx: Record<string, unknown> = {
    $,
    trackLabelOf: () => "",
    showQDSolution: () => false,
    w: null,
    openAlgebra: null, // installAlgebra overwrites this with openWorkspace
    onStage: () => {},
    ns: [],
    nodes: () => [],
    c: 0,
    activeTrack: null,
    ...overrides,
  };

  const api = QD_UI.installAlgebra(ctx);
  dispatchTab("algebra"); // trigger the lazy first-open mount

  const container = document.getElementById("controls-algebra");
  if (!container || !container.querySelector("#alg-sections")) {
    throw new Error(
      "mountAlgebra: sidebar did not render into #controls-algebra — bootstrap or mount trigger changed.",
    );
  }
  return { QD, QD_UI, ctx, api, container: container as HTMLElement, $, $$, dispatchTab };
}

/** Section <summary> texts in DOM order — the behavioural twin of the old source regex. */
export function sectionNames(m: AlgebraMount): string[] {
  return m.$$("#alg-sections details.algebra-section > summary").map((s) => (s.textContent || "").trim());
}

// ── Op-runner / inspector net helpers (need mountAlgebra(_, { withCanvas: true })) ──────────────
/** The rendered canvas node cards (empty unless mounted withCanvas AND a system is seeded). */
export function nodeCards(m: AlgebraMount): HTMLElement[] {
  void m;
  return Array.from(document.querySelectorAll(".algebra-node[data-id]")) as HTMLElement[];
}

/**
 * Seed the order-2 Aharonov–Shapiro moment system — the one seed that needs NO geometric solve
 * (store.seedFromPolys, no activeEnv), so a jsdom mount can populate the store and, withCanvas,
 * render selectable node cards. Returns the node data-ids in DOM order.
 */
export function seedMoments(m: AlgebraMount): string[] {
  const btn = m.$("#alg-seed-moment") as HTMLButtonElement | null;
  if (!btn) throw new Error("seedMoments: #alg-seed-moment not found (sidebar not mounted?)");
  btn.click();
  return nodeCards(m).map((c) => c.getAttribute("data-id") || "");
}

/**
 * Select node card `i` (a real canvas click → onSelect → renderInspector) and return #alg-inspector.
 * Requires withCanvas + a prior seed. The single-node inspector is where doSolveRadical's
 * "Solve for a variable" action lives.
 */
export function selectNode(m: AlgebraMount, i = 0): HTMLElement {
  const cards = nodeCards(m);
  if (!cards[i]) throw new Error(`selectNode: no card at index ${i} (have ${cards.length})`);
  cards[i].click();
  return m.$("#alg-inspector") as HTMLElement;
}
