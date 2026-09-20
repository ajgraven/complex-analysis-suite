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

import { mountShell2 } from "../src/shell/app.js";
import { plotToScreen } from "../src/kernel/camera.js";

import "katex/dist/katex.min.css";
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

describe("the two marks the cutover's parity sweep found missing", () => {
  it("DRAWS the pen's path while it is being drawn", async () => {
    // **It was not drawn at all.** shell2 put down the crosshair cursor and the snap chip and
    // nothing else, so every vertex a reader placed was invisible until they committed the whole
    // path — and `inkTheme.ts` had carried a `penPreview` colour since step 1.2 that nothing drew
    // with, which is the same gap seen from the palette's side. Three jsdom specs assert the pen's
    // SESSION and never its ink, and `penInk.browser.test.ts` measures the committed contour, so
    // nothing could see it.
    const { root, app } = mount();
    const ink = root.querySelector<HTMLCanvasElement>("canvas.ink");
    if (ink === null) throw new Error("no ink canvas");
    app.actions().toSandbox();
    await settled();
    const before = pixels(ink);
    app.stage().penStart();
    const box = ink.getBoundingClientRect();
    for (const [fx, fy] of [[0.3, 0.3], [0.6, 0.35], [0.5, 0.6]] as const) {
      ink.dispatchEvent(pointerAt("pointerdown", box.left + box.width * fx, box.top + box.height * fy, 1));
    }
    await settled();
    // Read while the pen is still OUT: the draft's ink is the subject, and committing or cancelling
    // would take it away again.
    const during = pixels(ink);
    expect(app.session().pen?.nodes, "the clicks placed no vertices").toHaveLength(3);
    expect(differing(before, during)).toBeGreaterThan(0);

    // The draft's DASHES are asserted in the next test, which has one straight segment whose two
    // ends it knows exactly — three snapped clicks do not give a geometry a walk can follow without
    // the test carrying a second copy of the pen.
  });

  it("draws a TWO-vertex path, which is one segment and the commonest thing a reader starts with", async () => {
    // A guard of `nodes.length >= 3` would leave the first segment invisible — the moment a reader
    // most needs to see that the pen is doing anything.
    //
    // **Which moment that is took measuring.** Two clicks do NOT reach it: `penClick` sets the
    // pending end to the vertex it just placed, so two placed vertices are THREE nodes and a
    // `>= 3` guard draws the segment anyway. The state the guard actually decides is the one
    // between the first click and the second — one placed vertex and the rubber band to the
    // cursor — and that is also the first thing the pen ever shows.
    const { root, app } = mount();
    const ink = root.querySelector<HTMLCanvasElement>("canvas.ink");
    if (ink === null) throw new Error("no ink canvas");
    app.actions().toSandbox();
    await settled();
    const before = pixels(ink);
    app.stage().penStart();
    const box = ink.getBoundingClientRect();
    // **In a CORNER**, which took three attempts to get right: the committed circle fills most of
    // this canvas, so a window on a segment across the middle is a window on the circle — and the
    // pointer events move `session.hover`, which re-strokes a hovered piece at 4 px against 2.5, so
    // the window gained pixels with the draft not drawn at all. Up here the control reads 0.
    ink.dispatchEvent(pointerAt("pointerdown", box.left + box.width * 0.1, box.top + box.height * 0.12, 1));
    ink.dispatchEvent(pointerAt("pointermove", box.left + box.width * 0.3, box.top + box.height * 0.14, 0));
    await settled();
    const draft = app.session().pen;
    if (draft === null || draft === undefined) throw new Error("the pen is not out");
    expect(draft.nodes).toHaveLength(1);
    const pending = draft.at;
    if (pending === null) throw new Error("the pen has no pending end");

    // **At the segment's OWN midpoint**, read off the placed vertex and the pending end rather than
    // off the event positions: the pen snaps, so where the reader pressed and where the vertex
    // landed are two different points.
    //
    // The first draft asked only that SOME pixel had changed, and a sweep showed it passing with the
    // draft not drawn at all — the pointer events move `session.hover`, which re-emphasises a piece
    // of the committed contour, so the canvas differs whatever the pen did.
    const dpr = ink.width / (box.width || ink.width);
    const vp = { width: ink.width / dpr, height: ink.height / dpr };
    const mid: [number, number] = [
      (draft.nodes[0].at[0] + pending[0]) / 2,
      (draft.nodes[0].at[1] + pending[1]) / 2,
    ];
    const [mx, my] = plotToScreen(mid[0], mid[1], app.currentState().view, vp);
    // A 3 px window, because the stroke is 4.5 px of halo about a line through this point and the
    // device ratio rounds. **Counted BEFORE and after**, because the committed contour runs near
    // here too — measured, a window across the middle is already 34 pixels inked with no pen out at
    // all, so an absolute count is a count of the circle.
    const window = (px: Uint8ClampedArray): number => {
      let n = 0;
      for (let dx = -3; dx <= 3; dx++) {
        for (let dy = -3; dy <= 3; dy++) {
          const i = (Math.round((my + dy) * dpr) * ink.width + Math.round((mx + dx) * dpr)) * 4;
          if (px[i + 3] > 8) n++;
        }
      }
      return n;
    };
    const after = pixels(ink);
    expect(window(before), "the control window is not clear — it measures the contour").toBe(0);
    expect(window(after), "the one-segment draft is not drawn").toBeGreaterThan(5);

    // **And it is DASHED**, which took a third instrument. A path in progress is dashed because it
    // is not a contour — no roles, no value, no verdict — and drawing it like a finished piece would
    // claim otherwise. Two earlier attempts could not see it. INK: the draft lays down 1,831 pixels
    // dashed and 1,907 solid, a 4% difference, because most of that ink is the halo's WIDTH rather
    // than its length. RUNS OF INK along the segment: one run whichever way it was stroked, and the
    // reason is in `drawPenPath` — the halo is stroked with the same `[6, 4]` dash and `lineCap`
    // `"round"`, so each 4 px gap is closed by two 2.25 px caps and the halo is continuous.
    //
    // What the gaps do leave is the CORE colour: `penPreview` on a dash, halo alone between. So the
    // walk compares the centreline against a point 1.6 px off it — inside the 4.5 px halo, outside
    // the 1.8 px core — and counts the runs where the two differ. Measured: 13 over 119 px, which
    // is the dash period of 10, against 1 with `setLineDash` removed.
    const [ax, ay] = plotToScreen(draft.nodes[0].at[0], draft.nodes[0].at[1], app.currentState().view, vp);
    const [bx, by] = plotToScreen(pending[0], pending[1], app.currentState().view, vp);
    const len = Math.hypot(bx - ax, by - ay);
    const [ux, uy] = [(bx - ax) / len, (by - ay) / len];
    const rgb = (x: number, y: number): readonly number[] => {
      const i = (Math.round(y * dpr) * ink.width + Math.round(x * dpr)) * 4;
      return [after[i], after[i + 1], after[i + 2]];
    };
    let runs = 0;
    let on = false;
    for (let d = 6; d <= len - 6; d += 0.5) {
      const [cx, cy] = [ax + ux * d, ay + uy * d];
      const [c, h] = [rgb(cx, cy), rgb(cx - uy * 1.6, cy + ux * 1.6)];
      const core = Math.max(...c.map((v, k) => Math.abs(v - h[k]))) > 24;
      if (core && !on) runs++;
      on = core;
    }
    expect(runs, "the draft is drawn as one unbroken line — it is not dashed").toBeGreaterThanOrEqual(5);
  });

  it("DRAWS the cut system's handles, which were hit-testable and invisible", async () => {
    // Grabbable since step 1.3 and painted by nothing: a reader could take hold of a branch point,
    // drag it and hear it announced, aiming at a spot on an empty plane.
    //
    // **In the SANDBOX**, which is where the handles exist at all: the Branch Cuts card says in as
    // many words that a record's cuts are the record's, and the keyhole template seeds the cut
    // system its own shape presupposes (M4.6). The first draft of this test reached for a tier-D
    // record and found `state.branch.points` empty — a record's cuts do not live in the state.
    const { root, app } = mount();
    const ink = root.querySelector<HTMLCanvasElement>("canvas.ink");
    if (ink === null) throw new Error("no ink canvas");
    app.actions().toSandbox();
    app.actions().setTemplate("keyhole");
    await settled();
    expect(app.currentState().branch.points.length, "the keyhole seeded no branch points").toBeGreaterThan(0);
    const full = app.currentState();
    const plain = pixels(ink);

    // **The discriminator is the EMPHASIS, which only a handle can show.** Two earlier attempts were
    // not about the handles at all: emptying the whole cut system measures the cut POLYLINES, which
    // were drawn all along, and an annulus around a branch point is crossed by the cut's own ray
    // (232 inked pixels there with no handle drawn). What nothing else on this canvas can produce is
    // the same frame, same state, same cuts — with one handle held. If the marks are not drawn,
    // holding one changes no pixel.
    app.session().held = { label: "a branch point", at: full.branch.points[0].at };
    app.actions().redraw();
    await settled();
    const held = pixels(ink);
    expect(differing(plain, held), "holding a branch handle changes nothing on the canvas").toBeGreaterThan(0);

    // **And that it is a SQUARE**, which the assertion above cannot see: a diamond emphasises just
    // as visibly. The mark's whole job is to be told apart from the diamond a cut VERTEX carries and
    // from the four round things on this canvas, so the shape is the content, not a decoration.
    //
    // **The instrument is the CORNER, and it measures a CHANGE rather than ink.** "Was clear, now
    // inked" is not available here — the keyhole's inner circle and its two lips meet at the origin,
    // so the 25 px about the branch point are already ink in both frames, measured. What the two
    // frames do not share is the mark itself: holding it takes `r` from 5 to 7, so a square's halo
    // sweeps the diagonal at (±8, ±8) and a diamond's does not come within 6 px of it (its halo
    // stops at |dx| + |dy| ≈ 9.8). Measured on the keyhole: 4 corners of 4 change when the mark is
    // held, and 0 with `square` forced false.
    const box = ink.getBoundingClientRect();
    const dpr = ink.width / (box.width || ink.width);
    const vp = { width: ink.width / dpr, height: ink.height / dpr };
    const [hx, hy] = plotToScreen(full.branch.points[0].at[0], full.branch.points[0].at[1], full.view, vp);
    const changedAt = (x: number, y: number): boolean => {
      const i = (Math.round(y * dpr) * ink.width + Math.round(x * dpr)) * 4;
      return (
        plain[i] !== held[i] ||
        plain[i + 1] !== held[i + 1] ||
        plain[i + 2] !== held[i + 2] ||
        plain[i + 3] !== held[i + 3]
      );
    };
    let corners = 0;
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      if (changedAt(hx + 8 * sx, hy + 8 * sy)) corners++;
    }
    expect(corners, "the held mark has no corners — it is not a square").toBeGreaterThanOrEqual(3);
  });
});
