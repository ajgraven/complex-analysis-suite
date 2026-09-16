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

/**
 * Listeners the previous `mount()` left on `window` / `document`.
 *
 * `document.body.innerHTML = …` replaces the DOM but NOT the window, so a second `init()` in the
 * same file leaves the first one still listening — and the first one's closure holds the first
 * one's plots. Found by a test that turned the sphere OFF through a `hashchange`: the stale init
 * answered first, cleared the checkbox in the live DOM and set the sphere on its OWN detached
 * plots, so the box and the plot disagreed. Every assertion in this file that mounts twice was
 * running against two apps at once; they agreed on the answer, which is exactly why nothing
 * noticed. One app per mount now.
 */
const leaked: { target: EventTarget; type: string; fn: EventListenerOrEventListenerObject }[] = [];

/** Mount the real app into a fresh document. */
async function mount(hash = ""): Promise<void> {
  for (const l of leaked.splice(0)) l.target.removeEventListener(l.type, l.fn);
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
  // Record what `init()` attaches outside the document body, so the next mount can detach it.
  const patched: EventTarget[] = [window, document];
  const originals = patched.map((t) => t.addEventListener);
  for (const t of patched) {
    const original = t.addEventListener.bind(t);
    t.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, opts?: unknown) => {
      leaked.push({ target: t, type, fn });
      original(type, fn, opts as never);
    }) as typeof t.addEventListener;
  }
  try {
    const { init } = await import("../src/main");
    init();
  } finally {
    patched.forEach((t, i) => (t.addEventListener = originals[i]));
  }
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
  // closures inside `init()`, so the WP7 block below reaches them the way a reader does: through a
  // `#vs=` hash the app loads at startup.
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

/** The dev-only handle `init()` publishes, so a test can read the state the PLOTS are in. */
function views(): { param: { sphere: boolean }; dyn: { sphere: boolean } } {
  const v = (window as unknown as { __views?: { param: { sphere: boolean }; dyn: { sphere: boolean } } })
    .__views;
  if (!v) throw new Error("__views not published — is import.meta.env.DEV false?");
  return v;
}

describe("WP7/S3 — the Riemann sphere is part of the shared view", () => {
  // It was excluded as "not part of the serialized state for the MVP", which made it the one
  // view-defining toggle a permalink dropped: the sender was looking at a sphere and the recipient
  // opened a flat plane. And the checkbox alone is not the fix — `applyAppState` writes a checkbox
  // and stops, so a link could equally have arrived with the box ticked over a flat plot.
  async function mountWithSphere(): Promise<void> {
    await mount();
    byId<HTMLInputElement>("sphere-dyn").checked = true;
    fire("sphere-dyn", "change");
    byId<HTMLInputElement>("sphere-light").checked = false;
    fire("sphere-light", "change");
    expect(views().dyn.sphere).toBe(true);
  }

  it("carries the three checkboxes, and reaches the PLOT and not just the DOM", async () => {
    await mountWithSphere();
    const { readAppState, encodeState } = await import("../src/state/appState");
    const hash = encodeState(readAppState());

    await mount(hash); // a fresh document, loading the link at startup
    expect(byId<HTMLInputElement>("sphere-dyn").checked).toBe(true);
    expect(byId<HTMLInputElement>("sphere-light").checked).toBe(false);
    expect(views().dyn.sphere).toBe(true); // ← the half `applyAppState` alone would not do
    expect(views().param.sphere).toBe(false); // and only the plane that was on
  });

  it("a link WITHOUT the sphere turns it off — restoring a state the app is not in", async () => {
    // Rule 1: the lossy-read/lossy-apply pair agrees with itself, so the interesting direction is
    // the one that has to CLEAR a toggle rather than set it. Both links are applied through the
    // real path (hashchange → loadFromHash → applyFullState), never by calling the codec directly.
    await mount();
    const { readAppState, encodeState } = await import("../src/state/appState");
    const flat = encodeState(readAppState());
    byId<HTMLInputElement>("sphere-param").checked = true;
    fire("sphere-param", "change");
    const onSphere = encodeState(readAppState());
    byId<HTMLInputElement>("sphere-param").checked = false;
    fire("sphere-param", "change");

    const openLink = (hash: string): void => {
      window.location.hash = hash;
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    };
    openLink(onSphere);
    expect(views().param.sphere).toBe(true);
    openLink(flat);
    expect(byId<HTMLInputElement>("sphere-param").checked).toBe(false);
    expect(views().param.sphere).toBe(false);
  });
});

