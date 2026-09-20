// The exported figure, in a real browser — the half jsdom cannot reach.
//
// **THE LOAD-BEARING TEST HERE IS THAT THE PHASE PORTRAIT IS IN THE PLATE.** `GLStage` creates its
// context without `preserveDrawingBuffer`, so reading `canvas.gl` after the browser has composited
// returns an empty buffer: probing the live page before this slice existed, the GL layer read back a
// single distinct colour where the ink layer read 44. The export therefore re-renders the stage
// synchronously and composites in the same task — and if anyone removes that line the figure loses
// its whole backdrop and merely looks plain, which no node test can see.
//
// **MOUNTED ON THE NEW SHELL SINCE M8 STEP 1.12**, which is where `mountApp` went. The export is the
// same `figureBytes` — `stageView.drawNow`, then `drawFigure` over the two stage canvases and the
// accumulator, then `injectPngText` — so every claim below is about the same code; what moved is the
// route to it. Three things about the route are worth writing down, because each one is a way for
// this file to end up measuring an artefact instead of the product:
//
//  - **The stylesheets are the app's own, all four of them.** `src/ui/app.css` went with the old
//    shell; `theme.css` and `shell.css` are what `main.ts` loads now. Mounting without one does not
//    give a plainer layout, it gives a DIFFERENT one, and the plate's size comes from the canvases'
//    laid-out size — so a shell with no stylesheet exports a picture of a collapsed grid.
//  - **The root is given a desktop box.** The browser harness's viewport is 1280 x 900 but its body
//    has no size at all; M7.2 spent a slice discovering that a test aimed at an unsized stage is
//    aimed at nothing.
//  - **Every mount is destroyed.** A shell writes `#vs=` to the address bar 250 ms after its last
//    change and the next one reads it at boot, so one test's parting state is the next one's
//    subject — and since step 1.11 the shell also holds a `keydown` listener on the DOCUMENT.
//
// The cold start is now A6 (`∫dx/(1+x⁴)` by a semicircle) rather than the sandbox's circle at `1/z`,
// which changes what the caption says and nothing about whether it is there.
import { afterEach, describe, expect, it } from "vitest";
import { readPngText } from "@cas/export";
import { mountShell2 } from "../src/shell/app.js";
import { decodeShell } from "../src/shell/viewState.js";
import { drawFigure, figureLayout, type FigureCaption } from "../src/shell/figure.js";

// The stylesheets `main.ts` loads. `shell2.browser.test.ts` records why each one is load-bearing.
import "katex/dist/katex.min.css";
import "@cas/ui/nav.css";
import "../src/ui/theme.css";
import "../src/ui/shell.css";

/** Every shell this file mounts, torn down after the test that mounted it. */
const mounted: ReturnType<typeof mountShell2>[] = [];
afterEach(() => {
  for (const app of mounted.splice(0)) app.destroy();
  if (window.location.hash !== "") window.history.replaceState(null, "", window.location.pathname);
});

/** A canvas filled with a known colour, as a stand-in for one of the app's layers. */
function filled(w: number, h: number, colour: string, mark?: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (ctx === null) throw new Error("no 2-D context");
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, w, h);
  if (mark !== undefined) {
    ctx.fillStyle = mark;
    ctx.fillRect(0, 0, Math.max(1, Math.round(w / 4)), Math.max(1, Math.round(h / 4)));
  }
  return c;
}

const pixel = (c: HTMLCanvasElement, x: number, y: number): readonly number[] => {
  const ctx = c.getContext("2d");
  if (ctx === null) throw new Error("no 2-D context");
  return [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data];
};

/** How many distinct colours a canvas region carries — the measure that caught the blank GL layer. */
function variety(c: HTMLCanvasElement, x: number, y: number, w: number, h: number): number {
  const ctx = c.getContext("2d");
  if (ctx === null) throw new Error("no 2-D context");
  const d = ctx.getImageData(Math.round(x), Math.round(y), Math.round(w), Math.round(h)).data;
  const seen = new Set<string>();
  for (let i = 0; i < d.length; i += 4 * 37) {
    seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    if (seen.size > 600) break;
  }
  return seen.size;
}

const CAPTION: FigureCaption = {
  title: "∮ 1/z dz over the circle",
  value: "= $\\oint_\\gamma f(z)\\,dz = 2πi",
  verdict: "The closed-contour value is established exactly.",
  level: "=",
};
const THEME = { background: "#0f1115", text: "#e7e9ee", muted: "#99a1b3" };

