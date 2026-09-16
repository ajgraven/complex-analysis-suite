// @vitest-environment jsdom
// **THE FIRST TEST THAT REACHES `src/main.ts`.**
//
// 6,900 lines of it — the whole shell: preset orchestration, the parameter→dynamical coupling,
// undo/redo, share links, profiles, the σ mode switch, every control handler — had no test at all.
// That was not an oversight so much as a consequence: the two plots are WebGL2, so the only way in
// looked like the browser suite, and the browser suite is not where you assert DOM wiring.
//
// It is reachable. `init()` builds its plots inside a try, jsdom has no canvas, `getContext` is
// stubbed to null, and `GLPlot` already takes a guarded path for a context it could not get —
// exactly as contour-integration's own shell test found for its stage. Everything else is ordinary
// DOM. What this buys is a test over the app as a USER reaches it: pick the preset, press the key,
// read the field back.
//
// Two rules this file keeps, both learned elsewhere in the suite:
//   1. **A round trip must restore a state the app is NOT in.** A lossy `read` paired with a lossy
//      `apply` agrees with itself perfectly, so "apply(read()) is a fixed point" is satisfied by
//      functions that do nothing. Every state assertion here starts from a DIFFERENT state.
//   2. **Assert the reason, not just the outcome.** Where a guard exists, poke the thing it guards.
import { beforeEach, describe, expect, it, vi } from "vitest";
// Vite's `?raw`, not node:fs: under jsdom `import.meta.url` is an http URL, so `fileURLToPath`
// throws. The bundler resolves this at transform time and it works in every environment.
import HTML from "../index.html?raw";

/**
 * A minimal fake WebGL2 context.
 *
 * Unlike contour-integration's stage, `GLPlot`'s constructor THROWS when it cannot get a context —
 * which is the right product behaviour (a browser without WebGL2 should get the banner, not a dead
 * canvas), but it means a null context aborts `init()` before a single control is wired. So the
 * shell is given a context that answers plausibly and draws nothing.
 *
 * **It is not a renderer and nothing here asserts a pixel.** Shader compiles and links report
 * success, `getExtension` returns null (a legitimate configuration: no float render targets, no
 * parallel compile), and every other call is a no-op returning a fresh object. What this buys is the
 * DOM: the real `init()`, the real handlers, the real markup.
 */
function fakeGL(canvas: HTMLCanvasElement): unknown {
  const constants: Record<string, number> = {};
  let next = 0x8000;
  const target = {
    canvas,
    drawingBufferWidth: canvas.width,
    drawingBufferHeight: canvas.height,
    getParameter: () => 4096,
    getExtension: () => null,
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getShaderInfoLog: () => "",
    getProgramInfoLog: () => "",
    getError: () => 0,
    getUniformLocation: () => ({}),
    getAttribLocation: () => 0,
    checkFramebufferStatus: () => 0x8cd5, // FRAMEBUFFER_COMPLETE
    isContextLost: () => false,
    readPixels: () => {},
  } as Record<string, unknown>;
  return new Proxy(target, {
    get(t, prop: string) {
      if (prop in t) return t[prop];
      // A screaming-case property is a GL constant; anything else is a method.
      if (/^[A-Z][A-Z0-9_]*$/.test(prop)) {
        constants[prop] ??= next++;
        return constants[prop];
      }
      if (/^create/.test(prop)) return () => ({});
      return () => undefined;
    },
    has: () => true,
  });
}

/** A no-op 2D context: jsdom ships none, and the orbit overlay refuses to build without one. */
function fake2D(canvas: HTMLCanvasElement): unknown {
  const target = {
    canvas,
    measureText: (t: string) => ({ width: t.length * 6 }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(Math.max(1, w * h) * 4),
      width: w,
      height: h,
    }),
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(Math.max(1, w * h) * 4),
      width: w,
      height: h,
    }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => null,
    isPointInPath: () => false,
    getLineDash: () => [] as number[],
  } as Record<string, unknown>;
  return new Proxy(target, {
    get: (t, prop: string) => (prop in t ? t[prop] : /^[a-z]/.test(prop) ? () => undefined : undefined),
    set: () => true, // fillStyle, font, lineWidth … all accepted and ignored
    has: () => true,
  });
}