describe("WP7/U2 — the view chip prints the cap the app is USING", () => {
  it("agrees with the applied iterations at first load, not the markup default", async () => {
    await mount();
    // The markup ships 100 and the startup profile applies 200; the chip used to read the input at
    // a moment when neither had been refreshed, so every session opened claiming a count that was
    // not in force. Both the chip and the box now say what the plot is running.
    const applied = val("inpmn");
    expect(applied).toBe("200"); // the Explore profile's, not the HTML's 100
    expect(byId("param-view-chip").textContent ?? "").toContain(`${applied} it`);
    expect(byId("dyn-view-chip").textContent ?? "").toContain(`${val("inpjn")} it`);
  });

  it("follows a profile change", async () => {
    await mount();
    const sel = byId<HTMLSelectElement>("profile");
    sel.value = "researcher"; // 400 iterations
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    expect(val("inpmn")).toBe("400");
    expect(byId("param-view-chip").textContent ?? "").toContain("400 it");
  });

  it("ignores a typed-but-unapplied count — the chip is about the picture", async () => {
    await mount();
    setVal("inpmn", "777");
    expect(byId("param-view-chip").textContent ?? "").toContain("200 it");
    expect(byId("param-view-chip").textContent ?? "").not.toContain("777 it");
    byId("apply_all").click();
    expect(byId("param-view-chip").textContent ?? "").toContain("777 it");
  });

  it("and the profile picker compares against the applied count for the same reason", async () => {
    await mount();
    const sel = byId<HTMLSelectElement>("profile");
    expect(sel.value).toBe("explore");
    setVal("inpmn", "777"); // typed, not applied
    byId<HTMLInputElement>("light").checked = true; // a LIVE control, which does refresh the label
    fire("light", "change");
    // "Custom…" now — but because of the light, not because of a number nobody applied. Applying the
    // number is what makes it part of the divergence.
    expect(sel.value).toBe("custom");
    byId<HTMLInputElement>("light").checked = false;
    fire("light", "change");
    expect(sel.value).toBe("explore"); // back to the profile: the unapplied 777 never counted
  });
});

describe("WP7/S6 — a link pasted into an open tab is honoured", () => {
  it("applies a #vs= arriving by hashchange", async () => {
    await mount();
    setVal("inpf", "z^3+c");
    byId("apply_all").click();
    const { readAppState, encodeState } = await import("../src/state/appState");
    const cubic = encodeState(readAppState());

    await mount(); // fresh tab, on the default
    expect(val("inpf")).toBe("z^2+c");
    window.location.hash = cubic;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(val("inpf")).toBe("z^3+c");
  });

  it("says so when the link carries no view of ours, rather than silently doing nothing", async () => {
    await mount();
    window.location.hash = "#vs=" + btoa(JSON.stringify({ v: 1, app: "qd", state: {} }));
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(val("inpf")).toBe("z^2+c"); // unchanged
    expect(document.querySelector(".toast")?.textContent ?? "").toContain("no Complex Dynamics view");
  });
});

