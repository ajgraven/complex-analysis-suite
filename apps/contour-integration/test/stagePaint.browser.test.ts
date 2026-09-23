// **WHAT THE STAGE PAINTS, AND WHEN IT PAINTS AT ALL.**
//
// Four claims the node gate cannot reach, each of them a defect that shipped:
//
//  - the modulus-contour control read PRESSED on every branch record while the stage drew none, and
//    its first click was a no-op, because the card and the stage read the tri-state default
//    differently;
//  - the strength uniform was handed a COUNT of 8, and `mix` extrapolates: 7.9 % of a frame crushed
//    to black;
//  - a lost WebGL context left the portrait black for the life of the page, with
//    `defaultPrevented: false` so the browser never even tried to restore it, under a rail still
//    printing exact answers;
//  - and the portrait was re-rendered on every pointer MOVE, at 33–35 ms a frame under software
//    rendering, for a picture identical to the one already in the buffer.
//
// The fifth is the rail's: a displayed formula ran off the side of its card on 7 of the 28 records,
// which `document.documentElement.scrollWidth` can never see because the card clips nothing.
import { afterEach, describe, expect, it } from "vitest";
import "katex/dist/katex.min.css";
import "../src/ui/theme.css";
import "../src/ui/shell.css";

import { COMPLEX_DERIVED_GLSL, COMPLEX_SINGLE_GLSL, createProgram } from "@cas/gpu";
import { compileF, parse } from "@cas/expr";
import { mountShell2 } from "../src/shell/app.js";
import { offeredCorpus } from "../src/shell/state.js";
import { buildPhaseFrag, PHASE_VERT, STAGE_MODE_CODE } from "../src/ui/stage/phase.glsl.js";
import { CUT_GLSL } from "../src/ui/stage/cut.glsl.js";
import { cetC6Bytes } from "@cas/gpu/cet";
import { ISO_STRENGTH } from "../src/ui/stage/mode.js";

const mounted: ReturnType<typeof mountShell2>[] = [];
afterEach(() => {
  for (const app of mounted.splice(0)) app.destroy();
  if (window.location.hash !== "") window.history.replaceState(null, "", window.location.pathname);
});

const RECORD_IDS = offeredCorpus()
  .tiers.flatMap((t) => t.families)
  .map((f) => f.id);

/** A tier-D record: it carries a declared product, which is what the iso default follows. */
const BRANCH_RECORD = offeredCorpus()
  .tiers.flatMap((t) => t.families)
  .filter((f) => f.branch !== undefined)[0].id;

const settle = async (): Promise<void> => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 150));
};

function mount(width = 1280): { root: HTMLElement; app: ReturnType<typeof mountShell2> } {
  const root = document.createElement("div");
  root.style.cssText = `position:fixed;inset:0;width:${width}px;height:900px`;
  document.body.replaceChildren(root);
  try {
    window.localStorage.clear();
  } catch {
    /* nothing to clear */
  }
  const app = mountShell2(root);
  mounted.push(app);
  return { root, app };
}

const glCanvas = (root: Element): HTMLCanvasElement => {
  const c = root.querySelector<HTMLCanvasElement>("canvas.gl");
  if (c === null) throw new Error("no GL canvas");
  return c;
};

function frame(root: Element): Uint8ClampedArray {
  const c = glCanvas(root);
  const copy = document.createElement("canvas");
  copy.width = c.width;
  copy.height = c.height;
  const ctx = copy.getContext("2d");
  if (ctx === null) throw new Error("no 2-D context to read with");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height).data;
}

/** How many pixels of two frames of the same canvas differ at all. */
function differing(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n += 1;
  }
  return n;
}

/** The modulus-contour control, which lives in the Branch-cuts card in both modes. */
function isoButton(root: Element): HTMLButtonElement {
  const card = root.querySelector('[data-card="cuts"]');
  if (card === null) throw new Error("no Branch-cuts card");
  const b = [...card.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes("modulus contours"));
  if (b === undefined) throw new Error("no modulus-contour control");
  return b as HTMLButtonElement;
}