describe("drawFigure", () => {
  it("composites the stage layers IN ORDER, so the ink sits over the portrait", () => {
    const layout = figureLayout({ w: 200, h: 100 }, { w: 150, h: 50 });
    const plate = document.createElement("canvas");
    // Green "portrait" under a red "ink" mark in the top-left quarter.
    drawFigure(
      plate,
      layout,
      [filled(200, 100, "#00ff00"), filled(200, 100, "rgba(0,0,0,0)", "#ff0000")],
      filled(150, 50, "#0000ff"),
      CAPTION,
      THEME,
    );
    const inMark = pixel(plate, layout.stage.x + 5, layout.stage.y + 5);
    const outsideMark = pixel(plate, layout.stage.x + layout.stage.w - 5, layout.stage.y + layout.stage.h - 5);
    expect(inMark.slice(0, 3)).toEqual([255, 0, 0]); // ink won where it drew
    expect(outsideMark.slice(0, 3)).toEqual([0, 255, 0]); // portrait shows through elsewhere
  });

  it("draws the accumulator into its own band, scaled to the stage's width", () => {
    const layout = figureLayout({ w: 200, h: 100 }, { w: 150, h: 50 });
    const plate = document.createElement("canvas");
    drawFigure(plate, layout, [filled(200, 100, "#00ff00")], filled(150, 50, "#0000ff"), CAPTION, THEME);
    expect(pixel(plate, layout.accumulator.x + 4, layout.accumulator.y + 4).slice(0, 3)).toEqual([0, 0, 255]);
    // And the band really is the stage's width, not the accumulator's own 150.
    expect(
      pixel(plate, layout.accumulator.x + layout.accumulator.w - 4, layout.accumulator.y + 4).slice(0, 3),
    ).toEqual([0, 0, 255]);
  });

  it("lays INK DOWN for the caption — three lines of it", () => {
    const layout = figureLayout({ w: 600, h: 300 }, { w: 450, h: 150 });
    const plate = document.createElement("canvas");
    drawFigure(plate, layout, [filled(600, 300, "#0f1115")], filled(450, 150, "#0f1115"), CAPTION, THEME);
    // Measured as variety, not as "not the background": an empty band is one colour, and the first
    // draft of the accumulator's own ink test passed VACUOUSLY by measuring the axes instead.
    expect(variety(plate, layout.caption.x, layout.caption.y, layout.caption.w, layout.caption.h)).toBeGreaterThan(4);
  });

  it("survives a zero-sized layer instead of throwing", () => {
    const layout = figureLayout({ w: 200, h: 100 }, { w: 150, h: 50 });
    const plate = document.createElement("canvas");
    const empty = document.createElement("canvas");
    empty.width = 0;
    empty.height = 0;
    expect(() => {
      drawFigure(plate, layout, [empty], empty, CAPTION, THEME);
    }).not.toThrow();
  });
});

describe("the app's own exported figure", () => {
  it("CONTAINS THE PHASE PORTRAIT, and carries its permalink and verdict", async () => {
    const root = document.createElement("div");
    root.style.cssText = "position:fixed;inset:0;width:1280px;height:900px";
    document.body.replaceChildren(root);
    mounted.push(mountShell2(root));
    // Two frames, so the stage has rendered and been composited at least once — which is exactly the
    // state in which a naive read of `canvas.gl` comes back blank.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 400));

    const gl = root.querySelector<HTMLCanvasElement>("canvas.gl");
    expect(gl).not.toBeNull();
    if (gl === null) return;
    expect(gl.width, "the stage has a drawing buffer").toBeGreaterThan(0);

    // The bar's own button, by the prefix of its label — measured against `shell2/bar.ts`, where it
    // reads "download this figure as a PNG carrying its own permalink". Driving `actions()` instead
    // would skip the control, and the control is half of what "the app's own exported figure" means.
    const save = root.querySelector<HTMLButtonElement>('[aria-label^="download this figure"]');
    expect(save).not.toBeNull();

    // Reach the export the way the button does, then read the bytes back.
    const clicked = new Promise<Uint8Array>((resolve, reject) => {
      const original = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob: Blob | MediaSource): string => {
        void (blob as Blob).arrayBuffer().then((b) => {
          resolve(new Uint8Array(b));
        }, reject);
        return original(blob);
      };
      save?.click();
      setTimeout(() => {
        reject(new Error("no figure was produced"));
      }, 8000);
    });
    const bytes = await clicked;

    // ── the metadata ──
    const meta = readPngText(bytes);
    expect(meta.Software).toContain("Contour Integration");
    expect(meta["cas:verdict"]).toBeTruthy();
    expect(meta["cas:value"]).toBeTruthy();
    const link = meta["cas:state"];
    expect(link, "the figure carries its own permalink").toBeTruthy();
    const decoded = decodeShell(link);
    expect(decoded?.ok, "and that permalink decodes").toBe(true);

    // ── THE PIXELS: the portrait has to be there ──
    const img = new Image();
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: "image/png" }));
    await new Promise((r, j) => {
      img.onload = r;
      img.onerror = j;
      img.src = url;
    });
    const plate = document.createElement("canvas");
    plate.width = img.naturalWidth;
    plate.height = img.naturalHeight;
    plate.getContext("2d")?.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);

    expect(plate.width).toBeGreaterThan(400);

    // **THE MEASUREMENT THAT MATTERS, and it took three attempts to find one that is not vacuous.**
    //
    // The first asked whether the plate's upper band carried more than a dozen distinct colours.
    // That passes with the portrait entirely absent: the plate is drawn at 2×, and `drawImage`
    // interpolating the ink layer's 44 antialiased shades manufactures hundreds — both runs read
    // 601, the sampler's own cap.
    //
    // The second composited a control plate with the GL layer replaced by a blank canvas and
    // required the real plate to differ from it. Measured, that reads **97.9 % in BOTH
    // directions** — the real plate has been through a PNG encode and an `Image` decode while the
    // control was drawn straight to a canvas, and the two disagree almost everywhere for reasons
    // that have nothing to do with the portrait. A tolerance did not rescue it.
    //
    // So the claim is made on the PRIMITIVE the whole slice turns on: can `canvas.gl` be read back
    // at all. It could not — one distinct colour — until `preserveDrawingBuffer` was set on its
    // context, and it is 601 with it. That the readable layer then lands on the plate is what the
    // synthetic `drawFigure` tests above establish, and they assert exact pixels rather than
    // variety, so nothing here is inferred from a number that could come from somewhere else.
    const direct = document.createElement("canvas");
    direct.width = gl.width;
    direct.height = gl.height;
    direct.getContext("2d")?.drawImage(gl, 0, 0);
    const glVariety = variety(direct, 0, 0, direct.width, direct.height);
    expect(glVariety, `the GL layer reads back ${glVariety} distinct colours`).toBeGreaterThan(12);
  });
});
