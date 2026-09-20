// **THE RENAME BOX, IN A REAL BROWSER** — M8 step 4.4.
//
// One claim, and it is here rather than in jsdom because jsdom **cannot** make it false: removing a
// focused element fires `blur` synchronously in Chromium and not at all in jsdom, so the whole
// sequence this file exists to pin — Enter commits, the render removes the input, the removed
// input's `blur` handler runs INSIDE `patch`, and a second render starts from inside the first —
// is unreachable there. Measured before it was fixed: every Enter and every Escape in the rename
// box threw `NotFoundError: The node to be removed is no longer a child of this node` out of an
// event handler, while the rename itself went through and the app suite stayed green.
//
// The fix is the shell's own rule — `setRenaming` with the value it already holds does nothing —
// and `dom.ts` is deliberately not hardened to tolerate the re-entrancy as well, because two fixes
// for one rule is step 4.3's finding and because `patch` throwing is what put this in front of
// anyone at all.
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
  app.actions().toSandbox();
  app.actions().setTemplate("semicircle");
  return { root, app };
}

const settled = async (): Promise<void> => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
};

/** Every uncaught error while `body` runs — the instrument, since the app keeps working regardless. */
async function thrown(body: () => Promise<void>): Promise<string[]> {
  const seen: string[] = [];
  const onError = (e: ErrorEvent): void => {
    seen.push(String(e.error ?? e.message));
  };
  window.addEventListener("error", onError);
  try {
    await body();
  } finally {
    window.removeEventListener("error", onError);
  }
  return seen;
}

const row = (root: ParentNode, id: string): HTMLElement => {
  const li = root.querySelector<HTMLElement>(`[data-card="contour"] li[data-piece="${id}"]`);
  if (li === null) throw new Error(`no row for ${id}`);
  return li;
};
const rename = (root: ParentNode, id: string): HTMLButtonElement => {
  const b = [...row(root, id).querySelectorAll<HTMLButtonElement>("button.pieceTool")].find((x) =>
    (x.getAttribute("aria-label") ?? "").startsWith("rename"),
  );
  if (b === undefined) throw new Error("no rename control");
  return b;
};

describe("committing a rename does not re-enter the renderer", () => {
  it("throws nothing on Enter, and the name is the one that was typed", async () => {
    const { root, app } = mount();
    await settled();
    const errors = await thrown(async () => {
      rename(root, "diameter").click();
      await settled();
      const box = root.querySelector<HTMLInputElement>("input.pieceRename");
      expect(box, "the rename control opened no box").not.toBeNull();
      if (box === null) return;
      // Focused by the shell after the patch, which is what makes the removal fire `blur` — the
      // whole mechanism. Asserted, because a box that never took focus would make the test vacuous.
      expect(document.activeElement).toBe(box);
      box.value = "the base";
      box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await settled();
    });
    expect(errors, errors.join(" | ")).toEqual([]);
    expect(app.currentState().contour.pieces[0].name).toBe("the base");
    expect(root.querySelector("input.pieceRename")).toBeNull();
  });

  it("throws nothing on Escape either, and abandons", async () => {
    const { root, app } = mount();
    await settled();
    const was = app.currentState().contour.pieces[0].name;
    const errors = await thrown(async () => {
      rename(root, "diameter").click();
      await settled();
      const box = root.querySelector<HTMLInputElement>("input.pieceRename");
      if (box === null) return;
      expect(document.activeElement).toBe(box);
      box.value = "something else";
      box.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await settled();
    });
    expect(errors, errors.join(" | ")).toEqual([]);
    expect(app.currentState().contour.pieces[0].name).toBe(was);
    expect(root.querySelector("input.pieceRename")).toBeNull();
  });
});
