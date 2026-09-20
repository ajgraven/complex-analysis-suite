// **The step's focus, in ink** — M8 step 3.1c, the browser half of the plan's gate.
//
// The gate is *stepping through A6, B1, C1, D1 and G1 highlights the right object at every step
// (jsdom: focus values; browser: the ink focus pixels change)*. `stepFocus.test.ts` has the focus
// values over the whole corpus and `stepStage.test.ts` has the overlay's chips; what neither can
// see is the DIMMING, because it is `globalAlpha` on a 2-D canvas and jsdom has no context at all.
//
// The mount is `hover.browser.test.ts`'s — a real 1280 × 900 box with the app's four stylesheets,
// because a shell mounted without them is not a plainer layout but a different one (`penInk`'s two
// drafts). The app opens on A6, which is the first of the gate's five.
import { afterEach, describe, expect, it } from "vitest";

import { mountShell2 } from "../src/shell/app.js";

import "katex/dist/katex.min.css";
import "@cas/ui/nav.css";
import "../src/ui/theme.css";
import "../src/ui/shell.css";

const mounted: ReturnType<typeof mountShell2>[] = [];
afterEach(() => {
  for (const app of mounted.splice(0)) app.destroy();
  if (window.location.hash !== "") window.history.replaceState(null, "", window.location.pathname);
});

function mount(): { root: HTMLElement; app: ReturnType<typeof mountShell2> } {
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;inset:0;width:1280px;height:900px";
  document.body.replaceChildren(root);
  const app = mountShell2(root);
  mounted.push(app);
  return { root, app };
}

const settled = async (): Promise<void> => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
};

function pixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const rb = document.createElement("canvas");
  rb.width = canvas.width;
  rb.height = canvas.height;
  const ctx = rb.getContext("2d");
  if (ctx === null) throw new Error("no 2d context");
  ctx.drawImage(canvas, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

/** How much ink there is — the alpha sum, which a fade reduces and a redraw of the same curve does not. */
function inkWeight(px: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 3; i < px.length; i += 4) n += px[i];
  return n;
}

const differing = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++;
  }
  return n;
};

const ink = (root: HTMLElement): HTMLCanvasElement => {
  const c = root.querySelector<HTMLCanvasElement>("canvas.ink");
  if (c === null) throw new Error("no ink canvas");
  return c;
};

const stepButton = (root: HTMLElement, label: string): HTMLButtonElement => {
  const b = root.querySelector<HTMLButtonElement>(`[data-card="derivation"] .stepBar button[aria-label="${label}"]`);
  if (b === null) throw new Error(`no ${label} button`);
  return b;
};

/** Enter the stepper through the card's own control, which is how a reader does it. */
async function enterStepper(root: HTMLElement): Promise<void> {
  const enter = root.querySelector<HTMLButtonElement>('[data-card="derivation"] .stepBar button');
  if (enter === null) throw new Error("no Step through button");
  enter.click();
  await settled();
}