/**
 * One pixel of the real `buildPhaseFrag` program, with the overlay off and on.
 *
 * `d` is HALF the pixel's width in plot units, which is the whole point of the probe: `fwidth` is a
 * screen-space derivative, so the only way to ask the shader about a band thinner than a pixel is to
 * say how big the pixel is. `1/(1+z²)` because its modulus sweeps several octaves over the sample
 * range and it is the integrand the review measured the crush on.
 */
function isoPixel(z: readonly [number, number], d: number): { off: number[]; on: number[] } {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("no WebGL2 context");
  if (!gl.getExtension("EXT_color_buffer_float")) throw new Error("EXT_color_buffer_float unavailable");
  const stdlib = `${COMPLEX_SINGLE_GLSL}\n${COMPLEX_DERIVED_GLSL}\nuniform vec2 uA;\n${CUT_GLSL}\n`;
  const program = createProgram(gl, PHASE_VERT, buildPhaseFrag(stdlib, compileF(parse("1/(1+z^2)"))));
  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  const fbo = gl.createFramebuffer();
  const ramp = gl.createTexture();
  try {
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    // The render target on unit 1 and CET-C6 on unit 0 — `declaredParity.browser.test.ts`'s note:
    // leaving the target bound on unit 0 makes a feedback loop the moment `uRamp` reads it.
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ramp);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, cetC6Bytes());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, 1, 1);
    gl.useProgram(program);
    gl.uniform4f(gl.getUniformLocation(program, "uRange"), z[0] - d, z[0] + d, z[1] - d, z[1] + d);
    gl.uniform2f(gl.getUniformLocation(program, "uParamC"), 0, 0);
    gl.uniform2f(gl.getUniformLocation(program, "uA"), 0, 0);
    gl.uniform1f(gl.getUniformLocation(program, "uModulusDepth"), 1);
    gl.uniform1f(gl.getUniformLocation(program, "uGridStrength"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "uCutCount"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "uRamp"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "uMode"), STAGE_MODE_CODE.full);
    const read = (iso: number): number[] => {
      gl.uniform1f(gl.getUniformLocation(program, "uIsoStrength"), iso);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const px = new Float32Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, px);
      return [px[0], px[1], px[2]];
    };
    // **At the strength the app passes**, imported rather than written as a literal.
    return { off: read(0), on: read(ISO_STRENGTH) };
  } finally {
    gl.deleteProgram(program);
    gl.deleteVertexArray(vao);
    gl.deleteBuffer(buffer);
    gl.deleteTexture(texture);
    gl.deleteTexture(ramp);
    gl.deleteFramebuffer(fbo);
  }
}

