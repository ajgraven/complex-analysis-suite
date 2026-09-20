// **The three plates, in a real browser** — M8 step 2.3.
//
// `figureInk.browser.test.ts` establishes that the export contains the phase portrait at all; this
// file is about the other two treatments, which exist only inside a GL render and a 2-D re-render
// and so are invisible to every node test: the LIGHT plate washes the portrait onto paper through a
// uniform, and the PRINT plate draws the textbook stage — no portrait, axes, a unit grid, the
// contour in its piece colours, poles as ⊗, cuts dashed — in the ink palette darkened for paper.
//
// Each claim is a comparison rather than an absolute: "lighter than the dark plate" is a fact about
// two pictures of the same state, where "light" alone is a threshold somebody has to choose.
import { afterEach, describe, expect, it } from "vitest";
import { readPngText } from "@cas/export";

import { mountShell2, type Shell2Handle } from "../src/shell/app.js";
import { createStageView } from "../src/shell/stageView.js";
import { defaultSession } from "../src/shell/session.js";
import { defaultState, resolveState } from "../src/shell/state.js";
import { circleTemplate } from "../src/engine/contour/templates.js";

import "katex/dist/katex.min.css";
import "../src/ui/theme.css";
import "../src/ui/shell.css";

const mounted: Shell2Handle[] = [];
afterEach(() => {
  for (const app of mounted.splice(0)) app.destroy();
  if (window.location.hash !== "") window.history.replaceState(null, "", window.location.pathname);
});

async function mounted2(): Promise<Shell2Handle> {
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;inset:0;width:1280px;height:900px";
  document.body.replaceChildren(root);
  const handle = mountShell2(root);
  mounted.push(handle);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 400));
  return handle;
}

/** Save a plate through the action the buttons call, and read the PNG back. */
async function save(handle: Shell2Handle, plate: "dark" | "light" | "print"): Promise<Uint8Array> {
  return await new Promise<Uint8Array>((resolve, reject) => {
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob: Blob | MediaSource): string => {
      URL.createObjectURL = original;
      void (blob as Blob).arrayBuffer().then((b) => {
        resolve(new Uint8Array(b));
      }, reject);
      return original(blob);
    };
    handle.actions().saveFigure(plate);
    setTimeout(() => {
      reject(new Error(`no ${plate} plate was produced`));
    }, 8000);
  });
}

/** The saved PNG, decoded onto a canvas so its pixels can be read. */
async function plateOf(bytes: Uint8Array): Promise<HTMLCanvasElement> {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: "image/png" }));
  await new Promise((r, j) => {
    img.onload = r;
    img.onerror = j;
    img.src = url;
  });
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  if (ctx === null) throw new Error("no 2-D context");
  ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);
  return c;
}

interface Band {
  readonly colours: number;
  readonly luma: number;
  readonly inked: number;
  /** The band's most common colour — its ground. */
  readonly top: string;
}

/**
 * What a horizontal band of the plate carries: how many colours, how light, how much ink.
 *
 * `inked` counts pixels that are neither the band's own most common colour nor within 12 of it,
 * which on a plate with no portrait is exactly the drawn furniture and on one with a portrait is
 * nearly everything.
 */
