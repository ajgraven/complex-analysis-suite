// @vitest-environment jsdom
//
// DomainPlot double-click → add-pole (jsdom). Migrated from app/test/ui-domain-plot.test.js at the
// Phase-2 flip: instead of W.eval-ing the classic ui-domain-plot.js in a hand-built JSDOM window,
// it imports the ESM twin (which attaches QD_UI.installDomainPlot onto the ui-registry) and drives
// the same interactions in Vitest's jsdom environment. Same assertions as the classic test.
import { describe, it, expect, vi } from "vitest";
import { QD_UI } from "../app/ui-registry.mjs";
import "../app/ui-domain-plot.mjs"; // side effect: QD_UI.installDomainPlot

describe("DomainPlot double-click → add-pole (jsdom)", () => {
  it("loads, fires onAddPole on empty dblclick, ignores on-pole, and setLivePole moves/guards", () => {
    document.body.innerHTML =
      '<button class="tab-btn active" data-tab="qd"></button><canvas id="c"></canvas>';
    const DP: any = QD_UI.installDomainPlot({
      state: { poles: [], viewMode: "inverse" },
      modeDescriptor: () => ({}),
      formatTick: (v: number) => String(v),
      sub: (n: number) => String(n),
    });
    expect(typeof DP).toBe("function");
    DP.prototype.render = function () {}; // jsdom has no 2D ctx — stub drawing

    const canvas = document.getElementById("c") as HTMLCanvasElement;
    const plot: any = new DP(canvas, { textContent: "" });
    plot.setData({ poles: [{ re: 0.5, im: -0.5 }], boundaryPts: [] });

    // (1) dblclick empty space → onAddPole(w === toWorld(click))
    let added: any = null;
    plot.onAddPole = (w: any) => { added = w; };
    canvas.dispatchEvent(new MouseEvent("dblclick", { clientX: 5, clientY: 5, bubbles: true, cancelable: true }));
    const want = plot.toWorld(5, 5);
    expect(added).not.toBeNull();
    expect(Math.abs(added.re - want.re)).toBeLessThan(1e-9);
    expect(Math.abs(added.im - want.im)).toBeLessThan(1e-9);

    // (2) dblclick ON the existing pole dot → ignored
    added = null;
    const sp = plot.toScreen(0.5, -0.5);
    canvas.dispatchEvent(new MouseEvent("dblclick", { clientX: sp.x, clientY: sp.y, bubbles: true, cancelable: true }));
    expect(added).toBeNull();

    // (3) setLivePole moves in place, no-ops out-of-range + on null data
    plot.setLivePole(0, { re: 1.25, im: -0.75 });
    expect(plot.data.poles[0].re).toBe(1.25);
    expect(plot.data.poles[0].im).toBe(-0.75);
    plot.setLivePole(5, { re: 9, im: 9 });
    expect(plot.data.poles.length).toBe(1);
    expect(plot.data.poles[0].re).toBe(1.25);
    const saved = plot.data;
    plot.data = null;
    expect(() => plot.setLivePole(0, { re: 0, im: 0 })).not.toThrow();
    plot.data = saved;
  });

  it("debounces onViewChange and only fires when a callback is set", () => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML =
        '<button class="tab-btn active" data-tab="qd"></button><canvas id="c2"></canvas>';
      const DP: any = QD_UI.installDomainPlot({
        state: { poles: [], viewMode: "inverse" },
        modeDescriptor: () => ({}),
        formatTick: (v: number) => String(v),
        sub: (n: number) => String(n),
      });
      DP.prototype.render = function () {}; // jsdom has no 2D ctx
      const plot: any = new DP(document.getElementById("c2"), { textContent: "" });
      // No callback set → no throw, no fire.
      expect(() => plot._notifyViewChange()).not.toThrow();
      vi.advanceTimersByTime(300);
      let fired = 0;
      plot.onViewChange = () => { fired++; };
      plot._notifyViewChange();
      plot._notifyViewChange(); // burst → coalesced into one
      expect(fired).toBe(0);    // debounced — nothing yet
      vi.advanceTimersByTime(300);
      expect(fired).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