describe("the modulus-contour control and the stage agree", () => {
  it("draws the contours exactly when the button reads pressed — a record and the sandbox, both ways", async () => {
    const { root, app } = mount();
    await settle();
    app.applyState({ ...app.currentState(), mode: "gallery", record: BRANCH_RECORD, fixture: 0 });
    await settle();

    // A declared product is the context the default follows, so the control opens PRESSED — and
    // this is the assertion the defect fails: it was pressed and the stage drew nothing, so turning
    // it off changed no pixel at all and the first click merely un-pressed the button.
    expect(isoButton(root).getAttribute("aria-pressed")).toBe("true");
    const on = frame(root);

    app.actions().setIso(false);
    await settle();
    expect(isoButton(root).getAttribute("aria-pressed")).toBe("false");
    const off = frame(root);
    expect(differing(on, off), "the pressed control drew no contours").toBeGreaterThan(500);

    app.actions().setIso(true);
    await settle();
    expect(isoButton(root).getAttribute("aria-pressed")).toBe("true");
    expect(differing(on, frame(root)), "turning it back on did not restore the picture").toBe(0);

    // The sandbox with no declaration is the other side of the default: nothing to follow, so the
    // control opens UNPRESSED and the stage draws none. **Back to `iso: null` first** — an explicit
    // choice is the reader's and survives a mode switch, which is the point of the tri-state and not
    // something this half is about.
    app.actions().toSandbox();
    app.actions().setExpr("1/(1+z^2)");
    app.applyState({ ...app.currentState(), iso: null });
    await settle();
    expect(isoButton(root).getAttribute("aria-pressed")).toBe("false");
    const plain = frame(root);
    app.actions().setIso(true);
    await settle();
    expect(isoButton(root).getAttribute("aria-pressed")).toBe("true");
    expect(differing(plain, frame(root)), "the sandbox's control drew no contours either").toBeGreaterThan(500);
  }, 60000);

  it("darkens without CRUSHING — no pure black anywhere, at the strength the app passes", async () => {
    // `uIsoStrength` is a strength in [0,1] and was handed `ISO_CONTOURS = 8`; `mix` extrapolates,
    // so `rgb·(1 − 3.2·iso)` goes negative past `iso = 0.3125` and clamps. Measured on the real
    // program at 256²: 0 black at strength 1, **5,183 black at 8**.
    //
    // The record is chosen so that black means the defect and nothing else: `z^{a−1}/(1+z)` has no
    // ZERO in view (a zero is painted black on purpose, and is the anchor a reader identifies), and
    // its pole is painted white.
    const { root, app } = mount();
    await settle();
    app.applyState({ ...app.currentState(), mode: "gallery", record: BRANCH_RECORD, fixture: 0, iso: false });
    await settle();
    const off = frame(root);
    const blackIn = (px: Uint8ClampedArray): number => {
      let n = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] < 8 && px[i + 1] < 8 && px[i + 2] < 8) n += 1;
      return n;
    };
    expect(blackIn(off), "the portrait is already black somewhere with the overlay OFF").toBe(0);

    app.actions().setIso(true);
    await settle();
    const on = frame(root);
    expect(blackIn(on)).toBe(0);
    // And it did something: the band is the measured one (12,568 of 362,336 pixels differ, 3.5 %)
    // with room either side, so a strength of zero fails it from below and the crushed 8 — which
    // inks whole pole neighbourhoods through the missing `wIso` guard — fails it from above.
    const moved = differing(on, off);
    expect({ moved, band: moved > 2000 && moved < 60000 }).toEqual({ moved, band: true });
  }, 60000);

  it("inks NOTHING where a band is thinner than the pixel it would be drawn on", () => {
    // The phase-isoline branch has carried `(1 − smoothstep(0.5, 1.5, wPhase))` since M8 step 1.9 —
    // *"twelve lines inside one pixel is not a picture of twelve lines"* — and the modulus branch
    // below it had no such guard. `fwidth(log2|f|)` is large wherever `|f|` doubles within a pixel:
    // every pole neighbourhood, and every pixel at a wide enough zoom. There `dIso ≤ wIso·1.5` holds
    // whatever `z` is, so the ramp never clears and the region inks solid — and at the shipped
    // strength of 8 it inked solid BLACK, which is most of the 5,183 pixels the review counted.
    //
    // Asserted on the shader rather than through the app, because the area involved is a couple of
    // pixels wide at any camera the app offers: the honest claim is about `fwidth`, so the probe
    // sets the pixel's own size and reads the two colours out.
    const coarse = isoPixel([0.35, 0.2], 4); //  a pixel 8 plot units across: dozens of bands in it
    expect({ same: coarse.on.join() === coarse.off.join() }).toEqual({ same: true });
    // The control, at a pixel 0.02 across, where the bands are resolved and the overlay is a real
    // line: without it this test passes on a shader that draws no modulus contours at all.
    const fine = [...Array(40).keys()]
      .map((k) => isoPixel([0.25 + k * 0.05, 0.31], 0.01))
      .filter((p) => p.on.join() !== p.off.join());
    expect(fine.length).toBeGreaterThan(0);
  });
});

