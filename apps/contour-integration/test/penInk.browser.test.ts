// The pen's GESTURE, in a real browser — the half jsdom cannot reach.
//
// `pen.test.ts` pins the arithmetic (`bulgeFromApex` inverts `arcThroughBulge`) and the grammar's
// bookkeeping (what a click places, what closes, what Undo removes). What it cannot supply is the
// app's own LAYOUT: a stage with a true aspect, a grab tolerance of 11 real pixels, and pointer
// positions that mean on the plane what they say on the screen. Everything here needs one of those.
//
// **AND THE STORY THIS FILE WAS FIRST WRITTEN ON WAS WRONG, which measuring found.** The defect that
// shipped in the first draft — the drag bowing the piece LEAVING the new vertex, against a chord
// whose far end was still the click itself, so the chord was zero and nothing happened — was
// recorded as invisible to jsdom *by construction*, on the grounds that a zero-sized rect collapses
// every screen point to the view centre. It does not: `viewport()` guards with `|| 1`, so jsdom's
// map MAGNIFIES by 4, the chord is 280 world units long there, and the same drag produces a real arc
// with a bulge of −358. The jsdom test could have caught it and did not, because it asserted the
// piece COUNT where the defect shows in the KINDS. Both files assert the kinds now.
//
// **THE LAYOUT HAS TO BE THE APP'S, AND GETTING THAT WRONG COST THIS FILE TWO DRAFTS.** Mounting the
// shell without its stylesheets does not give a plain version of the app's layout, it gives a
// different one: `.shell` stops being a grid, the three canvases fall into normal flow at their
// intrinsic 300 × 150, and the measurements come out `.stage` = 1200 × 316 with `canvas.ink` =
// 1200 × 154 somewhere inside it — two boxes that in the real app are the same box. A test aiming at
// either is aiming at an artefact, which is how the first draft came to place "vertices" outside the
// drawing surface and then read the snap that never fired as a pen defect. So this file loads the
// page's THREE stylesheets — `katex.min.css` from `src/main.ts`, `theme.css` and `shell.css` from
// `index.html`; `app.css` went with the old shell at step 1.12, and this comment went on saying
// four until it was counted — and the browser project sets a desktop viewport (the default is a
// phone, see
// `vitest.browser.config.ts`). Re-measured on the new shell: `canvas.ink` is 592 × 613 at
// (304, 95) with a half-height of 1.94, and does not move for the rest of the gesture. It is
// NARROWER than the old shell's 928 × 564 because shell2 has two rails, which is why every offset
// below stays inside ±180 px of the centre.
//
// **MOUNTED ON THE NEW SHELL SINCE M8 STEP 1.12.** `mountApp` is gone; the pen is `mountShell2`'s
// stage controller (`src/shell/stageController.ts`), which is the same grammar with the same
// numbers — the drag still bows the piece ENDING at the new vertex, the close still needs three
// vertices, `snapTo` still names the constraint. Four things about the route changed and each one
// is a way to aim at nothing:
//
//  - **The pointer events go to `canvas.ink`.** The old shell listened on a transparent overlay
//    `div.stage`; shell2's controller binds to the ink canvas itself, and an event dispatched at the
//    host would bubble UP past it rather than down into it. So `surface()` reads the ink canvas's
//    own rect, which is also the rect `stagePoint` reads.
//  - **`setPointerCapture` has to be stubbed.** A synthetic `PointerEvent` carries a `pointerId` the
//    browser has no active pointer for, and `onPointerDown`'s pen branch captures — which throws
//    `NotFoundError` and takes the click with it. `shell2.browser.test.ts` records the same.
//  - **The app opens on a RECORD (A6) rather than the sandbox**, and the pen is offered in the
//    sandbox only. `toSandbox()` is the reader's own route back to the circle at `1/z` — the state
//    the cold start was built on — and it frames, so the geometry every offset below is aimed at is
//    the one a reader would be looking at.
//  - **Every mount is destroyed**, for `shell2.browser.test.ts`'s reason: a shell writes `#vs=` 250 ms
//    after its last change and the next one reads it at boot, and since step 1.11 it also holds a
//    `keydown` listener on the DOCUMENT.
//
// The two surfaces the assertions read moved with the shell: the pending vertex count is the Contour
// card's `.num` (`[data-card="contour"]`), and the snap's name is the stage overlay's chip
// (`.stageChip.snap`) rather than a `.snapNote` in the rail — it is beside the pointer now, which is
// where research 07 rule 5 wants it.
import { afterEach, describe, expect, it } from "vitest";
import "katex/dist/katex.min.css";
import "../src/ui/theme.css";
import "../src/ui/shell.css";
import { mountShell2 } from "../src/shell/app.js";
import { penPath } from "../src/engine/contour/pen.js";

