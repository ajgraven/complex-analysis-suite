import { beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — Vite `?raw` import returns the file's text; no ambient type in this project.
import indexHtml from "../../app/index.html?raw";

// The QD app BOOTS THE MODULE GRAPH here, in a real browser — the coverage the node/jsdom gate
// structurally cannot give (jsdom has no WebGL2 for `new DomainPlot($('#canvas'))`), which is why
// ui/ui.mjs booted on import with ZERO executable coverage (QD-UI-5, QD-TEST-2). We assemble the
// app's real DOM from index.html's <body>, then import main.mjs (its whole graph → bootQdUi()).
//
// SCOPE (honest): this is the MODULE-GRAPH boot. The <script>s inside the injected markup are inert
// (innerHTML never executes them), so the inline tab-switching + version scripts do NOT run — the
// assembled-page behaviour (tab switching, a real solve) is Stage 2's full-page Playwright harness.
// What this DOES pin: importing the real graph against the real DOM neither throws nor logs an error,
// bootQdUi() runs (its QD_UI hooks register), and #canvas takes a live WebGL2 context.
const bodyInner = (() => {
  const m = /<body[^>]*>([\s\S]*)<\/body>/i.exec(indexHtml);
  if (!m) throw new Error("index.html has no <body>");
  return m[1];
})();

describe("the QD app boots its module graph against the DOM", () => {
  const errors: string[] = [];
  const origError = console.error;

  beforeAll(async () => {
    console.error = (...a: unknown[]) => { errors.push(a.map(String).join(" ")); origError(...a); };
    window.addEventListener("error", (e) => errors.push("window.error: " + e.message));
    window.addEventListener("unhandledrejection", (e) =>
      errors.push("unhandledrejection: " + String((e as PromiseRejectionEvent).reason)));

    // #canvas must exist BEFORE the import so bootQdUi()'s `document.querySelector('#canvas')` guard
    // is true — mirrors index.html, where the static canvas precedes the deferred main.mjs module.
    document.body.innerHTML = bodyInner;
    await import("../../app/main.mjs"); // side-effect: boots bootQdUi()
    await new Promise((r) => setTimeout(r, 0)); // let any microtask boot work settle
  });

  it("registers its QD_UI boot hooks (the inverse of the no-DOM node seam test)", async () => {
    const { QD_UI } = await import("../../app/ui/ui-registry.mjs");
    expect(QD_UI.snapshotScenario, "bootQdUi() must have run").toBeTypeOf("function");
    expect(QD_UI.loadScenarioIntoQdTab).toBeTypeOf("function");
  });

  it("DomainPlot claimed #canvas with a 2D context (a fresh canvas would not)", () => {
    const canvas = document.querySelector<HTMLCanvasElement>("#canvas");
    expect(canvas, "#canvas present").toBeTruthy();
    // DomainPlot does `canvas.getContext('2d')` at construction (ui/ui-domain-plot.mjs:73). A canvas
    // that already holds a 2D context returns null when asked for a *different* mode — so webgl2===null
    // here PROVES the plot initialized on #canvas during boot (an un-booted #canvas would instead hand
    // back a live WebGL2 context, exactly as smoke.browser.test.ts's fresh canvas does).
    expect(canvas!.getContext("webgl2"), "2D-claimed ⇒ DomainPlot ran on boot").toBeNull();
    expect(canvas!.getContext("2d")).toBeInstanceOf(CanvasRenderingContext2D);
  });

  it("has the static tab bar + QD controls panel wired elements", () => {
    expect(document.querySelector("#tab-bar")).toBeTruthy();
    expect(document.querySelectorAll(".tab-btn").length).toBeGreaterThan(0);
    expect(document.querySelector("#controls-qd")).toBeTruthy();
  });

  it("mounts the inverse-tab '?' help buttons at boot (QoL — pins the installQolHelp lift)", () => {
    // installQolHelp (lifted verbatim from mountQolHelp) attaches QD.QoL.attachHelp — a
    // `<button class="help-btn">?</button>` appended INTO each header — to the app intro title and the
    // static inverse-tab card headers. Those headers are touched by NOTHING ELSE (ui-faber/-thesis/
    // -qd-equations attach to their own cards), so asserting on them isolates THIS lift's boot output —
    // a plain `.help-btn` count would stay >0 from those other mounts even if installQolHelp no-op'd.
    expect(document.querySelector(".app-header-row h1 button.help-btn"), "intro '?' on the app title").toBeTruthy();
    expect(document.querySelector("#h-card h2 button.help-btn"), "'?' on the h(w) card").toBeTruthy();
    expect(document.querySelector("#domain-mode-card h2 button.help-btn"), "'?' on the domain-type card").toBeTruthy();
  });

  it("boots with no console.error and no uncaught error/rejection", () => {
    expect(errors, "boot-time errors:\n" + errors.join("\n")).toEqual([]);
  });
});