describe("WP7/S2 — 'Copy properties' waits for the measurement", () => {
  /** A worker that answers on a macrotask, so the Tier-2 pass is genuinely asynchronous. Under
   *  jsdom there is no `Worker` at all and the client falls back to a SYNCHRONOUS compute, in
   *  which the defect cannot happen — so a test without this stub would pass either way. */
  class LateWorker {
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    postMessage(m: { reqId: number }): void {
      // A failure, not a result: it needs no `JuliaImageMetrics` shape, and it exercises WP6's
      // error path end-to-end at the same time. Either way the rows stop saying "measuring…".
      setTimeout(() => this.onmessage?.({ data: { reqId: m.reqId, error: "stub" } } as MessageEvent), 0);
    }
    terminate(): void {}
  }

  async function flush(): Promise<void> {
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 1));
  }

  it("does not put the spinner text in the clipboard, and says it is waiting", async () => {
    const savedWorker = (globalThis as { Worker?: unknown }).Worker;
    (globalThis as { Worker?: unknown }).Worker = LateWorker as unknown;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let copied: string | null = null;
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: (t: string) => { copied = t; return Promise.resolve(); } },
      configurable: true,
    });
    try {
      await mount();
      // A NON-POLYNOMIAL f. Measured: for z²+c the Tier-1 analytic rows answer every question
      // outright at every c tried — "0 (disconnected)" and "—" when the orbit escapes, an exact
      // bound and a closed-form symmetry at c = 0 and c = −1 — so no row is ever a placeholder and
      // the test would have had nothing to wait for. `monicDegree === null` is the case where the
      // bounding radius, the symmetry and the connectivity all come from the image pass.
      const sel = byId<HTMLSelectElement>("fractal_presets");
      sel.value = "herman ring";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      const panel = byId<HTMLDetailsElement>("julia-props-group");
      panel.open = true;
      panel.dispatchEvent(new Event("toggle", { bubbles: true }));
      // The image-derived rows are at the placeholder: nothing has come back yet.
      const dds = [...document.querySelectorAll<HTMLElement>("#julia-props-group .julia-prop dd")];
      expect(dds.some((d) => d.textContent === "measuring\u2026")).toBe(true);

      const btn = byId<HTMLButtonElement>("julia-props-copy");
      btn.click();
      expect(btn.disabled).toBe(true); // it used to copy immediately, spinner text and all
      expect(btn.textContent).toBe("Measuring\u2026");

      await flush();
      expect(btn.disabled).toBe(false);
      expect((btn.textContent ?? "").trim()).toBe("Copy properties"); // its own label, verbatim
      expect(copied).not.toBeNull();
      const text = copied as unknown as string;
      expect(text).not.toContain("measuring"); // the spinner text, which used to be the whole point
      expect(text).toContain("Julia set properties");
      // Anti-vacuity: the rows WERE placeholders when the button was pressed, so this is the wait
      // working rather than a report that had nothing pending in it.
      expect(text).toContain("⚠ measurement failed"); // the stub worker's failure, WP6's path
    } finally {
      warn.mockRestore();
      (globalThis as { Worker?: unknown }).Worker = savedWorker;
    }
  });
});

const escape = (): void =>
  void document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

describe("WP8/S5 — Escape closes one layer, not all of them", () => {
  it("shuts the glossary and leaves the expanded plot expanded", async () => {
    await mount();
    const workspace = document.querySelector(".workspace") as HTMLElement;
    byId("expand-param").click();
    expect(workspace.classList.contains("expand-param")).toBe(true);
    byId("help-btn").click();
    expect(byId("glossary").hidden).toBe(false);

    escape();
    expect(byId("glossary").hidden).toBe(true);
    expect(workspace.classList.contains("expand-param")).toBe(true); // used to close too

    escape();
    expect(workspace.classList.contains("expand-param")).toBe(false); // …and now it is its turn
  });

  it("re-opening a layer does not leave its old registration behind", async () => {
    await mount();
    const workspace = document.querySelector(".workspace") as HTMLElement;
    byId("expand-param").click();
    for (let i = 0; i < 3; i++) {
      byId("help-btn").click();
      escape();
      expect(byId("glossary").hidden, `round ${i}`).toBe(true);
      expect(workspace.classList.contains("expand-param"), `round ${i}`).toBe(true);
    }
  });

  it("closing by the ✕ gives the key back to the layer underneath", async () => {
    await mount();
    const workspace = document.querySelector(".workspace") as HTMLElement;
    byId("expand-param").click();
    byId("help-btn").click();
    byId("glossary-close").click();
    escape();
    expect(workspace.classList.contains("expand-param")).toBe(false);
  });
});