function band(c: HTMLCanvasElement, from: number, to: number): Band {
  const ctx = c.getContext("2d");
  if (ctx === null) throw new Error("no 2-D context");
  const y0 = Math.round(c.height * from);
  const d = ctx.getImageData(0, y0, c.width, Math.max(1, Math.round(c.height * (to - from)))).data;
  const seen = new Map<string, number>();
  let luma = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const key = `${d[i]},${d[i + 1]},${d[i + 2]}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    luma += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    n++;
  }
  let top = "0,0,0";
  let best = -1;
  for (const [k, v] of seen) if (v > best) [top, best] = [k, v];
  const [tr, tg, tb] = top.split(",").map(Number);
  let inked = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i] - tr) + Math.abs(d[i + 1] - tg) + Math.abs(d[i + 2] - tb) > 12) inked++;
  }
  return { colours: seen.size, luma: luma / Math.max(1, n), inked, top };
}

describe("Save figure offers three plates", () => {
  it("draws them, and each is the picture it claims to be", async () => {
    const handle = await mounted2();
    const plates = {
      dark: await plateOf(await save(handle, "dark")),
      light: await plateOf(await save(handle, "light")),
      print: await plateOf(await save(handle, "print")),
    };

    // The stage band — the top two thirds of the plate, above the accumulator's trail.
    const [dark, light, print] = [band(plates.dark, 0.06, 0.55), band(plates.light, 0.06, 0.55), band(plates.print, 0.06, 0.55)];

    // **The dark plate has a portrait**, which is `figureInk.browser.test.ts`'s claim, repeated here
    // as the control: the other two are compared against it and a blank one would make both trivial.
    expect(dark.colours, "the dark plate has no portrait").toBeGreaterThan(200);

    // **The light plate is the same picture, lighter.** Both halves matter: a plate that lost the
    // portrait would also be lighter, and one that only changed its caption colours would not be.
    expect(light.colours, "the light plate lost the portrait").toBeGreaterThan(200);
    expect(light.luma, "the light plate is not lighter than the dark one").toBeGreaterThan(dark.luma + 30);

    // **The print plate has NO portrait** — a flat ground with drawn furniture on it. Its colour
    // count is small and its ink is a small share of the band, where a portrait fills it.
    expect(print.colours, "the print plate is carrying a portrait").toBeLessThan(dark.colours / 4);
    expect(print.luma, "the print plate is not on white").toBeGreaterThan(200);
    expect(print.inked, "the print plate drew nothing at all").toBeGreaterThan(200);
    expect(print.inked / (plates.print.width * plates.print.height), "the print plate is not mostly paper").toBeLessThan(0.3);

    // **ONE ground, not two.** The print plate's GL buffer is a flat clear of the ink theme's paper
    // (`#f7f8fa`) and the plate's own background is white, so compositing the portrait layer at all
    // — which is what the `print` branch exists to skip — tints the picture band a different colour
    // from the caption band under it. Measured: the two grounds differ by 3% grey, which is not
    // enough to move a luma bound or a colour count and is exactly the kind of seam a printed figure
    // shows. The claim is the one that matters: the plate has one ground.
    const caption = band(plates.print, 0.9, 1);
    expect(print.top, "the print plate's picture and its caption sit on different grounds").toBe(caption.top);
    expect(caption.top, "the print plate is not on white").toBe("255,255,255");
  }, 60_000);

  it("stamps which plate it is, and keeps everything else the same", async () => {
    const handle = await mounted2();
    const meta = {
      dark: readPngText(await save(handle, "dark")),
      light: readPngText(await save(handle, "light")),
      print: readPngText(await save(handle, "print")),
    };
    expect(meta.dark["cas:theme"]).toBe("dark");
    expect(meta.light["cas:theme"]).toBe("light");
    expect(meta.print["cas:theme"]).toBe("print");
    // **The plate is a treatment, not a different argument.** The verdict, the value and the
    // permalink are the same three strings on all three, which is what makes `cas:theme` the only
    // thing that distinguishes them.
    for (const key of ["cas:verdict", "cas:value", "cas:state", "Software"]) {
      expect(meta.light[key], key).toBe(meta.dark[key]);
      expect(meta.print[key], key).toBe(meta.dark[key]);
    }
  }, 60_000);

  it("re-renders the INK at the plate's scale and leaves the portrait at its own", async () => {
    // **The contract, asserted directly on the view**, because from outside the export the only
    // trace of the intermediate size is the sharpness of a hairline — which is what the choice is
    // FOR and not something a pixel count can separate from antialiasing. A phase portrait is a
    // smooth field and `drawImage` upscales it for nothing visible; the contour, the arrowheads and
    // the pole glyphs are hairlines, and those are re-rendered.
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;top:0;width:400px;height:300px";
    document.body.replaceChildren(host);
    const view = createStageView(host);
    const state = defaultState(circleTemplate([0, 0], 1.5));
    const draw = {
      state,
      resolution: resolveState(state, null),
      session: defaultSession(),
      poles: null,
    };
    view.drawNow(draw);
    const [ink1, gl1] = [view.ink.width, view.gl.width];
    expect(ink1, "the ink layer has no drawing buffer").toBeGreaterThan(100);
    const plate = view.plate({ ...draw, plate: "light" }, 2);
    expect(plate.ink.width, "the ink was not re-rendered at the plate's scale").toBe(ink1 * 2);
    expect(plate.gl.width, "the portrait was resized, which buys nothing").toBe(gl1);
    // And the next ordinary draw puts it back, so the pointer's coordinates still match the pixels.
    view.drawNow(draw);
    expect(view.ink.width).toBe(ink1);
    view.destroy();
  }, 30_000);

  it("leaves the stage as the reader had it", async () => {
    // The plate is drawn into the stage's own canvases, so the export has to put the live picture
    // back — in the same task, before anything is awaited. A washed portrait left on screen would
    // be a figure export that changed the app.
    const handle = await mounted2();
    const gl = document.querySelector<HTMLCanvasElement>("canvas.gl");
    if (gl === null) throw new Error("no stage");
    // **Through a 2-D copy**, because the stage's own canvas is a WebGL one and has no 2-D context
    // to read pixels from — which is also why the export composites the way it does.
    const snapshot = (c: HTMLCanvasElement): HTMLCanvasElement => {
      const out = document.createElement("canvas");
      out.width = c.width;
      out.height = c.height;
      out.getContext("2d")?.drawImage(c, 0, 0);
      return out;
    };
    const before = band(snapshot(gl), 0.2, 0.8);
    await save(handle, "print");
    await new Promise((r) => requestAnimationFrame(r));
    const after = band(snapshot(gl), 0.2, 0.8);
    expect(after.colours, "the stage was left on the print plate").toBeGreaterThan(before.colours / 2);
    expect(Math.abs(after.luma - before.luma), "the stage was left washed").toBeLessThan(12);
  }, 60_000);
});
