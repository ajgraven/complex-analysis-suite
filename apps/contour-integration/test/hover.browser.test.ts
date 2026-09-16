// **The three-way hover link, in a real browser** — M8 step 1.10.
//
// One identifier, three surfaces: the piece list in the left rail (and the derivation lines beside
// it), the contour on the stage, and the accumulator's trail in the strip. The jsdom half of this is
// in `shell2.test.ts` and can see the session and the DOM; what it cannot see is whether anything
// was DRAWN differently, and two of the three surfaces are canvases.
//
// It also cannot see the strip's half at all: `stepNear` is a hit test against the drawn picture,
// and in jsdom `getBoundingClientRect` is all zeros, so the canvas is a 1×1 box and every point is
// over everything.
import { afterEach, describe, expect, it } from "vitest";

import { mountShell2 } from "../src/shell2/app.js";

import "katex/dist/katex.min.css";
import "@cas/ui/nav.css";
import "../src/ui/app.css";
import "../src/ui/theme.css";
import "../src/ui/shell2.css";

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

/** Every pixel of a canvas, at its native size. */
function pixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const rb = document.createElement("canvas");
  rb.width = canvas.width;
  rb.height = canvas.height;
  const ctx = rb.getContext("2d");
  if (ctx === null) throw new Error("no 2d context");
  ctx.drawImage(canvas, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

const differing = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++;
  }
  return n;
};

/**
 * The Contour card's piece rows.
 *
 * By POSITION in the card's list, because the rows carry no identifier of their own: the piece id is
 * the keyed builder's key, which is not in the DOM. That is fine for what is asserted here — the
 * subject is that hovering a row and hovering the trail light the SAME row — and a test that needed
 * the id would be asking the app to publish one for its benefit.
 */
const pieceRows = (root: HTMLElement): HTMLElement[] => [
  ...root.querySelectorAll<HTMLElement>('[data-card="contour"] li'),
];

/** A pointer event the app's own listeners accept, in client coordinates. */
function pointerAt(type: string, x: number, y: number, buttons = 0): PointerEvent {
  return new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, buttons, pointerId: 1 });
}

