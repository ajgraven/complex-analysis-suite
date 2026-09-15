// The new shell, in a real browser — M8 step 1.1.
//
// The step's own gate is *"`?shell=new` boots to an empty two-rail layout over a LIVE phase portrait
// of the default state"*, and the node suite structurally cannot see the second half: jsdom has no
// WebGL2, so `mountShell2` takes its `catch` branch and every stage assertion there is about a stage
// that does not exist. That is the standing warning in CLAUDE.md — the contour-integration browser
// suite was red for three milestones because the node gate cannot compile GLSL — met on the first
// step of the new shell rather than on the last.
//
// It also holds the one guard the node sweep could not kill: the portrait's program is relinked when
// the INTEGRAND changes and not when the camera moves. M5.1's review found the old shell relinking
// on every frame of a contour drag, which is invisible to every test that does not count.
import { expect, describe, it, vi } from "vitest";

import { mountShell2 } from "../src/shell2/app.js";
import { GLStage } from "../src/ui/stage/glStage.js";
// **The stylesheets `main.ts` loads, all of them.** Mounting without one does not give a plainer
// layout, it gives a DIFFERENT one — M7.2 lost a slice to that. Without `nav.css` the suite nav is
// an unstyled 287 px block instead of a fixed 48 px bar, so the first draft of the viewport test
// below measured the shell against a window the nav was wrongly claiming a third of.
import "katex/dist/katex.min.css";
import "@cas/ui/nav.css";
import "../src/ui/app.css";
import "../src/ui/shell2.css";

function mount(): { root: HTMLElement; app: ReturnType<typeof mountShell2> } {
  const root = document.createElement("div");
  // The app's grid needs a box with a size; the browser harness's default body has none, and M7.2
  // spent a slice discovering that a test aimed at an unsized stage is aimed at an artefact.
  root.style.cssText = "position:fixed;inset:0;width:1280px;height:900px";
  document.body.replaceChildren(root);
  return { root, app: mountShell2(root) };
}

/** Mount straight into the body, so the shell's own sizing is what is measured. */
function mountInBody(): ReturnType<typeof mountShell2> {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  return mountShell2(root);
}

/** Wait for the rAF coalescer to have drawn. */
const drawn = async (): Promise<void> => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
};

describe("the new shell in a browser", () => {
  it("boots over a LIVE phase portrait of the default state", async () => {
    const { root } = mount();
    await drawn();
    const gl = root.querySelector<HTMLCanvasElement>("canvas.gl");
    expect(gl).not.toBeNull();
    // The stage really got a WebGL2 context — in jsdom this is where the shell takes its catch.
    expect(gl?.getContext("webgl2")).toBeTruthy();
    // And it really drew. `1/z` is a pole at the origin, so the portrait sweeps the whole hue
    // circle; a blank or single-coloured canvas is what a stage that never rendered looks like.
    // `preserveDrawingBuffer` is on (M6.3's finding), so a read after compositing is not empty.
    const probe = document.createElement("canvas");
    probe.width = 64;
    probe.height = 64;
    const ctx = probe.getContext("2d");
    if (ctx === null || gl === null) throw new Error("no 2d context to read the portrait with");
    ctx.drawImage(gl, 0, 0, 64, 64);
    const { data } = ctx.getImageData(0, 0, 64, 64);
    const colours = new Set<number>();
    for (let i = 0; i < data.length; i += 4) colours.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    expect(colours.size, "the portrait is blank — the stage never rendered").toBeGreaterThan(12);
  });

  it("FILLS the viewport below the fixed nav, rather than collapsing to its content", async () => {
    // The first draft used `height: 100%`, which needs a sized ancestor `#app` does not provide: the
    // shell collapsed to 440 px in a 900 px window, leaving the stage 186 px tall — and, worse, it
    // was anchored at y = 0 under a `position: fixed` nav that sits at z-index 6 and swallows the
    // clicks in that band. This app shipped that defect once already; the old shell's own comment
    // records it. Measured against the WINDOW, because that is the claim.
    mountInBody();
    await drawn();
    const shell = document.querySelector("main.shell2");
    const nav = document.querySelector("nav.cas-nav");
    if (shell === null) throw new Error("no shell");
    const r = shell.getBoundingClientRect();
    const navH = nav?.getBoundingClientRect().height ?? 0;
    expect(r.height).toBeCloseTo(window.innerHeight - navH, 0);
    // It starts BELOW the nav rather than underneath it.
    expect(r.top).toBeGreaterThanOrEqual(navH - 1);
    // And the stage gets the space, rather than the rails keeping it.
    const stage = document.querySelector("div.stage2")?.getBoundingClientRect();
    expect(stage?.height ?? 0).toBeGreaterThan(r.height / 2);
  });

  it("has the two rails and the stage as real boxes, not a collapsed grid", async () => {
    const { root } = mount();
    await drawn();
    const rect = (sel: string): DOMRect => {
      const e = root.querySelector(sel);
      if (e === null) throw new Error(`no ${sel}`);
      return e.getBoundingClientRect();
    };
    const left = rect("aside.rail2.left");
    const right = rect("aside.rail2.right");
    const stage = rect("div.stage2");
    for (const [name, r] of [["left", left], ["right", right], ["stage", stage]] as const) {
      expect(r.width, `${name} has no width`).toBeGreaterThan(20);
      expect(r.height, `${name} has no height`).toBeGreaterThan(20);
    }
    // The stage is between the rails and is the widest of the three — the layout, measured rather
    // than assumed from the stylesheet.
    expect(stage.left).toBeGreaterThanOrEqual(left.right - 1);
    expect(stage.right).toBeLessThanOrEqual(right.left + 1);
    expect(stage.width).toBeGreaterThan(Math.max(left.width, right.width));
  });

  it("relinks the portrait's program for a NEW integrand, and not for a moved camera", async () => {
    // The guard the node sweep cannot kill, because in jsdom there is no stage to relink. M5.1's
    // review found the old shell recompiling and relinking its GLSL on every frame of a contour
    // drag — invisible to every test that does not count the calls.
    const spy = vi.spyOn(GLStage.prototype, "setIntegrand");
    const { app } = mount();
    await drawn();
    const afterBoot = spy.mock.calls.length;
    expect(afterBoot).toBe(1);

    // A camera move is not a new integrand.
    app.applyState({ ...app.currentState(), view: { center: [0.5, 0], halfHeight: 1 } });
    await drawn();
    expect(spy.mock.calls.length, "a pan relinked the program").toBe(afterBoot);

    // A new expression is.
    app.applyState({ ...app.currentState(), expr: "1/(1+z^2)" });
    await drawn();
    expect(spy.mock.calls.length, "a new integrand did NOT relink the program").toBe(afterBoot + 1);
    spy.mockRestore();
  });
});
