// The drill's MASK, on a real canvas — the half jsdom cannot see at all.
//
// `shell2Drill.test.ts` pins everything the mask does to the DOM: the KILL rows leave the ledger, the
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
//
// ── M8 step 1.12: MOUNTED ON THE NEW SHELL ────────────────────────────────────────────────────
//
// `mountApp` is gone. The drill is the same model (`src/shell/drill.ts`) behind a different door:
// the bar's mode control instead of a full-screen overlay's button, and a right-rail card
// (`[data-card="drill"]`) instead of `.drillPanel` / `.drillCard`. `shell2Drill.test.ts` is the DOM
// half and records the route; `actions().setMode("drill")` is what a reader presses.
//
// **AND THE INK LAYER NOW CARRIES THE POLES, so "none at all" had to be RE-EXPRESSED rather than
// weakened.** In the old shell `canvas.ink` was the contour and nothing else, and the claim could be
// `toBe(0)` on the whole canvas. `shell2/stageView.ts` moved the pole rings down onto that canvas —
// deliberately, and it says why: at the rung whose question is *"which contour?"* the singularities
// are the question's DATA, not its answer. Measured, `toBe(0)` on the raw canvas now reads **367**,
// every one of those pixels a pole ring.
//
// So the claim is made about every pixel that is NOT one of those rings. The pole positions are read
// off the resolution the app itself drew and put on the canvas by the same `plotToScreen` the stage
// used (2 poles, at (296, 153) and (296, 460) in canvas pixels), and a disk of 24 px is excluded
// around each. What is left has to be EMPTY — not "less", not "different", and the exclusion is
// nowhere near large enough to buy that: **rung i leaves 4,174 pixels outside those same disks and
// the boot state 9,487**, against a total excluded area of ~3,600. The two numbers are read from the
// live canvas in the test, not transcribed, so a record whose contour moves does not go stale.
import { afterEach, describe, expect, it } from "vitest";
import "katex/dist/katex.min.css";
import "@cas/ui/nav.css";
import "../src/ui/theme.css";
import "../src/ui/shell.css";
import { mountShell2 } from "../src/shell/app.js";
import { plotToScreen } from "../src/kernel/camera.js";

const mounted: ReturnType<typeof mountShell2>[] = [];
afterEach(() => {
  for (const handle of mounted.splice(0)) handle.destroy();
  if (window.location.hash !== "") window.history.replaceState(null, "", window.location.pathname);
});

/**
 * Mount the app, sized as the page sizes it.
 *
 * The root gets a desktop box because the harness's body has none, and every mount is destroyed
 * after the test: a shell writes `#vs=` 250 ms after its last change and the next one reads it at
 * boot, and since step 1.11 it also holds a `keydown` listener on the DOCUMENT.
 */
async function app(): Promise<{ root: HTMLElement; handle: ReturnType<typeof mountShell2> }> {
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;inset:0;width:1280px;height:900px";
  document.body.replaceChildren(root);
  try {
    window.localStorage.clear();
  } catch {
    /* nothing to clear */
  }
  const handle = mountShell2(root);
  mounted.push(handle);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 400));
  return { root, handle };
}

/**
 * Where the app drew its poles, in the ink canvas's own pixels.
 *
 * Read from the state and the resolution the shell is holding rather than from the record's source,
 * so the day a record's pole set changes this follows it. The device-pixel ratio is taken from the
 * canvas itself (`sized()` scales by `min(devicePixelRatio, 2)`), which is one fact fewer to assume.
 *
 * **A SANDBOX state returns an empty list**, because a sandbox's poles come from the cached compile
 * and the handle does not publish it. That is deliberate rather than a gap: the one assertion made
 * against a sandbox state here is the rung-iii PICK, which is a lower bound, so an empty exclusion
 * can only make it harder to pass. The `toBe(0)` that the exclusion exists for is a gallery state —
 * rung iii is the contrast cell's own record — and there the two poles are found.
 */
function poleCentres(root: Element, handle: ReturnType<typeof mountShell2>): readonly (readonly [number, number])[] {
  const canvas = root.querySelector<HTMLCanvasElement>("canvas.ink");
  const host = root.querySelector<HTMLElement>("div.stage2");
  if (canvas === null || host === null) throw new Error("no stage");
  const resolution = handle.resolution();
  const report = resolution.kind === "gallery" ? resolution.run?.poles : null;
  const vp = { width: host.clientWidth, height: host.clientHeight };
  const dpr = canvas.width / Math.max(vp.width, 1);
  return (report?.poles ?? []).map((pole) => {
    const [x, y] = plotToScreen(pole.at[0], pole.at[1], handle.currentState().view, vp);
    return [x * dpr, y * dpr] as const;
  });
}

/**
 * How far from a pole's centre its glyph can reach.
 *
 * The ring is `POLE_R` = 6 at line width 4, and a pole of order > 1 puts its order label at
 * `+POLE_R + 6` in x and `−POLE_R − 2` in y. 24 covers both with room to spare, and the header
 * records the measurement that says the room costs nothing.
 */