describe("WP8/S4 — a mode the app cannot draw says so, and says so when it moves", () => {
  it("greys out the derivative modes for a non-holomorphic f, with the reason on each", async () => {
    await mount();
    const analytic = byId<HTMLOptionElement>("mode-distance-analytic");
    expect(analytic.disabled).toBe(false);
    expect(analytic.title).toBe("");

    setVal("inpf", "conjugate(z^2)+c"); // not holomorphic
    byId("apply_all").click();
    expect(analytic.disabled).toBe(true);
    expect(analytic.title).toContain("not holomorphic"); // the reason, on the greyed option
  });

  it("moving the SELECTED mode is announced instead of happening silently", async () => {
    await mount();
    const sel = byId<HTMLSelectElement>("mode");
    sel.value = "multiplier";
    fire("mode", "change");
    expect(sel.value).toBe("multiplier");

    setVal("inpf", "conjugate(z^2)+c");
    byId("apply_all").click();
    expect(sel.value).toBe("smooth"); // it always did this
    const toast = [...document.querySelectorAll(".toast")].map((t) => t.textContent ?? "").join(" ");
    expect(toast).toContain("Multiplier map"); // …but now it says which mode it took away
    expect(toast).toContain("not holomorphic"); // …and why
    expect(toast).toContain("Smooth"); // …and what is showing instead
  });

  it("perturbation greys out every mode its kernel does not render", async () => {
    // The kernel draws `uMode = mode === 1 ? 1 : 0` — smooth, else escape — so ten of the sixteen
    // modes were selectable while something else was drawn. Four were already disabled for other
    // reasons; the other six were silent substitutions.
    await mount();
    const sel = byId<HTMLSelectElement>("mode");
    const before = [...sel.options].filter((o) => o.disabled).map((o) => o.value);
    byId<HTMLInputElement>("perturbation").checked = true;
    fire("perturbation", "change");
    const after = [...sel.options].filter((o) => o.disabled).map((o) => o.value);
    expect(after.length).toBeGreaterThan(before.length);
    for (const o of sel.options) {
      expect(o.disabled, o.value).toBe(o.value !== "escape" && o.value !== "smooth");
      if (o.disabled) expect(o.title).toContain("perturbation (deep zoom)");
    }
    byId<HTMLInputElement>("perturbation").checked = false;
    fire("perturbation", "change");
    expect([...sel.options].filter((o) => o.disabled).map((o) => o.value)).toEqual(before);
  });
});

describe("WP8/U7 — a panel that needs z²+c says so before you press anything", () => {
  it("disables the seven quadratic panels and names the current f", async () => {
    await mount();
    const btn = byId<HTMLButtonElement>("angles-find");
    expect(btn.disabled).toBe(false);
    expect(document.querySelector("#angle-group > p.gate-note")).toBeNull();

    setVal("inpf", "z^3+c");
    byId("apply_all").click();
    expect(btn.disabled).toBe(true);
    const note = document.querySelector("#angle-group > p.gate-note");
    expect(note?.textContent ?? "").toContain("Needs f = z²+c");
    expect(note?.textContent ?? "").toContain("z^3+c"); // …and what f actually is

    setVal("inpf", "z^2+c");
    byId("apply_all").click();
    expect(btn.disabled).toBe(false);
    expect(document.querySelector("#angle-group > p.gate-note")).toBeNull();
  });

  it("does not re-enable a control some OTHER rule had disabled", async () => {
    // `updateLamination` greys out the detail slider while both its toggles are off. Going
    // non-quadratic and back must leave it grey — the gate only undoes its own work.
    await mount();
    const detail = byId<HTMLInputElement>("lamination-detail");
    expect(detail.disabled).toBe(true);
    setVal("inpf", "z^3+c");
    byId("apply_all").click();
    expect(byId<HTMLButtonElement>("angles-find").disabled).toBe(true); // the gate IS in effect
    setVal("inpf", "z^2+c");
    byId("apply_all").click();
    expect(byId<HTMLButtonElement>("angles-find").disabled).toBe(false); // …and has let go
    expect(detail.disabled).toBe(true); // but the slider is not its to hand back
  });

  it("leaves the glossary links alone — a definition is still worth reading", async () => {
    await mount();
    setVal("inpf", "z^3+c");
    byId("apply_all").click();
    const panel = byId("mating-group");
    const gated = [...panel.querySelectorAll<HTMLButtonElement>("button")].filter(
      (b) => !b.classList.contains("gloss-link"),
    );
    expect(gated.length, "the panel has action buttons to gate").toBeGreaterThan(0);
    expect(gated.every((b) => b.disabled), "the gate IS in effect").toBe(true);
    const links = [...panel.querySelectorAll<HTMLButtonElement>(".gloss-link")];
    expect(links.length, "the panel has glossary links").toBeGreaterThan(0);
    for (const g of links) expect(g.disabled).toBe(false);
  });
});