describe("a lost graphics context", () => {
  it("is SAID, and the portrait comes back when the browser restores it", async () => {
    const { root, app } = mount();
    await settle();
    const canvas = glCanvas(root);
    // The same context object the stage holds — `getContext` with the same type returns it.
    const gl = canvas.getContext("webgl2");
    const ext = gl?.getExtension("WEBGL_lose_context") ?? null;
    if (ext === null) throw new Error("WEBGL_lose_context unavailable — the loss cannot be driven");

    const colours = (): number => {
      const px = frame(root);
      const seen = new Set<number>();
      for (let i = 0; i < px.length; i += 4) seen.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
      return seen.size;
    };
    expect(colours(), "no portrait to lose").toBeGreaterThan(12);

    ext.loseContext();
    await settle();
    expect(gl?.isContextLost()).toBe(true);
    // **Said on the stage, not swallowed.** A rail printing `=` over a black rectangle is the one
    // combination a reader cannot diagnose.
    const notice = root.querySelector(".overlay2 .stageChip.notice")?.textContent ?? "";
    expect(notice).toContain("graphics context was lost");
    // And nothing threw: the app still answers, and a state change still lands.
    app.applyState({ ...app.currentState(), view: { center: [0.2, 0], halfHeight: 2.5 } });
    await settle();
    expect(app.currentState().view.halfHeight).toBe(2.5);

    ext.restoreContext();
    await settle();
    await settle();
    expect(gl?.isContextLost()).toBe(false);
    expect(root.querySelector(".overlay2 .stageChip.notice")).toBeNull();
    // The PROGRAM is gone with the context, so this passes only if the restore relinked: without
    // dropping `programKey` the stage believes it is still built for this integrand and draws
    // nothing for ever.
    expect(colours(), "the portrait did not come back").toBeGreaterThan(12);
  }, 60000);
});

describe("the portrait is not redrawn for a pointer that changed nothing", () => {
  it("issues no GL draw for 60 hover moves, and one as soon as the camera moves", async () => {
    // The portrait is a function of (program, camera, viewport, mode, overlay, plate, cuts) alone.
    // A hover moves the readout and the rail's highlight, which are DOM. Measured before the cache:
    // `render` ran on every move at 33–35 ms under SwiftShader.
    const proto = WebGL2RenderingContext.prototype;
    const real = proto.drawArrays;
    let draws = 0;
    proto.drawArrays = function patched(this: WebGL2RenderingContext, ...args: Parameters<typeof real>) {
      draws += 1;
      return real.apply(this, args);
    } as typeof real;
    try {
      const { root, app } = mount();
      await settle();
      const ink = root.querySelector<HTMLCanvasElement>("canvas.ink");
      if (ink === null) throw new Error("no ink canvas");
      const box = ink.getBoundingClientRect();
      await settle();

      const before = draws;
      for (let k = 0; k < 60; k++) {
        ink.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            clientX: box.left + 40 + k * 3,
            clientY: box.top + 40 + (k % 7) * 5,
            pointerId: 1,
          }),
        );
        await new Promise((r) => requestAnimationFrame(r));
      }
      await settle();
      expect({ hoverDraws: draws - before }).toEqual({ hoverDraws: 0 });

      // The control: the cache must not be a way of never drawing again.
      app.applyState({ ...app.currentState(), view: { center: [0.7, 0.3], halfHeight: 2.2 } });
      await settle();
      expect(draws - before).toBeGreaterThan(0);
    } finally {
      proto.drawArrays = real;
    }
  }, 60000);
});

describe("a disposed stage leaves nothing behind", () => {
  it("deletes every buffer it created — one orphan per mount, before the review", async () => {
    // `initGeometry` kept its buffer in a LOCAL, so `dispose()` deleted the program, the VAO and the
    // colour ramp and left the quad behind: negligible in the app, visible across a 220-test browser
    // run, and a leak whose only symptom is a number nobody is watching. Counted rather than
    // inspected, because the handle is the stage's own and is not exposed.
    const proto = WebGL2RenderingContext.prototype;
    const create = proto.createBuffer;
    const remove = proto.deleteBuffer;
    let made = 0;
    let gone = 0;
    proto.createBuffer = function patched(this: WebGL2RenderingContext) {
      made += 1;
      return create.apply(this);
    } as typeof create;
    proto.deleteBuffer = function patched(this: WebGL2RenderingContext, b: WebGLBuffer | null) {
      if (b !== null) gone += 1;
      return remove.apply(this, [b]);
    } as typeof remove;
    try {
      for (let k = 0; k < 3; k++) {
        const { app } = mount();
        await settle();
        app.destroy();
        mounted.pop();
      }
      // Three mounts, three buffers, three deletes. The equality is the claim; the count is the
      // anti-vacuity clause, since 0 === 0 would pass on a stage that never started.
      expect({ made, gone }).toEqual({ made: 3, gone: 3 });
    } finally {
      proto.createBuffer = create;
      proto.deleteBuffer = remove;
    }
  }, 60000);
});

