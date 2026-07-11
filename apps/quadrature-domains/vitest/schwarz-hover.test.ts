// @vitest-environment jsdom
//
// CPU-mode hover readout labels the pixel class correctly (Review QD-schwarz-b-A-02).
//
// The escape-time field stores its class as KIND+1 (0 = unresolved; KIND_*+1 = 1..5) — the offset the
// writers emit (schwarz-render.mjs / schwarz-worker-entry.mjs) and the painter reads (schwarz-paint.mjs).
// The CPU-mode hover readout passed that raw KIND+1 value straight to describeKind(), which switches on
// the RAW KIND_* enum, so every class label came out one off (a fundamental / escape-time pixel read
// "in escaping set", an interior pixel "Newton diverged", etc.). The fix subtracts the offset. This
// drives the real onMouseMove (exposed via the test hook) over a 1×1 field and asserts the label.
import { describe, it, expect, beforeAll } from "vitest";

let T: any;

beforeAll(async () => {
  document.body.innerHTML =
    '<div id="controls-schwarz"></div><canvas id="canvas"></canvas><div id="schwarz-readout"></div>';
  (window as any).__SCHWARZ_UI_TEST_HOOK__ = true;
  const QD: any = (await import("../app/solver.mjs")).default;
  // Plane-view CPU field readout reads only sState.field/fieldKind — no σ engine needed; a light mock
  // satisfies the isSchwarzActive/isInOmega touches without pulling in the LQD graph.
  QD.Schwarz = {
    escapeTime: () => ({ kind: "interior", n: 0 }),
    makeOrbit: () => [],
    buildPreimageTree: () => ({ generations: [], edges: [], truncatedByBudget: false }),
  };
  await import("../app/schwarz/schwarz-paint.mjs");
  await import("../app/schwarz/schwarz-render.mjs");
  await import("../app/schwarz/schwarz-features.mjs");
  await import("../app/schwarz/schwarz-interaction.mjs");
  await import("../app/schwarz/schwarz-ui.mjs");
  T = (window as any).__schwarzUiTest;
});

// KIND_FUND=0, KIND_ESC=1, KIND_INT=2, KIND_INV=3, KIND_OUTSIDE=4 (schwarz-ui.mjs); field stores +1.
const KIND_FUND = 0, KIND_ESC = 1, KIND_INT = 2, KIND_INV = 3, KIND_OUTSIDE = 4;

function readoutFor(kindPlus1: number, n: number): string {
  T.sState.fieldKind[0] = kindPlus1;
  T.sState.field[0] = n;
  T.onMouseMove({ clientX: 5, clientY: 5, shiftKey: false });
  return (document.getElementById("schwarz-readout") as HTMLElement).textContent || "";
}

describe("Schwarz CPU hover readout: pixel-class labels (QD-schwarz-b-A-02)", () => {
  beforeAll(() => {
    // Minimal fractal/plane state with a 1×1 escape-time field (cursor always maps to idx 0).
    T.sState.mode = "fractal";
    T.sState.viewMode = "plane";
    T.sState.schwarz = { unbounded: false, isInOmega: () => true, evalPhi: (z: any) => z };
    T.sState.hoverOrbitEnabled = false;
    T.sState.view = { cx: 0, cy: 0, scale: 50, cssW: 100, cssH: 100 };
    T.sState.field = [0];
    T.sState.fieldKind = [0];
    T.sState.fieldW = 1;
    T.sState.fieldH = 1;
  });

  it("a fundamental pixel (fieldKind=KIND_FUND+1) reads its escape time, NOT 'in escaping set'", () => {
    const txt = readoutFor(KIND_FUND + 1, 7);
    expect(txt).toContain("escape time n=7");
    expect(txt).not.toContain("in escaping set"); // the old off-by-one label for this pixel
  });

  it("an interior pixel (KIND_INT+1) reads the interior label, NOT 'Newton diverged'", () => {
    const txt = readoutFor(KIND_INT + 1, 0);
    expect(txt).toContain("tiling-set interior");
    expect(txt).not.toContain("Newton diverged");
  });

  it("an escaping pixel (KIND_ESC+1) reads 'in escaping set'", () => {
    expect(readoutFor(KIND_ESC + 1, 0)).toContain("in escaping set");
  });

  it("an invalid pixel (KIND_INV+1) reads 'Newton diverged'", () => {
    expect(readoutFor(KIND_INV + 1, 0)).toContain("Newton diverged");
  });

  it("an outside pixel (KIND_OUTSIDE+1) reads the Ω^c label, NOT a dropped/empty class", () => {
    const txt = readoutFor(KIND_OUTSIDE + 1, 0);
    expect(txt).toContain("Ω^c");
  });

  it("an unresolved cell (fieldKind=0) shows no class suffix (maps to −1 → describeKind default)", () => {
    const txt = readoutFor(0, 0);
    // Only the coordinate readout, no class phrase appended.
    expect(txt).toContain("w = (");
    for (const s of ["escape time", "in escaping set", "interior", "Newton diverged", "Ω^c"]) {
      expect(txt).not.toContain(s);
    }
  });
});