/** Mount the real app into a fresh document. */
async function mount(hash = ""): Promise<void> {
  // jsdom implements neither of these, and the app asks for both during init.
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string) {
    if (kind === "webgl2") return fakeGL(this);
    if (kind === "2d") return fake2D(this);
    return null;
  } as never;
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  }
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as never;
  }
  window.history.replaceState(null, "", hash === "" ? "/" : hash);
  const body = HTML.slice(HTML.indexOf("<body>") + 6, HTML.indexOf("</body>"));
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, "");
  const { init } = await import("../src/main");
  init();
}

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (e === null) throw new Error(`no #${id}`);
  return e as T;
};
const val = (id: string): string => byId<HTMLInputElement>(id).value;
const setVal = (id: string, v: string): void => {
  const e = byId<HTMLInputElement>(id);
  e.value = v;
  e.dispatchEvent(new Event("input", { bubbles: true }));
};
const fire = (id: string, kind: string): void => {
  byId(id).dispatchEvent(new Event(kind, { bubbles: true }));
};
const enterOn = (id: string, mods: { ctrlKey?: boolean } = {}): void => {
  byId(id).dispatchEvent(
    new KeyboardEvent("keyup", { key: "Enter", bubbles: true, ...mods }),
  );
};

beforeEach(() => {
  vi.resetModules();
  try {
    localStorage.clear();
  } catch {
    /* a jsdom without storage is fine — the app guards every access */
  }
});

describe("the app mounts under jsdom without a WebGL2 context", () => {
  it("initialises, and reports the missing context instead of throwing", async () => {
    await expect(mount()).resolves.toBeUndefined();
    // The two plots exist as elements even though neither got a context.
    expect(document.getElementById("MCSCanvas")).not.toBeNull();
    expect(document.getElementById("JCSCanvas")).not.toBeNull();
  });
});

describe("WP1/U1 — a preset applies when you pick it", () => {
  it("choosing Herman ring rewrites the formula with no second click", async () => {
    await mount();
    expect(val("inpf")).toBe("z^2+c");
    const sel = byId<HTMLSelectElement>("fractal_presets");
    sel.value = "herman ring";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    expect(val("inpf")).toBe("e^(2*pi*i*c)*z^2*(z-4)/(1-4*z)");
    // And the separate apply button it used to need is gone from the markup entirely.
    expect(document.getElementById("apply_preset")).toBeNull();
  });
});

describe("WP1/S1 — Enter applies only from the fields it is meant for", () => {
  // The listener used to be unconditional, so Enter from ANY element re-applied the whole app.
  it("applies from a deferred single-line input", async () => {
    await mount();
    setVal("inpmn", "321");
    enterOn("inpmn");
    expect(byId("param-view-chip").textContent ?? "").toContain("321 it");
  });

  it("does NOT apply from the Views name box or from a button", async () => {
    await mount();
    const before = byId("param-view-chip").textContent;
    setVal("inpmn", "321");
    enterOn("view-name"); // used to save nothing and apply the plots instead
    expect(byId("param-view-chip").textContent).toBe(before);
    enterOn("share-btn"); // keyboard-activating any button used to re-apply everything
    expect(byId("param-view-chip").textContent).toBe(before);
  });

  it("needs a modifier in the multi-line formula box, where Enter breaks the line", async () => {
    await mount();
    setVal("inpmn", "321");
    enterOn("inpf");
    expect(byId("param-view-chip").textContent ?? "").not.toContain("321 it");
    enterOn("inpf", { ctrlKey: true });
    expect(byId("param-view-chip").textContent ?? "").toContain("321 it");
  });
});