const mounted: ReturnType<typeof mountShell2>[] = [];
afterEach(() => {
  for (const handle of mounted.splice(0)) handle.destroy();
  if (window.location.hash !== "") window.history.replaceState(null, "", window.location.pathname);
});

/**
 * Mount the app, put it in the sandbox, and let it settle.
 *
 * The root is given the harness's own desktop box: the viewport is 1280 x 900 but the body has no
 * size, and the shell's grid needs one.
 */
async function app(): Promise<{ root: HTMLElement; handle: ReturnType<typeof mountShell2> }> {
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;inset:0;width:1280px;height:900px";
  document.body.replaceChildren(root);
  const handle = mountShell2(root);
  mounted.push(handle);
  // The reader's own route to the pen: the Contour card offers it in the sandbox only.
  handle.actions().toSandbox();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 350));
  return { root, handle };
}

const byLabel = <T extends HTMLElement = HTMLElement>(root: Element, label: string): T => {
  const e = root.querySelector<T>(`[aria-label="${label}"]`);
  if (e === null) throw new Error(`no [aria-label="${label}"]`);
  return e;
};

/** A pointer event on the stage at a page position, with the fields the shell reads. */
function send(stage: Element, type: string, x: number, y: number, buttons = 0, altKey = false): void {
  const ev = new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, buttons, pointerId: 1, altKey });
  stage.dispatchEvent(ev);
}

/**
 * A gesture step: dispatch, then yield.
 *
 * **Dispatching a move and a down in the same task does not work here**, and driving the same
 * sequence through Playwright's real pointer showed the product was fine — so the tests were wrong
 * and not the pen. The shell coalesces its draw through `requestAnimationFrame` and rebuilds the
 * Contour card only when the snap's NAME changes, so a synchronous burst reads the state of a frame
 * that has not happened yet.
 */
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 40));

/**
 * The drawing surface, and a point at a pixel offset from its centre.
 *
 * The offset is in SCREEN pixels on purpose: the snap tolerance is `GRAB_PX × scale(view, viewport)`,
 * so a distance expressed in pixels means the same thing at every zoom and nothing here has to know
 * the camera. **The rect is read at call time rather than captured**, because
 * `getBoundingClientRect` is viewport-relative and a focus change can scroll the page underneath a
 * gesture — which is exactly what the unstyled harness did when the pen's controls appeared (the
 * stage's `top` moved 349 → 304, and every point after that was 45 px out with nothing to show it).
 */
function surface(root: Element): {
  readonly el: Element;
  readonly at: (dx: number, dy: number) => readonly [number, number];
} {
  // **`canvas.ink`, not its host.** The controller's listeners are on the canvas and `stagePoint`
  // measures from the canvas's own rect, so a point built from the host's would be right only for as
  // long as the two boxes agree — and would be silently wrong the day they stop.
  const el = root.querySelector("canvas.ink");
  if (el === null) throw new Error("no ink canvas");
  // A synthetic pointer's id belongs to no active pointer, and the pen branch of `onPointerDown`
  // captures: unstubbed, the first click throws `NotFoundError` instead of placing a vertex.
  const cap = el as Element & Record<string, unknown>;
  cap.setPointerCapture = (): void => {};
  cap.releasePointerCapture = (): void => {};
  cap.hasPointerCapture = (): boolean => false;
  const first = el.getBoundingClientRect();
  // A real layout, which is the whole point of running this here — and the assertion that fails
  // loudly if the stylesheets ever stop arriving instead of quietly aiming at nothing.
  if (!(first.width > 400 && first.height > 300)) {
    throw new Error(`the stage is ${first.width} × ${first.height}; the app's CSS is missing`);
  }
  return {
    el,
    at: (dx, dy) => {
      const b = el.getBoundingClientRect();
      return [b.x + b.width / 2 + dx, b.y + b.height / 2 + dy] as const;
    },
  };
}