const POLE_EXCLUSION_PX = 24;

/**
 * How many pixels of the ink layer are not transparent — the contour, its handles and its cuts.
 *
 * `except` is the pole list: those rings are on this canvas too and are NOT masked by any rung.
 */
function inkPixels(root: Element, except: readonly (readonly [number, number])[] = []): number {
  const c = root.querySelector<HTMLCanvasElement>("canvas.ink");
  if (c === null) throw new Error("no ink canvas");
  const ctx = c.getContext("2d");
  if (ctx === null) throw new Error("no 2-D context");
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const r2 = POLE_EXCLUSION_PX * POLE_EXCLUSION_PX;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] <= 8) continue;
    const px = (i - 3) / 4;
    const x = px % c.width;
    const y = (px - x) / c.width;
    if (except.some(([cx, cy]) => (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r2)) continue;
    n++;
  }
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

/** The drill's card — the chooser before a pick, the open rung after one. */
const drillCard = (root: Element): HTMLElement => {
  const card = root.querySelector<HTMLElement>('[data-card="drill"]');
  if (card === null) throw new Error("no drill card");
  return card;
};

/** Click the button in `host` whose text contains `needle`. */
async function clickIn(host: Element, needle: string): Promise<void> {
  const b = [...host.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes(needle));
  if (b === undefined) throw new Error(`no '${needle}' in the drill card`);
  b.click();
  await settle();
}

/**
 * Open a task from the chooser, by the `aria-label` its own button carries.
 *
 * By label rather than by the row's text, `shell2Drill.test.ts`'s reason: `forced-downward`'s words
 * EXTEND `oscillatory`'s, so a `textContent.includes` matches both and the row a test then reads is
 * whichever came first.
 */
async function openTask(root: Element, label: string): Promise<void> {
  const b = [...drillCard(root).querySelectorAll<HTMLButtonElement>("button")].find((x) =>
    (x.getAttribute("aria-label") ?? "").startsWith(`open ${label} at rung `),
  );
  if (b === undefined) throw new Error(`no chooser row for '${label}'`);
  b.click();
  await settle();
}

/** Click the button whose text IS `label` — "circle" is a substring of "semicircle ↑". */
async function clickExact(host: Element, label: string): Promise<void> {
  const b = [...host.querySelectorAll("button")].find((x) => (x.textContent ?? "").trim() === label);
  if (b === undefined) throw new Error(`no button labelled exactly '${label}'`);
  b.click();
  await settle();
}

describe("the drill's mask, on the stage", () => {
  it("takes the CONTOUR off the ink layer at rung iii, and gives it back on a pick", async () => {
    const { root, handle } = await app();
    const booted = inkPixels(root, poleCentres(root, handle));
    // The cold start's own contour is on screen: a contour is ink, and this is the control.
    expect(booted).toBeGreaterThan(1000);

    // The bar's mode control is the drill's only door for a reader — M8 step 1.7.
    handle.actions().setMode("drill");
    await settle();
    await openTask(root, "∫ cos x/(x²+1) dx");
    const worked = inkPixels(root, poleCentres(root, handle));
    expect(worked, "rung i draws the record's own contour").toBeGreaterThan(1000);

    await clickIn(drillCard(root), "Next rung");
    expect(inkPixels(root, poleCentres(root, handle)), "rung ii masks the ledger, not the contour").toBeGreaterThan(
      1000,
    );

    await clickIn(drillCard(root), "Next rung");
    // **THE CLAIM**: not "fewer pixels", not "a different picture" — none at all, once the pole
    // rings this rung deliberately keeps are set aside. The rest of the ink layer is the contour,
    // its handles and its cuts, and at this rung the reader has not chosen one.
    expect(inkPixels(root, poleCentres(root, handle)), "rung iii must leave NOTHING of the contour").toBe(0);

    await clickExact(drillCard(root), "semicircle ↓");
    expect(
      inkPixels(root, poleCentres(root, handle)),
      "a pick is the reader's own contour, and is drawn",
    ).toBeGreaterThan(1000);
  });

  it("does NOT mask the phase portrait — the problem stays on screen", async () => {
    // The mask hides the ANSWER. The integrand is the question, and a reader choosing a contour for
    // it needs to see where it decays and where its poles are.
    const { root, handle } = await app();
    const before = portraitColours(root);
    expect(before, "the portrait is rendered at all").toBeGreaterThan(12);

    handle.actions().setMode("drill");
    await settle();
    await openTask(root, "∫ cos x/(x²+1) dx");
    await clickIn(drillCard(root), "Next rung");
    await clickIn(drillCard(root), "Next rung");
    expect(inkPixels(root, poleCentres(root, handle))).toBe(0);
    expect(portraitColours(root), "the portrait survives the mask").toBeGreaterThan(12);
  });
});