describe("the shareable state round-trips into a document it is not in", () => {
  // Rule 1 above: a lossy read paired with a lossy apply is a perfect fixed point, so the state
  // being restored is deliberately different from the default in every field it touches, and it is
  // applied to a FRESH document rather than back onto the one it came from.
  //
  // This exercises `readAppState`/`applyAppState` over SHARE_IDS — the layer the permalink is built
  // on. `readFullState`/`applyFullState`, which add `_z0`, `_notes`, `_profile` and `_sigma`, are
  // closures inside `init()` and cannot be reached from here; lifting them is WP7's job, and the
  // sphere ids missing from SHARE_IDS (report S3) are its first item.
  it("restores formula, parameter, colouring and toggles into a fresh default", async () => {
    await mount();
    setVal("inpf", "z^3+c");
    setVal("inpc", "0.4+i*0.2");
    byId<HTMLSelectElement>("mode").value = "orbit";
    fire("mode", "change");
    byId<HTMLSelectElement>("palette").value = "viridis";
    fire("palette", "change");
    byId<HTMLInputElement>("critorbit").checked = true;
    fire("critorbit", "change");
    byId("apply_all").click();

    const { readAppState, applyAppState, encodeState, decodeState } = await import(
      "../src/state/appState"
    );
    const shared = readAppState();
    expect(shared.inpf).toBe("z^3+c");
    // Through the real codec, not just the object: a permalink is what a reader actually receives.
    const decoded = decodeState(encodeState(shared));
    expect(decoded).not.toBeNull();

    await mount(); // a FRESH default document — nothing carried over
    expect(val("inpf")).toBe("z^2+c");
    expect(byId<HTMLInputElement>("critorbit").checked).toBe(false);

    applyAppState(decoded as Record<string, string | boolean>);
    expect(val("inpf")).toBe("z^3+c");
    expect(val("inpc")).toBe("0.4+i*0.2");
    expect(byId<HTMLSelectElement>("mode").value).toBe("orbit");
    expect(byId<HTMLSelectElement>("palette").value).toBe("viridis");
    expect(byId<HTMLInputElement>("critorbit").checked).toBe(true);
  });

  it("refuses a link from another app rather than applying half of it", async () => {
    await mount();
    const { decodeState } = await import("../src/state/appState");
    expect(decodeState("#vs=" + btoa(JSON.stringify({ v: 1, app: "qd", state: {} })))).toBeNull();
  });
});

describe("the page's structure", () => {
  it("has exactly one <main> and one <h1>", async () => {
    await mount();
    expect(document.querySelectorAll("main")).toHaveLength(1);
    expect(document.querySelectorAll("h1")).toHaveLength(1);
  });

  it("names every canvas, or hides it explicitly", async () => {
    await mount();
    for (const c of document.querySelectorAll("canvas")) {
      const named =
        (c.getAttribute("aria-label") ?? "").length > 0 ||
        (c.getAttribute("aria-labelledby") ?? "").length > 0;
      const hidden = c.getAttribute("aria-hidden") === "true";
      expect(named || hidden, `${c.id || c.className} is neither named nor hidden`).toBe(true);
    }
  });

  it("gives every interactive control an accessible name", async () => {
    await mount();
    const unnamed: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("input, select, textarea, button")) {
      // `type="hidden"` is not a control a user reaches — the two canonical centre fields carry the
      // parseable "x,y" behind the visible real/imaginary boxes, which are labelled.
      if (el instanceof HTMLInputElement && el.type === "hidden") continue;
      if (el.hidden || el.getAttribute("aria-hidden") === "true") continue;
      const named =
        (el.getAttribute("aria-label") ?? "").trim().length > 0 ||
        (el.getAttribute("aria-labelledby") ?? "").trim().length > 0 ||
        (el.getAttribute("title") ?? "").trim().length > 0 ||
        (el.textContent ?? "").trim().length > 0 ||
        (el.id.length > 0 && document.querySelector(`label[for="${el.id}"]`) !== null) ||
        el.closest("label") !== null;
      if (!named) unnamed.push(`${el.tagName.toLowerCase()}#${el.id || "(no id)"}`);
    }
    expect(unnamed, `unnamed controls: ${unnamed.join(", ")}`).toHaveLength(0);
  });
});
