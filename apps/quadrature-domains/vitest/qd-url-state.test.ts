// @vitest-environment jsdom
//
// QD's share-link codec (QD_UI.installUrlState) had ZERO tests, while "preserve or migrate each
// app's existing share-link URL formats" is a non-negotiable CLAUDE.md guardrail
// (qd-urlstate-untested-06). The whole field mapping was unguarded in both directions, and the
// failure mode is silent by construction: writeUrlState's body is wrapped in
// `catch (e) { /* never let URL bookkeeping break the app */ }`, and applyUrlState drops anything
// that fails a validation gate. Rename an aggressiveness preset key and every previously-shared
// link carrying `agg` quietly restores the DEFAULT aggressiveness instead — a different domain
// than the sender saw, with no error anywhere and no failing test.
//
// installUrlState(ui) takes every dependency by injection, so it is directly testable against a
// stub `ui` over a minimal DOM. What is pinned here:
//   1. the write -> apply round trip for every field,
//   2. the KEY COVERAGE diff — every key writeUrlState can emit is consumed by applyUrlState
//      (this is the test that catches a rename on one side only),
//   3. the crafted-link seatbelts, which are the security-relevant half.
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { encodeViewState, decodeViewState } from "@cas/interchange";

type Ui = Record<string, unknown>;
type UrlState = { writeUrlState: () => void; applyUrlState: () => boolean };

let installUrlState: (ui: Ui) => UrlState;
let MODES: Record<string, unknown>;
let PRESETS: Record<string, unknown>;

beforeAll(async () => {
  await import("../app/solver.mjs"); // installs the QD solver namespace ui-modes imports
  const reg = (await import("../app/ui-registry.mjs")) as unknown as { QD_UI: Record<string, any> };
  await import("../app/ui-modes.mjs");
  await import("../app/ui-url-state.mjs");
  // The REAL mode + preset tables, so the `MODES[mode]` / `PRESETS[agg]` gates are exercised
  // against the values a live share link actually carries. installModes only reads `ui.buildW0`
  // at solve time, so an empty ctx is enough to build the descriptors.
  ({ MODES, PRESETS } = reg.QD_UI.installModes({}) as { MODES: Record<string, unknown>; PRESETS: Record<string, unknown> });
  installUrlState = reg.QD_UI.installUrlState as (ui: Ui) => UrlState;
});

/** The QD state fields the codec touches. Mirrors ui.js's `state` object shape. */
interface QdState {
  mode: string;
  w0Mode?: string;
  w0Manual?: string;
  c?: number | null;
  alpha?: number | null;
  q?: string;
  aggressiveness?: string;
}

interface Harness extends UrlState {
  state: QdState;
  calls: { applyModeVisuals: number; setC: number[]; setQ: string[]; parseAndApplyHText: number; figureReflect: number; render: number };
  plot: { view: { cx: number; cy: number; scale: number }; render: () => void };
  figure: () => Record<string, unknown>;
  hText: () => string;
  setHText: (v: string) => void;
  activateTab: (id: string) => void;
}