describe("the pen, drawn with a real pointer", () => {
  it("BOWS A PIECE INTO AN ARC on a held drag, at the app's own scale", async () => {
    // The jsdom twin proves the WIRING (a held move reaches `penBow` and the incoming piece becomes
    // an arc). This proves it where the numbers are the plane's: a real `PointerEvent`, a real rect,
    // no 4× magnification, and a bulge of order 0.1 in a view of half-height 2 — which is the range
    // a reader's drag actually produces.
    const { root, handle } = await app();
    const { el: stage, at } = surface(root);
    byLabel<HTMLButtonElement>(root, "draw a contour by hand").click();

    // Corner 1.
    send(stage, "pointerdown", ...at(-180, 120));
    await tick();
    // Corner 2, then hold and pull well off the chord to bow the piece 1 → 2.
    send(stage, "pointermove", ...at(180, 120));
    await tick();
    send(stage, "pointerdown", ...at(180, 120));
    await tick();
    send(stage, "pointermove", ...at(0, 240), 1);
    await tick();
    send(stage, "pointerup", ...at(0, 240));
    await tick();
    // Corner 3, plain.
    send(stage, "pointermove", ...at(0, -170));
    await tick();
    send(stage, "pointerdown", ...at(0, -170));
    await tick();
    // Close on the first vertex.
    send(stage, "pointermove", ...at(-180, 120));
    await tick();
    send(stage, "pointerdown", ...at(-180, 120));
    await new Promise((r) => setTimeout(r, 400));

    const pieces = handle.currentState().contour.pieces;
    expect(pieces).toHaveLength(3);
    // **THE CLAIM**: exactly one piece is an arc, and it is the one the drag bowed.
    expect(pieces.map((p) => p.geom.kind)).toEqual(["arc", "segment", "segment"]);
    expect(pieces[0].name).toBe("drawn arc 1");
    // The bulge survives into the path the codec would carry, with the sign of the drag's side.
    const path = penPath(handle.currentState().contour);
    expect(path?.closed).toBe(true);
    expect(path?.nodes[0].bulge).toBeDefined();
    expect(Math.abs(path?.nodes[0].bulge ?? 0)).toBeGreaterThan(0.1);
  });

  it("and a plain click sequence leaves every piece STRAIGHT, so the arc above is the drag's", async () => {
    // The control. Without it, "one arc" could be something the pen does to every path.
    const { root, handle } = await app();
    const { el: stage, at } = surface(root);

    byLabel<HTMLButtonElement>(root, "draw a contour by hand").click();
    for (const [dx, dy] of [
      [-180, 120],
      [180, 120],
      [0, -170],
      [-180, 120],
    ]) {
      send(stage, "pointermove", ...at(dx, dy));
      await tick();
      send(stage, "pointerdown", ...at(dx, dy));
      await tick();
      send(stage, "pointerup", ...at(dx, dy));
      await tick();
    }
    await new Promise((r) => setTimeout(r, 300));

    const pieces = handle.currentState().contour.pieces;
    expect(pieces.map((p) => p.geom.kind)).toEqual(["segment", "segment", "segment"]);
  });

  it("does NOT close a path of two — the click's own threshold, not the button's", async () => {
    // A sweep survivor: loosening `penClick`'s threshold from three to two left every node test
    // green, because the `Close` BUTTON's guard is a separate expression and was the only one under
    // test. The rule is reachable in jsdom too — the third click lands exactly on the first vertex,
    // so the distance is zero whatever the tolerance — and it lives here because that is the point:
    // here the gesture goes through the real snap at the real tolerance, and what is being pinned is
    // that a path of two refuses to close even when the pointer is ON its first vertex.
    const { root } = await app();
    const { el: stage, at } = surface(root);
    const place = async (dx: number, dy: number): Promise<void> => {
      send(stage, "pointermove", ...at(dx, dy));
      await tick();
      send(stage, "pointerdown", ...at(dx, dy));
      await tick();
    };

    byLabel<HTMLButtonElement>(root, "draw a contour by hand").click();
    await place(-180, 120);
    await place(180, 120);
    // Back onto the FIRST vertex with only two placed: this must place a third, not close.
    await place(-180, 120);
    expect(root.querySelector('[aria-label="draw a contour by hand"]'), "still drawing").toBeNull();
    // The Contour card's own count, which is where the pen row lives now.
    const num = root.querySelector('[data-card="contour"] .num')?.textContent ?? "";
    expect(num).toContain("3 vertex");
  });

  it("SNAPS with intent and NAMES the constraint, and a modifier suppresses it", async () => {
    // Research 07 rule 5, and two more sweep survivors: nothing tested that the first-vertex snap
    // exists or that Alt turns snapping off. Both need a real tolerance, so both live here.
    const { root } = await app();
    const { el: stage, at } = surface(root);
    // The stage's own chip, beside the pointer — the rail's `.snapNote` went with the old shell.
    const snapNote = (): string | null => root.querySelector(".stageChip.snap")?.textContent ?? null;

    byLabel<HTMLButtonElement>(root, "draw a contour by hand").click();
    for (const [dx, dy] of [
      [-180, 120],
      [180, 120],
    ]) {
      send(stage, "pointermove", ...at(dx, dy));
      await tick();
      send(stage, "pointerdown", ...at(dx, dy));
      await tick();
    }

    // Hover a few pixels off the first vertex: the snap fires and says which constraint it was.
    send(stage, "pointermove", ...at(-177, 122));
    await tick();
    expect(snapNote()).toContain("the first vertex");

    // The SAME position with the modifier held: no snap, and nothing claimed.
    send(stage, "pointermove", ...at(-177, 122), 0, true);
    await tick();
    expect(snapNote()).toBeNull();

    // And the axes name themselves too — a contour along ℝ is most of the gallery. `dy = 0` is the
    // stage's vertical centre, which is where the real axis is with the view centred at the origin.
    send(stage, "pointermove", ...at(150, 0));
    await tick();
    expect(snapNote()).toContain("real axis");
  });

  it("PLACES the snapped point, not the one the pointer was on", async () => {
    // A sweep survivor, and the difference between a snap and a hint: `penClick` could name the
    // constraint in the badge and still place the RAW pointer position, which is precisely what
    // "snap with intent" is not — the badge would be telling the reader about a move that never
    // happened. Aimed three pixels off the real axis, the committed vertex has y EXACTLY zero.
    const { root, handle } = await app();
    const { el: stage, at } = surface(root);
    byLabel<HTMLButtonElement>(root, "draw a contour by hand").click();
    for (const [dx, dy] of [
      [-180, 3],
      [180, 120],
      [0, -170],
      [-180, 3],
    ]) {
      send(stage, "pointermove", ...at(dx, dy));
      await tick();
      send(stage, "pointerdown", ...at(dx, dy));
      await tick();
    }
    await new Promise((r) => setTimeout(r, 300));

    const first = handle.currentState().contour.pieces[0].geom;
    expect(first.kind).toBe("segment");
    if (first.kind !== "segment") return;
    // Exactly zero, not near it: `penSnapTo` returns `[at[0], 0]`, and three pixels of raw pointer
    // would be about 0.02 world units here.
    expect(first.from.y).toBe(0);
  });

  it("closes, and the LEDGER certifies it exactly — M7.2's gate, in the app", async () => {
    const { root, handle } = await app();
    const { el: stage, at } = surface(root);

    // A triangle around the origin, where the boot integrand `1/z` has its simple pole.
    byLabel<HTMLButtonElement>(root, "draw a contour by hand").click();
    for (const [dx, dy] of [
      [-170, 110],
      [170, 110],
      [0, -160],
      [-170, 110],
    ]) {
      send(stage, "pointermove", ...at(dx, dy));
      await tick();
      send(stage, "pointerdown", ...at(dx, dy));
      await tick();
    }
    await new Promise((r) => setTimeout(r, 500));

    const text = ([...root.querySelectorAll(".rail2")].map((r) => r.textContent ?? "").join(" ")).replace(
      /\s+/g,
      " ",
    );
    // The hand-drawn contour is certified, not estimated: the value comes from the residue theorem
    // and the quadrature merely agrees with it.
    expect(text).toContain("2πi");
    expect(text).toContain("quadrature agrees");
    expect(text).toContain("the contour is closed (orientation as drawn)");
    expect(text).toContain("at 1 singularity, decided exactly");
    // And the card says the contour is hand-drawn, which is the only clue that it has no recipe.
    expect(text).toContain("drawn · 3 pieces");
    expect(handle.currentState().contourSource).toBeNull();
  });
});
