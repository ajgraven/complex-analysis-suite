// **Two layouts that were wrong in the same way** — a container whose children are a SENTENCE — and
// two measurements, M8 step 2.1.
//
// The node gate cannot see either: `getBoundingClientRect` is all zeros in jsdom, so a panel that
// draws its five columns past the edge of its own dialog and a paragraph that sets a sentence as a
// column of flex items both read as perfectly ordinary DOM.
import { afterEach, describe, expect, it } from "vitest";

import { mountShell2 } from "../src/shell/app.js";

import "katex/dist/katex.min.css";
import "../src/ui/theme.css";
import "../src/ui/shell.css";

const mounted: ReturnType<typeof mountShell2>[] = [];
afterEach(() => {
  for (const app of mounted.splice(0)) app.destroy();
  document.body.replaceChildren();
  if (window.location.hash !== "") window.history.replaceState(null, "", window.location.pathname);
});

function mount(): ReturnType<typeof mountShell2> {
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;inset:0;width:1440px;height:950px";
  document.body.replaceChildren(root);
  const app = mountShell2(root);
  mounted.push(app);
  return app;
}

const settled = async (): Promise<void> => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
};

describe("the contrast ladder", () => {
  it("costs the stage NOTHING while it is shut, and gives it back when it closes", async () => {
    // **The grid grew a row for it** (M8 step 3.5), and a row that reserved height would take it
    // off the stage on every page load for the sake of a panel most readers never open. `auto` plus
    // a `hidden` wrapper is exactly zero; jsdom cannot see the difference, because every rect there
    // is zeros either way.
    const app = mount();
    await settled();
    const wrap = document.querySelector<HTMLElement>(".ladderWrap");
    const stage = document.querySelector<HTMLElement>(".stage2");
    if (wrap === null || stage === null) throw new Error("no ladder wrapper or stage");
    expect(wrap.getBoundingClientRect().height).toBe(0);
    const tall = stage.getBoundingClientRect().height;

    app.actions().setContrastsOpen(true);
    await settled();
    const open = wrap.getBoundingClientRect().height;
    expect(open, "the strip drew nothing").toBeGreaterThan(40);
    // The stage pays for the strip and for nothing else — the arithmetic, not an inequality, so a
    // layout that also ate a margin somewhere would fail.
    expect(Math.round(stage.getBoundingClientRect().height)).toBe(Math.round(tall - open));

    app.actions().setContrastsOpen(false);
    await settled();
    expect(wrap.getBoundingClientRect().height).toBe(0);
    expect(Math.round(stage.getBoundingClientRect().height)).toBe(Math.round(tall));
  });

  it("draws all five cases inside the strip, each one whole", async () => {
    // **The grid this replaced never fitted.** Its table wore `numTable`, whose `th` rule is
    // `white-space: nowrap`, so no column head wrapped and the table was wider than the dialog at
    // every window size — 2,209 px in a 1,088 px dialog, with the fourth and fifth columns drawn
    // past the edge where nothing could reach them. The strip is a flex row in the stage's own
    // column, which is narrower still, so the same question has to be asked again of the new shape.
    const app = mount();
    await settled();
    app.actions().setContrastsOpen(true);
    await settled();
    const list = document.querySelector<HTMLElement>(".ladderList");
    if (list === null) throw new Error("no ladder list");
    const cards = [...list.querySelectorAll<HTMLElement>("button.ladderCard")];
    expect(cards).toHaveLength(5);
    // Every card is inside the region's own scroll width — which is what "reachable" means for a
    // row that may scroll — and nothing is clipped horizontally inside a card.
    for (const c of cards) {
      expect(c.getBoundingClientRect().width, "a case collapsed to nothing").toBeGreaterThan(80);
      expect(c.scrollWidth, `${c.getAttribute("data-cell") ?? "?"} overflows its own box`).toBeLessThanOrEqual(
        c.clientWidth + 1,
      );
    }
    // And they are laid out as a ROW: five cards, five different left edges, one shared top.
    const tops = new Set(cards.map((c) => Math.round(c.getBoundingClientRect().top)));
    expect(tops.size, "the cases wrapped into a column").toBe(1);
    expect(new Set(cards.map((c) => Math.round(c.getBoundingClientRect().left))).size).toBe(5);
    // **And the strip does not cost more than the stage it comments on.** In the stage's own
    // column the five cases are 152 px wide, every line wraps, and the panel is 335 px tall beside
    // a stage of 328 — which is what sent it across all three columns, where it is 231 and the
    // stage keeps 433. The numbers are in `shell.css`; this is the claim they were taken for.
    const strip = document.querySelector<HTMLElement>(".ladderWrap");
    const stage2 = document.querySelector<HTMLElement>(".stage2");
    if (strip === null || stage2 === null) throw new Error("no ladder wrapper or stage");
    expect(strip.getBoundingClientRect().height).toBeLessThan(stage2.getBoundingClientRect().height);
  });

  it("marks the declared check in the Result card where a reader can SEE it", async () => {
    // The mark is a background and an inset rule, so the node gate can only assert the attribute.
    // What it cannot assert is that the row is on screen at all: the check list is a disclosure,
    // and a highlight inside a closed `<details>` has a height of zero.
    const app = mount();
    await settled();
    app.actions().setContrastsOpen(true);
    await settled();
    const card = [...document.querySelectorAll<HTMLButtonElement>("button.ladderCard")].find(
      (b) => b.getAttribute("data-cell") === "oscillatory",
    );
    if (card === undefined) throw new Error("no oscillatory case");
    card.click();
    await settled();
    const marked = document.querySelector<HTMLElement>('.checkRow[data-change="declared"]');
    if (marked === null) throw new Error("no marked row");
    const box = marked.getBoundingClientRect();
    expect(box.height, "the marked row is inside a closed disclosure").toBeGreaterThan(8);
    expect(box.width).toBeGreaterThan(80);
  });
});

