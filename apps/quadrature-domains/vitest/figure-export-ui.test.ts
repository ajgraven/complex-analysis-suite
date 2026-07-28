// @vitest-environment jsdom
//
// Figure & export card (ui-figure-export.mjs) + the DomainPlot palette / gates /
// export-render it drives (ui-domain-plot.mjs). Two halves:
//
//  1. The DomainPlot resolver + gate helpers, exercised on the installed class
//     prototype WITHOUT a real canvas (they read the closure `state.figure`, not
//     `this`) — this pins the "defaults == the pre-card literals" invariant that
//     keeps the palette refactor byte-identical, the honest-labelling rule that a
//     boundary recolour applies to a UNIVALENT boundary only, and the element
//     gates. renderToCanvas is checked for its off-screen size (jsdom has no 2D
//     context, so it returns the sized canvas before drawing — enough to assert
//     the backing-store dimensions; the pixels themselves are browser-verified).
//
//  2. The card wiring: a checkbox → state.figure flag → repaint, the boundary
//     colour/width controls, the univalence note, and the export size math. The
//     actual toBlob → download is NOT exercised here (browser-verified); the mock
//     plot records the renderToCanvas call so the size + transparent flag are
//     asserted.
import { describe, it, expect, beforeEach } from "vitest";
import { QD_UI } from "../app/ui-registry.mjs";
import "../app/ui-domain-plot.mjs"; // side effect: QD_UI.installDomainPlot
import "../app/ui-figure-export.mjs"; // side effect: QD_UI.installFigureExport

const REG: any = QD_UI as any;

// Install DomainPlot with a controlled closure `state`, then build a bare object
// on its prototype: the resolver/gate helpers read the closure `state.figure`,
// so this drives them without constructing a real (canvas-backed) plot.
function proto(figure: any) {
  const DP: any = REG.installDomainPlot({
    state: { figure },
    modeDescriptor: () => ({}),
    formatTick: (v: number) => String(v),
    sub: (n: number) => String(n),
  });
  return Object.create(DP.prototype);
}

describe("DomainPlot figure palette + gates", () => {
  it("palette defaults equal the pre-card literals (byte-identical render)", () => {
    const p = proto({});
    expect(p._pal("bg")).toBe("#fafafa");
    expect(p._pal("grid")).toBe("#e8eaef");
    expect(p._pal("gridLabel")).toBe("#777");
    expect(p._pal("axis")).toBe("#bbb");
    expect(p._pal("boundaryUnivalent")).toBe("#1a3e7a");
    expect(p._pal("boundaryNonUnivalent")).toBe("#b53030");
    expect(p._pal("fillBoundedUnivalent")).toBe("rgba(86, 119, 168, 0.16)");
    expect(p._pal("fillUnboundedUnivalent")).toBe("rgba(180, 195, 220, 0.45)");
    expect(p._pal("boundaryWidthBounded")).toBe(1.6);
    expect(p._pal("boundaryWidthUnbounded")).toBe(1.8);
    // No `figure` block at all (a mock state) still resolves to defaults.
    expect(proto(undefined)._pal("bg")).toBe("#fafafa");
  });

  it("boundary colour overrides the univalent stroke only; non-univalent stays red", () => {
    const p = proto({ boundaryColor: "#000000" });
    expect(p._boundaryStroke()).toBe("#000000");
    // The warning red is a validity signal, never touched by the override.
    expect(p._pal("boundaryNonUnivalent")).toBe("#b53030");
    // Univalent fill derives a tint of the override at the default alpha.
    expect(p._boundaryFill("fillBoundedUnivalent", "fillAlphaBounded")).toBe("rgba(0, 0, 0, 0.16)");
    // No override → the default blue + default tint.
    const q = proto({});
    expect(q._boundaryStroke()).toBe("#1a3e7a");
    expect(q._boundaryFill("fillBoundedUnivalent", "fillAlphaBounded")).toBe("rgba(86, 119, 168, 0.16)");
  });

  it("_hexToRgba parses #rgb / #rrggbb and passes non-hex through", () => {
    const p = proto({});
    expect(p._hexToRgba("#ff8800", 0.5)).toBe("rgba(255, 136, 0, 0.5)");
    expect(p._hexToRgba("#f80", 0.5)).toBe("rgba(255, 136, 0, 0.5)");
    expect(p._hexToRgba("rgba(1,2,3,0.4)", 0.5)).toBe("rgba(1,2,3,0.4)");
    expect(p._hexToRgba("not-a-colour", 0.5)).toBe("not-a-colour");
  });

  it("boundary width override applies (positive only), else family default", () => {
    expect(proto({ boundaryWidth: 3 })._boundaryWidth("boundaryWidthBounded")).toBe(3);
    expect(proto({})._boundaryWidth("boundaryWidthBounded")).toBe(1.6);
    expect(proto({ boundaryWidth: 0 })._boundaryWidth("boundaryWidthBounded")).toBe(1.6);
    expect(proto({ boundaryWidth: -2 })._boundaryWidth("boundaryWidthUnbounded")).toBe(1.8);
  });

  it("element gates are default-on and trip only on explicit false", () => {
    expect(proto({})._show("showAxes")).toBe(true);
    expect(proto(undefined)._show("showGrid")).toBe(true);
    expect(proto({ showAxes: false })._show("showAxes")).toBe(false);
    expect(proto({})._hideOverlays()).toBe(false);
    expect(proto({ hideOverlays: true })._hideOverlays()).toBe(true);
  });

  it("renderToCanvas builds an off-screen canvas at the requested size (or null unsized)", () => {
    const p = proto({});
    p.cssW = 400;
    p.cssH = 300;
    const off = p.renderToCanvas(800, 600, {});
    expect(off).toBeTruthy();
    expect(off.width).toBe(800);
    expect(off.height).toBe(600);
    // No live size → cannot export → null.
    expect(proto({}).renderToCanvas(100, 100, {})).toBeNull();
  });
});