describe("the stage, stepped", () => {
  it("DIMS the pieces the step is not about, and un-dims them at All", async () => {
    const { root, app } = mount();
    await settled();
    const canvas = ink(root);
    const all = pixels(canvas);

    await enterStepper(root);
    expect(app.session().step, "the control did not enter the stepper").toBe(0);

    // Walk to A6's boundary step — the vanishing arc — which is about ONE of its two pieces.
    let guard = 0;
    while (guard++ < 20) {
      const label = root.querySelector('[data-card="derivation"] .stepBody h3')?.textContent ?? "";
      if (label.includes("Boundary")) break;
      stepButton(root, "next step").click();
      await settled();
    }
    expect(guard, "never reached a boundary step").toBeLessThan(20);

    const stepped = pixels(canvas);
    // **The ink is LIGHTER, not merely different.** A redraw that changed nothing about the alpha
    // would still differ pixel by pixel (the emphasised piece is stroked at 4 px rather than 2.5),
    // so "some pixels moved" is bought by any redraw at all; a fade is a fall in total alpha.
    // Measured on A6 at the cold-start camera: 2,028,695 at `All` and 1,615,064 on the arc's step,
    // a **20.4%** fall — where the first draft, which dimmed the strokes and left every halo at full
    // strength, managed 0.17%. It is not the 72% the alpha removes from a dimmed piece, and should
    // not be: the FOCUSED piece is thickened from 2.5 px to 4 (which adds ink), and the poles, the
    // handles, the cuts and the marker are untouched, because they are not pieces of the contour.
    expect(inkWeight(stepped), "nothing was dimmed").toBeLessThan(inkWeight(all) * 0.9);
    expect(differing(all, stepped), "the ink layer did not redraw").toBeGreaterThan(1000);

    // And `All` puts the whole contour back, which is the Phase 1 picture.
    //
    // **By `textContent`, not `:last-of-type`** — step 3.1b's own finding, met again: the selector
    // is per PARENT, and each step dot is the only button inside its `<li>`, so `:last-of-type`
    // matches a dot rather than the last control on the bar.
    const back = [...root.querySelectorAll<HTMLButtonElement>('[data-card="derivation"] .stepBar button')].find(
      (b) => b.textContent === "All",
    );
    expect(back, "no All button").toBeDefined();
    back?.click();
    await settled();
    expect(differing(all, pixels(canvas)), "All did not restore the whole contour").toBe(0);
  });

  it("draws a DIFFERENT picture at every step, which is what linking the two surfaces means", async () => {
    const { root, app } = mount();
    await settled();
    const canvas = ink(root);
    await enterStepper(root);

    const weights: number[] = [];
    for (let k = 0; k < 12; k++) {
      weights.push(inkWeight(pixels(canvas)));
      const next = stepButton(root, "next step");
      if (next.disabled) break;
      next.click();
      await settled();
    }
    expect(weights.length, "A6 has too few steps to walk").toBeGreaterThan(5);
    // Some steps focus nothing (the problem, the hypotheses, the conclusion) and draw the full
    // contour; the ones that focus a piece draw less. Both must occur, or the link is decorative.
    const full = Math.max(...weights);
    expect(weights.filter((w) => w >= full * 0.999).length, "no step drew the whole contour").toBeGreaterThan(1);
    expect(weights.filter((w) => w < full * 0.95).length, "no step dimmed anything").toBeGreaterThan(0);
    expect(app.session().step).not.toBe("all");
  });

  it("rings the step's OWN pole, and leaves the other three alone", async () => {
    // **The sweep's `sv-ring-every-pole` survivor.** Nothing read the pole pixels, so a ring drawn
    // around every singularity at every residue step passed every test — and it would say the
    // argument is about all four of A6's poles when it is about one of them at a time.
    //
    // A6's residue step focuses NO piece, so the only difference from `All` is the ring itself.
    // That is what makes "where did the ink change?" a question about the ring alone.
    const { root, app } = mount();
    await settled();
    const canvas = ink(root);
    const all = pixels(canvas);

    await enterStepper(root);
    let guard = 0;
    while (guard++ < 20) {
      const label = root.querySelector('[data-card="derivation"] .stepBody h3')?.textContent ?? "";
      if (label.includes("Residues")) break;
      stepButton(root, "next step").click();
      await settled();
    }
    expect(guard, "never reached a residue step").toBeLessThan(20);
    expect(app.session().step).not.toBe("all");

    // Where the ink moved, as a bounding box in device pixels.
    const stepped = pixels(canvas);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let moved = 0;
    for (let i = 0; i < all.length; i += 4) {
      const same =
        all[i] === stepped[i] && all[i + 1] === stepped[i + 1] &&
        all[i + 2] === stepped[i + 2] && all[i + 3] === stepped[i + 3];
      if (same) continue;
      moved++;
      const px = (i / 4) % canvas.width;
      const py = Math.floor(i / 4 / canvas.width);
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }
    expect(moved, "the residue step changed nothing on the ink layer").toBeGreaterThan(50);
    // **One ring, so one small box.** A6's four poles sit at the corners of a square about the
    // origin, which is hundreds of device pixels across at the cold-start camera; a ring is about
    // 2·(POLE_R + 5) plus its stroke. Ringing all four would span that square instead.
    const w = maxX - minX;
    const h = maxY - minY;
    expect(w, `the changed region is ${w}px wide — wider than one ring`).toBeLessThan(80);
    expect(h, `the changed region is ${h}px tall — taller than one ring`).toBeLessThan(80);
  });

  it("puts the callout on the plane, over the stage and inside it", async () => {
    const { root } = mount();
    await settled();
    await enterStepper(root);
    let guard = 0;
    while (guard++ < 20 && root.querySelector(".overlay2 .stageChip.callout") === null) {
      const next = stepButton(root, "next step");
      if (next.disabled) break;
      next.click();
      await settled();
    }
    const chip = root.querySelector<HTMLElement>(".overlay2 .stageChip.callout");
    expect(chip, "no step drew a callout").not.toBeNull();
    const box = (chip as HTMLElement).getBoundingClientRect();
    const stage = ink(root).getBoundingClientRect();
    // **Inside the stage**, which is the thing a position computed from the camera can get wrong:
    // an unplaced chip lands at the overlay's origin and a chip placed in the wrong space lands
    // off it entirely. Measured on A6's arc bound at the cold-start camera.
    expect(box.width, "the chip has no layout").toBeGreaterThan(40);
    expect(box.left).toBeGreaterThan(stage.left);
    expect(box.right).toBeLessThan(stage.right + 1);
    expect(box.top).toBeGreaterThan(stage.top);
    expect(box.bottom).toBeLessThan(stage.bottom);
  });
});