describe("a verdict", () => {
  it("sets its sentence as ONE flow, however many nodes the sentence is", async () => {
    // `.verdict` was `display: flex`, which makes every node of the sentence a flex item. That is
    // fine for a badge and one string and wrong for the sentences this app composes: a refusal
    // naming $R(z)$ is text, formula, text, formula, text, and it was laid out as five columns two
    // words wide. Measured in the same 19rem rail: 342 px tall as a flex row against 133 px as a
    // paragraph, for the same words.
    const app = mount();
    await settled();
    const p = document.createElement("p");
    p.className = "verdict";
    const card = document.querySelector<HTMLElement>('[data-card="cuts"]');
    if (card === null) throw new Error("no cuts card");
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "⚠";
    p.append(badge);
    // The shape of a real one: alternating text and typeset formula, nine nodes.
    for (const word of ["the declared factor times ", "R(z)", " is not the expression that was in ", "the box", " — they differ by 2.01e+0 relative, at points where the two determinations agree"]) {
      const span = document.createElement("span");
      span.textContent = word;
      p.append(span);
    }
    card.append(p);
    await settled();
    // **The instrument is the WIDTH of one node, not the height of the paragraph.** The first draft
    // asked that the paragraph be under nine lines tall; measured, the flex version is 129.9 px and
    // the flowing one 78.3 px against a 18.1 px line, so seven lines against four — and the mutant
    // passed. A flex row does not wrap, so it squeezes each child into its own column; in flow the
    // first run of text is long enough to fill the width and wrap.
    const width = p.getBoundingClientRect().width;
    // Measured: the first run of text is 140.4 px of the paragraph's 260.8 flowing, and 48.0 px
    // squeezed — 0.538 against 0.184, so the bound sits between them with room either side.
    const first = (p.children[1] as HTMLElement).getBoundingClientRect().width;
    expect(first / width, "the sentence is not flowing — its nodes are in columns").toBeGreaterThan(0.35);
    app.destroy();
  });
});