describe("the hover link, drawn", () => {
  it("EMPHASISES the hovered piece on the stage's ink layer", async () => {
    // The step's own gate: the highlight has to be visible, and the ink layer is the only place it
    // can be. The rail sets `session.hover.piece`; the stage reads the same field.
    const { root, app } = mount();
    await settled();
    const ink = root.querySelector<HTMLCanvasElement>("canvas.ink");
    if (ink === null) throw new Error("no ink canvas");
    const cold = pixels(ink);

    const rows = pieceRows(root);
    expect(rows.length, "no piece rows to hover").toBeGreaterThan(0);
    rows[0].dispatchEvent(new PointerEvent("pointerenter", { bubbles: true, pointerId: 1 }));
    await settled();
    expect(app.session().hover.piece, "the row did not set the hover").not.toBeNull();

    const hot = pixels(ink);
    // Measured on A6: hovering the first row moves 1,830 pixels of the ink layer — the piece is
    // stroked at 4 px rather than 2.5 and its arrowheads grow with it.
    expect(differing(cold, hot), "the stage did not redraw for the hovered piece").toBeGreaterThan(400);
  });

  it("lights the SAME piece from the accumulator's trail", async () => {
    // The strip's half, which no node test can reach: `stepNear` is a hit test against the drawn
    // picture and jsdom has no layout, so every point would be over every segment.
    const { root, app } = mount();
    await settled();
    const acc = root.querySelector<HTMLCanvasElement>("canvas.acc");
    if (acc === null) throw new Error("no accumulator canvas");
    const box = acc.getBoundingClientRect();
    expect(box.width, "the strip has no layout — the harness is not measuring the app").toBeGreaterThan(200);

    // Sweep the canvas for a point on the trail. A miss is the common case by design (measured at
    // 3.5% of a uniform grid), so the sweep is the test's own way of finding the curve rather than
    // a hardcoded point that a re-fit would silently move off it.
    let found: string | null = null;
    for (let gx = 0.04; gx < 0.98 && found === null; gx += 0.02) {
      for (let gy = 0.08; gy < 0.95; gy += 0.05) {
        acc.dispatchEvent(pointerAt("pointermove", box.left + box.width * gx, box.top + box.height * gy));
        if (app.session().hover.piece !== null) {
          found = app.session().hover.piece;
          break;
        }
      }
    }
    expect(found, "no point of the accumulator's trail named a piece").not.toBeNull();
    // **NOT `state.contour`'s ids** — the first draft compared against them and read `circle` where
    // the trail said `realAxis`, which is M6.1's finding meeting this test: the cold start is a
    // RECORD, its contour is the record's output, and `state.contour` is the parked sandbox curve.
    // The rail is drawn from the same drawn contour, so the rail is what the id is checked against.
    expect(root.querySelectorAll(".hot").length, "the rail did not light").toBeGreaterThan(0);
    const lit = pieceRows(root).filter((e) => e.classList.contains("hot"));
    expect(lit, "exactly one piece row is hot").toHaveLength(1);

    acc.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true, pointerId: 1 }));
    await settled();
    expect(app.session().hover.piece).toBeNull();
  });

  it("EMPHASISES the hovered piece on the trail too", async () => {
    const { root } = mount();
    await settled();
    const acc = root.querySelector<HTMLCanvasElement>("canvas.acc");
    if (acc === null) throw new Error("no accumulator canvas");
    const cold = pixels(acc);
    const rows = pieceRows(root);
    expect(rows.length, "A6 has two pieces, and the second one is the point").toBe(2);

    const hoverRow = async (k: number): Promise<Uint8ClampedArray> => {
      for (const row of rows) row.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true, pointerId: 1 }));
      rows[k].dispatchEvent(new PointerEvent("pointerenter", { bubbles: true, pointerId: 1 }));
      await settled();
      expect(rows[k].classList.contains("hot"), "the row that was hovered is not the one lit").toBe(true);
      return pixels(acc);
    };

    const first = await hoverRow(0);
    // Measured on A6's real segment: 960 pixels of the trail move when its row is hovered — and
    // it was 0 until this step, because `repaint` drew both rails and the stage and never the strip.
    expect(differing(cold, first), "the trail did not redraw for the hovered piece").toBeGreaterThan(300);

    // **And the SECOND row emphasises a different part of the trail.** A hover carries a piece id
    // and the walk knows piece indices, so something has to translate — and a translation that
    // always answered 0 would light the first piece whichever row was hovered, with the first
    // assertion above still green. Measured: 960 pixels differ between the two highlights.
    const second = await hoverRow(1);
    expect(differing(first, second), "both rows emphasise the same segments").toBeGreaterThan(300);
  });

  it("SHOWS THE READOUT over the stage and not over the strip", async () => {
    const { root } = mount();
    await settled();
    const ink = root.querySelector<HTMLCanvasElement>("canvas.ink");
    const acc = root.querySelector<HTMLCanvasElement>("canvas.acc");
    if (ink === null || acc === null) throw new Error("no canvases");
    const find = (): Element | null => root.querySelector('[data-testid="readout"]');

    const s = ink.getBoundingClientRect();
    ink.dispatchEvent(pointerAt("pointermove", s.left + s.width / 2, s.top + s.height / 2));
    await settled();
    expect(find(), "no readout over the stage").not.toBeNull();
    // It sits in the stage's top-left corner and nowhere near the middle, so it cannot cover the
    // contour it is describing.
    const r = find()?.getBoundingClientRect();
    expect((r?.left ?? 0) - s.left).toBeLessThan(24);
    expect((r?.top ?? 0) - s.top).toBeLessThan(24);

    const a = acc.getBoundingClientRect();
    acc.dispatchEvent(pointerAt("pointermove", a.left + a.width / 2, a.top + a.height / 2));
    ink.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true, pointerId: 1 }));
    await settled();
    expect(find(), "the readout outlived the pointer's visit to the stage").toBeNull();
  });
});
