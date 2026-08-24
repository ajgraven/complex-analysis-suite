import { describe, it, expect, afterEach } from "vitest";
import { mountCanvas, attachCanvasA11y, type CanvasKeyAction } from "../src/mountCanvas.js";

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

describe("attachCanvasA11y (existing canvas)", () => {
  it("applies the a11y contract to an app-built canvas without replacing it", () => {
    const c = container();
    // An app that lays out its own render+overlay pair (like Faber's gl/ov).
    const stage = document.createElement("div");
    const gl = document.createElement("canvas");
    const ov = document.createElement("canvas");
    stage.append(gl, ov);
    c.appendChild(stage);

    const seen: CanvasKeyAction[] = [];
    const a = attachCanvasA11y(ov, { label: "Domain: f on the unit disk", render: gl, onKey: (k) => seen.push(k) });

    // Same node — not replaced.
    expect(a.overlay).toBe(ov);
    expect(stage.contains(ov)).toBe(true);
    expect(ov.getAttribute("role")).toBe("application");
    expect(ov.tabIndex).toBe(0);
    expect(ov.getAttribute("aria-label")).toBe("Domain: f on the unit disk");
    // The render canvas behind is hidden from the screen reader.
    expect(gl.getAttribute("aria-hidden")).toBe("true");
    // Live region lands in the overlay's parent by default.
    expect(stage.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull();

    // Keyboard is wired.
    press(ov, "ArrowUp");
    press(ov, "-");
    expect(seen).toEqual([
      { kind: "pan", dx: 0, dy: -1 },
      { kind: "zoom", direction: -1 },
    ]);

    a.announce("recomputed");
    expect(stage.querySelector('[role="status"]')?.textContent).toBe("recomputed");
  });

  it('role:"img" names a static visualization without making it focusable or keyboard-driven', () => {
    const c = container();
    const cv = document.createElement("canvas");
    c.appendChild(cv);
    const seen: CanvasKeyAction[] = [];
    const a = attachCanvasA11y(cv, {
      label: "The deltoid Schwarz reflection σ — escape-time field",
      role: "img",
      onKey: (k) => seen.push(k), // ignored in img mode
    });
    expect(cv.getAttribute("role")).toBe("img");
    expect(cv.getAttribute("aria-label")).toBe("The deltoid Schwarz reflection σ — escape-time field");
    expect(cv.hasAttribute("tabindex")).toBe(false); // not focusable
    press(cv, "ArrowRight");
    expect(seen).toHaveLength(0); // no keyboard wired
    // announce still works (a static view may re-render and want to notify).
    a.announce("recomputed");
    expect(c.querySelector('[role="status"]')?.textContent).toBe("recomputed");
  });

  it('role:"application" without onKey names + focuses but adds no key listener (app owns keyboard)', () => {
    const c = container();
    const cv = document.createElement("canvas");
    c.appendChild(cv);
    // The app's own keydown handler — must be the only one that fires.
    const appKeys: string[] = [];
    cv.addEventListener("keydown", (e) => appKeys.push(e.key));
    const a = attachCanvasA11y(cv, { label: "plot view (app-driven keyboard)" }); // role defaults to application
    expect(cv.getAttribute("role")).toBe("application");
    expect(cv.tabIndex).toBe(0);
    press(cv, "ArrowRight");
    expect(appKeys).toEqual(["ArrowRight"]); // reached the app; our layer added nothing that swallowed it
    a.destroy();
  });

  it("names a canvas not yet attached to the DOM (live region falls back to body)", () => {
    const cv = document.createElement("canvas"); // detached
    const a = attachCanvasA11y(cv, { label: "detached view", role: "img" });
    expect(cv.getAttribute("role")).toBe("img");
    expect(cv.querySelector("*")).toBeNull(); // never appended a child INTO the canvas
    expect(document.body.querySelector('[role="status"]')).not.toBeNull();
    a.destroy();
    expect(document.body.querySelector('[role="status"]')).toBeNull();
  });

  it("destroy reverts what it added and stops handling keys", () => {
    const c = container();
    const ov = document.createElement("canvas");
    c.appendChild(ov);
    const seen: CanvasKeyAction[] = [];
    const a = attachCanvasA11y(ov, { label: "x", onKey: (k) => seen.push(k) });
    expect(ov.tabIndex).toBe(0);
    a.destroy();
    expect(ov.getAttribute("role")).toBeNull();
    expect(ov.getAttribute("aria-label")).toBeNull();
    expect(ov.hasAttribute("tabindex")).toBe(false); // reversed exactly what it added
    expect(c.querySelector('[role="status"]')).toBeNull();
    press(ov, "ArrowRight");
    expect(seen).toHaveLength(0);
  });
});
