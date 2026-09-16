// **Two layouts that were wrong in the same way** — a container whose children are a SENTENCE — and
// two measurements, M8 step 2.1.
//
// The node gate cannot see either: `getBoundingClientRect` is all zeros in jsdom, so a panel that
// draws its five columns past the edge of its own dialog and a paragraph that sets a sentence as a
// column of flex items both read as perfectly ordinary DOM.
import { afterEach, describe, expect, it } from "vitest";

import { mountShell2 } from "../src/shell/app.js";

import "katex/dist/katex.min.css";
import "@cas/ui/nav.css";
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

describe("the contrasts panel", () => {
  it("draws all five columns INSIDE its dialog", async () => {
    // **It never did.** The table wore `numTable`, whose `th` rule is `white-space: nowrap`, so no
    // column head ever wrapped and the table was wider than the dialog at every window size — step
    // 1.7's own screenshot has the third column cut off mid-word, and the fourth and fifth were
    // drawn past the edge where nothing could reach them. Measured before the fix at 1440 px: the
    // table is 2,209 px in a 1,088 px dialog. The class is gone and the layout is fixed-width, so
    // the columns share what there is and the heads wrap.
    const app = mount();
    await settled();
    app.actions().setContrastsOpen(true);
    await settled();
    const table = document.querySelector<HTMLTableElement>(".contrastGrid");
    if (table === null) throw new Error("no contrast grid");
    const dialog = table.closest<HTMLElement>(".modalDialog");
    if (dialog === null) throw new Error("no dialog");
    expect(table.tHead?.rows[0].cells.length, "not the five columns and their row heading").toBe(6);
    expect(table.scrollWidth, "the table is wider than the dialog holding it").toBeLessThanOrEqual(
      dialog.clientWidth,
    );
    // And every column is actually on screen, not merely inside a box that scrolls.
    const right = dialog.getBoundingClientRect().right;
    for (const cell of [...(table.tHead?.rows[0].cells ?? [])]) {
      expect(cell.getBoundingClientRect().right, `${cell.textContent?.slice(0, 20)} is off the dialog`).toBeLessThanOrEqual(right + 1);
    }
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
