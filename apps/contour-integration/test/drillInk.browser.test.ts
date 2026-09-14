// The drill's MASK, on a real canvas — the half jsdom cannot see at all.
//
// `drillShell.test.ts` pins everything the mask does to the DOM: the KILL rows leave the ledger, the
// value card hides, the derivation folds, and all of it comes back. What it cannot pin is the
// mask's other half, because jsdom has no canvas: at rung iii the CONTOUR must leave the stage too,
// since the question there is which contour to close over and the record's own contour is that
// answer, drawn.
//
// **AND THE FIRST IMPLEMENTATION GOT IT WRONG IN A WAY ONLY THIS COULD FIND.** `drawContour` begins
// with `clearRect`, so masking the contour by SKIPPING the call left the previous frame's contour
// standing on the ink layer — the ledger hidden, the value hidden, and the answer still on screen.
// Measured then: 131 non-transparent samples where there should have been none. It draws an empty
// piece list now, and the numbers below are the guard.
import { describe, expect, it } from "vitest";
import "../src/ui/app.css";
import "@cas/ui/nav.css";
import { mountApp } from "../src/shell/app.js";

async function app(): Promise<HTMLElement> {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  try {
    window.localStorage.clear();
  } catch {
    /* nothing to clear */
  }
  mountApp(root);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 400));
  return root;
}

/** How many pixels of the ink layer are not transparent — the contour, its handles and its cuts. */
function inkPixels(root: Element): number {
  const c = root.querySelector<HTMLCanvasElement>("canvas.ink");
  if (c === null) throw new Error("no ink canvas");
  const ctx = c.getContext("2d");
  if (ctx === null) throw new Error("no 2-D context");
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
  return n;
}

/** How many distinct colours the GL portrait carries — the PROBLEM, which no rung masks. */
function portraitColours(root: Element): number {
  const c = root.querySelector<HTMLCanvasElement>("canvas.gl");
  if (c === null) throw new Error("no gl canvas");
  const ctx = c.getContext("2d");
  // The GL canvas has no 2-D context; read it through an offscreen copy instead.
  if (ctx !== null) throw new Error("canvas.gl should not yield a 2-D context");
  const copy = document.createElement("canvas");
  copy.width = c.width;
  copy.height = c.height;
  const cctx = copy.getContext("2d");
  if (cctx === null) throw new Error("no 2-D context");
  cctx.drawImage(c, 0, 0);
  const d = cctx.getImageData(0, 0, copy.width, copy.height).data;
  const seen = new Set<string>();
  for (let i = 0; i < d.length; i += 4 * 397) {
    seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    if (seen.size > 400) break;
  }
  return seen.size;
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 450));

/** Click the button in `sel` whose text contains `needle`. */
async function clickIn(root: Element, sel: string, needle: string): Promise<void> {
  const host = root.querySelector(sel);
  if (host === null) throw new Error(`no ${sel}`);
  const b = [...host.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes(needle));
  if (b === undefined) throw new Error(`no '${needle}' in ${sel}`);
  b.click();
  await settle();
}

/** Click the button whose text IS `label` — "circle" is a substring of "semicircle ↑". */
async function clickExact(root: Element, label: string): Promise<void> {
  const b = [...root.querySelectorAll("button")].find((x) => (x.textContent ?? "").trim() === label);
  if (b === undefined) throw new Error(`no button labelled exactly '${label}'`);
  b.click();
  await settle();
}

describe("the drill's mask, on the stage", () => {
  it("takes the CONTOUR off the ink layer at rung iii, and gives it back on a pick", async () => {
    const root = await app();
    const booted = inkPixels(root);
    // The app's default circle is on screen: a contour is ink, and this is the control.
    expect(booted).toBeGreaterThan(1000);

    await clickExact(root, "Drill");
    await clickIn(root, ".drillPanel", "∫ cos x/(x²+1) dx");
    const worked = inkPixels(root);
    expect(worked, "rung i draws the record's own contour").toBeGreaterThan(1000);

    await clickIn(root, ".drillCard", "Next rung");
    expect(inkPixels(root), "rung ii masks the ledger, not the contour").toBeGreaterThan(1000);

    await clickIn(root, ".drillCard", "Next rung");
    // **THE CLAIM**: not "fewer pixels", not "a different picture" — none at all. The ink layer is
    // the contour, its handles and its cuts, and at this rung the reader has not chosen one.
    expect(inkPixels(root), "rung iii must leave NOTHING of the contour").toBe(0);

    await clickExact(root, "semicircle ↓");
    expect(inkPixels(root), "a pick is the reader's own contour, and is drawn").toBeGreaterThan(1000);
  });

  it("does NOT mask the phase portrait — the problem stays on screen", async () => {
    // The mask hides the ANSWER. The integrand is the question, and a reader choosing a contour for
    // it needs to see where it decays and where its poles are.
    const root = await app();
    const before = portraitColours(root);
    expect(before, "the portrait is rendered at all").toBeGreaterThan(12);

    await clickExact(root, "Drill");
    await clickIn(root, ".drillPanel", "∫ cos x/(x²+1) dx");
    await clickIn(root, ".drillCard", "Next rung");
    await clickIn(root, ".drillCard", "Next rung");
    expect(inkPixels(root)).toBe(0);
    expect(portraitColours(root), "the portrait survives the mask").toBeGreaterThan(12);
  });
});