describe("Figure card wiring (jsdom)", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <section id="figure-export-card">
        <select id="fig-preset"><option value="default" selected>d</option><option value="publication">p</option><option value="print">pr</option><option value="dark">dk</option><option value="grayscale">g</option><option value="colorblind">cb</option></select>
        <input type="checkbox" id="fig-axes" checked>
        <input type="checkbox" id="fig-grid" checked>
        <input type="checkbox" id="fig-ticks" checked>
        <input type="checkbox" id="fig-fill" checked>
        <input type="checkbox" id="fig-nodes" checked>
        <input type="checkbox" id="fig-w0" checked>
        <input type="checkbox" id="fig-cusps" checked>
        <input type="checkbox" id="fig-hide-overlays">
        <label><input type="checkbox" id="fig-boundary-custom">
          <input type="color" id="fig-boundary-color" value="#1a3e7a" disabled></label>
        <input type="number" id="fig-boundary-width">
        <div class="fig-status" id="fig-univalence-note" data-kind="muted"></div>
        <input type="color" id="fig-color-bg" value="#fafafa">
        <input type="color" id="fig-color-grid" value="#e8eaef">
        <input type="color" id="fig-color-axis" value="#bbbbbb">
        <button id="fig-colors-reset"></button>
        <select id="fig-export-scale"><option value="1">1</option><option value="2" selected>2</option><option value="4">4</option></select>
        <input type="number" id="fig-export-width">
        <select id="fig-export-bg"><option value="white" selected>white</option><option value="transparent">transparent</option></select>
        <button id="fig-export-png"></button>
        <button id="fig-copy-image"></button>
        <span class="fig-status" id="fig-copy-status" data-kind="muted"></span>
      </section>`;
  });

  // A mock plot that records renderToCanvas calls (the download itself is
  // browser-verified, so toBlob is a no-op here).
  function makeUi(figure: any, plotData: any) {
    let renders = 0;
    let urlWrites = 0;
    const plot: any = {
      cssW: 400,
      cssH: 300,
      data: plotData,
      render: () => { renders++; },
      renderToCanvas: (...args: any[]) => { plot._lastArgs = args; return { width: args[0], height: args[1], toBlob: () => {} }; },
      get renders() { return renders; },
    };
    const state: any = { figure };
    const ui: any = { state, $: (s: string) => document.querySelector(s), plot, writeUrlState: () => { urlWrites++; } };
    return { ui, state, plot, urlWrites: () => urlWrites };
  }

  it("an element checkbox drives its state.figure flag, repaints, and refreshes the link", () => {
    const { ui, state, plot, urlWrites } = makeUi({}, { boundaryPts: [{ re: 0, im: 0 }], univalent: true });
    REG.installFigureExport(ui);
    const before = plot.renders;
    const beforeUrl = urlWrites();
    const axes = document.getElementById("fig-axes") as HTMLInputElement;
    axes.checked = false;
    axes.dispatchEvent(new Event("change"));
    expect(state.figure.showAxes).toBe(false);
    expect(plot.renders).toBe(before + 1);
    expect(urlWrites()).toBe(beforeUrl + 1); // a figure change makes it into a copied link
    // hide-overlays: checked === hidden (no inversion).
    const hide = document.getElementById("fig-hide-overlays") as HTMLInputElement;
    hide.checked = true;
    hide.dispatchEvent(new Event("change"));
    expect(state.figure.hideOverlays).toBe(true);
  });

  it("custom-colour checkbox toggles the boundaryColor override and the picker", () => {
    const { ui, state } = makeUi({}, null);
    REG.installFigureExport(ui);
    const cb = document.getElementById("fig-boundary-custom") as HTMLInputElement;
    const color = document.getElementById("fig-boundary-color") as HTMLInputElement;
    expect(color.disabled).toBe(true);
    cb.checked = true;
    cb.dispatchEvent(new Event("change"));
    expect(state.figure.boundaryColor).toBe("#1a3e7a");
    expect(color.disabled).toBe(false);
    cb.checked = false;
    cb.dispatchEvent(new Event("change"));
    expect(state.figure.boundaryColor).toBeNull();
    expect(color.disabled).toBe(true);
  });

  it("width input sets a positive override and clears on empty", () => {
    const { ui, state } = makeUi({}, null);
    REG.installFigureExport(ui);
    const w = document.getElementById("fig-boundary-width") as HTMLInputElement;
    w.value = "2.5";
    w.dispatchEvent(new Event("input"));
    expect(state.figure.boundaryWidth).toBe(2.5);
    w.value = "";
    w.dispatchEvent(new Event("input"));
    expect(state.figure.boundaryWidth).toBeNull();
  });

  it("univalence note tells the truth about the drawn boundary", () => {
    // non-univalent
    REG.installFigureExport(makeUi({}, { boundaryPts: [{ re: 0, im: 0 }], univalent: false }).ui);
    let note = document.getElementById("fig-univalence-note") as HTMLElement;
    expect(note.dataset.kind).toBe("warn");
    expect((note.textContent || "").toLowerCase()).toContain("non-univalent");
    // univalent
    REG.installFigureExport(makeUi({}, { boundaryPts: [{ re: 0, im: 0 }], univalent: true }).ui);
    note = document.getElementById("fig-univalence-note") as HTMLElement;
    expect(note.dataset.kind).toBe("ok");
    // no solved boundary
    REG.installFigureExport(makeUi({}, null).ui);
    note = document.getElementById("fig-univalence-note") as HTMLElement;
    expect(note.dataset.kind).toBe("muted");
  });

  it("export computes the target size from the scale select", () => {
    const { ui, plot } = makeUi({}, { boundaryPts: [{ re: 0, im: 0 }], univalent: true });
    REG.installFigureExport(ui);
    (document.getElementById("fig-export-scale") as HTMLSelectElement).value = "4";
    document.getElementById("fig-export-png")!.dispatchEvent(new Event("click"));
    expect(plot._lastArgs[0]).toBe(1600); // 400 · 4
    expect(plot._lastArgs[1]).toBe(1200); // 300 · 4
    expect(plot._lastArgs[2]).toEqual({ transparent: false });
  });

  it("export honours a custom width and a transparent background", () => {
    const { ui, plot } = makeUi({}, { boundaryPts: [{ re: 0, im: 0 }], univalent: true });
    REG.installFigureExport(ui);
    (document.getElementById("fig-export-width") as HTMLInputElement).value = "1000";
    (document.getElementById("fig-export-bg") as HTMLSelectElement).value = "transparent";
    document.getElementById("fig-export-png")!.dispatchEvent(new Event("click"));
    expect(plot._lastArgs[0]).toBe(1000);
    expect(plot._lastArgs[1]).toBe(750); // 300 · (1000/400)
    expect(plot._lastArgs[2]).toEqual({ transparent: true });
  });

  it("colour pickers write state.figure and Reset colours clears them", () => {
    const { ui, state } = makeUi({}, null);
    REG.installFigureExport(ui);
    const bg = document.getElementById("fig-color-bg") as HTMLInputElement;
    bg.value = "#123456";
    bg.dispatchEvent(new Event("input"));
    expect(state.figure.bg).toBe("#123456");
    // seed a couple more overrides, then reset
    state.figure.grid = "#010203";
    state.figure.boundaryColor = "#ff0000";
    document.getElementById("fig-colors-reset")!.dispatchEvent(new Event("click"));
    expect(state.figure.bg).toBeNull();
    expect(state.figure.grid).toBeNull();
    expect(state.figure.boundaryColor).toBeNull();
    expect(bg.value).toBe("#fafafa"); // picker reflected back to its default
  });

  it("a preset applies a state.figure bundle and reflects onto the controls", () => {
    const { ui, state } = makeUi({}, null);
    REG.installFigureExport(ui);
    const sel = document.getElementById("fig-preset") as HTMLSelectElement;
    sel.value = "print";
    sel.dispatchEvent(new Event("change"));
    expect(state.figure.showFill).toBe(false);
    expect(state.figure.hideOverlays).toBe(true);
    expect(state.figure.boundaryColor).toBe("#000000");
    expect(state.figure.bg).toBe("#ffffff");
    // reflected onto the controls
    expect((document.getElementById("fig-fill") as HTMLInputElement).checked).toBe(false);
    expect((document.getElementById("fig-color-bg") as HTMLInputElement).value).toBe("#ffffff");
    expect((document.getElementById("fig-boundary-custom") as HTMLInputElement).checked).toBe(true);
    // Default clears every override back to the app look.
    sel.value = "default";
    sel.dispatchEvent(new Event("change"));
    expect(state.figure.showFill).toBe(true);
    expect(state.figure.boundaryColor).toBeNull();
    expect(state.figure.bg).toBeNull();
    expect((document.getElementById("fig-fill") as HTMLInputElement).checked).toBe(true);
  });

  it("Copy image writes an image/png ClipboardItem at the export size", () => {
    const writes: any[] = [];
    Object.defineProperty(globalThis, "ClipboardItem", {
      configurable: true, writable: true,
      value: class { data: any; constructor(d: any) { this.data = d; } },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write: (arr: any) => { writes.push(arr); return Promise.resolve(); } },
    });
    const { ui, plot } = makeUi({}, { boundaryPts: [{ re: 0, im: 0 }], univalent: true });
    REG.installFigureExport(ui);
    document.getElementById("fig-copy-image")!.dispatchEvent(new Event("click"));
    expect(plot._lastArgs[0]).toBe(800); // 400 · 2× default → same size the export would use
    expect(writes.length).toBe(1);
    expect(Object.keys(writes[0][0].data)[0]).toBe("image/png");
  });

  it("DEFAULT_FIGURE keys stay in sync with state.figure", async () => {
    const api = REG.installFigureExport(makeUi({}, null).ui);
    const stateMod: any = await import("../app/ui-state.mjs");
    expect(Object.keys(api.DEFAULT_FIGURE).sort()).toEqual(Object.keys(stateMod.state.figure).sort());
  });
});
