import { describe, it, expect, afterEach } from "vitest";
import { mountCanvas, type CanvasKeyAction } from "../src/mountCanvas.js";

// jsdom. Asserts the CD accessibility contract the mount ports: an aria-hidden render canvas beneath a
// focusable role=application overlay carrying the aria-label, a keyboard map → actions, and a live region.

let host: HTMLElement | null = null;
function container(): HTMLElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  return host;
}
afterEach(() => {
  host?.remove();
  host = null;
});

function press(el: HTMLElement, key: string): void {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

describe("mountCanvas", () => {
  it("builds the accessible overlay contract", () => {
    const m = mountCanvas(container(), { label: "Parameter space — arrows pan, +/− zoom" });
    expect(m.render.getAttribute("aria-hidden")).toBe("true");
    expect(m.overlay).not.toBe(m.render);
    expect(m.overlay.getAttribute("role")).toBe("application");
    expect(m.overlay.tabIndex).toBe(0);
    expect(m.overlay.getAttribute("aria-label")).toBe("Parameter space — arrows pan, +/− zoom");
    // A polite live region exists for announce().
    const status = m.root.querySelector('[role="status"]');
    expect(status?.getAttribute("aria-live")).toBe("polite");
  });

  it("overlay:false yields a single focusable canvas", () => {
    const m = mountCanvas(container(), { label: "single surface", overlay: false });
    expect(m.overlay).toBe(m.render);
    expect(m.render.getAttribute("role")).toBe("application");
    expect(m.render.getAttribute("aria-hidden")).toBeNull();
  });

  it("maps arrows / ± / Enter to actions", () => {
    const seen: CanvasKeyAction[] = [];
    const m = mountCanvas(container(), { label: "x", onKey: (a) => seen.push(a) });
    press(m.overlay, "ArrowRight");
    press(m.overlay, "ArrowUp");
    press(m.overlay, "+");
    press(m.overlay, "-");
    press(m.overlay, "Enter");
    expect(seen).toEqual([
      { kind: "pan", dx: 1, dy: 0 },
      { kind: "pan", dx: 0, dy: -1 },
      { kind: "zoom", direction: 1 },
      { kind: "zoom", direction: -1 },
      { kind: "commit" },
    ]);
  });

  it("ignores unmapped keys and announces into the live region", () => {
    const seen: CanvasKeyAction[] = [];
    const m = mountCanvas(container(), { label: "x", onKey: (a) => seen.push(a) });
    press(m.overlay, "q");
    expect(seen).toHaveLength(0);
    m.announce("recompute done");
    expect(m.root.querySelector('[role="status"]')?.textContent).toBe("recompute done");
  });

  it("destroy removes the DOM and stops handling keys", () => {
    const seen: CanvasKeyAction[] = [];
    const c = container();
    const m = mountCanvas(c, { label: "x", onKey: (a) => seen.push(a) });
    const overlay = m.overlay;
    m.destroy();
    expect(c.querySelector(".cas-canvas")).toBeNull();
    press(overlay, "ArrowRight");
    expect(seen).toHaveLength(0);
  });
});