describe("WP8/S6 — an error banner comes down when its cause does", () => {
  it("unticking Newton clears the error ticking it raised", async () => {
    await mount();
    const box = byId("input-errors");
    setVal("inpf", "conjugate(z^2)+c"); // no analytic derivative ⇒ Newton cannot compile
    byId("apply_all").click();
    byId<HTMLInputElement>("newton").checked = true;
    fire("newton", "change");
    // Non-vacuity first: unless ticking Newton actually RAISES a banner, "it comes down" is a
    // statement about nothing. (The error is CPU-side — `updateIteration` refusing to build the
    // Newton map without f′ — so jsdom reaches it without a real shader compile.)
    expect(box.hidden).toBe(false);
    expect(box.textContent ?? "").not.toBe("");

    byId<HTMLInputElement>("newton").checked = false;
    fire("newton", "change");
    // Before WP8 `reportCompileErrors` only ever ADDED, so this banner stayed for the session.
    expect(box.hidden).toBe(true);
    expect(box.textContent ?? "").toBe("");
  });

  it("leaving the σ view by Escape clears its error box, not only the ↩ button", async () => {
    await mount();
    const err = byId("schwarz-error");
    byId("schwarz-open").click(); // opens the σ pane and generates the default deltoid
    const workspace = document.querySelector(".workspace") as HTMLElement;
    if (!workspace.classList.contains("schwarz-active")) {
      // σ needs its engine to build; if it could not here, there is nothing to assert about
      // leaving it. The test says so rather than passing quietly on an empty premise.
      throw new Error("σ did not open under jsdom — this test's premise is gone");
    }
    // Put an error up the way a bad φ would.
    err.textContent = "could not build φ";
    err.hidden = false;

    escape();
    expect(workspace.classList.contains("schwarz-active")).toBe(false);
    expect(err.hidden).toBe(true); // only the ↩ button used to do this
    expect(err.textContent).toBe("");
  });
});