describe("a rail formula stays inside its card", () => {
  it("over all 28 records, at 1440 × 900", async () => {
    // 7 records overflowed, worst `jordan-quartic` at 142.8 px past the Target card's edge and its
    // Result value's right edge at x = 1528 in a 1440 px window — an answer literally off the
    // screen. No page-level test can see it: the card clips nothing, so
    // `document.documentElement.scrollWidth` never exceeds `innerWidth`.
    const { root, app } = mount(1440);
    await settle();
    const over: string[] = [];
    const spilt: string[] = [];
    let scrollable = 0;
    for (const id of RECORD_IDS) {
      app.applyState({ ...app.currentState(), mode: "gallery", record: id, fixture: 0 });
      await settle();
      for (const el of root.querySelectorAll<HTMLElement>(".card2 .math-display")) {
        const card = el.closest<HTMLElement>(".card2");
        if (card === null) continue;
        const box = card.getBoundingClientRect();
        const pad = Number.parseFloat(getComputedStyle(card).paddingRight || "0");
        const right = box.right - pad;
        const mine = el.getBoundingClientRect();
        // Half a pixel of slack for sub-pixel layout; the smallest real overflow measured was 2.2 px
        // and the largest 142.8.
        if (mine.right > right + 0.5) over.push(`${id} ${card.dataset.card ?? "?"} +${(mine.right - right).toFixed(1)}`);
        // **And the CONTENT is reachable, not merely clipped.** The box alone is not the claim: a
        // block box fills its container whatever its content does, so a formula wider than the card
        // would pass the line above while painting straight across the rail. A wrapper whose content
        // does not fit has to SCROLL.
        if (el.scrollWidth > el.clientWidth + 1) {
          scrollable += 1;
          const how = getComputedStyle(el).overflowX;
          if (how !== "auto" && how !== "scroll") spilt.push(`${id} ${card.dataset.card ?? "?"} ${how}`);
        }
      }
    }
    expect(over).toEqual([]);
    expect(spilt).toEqual([]);

    // **A wrapper in a plain BLOCK parent, which no card has today and the rule still has to hold
    // for.** Every one of the 8 wrappers above sits in a flex line (`.targetLine`, the Result
    // value's row), where flex blockifies it whatever `display` says — so `display: block` is
    // unobservable across the corpus and observable the moment a card puts a formula in an ordinary
    // `<div>`. Without it the wrapper is an inline box and takes its content's width: measured on a
    // 285 px card holding a 600 px formula, the box is 600 px wide with the declaration removed and
    // 285 with it.
    // Inside the shell, because every rule in both sheets is scoped under `.shell2` — a card
    // appended to the mount root is styled by nothing at all and would pass this vacuously.
    const shell = root.querySelector("main.shell2");
    if (shell === null) throw new Error("no shell to put the synthetic card in");
    const card = document.createElement("section");
    card.className = "card2";
    card.style.cssText = "width:285px;position:absolute;left:0;top:0";
    shell.append(card);
    const wrapper = document.createElement("span");
    wrapper.className = "math math-display";
    const wide = document.createElement("span");
    wide.style.cssText = "display:inline-block;width:600px;height:20px";
    wrapper.append(wide);
    card.append(wrapper);
    expect({ boxed: wrapper.getBoundingClientRect().width <= 285 }).toEqual({ boxed: true });
    expect(wrapper.scrollWidth, "the synthetic case is not wide enough to be about anything").toBeGreaterThan(
      wrapper.clientWidth + 1,
    );
    // Anti-vacuity: the clause above is empty unless something really is too wide for its card, and
    // 7 of the 28 records are — measured, 8 wrappers across them.
    expect(scrollable).toBeGreaterThanOrEqual(5);
  }, 180000);
});