/** Build the minimal DOM the codec reads, plus a stub `ui`, and install a fresh codec over it. */
function harness(initial: Partial<QdState> = {}, extra: { figure?: Record<string, unknown>; view?: { cx: number; cy: number; scale: number } } = {}): Harness {
  document.body.innerHTML = `
    <input id="h-text" />
    <input id="alpha-input" />
    <input id="w0-manual" disabled />
    <select id="aggressiveness">
      <option value="quick"></option><option value="standard"></option>
      <option value="thorough"></option><option value="exhaustive"></option>
    </select>
    <input type="radio" name="w0mode" value="auto" checked />
    <input type="radio" name="w0mode" value="manual" />
    <button class="tab-btn active" data-tab="qd"></button>
    <button class="tab-btn" data-tab="schwarz"></button>
    <button class="tab-btn" data-tab="param-slice"></button>
    <button class="tab-btn" data-tab="algebra"></button>`;

  const state: QdState = { mode: "bounded", ...initial };
  (state as unknown as { figure: Record<string, unknown> }).figure = { ...DEFAULT_FIG, ...(extra.figure || {}) };
  const calls = { applyModeVisuals: 0, setC: [] as number[], setQ: [] as string[], parseAndApplyHText: 0, figureReflect: 0, render: 0 };
  const plot = { view: extra.view ? { ...extra.view } : { cx: 0, cy: 0, scale: 100 }, render: () => { calls.render++; } };
  const $ = (sel: string): Element | null => document.querySelector(sel);

  const codec = installUrlState({
    state,
    MODES,
    PRESETS,
    $,
    plot,
    figureDefaults: DEFAULT_FIG,
    figureReflect: () => calls.figureReflect++,
    applyModeVisuals: () => calls.applyModeVisuals++,
    setC: (c: number) => {
      calls.setC.push(c);
      state.c = c;
    },
    setQ: (q: string) => {
      calls.setQ.push(q);
      state.q = q;
    },
    parseAndApplyHText: () => calls.parseAndApplyHText++,
  });

  return {
    ...codec,
    state,
    calls,
    plot,
    figure: () => (state as unknown as { figure: Record<string, unknown> }).figure,
    hText: () => (document.getElementById("h-text") as HTMLInputElement).value,
    setHText: (v) => {
      (document.getElementById("h-text") as HTMLInputElement).value = v;
    },
    activateTab: (id) => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelector(`.tab-btn[data-tab="${id}"]`)?.classList.add("active");
    },
  };
}

beforeEach(() => {
  // writeUrlState coalesces bursts through requestAnimationFrame. Run the callback synchronously so
  // the assertions are deterministic rather than racing a ~16 ms frame under CI contention — the
  // body under test is unchanged either way.
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback): number => {
    fn(0);
    return 0;
  });
  history.replaceState(null, "", location.pathname);
});

/** Decode whatever writeUrlState just put in the address bar. */
function writtenState(): Record<string, unknown> {
  const env = decodeViewState<Record<string, unknown>>(location.hash);
  expect(env, "writeUrlState wrote no decodable view state").not.toBeNull();
  expect(env?.app).toBe("qd");
  return env?.state ?? {};
}

/** Mirrors ui-state.mjs's state.figure defaults — the diff base + validation source the codec uses. */
const DEFAULT_FIG: Record<string, unknown> = {
  showAxes: true, showGrid: true, showTickLabels: true, showFill: true,
  showNodes: true, showW0: true, showCusps: true, hideOverlays: false, showNodeLabels: true,
  boundaryColor: null, boundaryWidth: null,
  bg: null, grid: null, gridLabel: null, axis: null,
  nodeColor: null, nodeSize: null, nodeShape: "circle", labelSize: null,
};

/** Every key writeUrlState can emit. A new one must be added here AND handled by applyUrlState. */
const WRITE_KEYS = ["mode", "h", "w0m", "w0", "c", "a", "q", "agg", "tab", "fig", "view"] as const;

/** A state that trips every optional write branch at once. */
function maximal(): Harness {
  const h = harness(
    {
      w0Mode: "manual",
      w0Manual: "0.5",
      c: 2,
      alpha: 1.5, // ≠ 1, or the write branch skips it
      q: "3", // ≠ '0', or the write branch skips it
      aggressiveness: "thorough",
    },
    {
      figure: { showAxes: false, boundaryColor: "#000000", bg: "#ffffff", nodeShape: "square", nodeSize: 3, showNodeLabels: false }, // ≠ defaults, or the `fig` diff is empty
      view: { cx: 1.5, cy: -0.5, scale: 250 }, // ≠ {0,0,100}, or the `view` branch skips it
    },
  );
  h.setHText("1/(w-2)");
  h.activateTab("schwarz"); // ≠ 'qd', or the write branch skips it
  return h;
}