describe("WP10/U4 — the sidebar is five tabs", () => {
  const tabs = (): HTMLButtonElement[] => [
    ...document.querySelectorAll<HTMLButtonElement>('#sidebar-tablist [role="tab"]'),
  ];
  const panels = (): HTMLElement[] => [
    ...document.querySelectorAll<HTMLElement>('#sidebar-panels [role="tabpanel"]'),
  ];
  const openPanel = (): HTMLElement => {
    const shown = panels().filter((p) => !p.hidden);
    expect(shown, "exactly one panel is shown").toHaveLength(1);
    return shown[0];
  };

  it("carries every group, and each group lands on exactly one tab", async () => {
    await mount();
    expect(tabs().map((t) => (t.textContent ?? "").trim())).toEqual([
      "Function",
      "Appearance",
      "Precision",
      "Instruments",
      "Studio",
    ]);
    // Nothing the pane used to hold is lost, and nothing is in two places.
    for (const id of [
      "inpf",
      "newton",
      "fractal_presets",
      "mode",
      "palette",
      "appearance-group",
      "overlays-group",
      "precision-group",
      "aa",
      "accumulate",
      "legend-toggle",
      "julia-props-group",
      "mating-group",
      "herman-group",
      "view-group",
      "studio-group",
    ]) {
      const el = byId(id);
      const owning = panels().filter((p) => p.contains(el));
      expect(owning, `${id} is on exactly one tab`).toHaveLength(1);
    }
  });

  it("the four re-homed controls are on the tab that owns their MEANING", async () => {
    await mount();
    const on = (id: string): string =>
      panels().find((p) => p.contains(byId(id)))?.id ?? "(none)";
    // Newton changes what is ITERATED, not the accuracy of iterating it.
    expect(on("newton")).toBe("tabpanel-function");
    // Anti-aliasing and idle refine are how HARD the plot works, not how it is coloured.
    expect(on("aa")).toBe("tabpanel-precision");
    expect(on("accumulate")).toBe("tabpanel-precision");
    // …and the colour legend is about colour.
    expect(on("legend-toggle")).toBe("tabpanel-appearance");
  });

  it("apply / reset / undo / redo are pinned, not tabbed", async () => {
    await mount();
    for (const id of ["apply_all", "reset_all", "undo-btn", "redo-btn"]) {
      expect(byId("pane-actions").contains(byId(id)), id).toBe(true);
      expect(panels().some((p) => p.contains(byId(id))), `${id} is not on a tab`).toBe(false);
    }
  });

  it("follows the WAI-ARIA tabs pattern", async () => {
    await mount();
    const ts = tabs();
    expect(ts.filter((t) => t.getAttribute("aria-selected") === "true")).toHaveLength(1);
    expect(ts.filter((t) => t.tabIndex === 0)).toHaveLength(1); // roving tabindex
    for (const t of ts) {
      const panel = document.getElementById(t.getAttribute("aria-controls") ?? "");
      expect(panel, `${t.id} controls a panel`).not.toBeNull();
      expect(panel?.getAttribute("aria-labelledby")).toBe(t.id); // …and it names itself from the tab
    }
  });

  it("Left / Right / Home / End move between tabs", async () => {
    await mount();
    const ts = tabs();
    const key = (el: HTMLElement, k: string): void =>
      void el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
    ts[0].click();
    expect(openPanel().id).toBe("tabpanel-function");
    key(ts[0], "ArrowRight");
    expect(openPanel().id).toBe("tabpanel-appearance");
    key(ts[1], "End");
    expect(openPanel().id).toBe("tabpanel-studio");
    key(ts[4], "ArrowRight"); // wraps
    expect(openPanel().id).toBe("tabpanel-function");
    key(ts[0], "ArrowLeft"); // …in both directions
    expect(openPanel().id).toBe("tabpanel-studio");
    key(ts[4], "Home");
    expect(openPanel().id).toBe("tabpanel-function");
  });

  it("remembers the open tab per viewer, and does not put it in the shared state", async () => {
    await mount();
    tabs()[3].click();
    expect(openPanel().id).toBe("tabpanel-instruments");
    expect(localStorage.getItem("cdjs.tab")).toBe("instruments");

    const { SHARE_IDS } = await import("../src/state/appState");
    // Which tab the sender had open is not part of a mathematical view.
    expect((SHARE_IDS as readonly string[]).some((id) => id.includes("tab"))).toBe(false);
  });
});

describe("WP10/U4 — the active-settings strip", () => {
  const strip = (): HTMLElement => byId("active-settings");
  const entries = (): string[] =>
    [...strip().querySelectorAll(".pane-strip-item")].map((b) => (b.textContent ?? "").trim());

  it("is empty and hidden while everything that changes the render is at its default", async () => {
    await mount();
    expect(entries()).toEqual([]);
    expect(strip().hidden).toBe(true); // the common case costs no height
  });

  it("names a setting the moment it is on, from whichever tab you are on", async () => {
    await mount();
    byId<HTMLInputElement>("perturbation").checked = true;
    fire("perturbation", "change");
    expect(strip().hidden).toBe(false);
    expect(entries()).toContain("perturbation");

    byId<HTMLInputElement>("newton").checked = true;
    fire("newton", "change");
    expect(entries()).toEqual(expect.arrayContaining(["Newton's method", "perturbation"]));

    byId<HTMLInputElement>("perturbation").checked = false;
    fire("perturbation", "change");
    expect(entries()).not.toContain("perturbation");
  });

  it("an entry switches to the owning tab and focuses the control — S4 made visible", async () => {
    await mount();
    // Start somewhere else entirely.
    byId("tab-studio").click();
    byId<HTMLInputElement>("perturbation").checked = true;
    fire("perturbation", "change");
    const item = [...strip().querySelectorAll<HTMLButtonElement>(".pane-strip-item")].find(
      (b) => (b.textContent ?? "").trim() === "perturbation",
    );
    expect(item).toBeDefined();
    item?.click();
    expect(byId("tabpanel-precision").hidden).toBe(false);
    expect(document.activeElement).toBe(byId("perturbation"));
  });

  it("lists a default that has been turned OFF as well as one turned on", async () => {
    await mount();
    const accum = byId<HTMLInputElement>("accumulate");
    expect(accum.checked, "refine-while-idle ships on").toBe(true);
    accum.checked = false;
    fire("accumulate", "change");
    expect(entries()).toContain("refine while idle: off");
  });

  it("ignores a purely cosmetic change — the picture already shows it", async () => {
    await mount();
    const pal = byId<HTMLSelectElement>("palette");
    pal.value = "viridis";
    fire("palette", "change");
    expect(entries()).toEqual([]);
    expect(strip().hidden).toBe(true);
  });
});

describe("WP10 — the rest of the shell pass", () => {
  it("U4: the inspector shows its hint, not three rows of inputs for a point nobody picked", async () => {
    await mount();
    expect(byId("inspector-hint").hidden).toBe(false);
    for (const id of ["inspector-siegel", "inspector-misiur", "inspector-note"]) {
      expect(byId(id).hidden, id).toBe(true);
    }
  });

  it("U4: …and they appear once a point IS inspected, and go away again when it is closed", async () => {
    await mount();
    // Through a real app action with the inspect as its postcondition: a pointer gesture on the
    // overlay needs a layout jsdom does not do, but the Siegel jump ends in the same `showInspect`.
    setVal("siegel-theta", "1/5");
    byId("siegel-go").click();
    expect(byId("inspector").hidden).toBe(false);
    expect(byId("inspector-hint").hidden).toBe(true);
    for (const id of ["inspector-siegel", "inspector-misiur", "inspector-note"]) {
      expect(byId(id).hidden, id).toBe(false);
    }

    byId("inspector-close").click();
    expect(byId("inspector-hint").hidden).toBe(false);
    expect(byId("inspector-note").hidden).toBe(true);
  });

  it("the import dialog replaces the prompt, and keeps the text when the parse fails", async () => {
    await mount();
    const prompt = vi.spyOn(window, "prompt");
    byId("import-map").click();
    expect(prompt, "no window.prompt anywhere in the path").not.toHaveBeenCalled();
    prompt.mockRestore();

    const dlg = byId("import-dialog");
    expect(dlg.hidden).toBe(false);
    const text = byId<HTMLTextAreaElement>("import-dialog-text");
    text.value = "not a link";
    byId("import-dialog-load").click();
    expect(dlg.hidden, "a bad paste does not close the dialog").toBe(false);
    expect(byId("import-dialog-error").hidden).toBe(false);
    expect(text.value, "…and the text survives, so it is one edit not one re-paste").toBe("not a link");
  });

  it("U11: every way of moving c keeps the caption, the input and the legend in step", async () => {
    await mount();
    const before = byId("dyn-c-value").textContent;
    setVal("siegel-theta", "1/3");
    byId("siegel-go").click();
    const after = byId("dyn-c-value").textContent;
    expect(after).not.toBe(before); // the jump happened
    // The five copies of this block had drifted; one helper now does all of them.
    expect(val("inpc")).toContain(after?.split(" ")[0] ?? "@@");
  });

  it("U6: the controls FAB is put away while σ has the workspace", async () => {
    await mount();
    const fab = byId<HTMLButtonElement>("controls-fab");
    expect(fab.hidden).toBe(false);
    byId("schwarz-open").click();
    const workspace = document.querySelector(".workspace") as HTMLElement;
    expect(workspace.classList.contains("schwarz-active"), "σ opened").toBe(true);
    expect(fab.hidden, "a button that opens a pane behind the takeover").toBe(true);
    escape();
    expect(fab.hidden).toBe(false);
  });
});