describe("QD share-link codec — write side", () => {
  it("emits exactly the documented key set when every field is set", () => {
    const h = maximal();
    h.writeUrlState();
    expect(Object.keys(writtenState()).sort()).toEqual([...WRITE_KEYS].sort());
  });

  it("omits the fields that are at their defaults", () => {
    // Every optional field is guarded, so a default-config link stays short. `mode` is unconditional.
    const h = harness({ alpha: 1, q: "0" }); // both explicitly AT the default sentinel
    h.writeUrlState();
    expect(Object.keys(writtenState())).toEqual(["mode"]);
  });

  it("does not rewrite history when the hash is unchanged", () => {
    const h = maximal();
    h.writeUrlState();
    const first = location.hash;
    const spy = vi.spyOn(history, "replaceState");
    h.writeUrlState();
    expect(location.hash).toBe(first);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("swallows a failure rather than breaking the app", () => {
    // The body is wrapped in a bare catch precisely so URL bookkeeping can never throw into a solve.
    const h = harness();
    const spy = vi.spyOn(history, "replaceState").mockImplementation(() => {
      throw new Error("history blocked");
    });
    expect(() => h.writeUrlState()).not.toThrow();
    spy.mockRestore();
  });
});

describe("QD share-link codec — round trip", () => {
  it("restores every field through write → apply", () => {
    const src = maximal();
    src.writeUrlState();

    const dst = harness(); // a fresh app at defaults, loading the link
    expect(dst.applyUrlState()).toBe(true);

    expect(dst.state.mode).toBe("bounded");
    expect(dst.state.w0Mode).toBe("manual");
    expect(dst.state.w0Manual).toBe("0.5");
    expect(dst.state.c).toBe(2);
    expect(dst.state.alpha).toBe(1.5);
    expect(dst.state.q).toBe("3");
    expect(dst.state.aggressiveness).toBe("thorough");
    expect(dst.hText()).toBe("1/(w-2)");
    // figure settings + viewport (the reproducible-figure fields)
    expect(dst.figure().showAxes).toBe(false);
    expect(dst.figure().boundaryColor).toBe("#000000");
    expect(dst.figure().bg).toBe("#ffffff");
    expect(dst.figure().nodeShape).toBe("square");
    expect(dst.figure().nodeSize).toBe(3);
    expect(dst.figure().showNodeLabels).toBe(false);
    expect(dst.plot.view).toEqual({ cx: 1.5, cy: -0.5, scale: 250 });
    expect(dst.calls.figureReflect).toBe(1); // the card controls were re-synced
    // …and the side effects the restore has to trigger for the app to actually be in that state.
    expect(dst.calls.applyModeVisuals).toBe(1);
    expect(dst.calls.setC).toEqual([2]);
    expect(dst.calls.setQ).toEqual(["3"]);
    expect(dst.calls.parseAndApplyHText).toBe(1);
  });

  it("mirrors each restored value into its own DOM control", () => {
    const src = maximal();
    src.writeUrlState();
    const dst = harness();
    dst.applyUrlState();
    expect((document.getElementById("alpha-input") as HTMLInputElement).value).toBe("1.5");
    expect((document.getElementById("w0-manual") as HTMLInputElement).value).toBe("0.5");
    expect((document.getElementById("w0-manual") as HTMLInputElement).disabled).toBe(false); // manual ⇒ enabled
    expect((document.getElementById("aggressiveness") as HTMLSelectElement).value).toBe("thorough");
    expect(document.querySelector<HTMLInputElement>('input[name="w0mode"][value="manual"]')?.checked).toBe(true);
  });

  it("round-trips every non-default mode", () => {
    for (const mode of Object.keys(MODES)) {
      const src = harness({ mode });
      src.writeUrlState();
      const dst = harness();
      expect(dst.applyUrlState()).toBe(true);
      expect(dst.state.mode).toBe(mode);
    }
  });

  it("round-trips every aggressiveness preset", () => {
    for (const agg of Object.keys(PRESETS)) {
      const src = harness({ aggressiveness: agg });
      src.writeUrlState();
      const dst = harness();
      dst.applyUrlState();
      expect(dst.state.aggressiveness).toBe(agg);
    }
  });

  it("switches to every whitelisted tab", async () => {
    vi.useFakeTimers();
    try {
      for (const tab of ["schwarz", "param-slice", "algebra"]) {
        const src = harness();
        src.activateTab(tab);
        src.writeUrlState();
        const dst = harness();
        const clicked: string[] = [];
        document
          .querySelectorAll<HTMLButtonElement>(".tab-btn")
          .forEach((b) => b.addEventListener("click", () => clicked.push(b.dataset.tab ?? "")));
        dst.applyUrlState();
        vi.runAllTimers(); // the click is deferred a tick so the QD solve starts first
        expect(clicked).toEqual([tab]);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  // THE drift guard. A key renamed on one side only still round-trips through encode/decode, so
  // only checking "write then apply" would not catch it — each key has to be shown to have an
  // observable effect ON ITS OWN.
  it("every key the write side can emit is consumed by the read side", () => {
    const src = maximal();
    src.writeUrlState();
    const full = writtenState();

    const observe: Record<string, (h: Harness) => unknown> = {
      mode: (h) => h.state.mode,
      h: (h) => h.hText(),
      w0m: (h) => h.state.w0Mode,
      w0: (h) => h.state.w0Manual,
      c: (h) => h.state.c,
      a: (h) => h.state.alpha,
      q: (h) => h.state.q,
      agg: (h) => h.state.aggressiveness,
      tab: (h) => h.calls, // the tab click is deferred; presence is asserted by the test above
      fig: (h) => ({ ...h.figure() }), // snapshot — state.figure is mutated in place, so a live ref would false-pass
      view: (h) => ({ ...h.plot.view }), // snapshot, same reason
    };

    const ignored: string[] = [];
    for (const key of WRITE_KEYS) {
      if (key === "mode" || key === "tab") continue; // covered by their own tests above
      // Apply a link carrying ONLY this key. If applyUrlState no longer reads it, the observed
      // value stays at the fresh harness's default and the key is dead.
      history.replaceState(null, "", location.pathname + encodeViewState("qd", { [key]: full[key] }));
      const dst = harness();
      const before = observe[key](dst);
      dst.applyUrlState();
      if (JSON.stringify(observe[key](dst)) === JSON.stringify(before)) ignored.push(key);
    }
    expect(ignored).toEqual([]);
  });
});

describe("QD share-link codec — untrusted input", () => {
  it("ignores a link from another app", () => {
    history.replaceState(null, "", location.pathname + encodeViewState("cd", { inpf: "z^2+c" }));
    const h = harness();
    expect(h.applyUrlState()).toBe(false);
    expect(h.calls.applyModeVisuals).toBe(0);
  });

  it("ignores an absent or corrupt hash", () => {
    for (const hash of ["", "#", "#vs=@@@not-base64@@@", "#nonsense"]) {
      history.replaceState(null, "", location.pathname + hash);
      expect(harness().applyUrlState()).toBe(false);
    }
  });

  it("ignores an unknown mode rather than adopting it", () => {
    // state.mode indexes MODES all over the solver; an unknown value would break every lookup.
    history.replaceState(null, "", location.pathname + encodeViewState("qd", { mode: "not-a-mode" }));
    const h = harness();
    expect(h.applyUrlState()).toBe(true); // the link IS ours — it is just partly unusable
    expect(h.state.mode).toBe("bounded"); // untouched
    expect(h.calls.applyModeVisuals).toBe(0);
  });

  it("ignores an unknown aggressiveness preset", () => {
    history.replaceState(null, "", location.pathname + encodeViewState("qd", { agg: "ludicrous" }));
    const h = harness({ aggressiveness: "standard" });
    h.applyUrlState();
    expect(h.state.aggressiveness).toBe("standard");
  });

  it("rejects a non-positive or degenerate α", () => {
    // α ≤ 0 is not a power the PQD families accept, and α = 1 IS classical bounded QD — restoring
    // either from a crafted link would put the app in a state its own inputs cannot express.
    for (const a of [0, -1, 1, "abc"]) {
      history.replaceState(null, "", location.pathname + encodeViewState("qd", { a }));
      const h = harness({ alpha: 2 });
      h.applyUrlState();
      expect(h.state.alpha).toBe(2);
    }
  });

  it("rejects a non-positive c", () => {
    for (const c of [0, -5, "abc"]) {
      history.replaceState(null, "", location.pathname + encodeViewState("qd", { c }));
      const h = harness();
      h.applyUrlState();
      expect(h.calls.setC).toEqual([]);
    }
  });

  it("ignores an unknown w₀ mode", () => {
    history.replaceState(null, "", location.pathname + encodeViewState("qd", { w0m: "telepathy" }));
    const h = harness({ w0Mode: "auto" });
    h.applyUrlState();
    expect(h.state.w0Mode).toBe("auto");
  });

  it("clamps a restored viewport scale and drops a non-finite frame", () => {
    // scale is clamped to the live wheel-zoom range [1e-3, 1e7]; NaN/negative/garbage is dropped.
    history.replaceState(null, "", location.pathname + encodeViewState("qd", { view: { cx: 0, cy: 0, scale: 1e12 } }));
    let h = harness();
    h.applyUrlState();
    expect(h.plot.view.scale).toBe(1e7);
    for (const bad of [{ cx: 0, cy: 0, scale: -1 }, { cx: NaN, cy: 0, scale: 100 }, "x"]) {
      history.replaceState(null, "", location.pathname + encodeViewState("qd", { view: bad }));
      h = harness();
      h.applyUrlState();
      expect(h.plot.view).toEqual({ cx: 0, cy: 0, scale: 100 }); // untouched default
    }
  });

  it("drops unknown figure keys and malformed colours, coerces booleans", () => {
    history.replaceState(
      null,
      "",
      location.pathname +
        encodeViewState("qd", { fig: { showAxes: 0, boundaryColor: "javascript:alert(1)", bg: "#0a0a0a", boundaryWidth: -3, evil: "x" } }),
    );
    const h = harness();
    h.applyUrlState();
    const f = h.figure();
    expect(f.showAxes).toBe(false); // 0 coerced to boolean
    expect(f.boundaryColor).toBeNull(); // malformed colour rejected → default
    expect(f.bg).toBe("#0a0a0a"); // valid hex accepted
    expect(f.boundaryWidth).toBeNull(); // non-positive rejected
    expect("evil" in f).toBe(false); // unknown key never copied
  });

  it("validates figure enum + numeric keys on restore", () => {
    history.replaceState(
      null,
      "",
      location.pathname + encodeViewState("qd", { fig: { nodeShape: "hexagon", nodeSize: -2, labelSize: 14, showNodeLabels: 0 } }),
    );
    const h = harness();
    h.applyUrlState();
    const f = h.figure();
    expect(f.nodeShape).toBe("circle"); // invalid enum → default
    expect(f.nodeSize).toBeNull(); // non-positive → default
    expect(f.labelSize).toBe(14); // valid positive accepted
    expect(f.showNodeLabels).toBe(false); // 0 coerced to boolean
  });

  it("does not let a crafted tab id reach the querySelector", () => {
    // applyUrlState interpolates the id into a selector string; an unwhitelisted value would throw
    // a SyntaxError and abort init, so SWITCHABLE_TABS is a seatbelt, not a nicety.
    vi.useFakeTimers();
    try {
      for (const tab of ['"]:has(', "qd", "does-not-exist", "<script>"]) {
        history.replaceState(null, "", location.pathname + encodeViewState("qd", { tab }));
        const h = harness();
        const clicked: string[] = [];
        document
          .querySelectorAll<HTMLButtonElement>(".tab-btn")
          .forEach((b) => b.addEventListener("click", () => clicked.push(b.dataset.tab ?? "")));
        expect(() => h.applyUrlState()).not.toThrow();
        vi.runAllTimers();
        expect(clicked).toEqual([]);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