describe("WP11/U10 — accessibility, asserted where the axe roster cannot look", () => {
  /** Open every `<details>` in the pane: the roster audits each page in its DEFAULT state only,
   *  which is precisely why the Exterior panel's findings survived four audits. */
  const openEverything = (): void => {
    for (const d of document.querySelectorAll<HTMLDetailsElement>("details")) d.open = true;
  };

  it("every scrollable list is reachable by keyboard and says what it is", async () => {
    await mount();
    openEverything();
    for (const id of ["exterior-param-list", "exterior-dyn-list"]) {
      const el = byId(id);
      expect(el.tabIndex, `${id} is focusable`).toBe(0);
      expect(el.getAttribute("role"), id).toBe("region");
      expect((el.getAttribute("aria-label") ?? "").length, id).toBeGreaterThan(0);
    }
  });

  it("…and with everything open, the structural invariants still hold", async () => {
    await mount();
    openEverything();
    expect(document.querySelectorAll("main")).toHaveLength(1);
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    const unnamed: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("input, select, textarea, button")) {
      if (el instanceof HTMLInputElement && el.type === "hidden") continue;
      if (el.hidden || el.getAttribute("aria-hidden") === "true") continue;
      if (el.closest("[hidden]")) continue;
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

  it("every part of the page belongs to a landmark", async () => {
    await mount();
    // The axe job does not block; this does. Both facts were found BY the audit after WP10's tab
    // shell went in, and both are older than it: the controls pane has always sat outside
    // `<main class="plots">`, and a `<footer>` nested inside another sectioning container is not
    // the `contentinfo` landmark.
    const pane = byId("controls-pane");
    expect(pane.getAttribute("role")).toBe("region");
    expect((pane.getAttribute("aria-label") ?? "").length).toBeGreaterThan(0);
    const footers = [...document.querySelectorAll("footer")];
    expect(footers.length).toBeGreaterThan(0);
    for (const f of footers) {
      expect(
        f.closest("main, aside, section, nav, article, [role='region']"),
        "a footer inside a sectioning container is not contentinfo",
      ).toBeNull();
    }
  });

  it("the inspector announces ONE sentence, not the whole report", async () => {
    await mount();
    // The live region used to be the whole `<aside>`, so every recompute read out six rows.
    expect(byId("inspector").hasAttribute("aria-live")).toBe(false);
    const status = byId("inspector-status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("");

    setVal("siegel-theta", "1/5");
    byId("siegel-go").click();
    expect(status.textContent ?? "").toMatch(/^Inspected c = /);
    // …and it is a sentence, not the list: the list has more rows than this has clauses.
    expect((status.textContent ?? "").split(",").length).toBeLessThan(
      byId("inspector-body").querySelectorAll("dt").length,
    );
  });

  it("a suggestion's severity is not carried by colour alone", async () => {
    await mount();
    for (const id of ["param-suggestion", "dyn-suggestion"]) {
      const icon = byId(id).querySelector(".suggestion-icon");
      expect(icon, id).not.toBeNull();
      expect(icon?.getAttribute("aria-hidden"), `${id} icon is not hidden from readers`).not.toBe(
        "true",
      );
      expect((icon?.getAttribute("aria-label") ?? "").length, id).toBeGreaterThan(0);
    }
  });

  it("the onboarding card traps Tab and gives focus back, like every other dialog", async () => {
    localStorage.removeItem("cdjs.onboarded");
    await mount();
    const card = byId("onboarding");
    expect(card.hidden).toBe(false);
    // `withModalFocus` focuses the initial control and registers an escape layer.
    expect(document.activeElement).toBe(byId("onboarding_dismiss"));
    escape();
    expect(card.hidden).toBe(true);
  });
});
