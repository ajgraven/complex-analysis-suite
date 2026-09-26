// @vitest-environment jsdom
//
// The mounted page: structure, the actions a reader takes, the permalink, undo, and the words on
// screen. jsdom has no canvas context; the stage already copes with not getting one (the ink layer
// simply does not draw), so everything else here is ordinary DOM.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountApp, type App } from "../src/shell/app.js";
import type { Cx, Polynomial } from "../src/engine/polynomial.js";
import { DEFAULT_STATE, type ShellState } from "../src/shell/state.js";
import { decodeShell, encodeShell, NAMESPACE } from "../src/shell/viewState.js";
import { verdictLine } from "../src/shell/figure.js";
import { resolveState } from "../src/shell/state.js";
import { DENYLIST } from "../src/engine/vocabulary.js";
import { decodeViewState, encodeViewState } from "@cas/interchange";

function mount(hash = ""): { root: HTMLElement; app: App } {
  window.history.replaceState(null, "", `${window.location.pathname}${hash}`);
  const root = document.createElement("div");
  root.id = "app";
  document.body.replaceChildren(root);
  return { root, app: mountApp(root) };
}

function livePoly(app: App): Polynomial {
  const p = app.live().poly;
  if (!p) throw new Error("no polynomial on screen");
  return p;
}

const q = <T extends Element = HTMLElement>(sel: string): T => {
  const e = document.querySelector<T>(sel);
  if (!e) throw new Error(`no ${sel}`);
  return e;
};

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the page's structure", () => {
  it("names every landmark uniquely", () => {
    mount();
    const names = [...document.querySelectorAll("section[aria-labelledby]")].map(
      (s) =>
        document.getElementById(s.getAttribute("aria-labelledby") ?? "")?.textContent,
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it("has one <main>, one <h1>, and every canvas named or explicitly hidden", () => {
    mount();
    expect(document.querySelectorAll("main")).toHaveLength(1);
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    for (const c of document.querySelectorAll("canvas")) {
      const named = (c.getAttribute("aria-label") ?? "").length > 0;
      const hidden = c.getAttribute("aria-hidden") === "true";
      expect(named || hidden).toBe(true);
    }
    // The ink layers are the interactive surfaces, focusable, with a generated description.
    const inks = document.querySelectorAll("canvas.ink");
    expect(inks).toHaveLength(2);
    for (const c of inks) {
      expect(c.getAttribute("role")).toBe("application");
      expect(c.getAttribute("tabindex")).toBe("0");
    }
    expect(q("canvas.ink").getAttribute("aria-label")).toMatch(
      /5 roots of a degree-5 polynomial/,
    );
  });

  it("opens on z⁵ − z − 1 with every root isolated, and says so exactly", () => {
    mount();
    expect(q(".rail-right .summary").textContent).toMatch(
      /5 discs, pairwise disjoint: each holds exactly one root/,
    );
    expect(q(".rail-right .summary .level").getAttribute("data-level")).toBe("=");
    expect(document.querySelectorAll(".rail-right .root")).toHaveLength(5);
    // Coordinates are estimates, whatever the disc says.
    for (const r of document.querySelectorAll(".rail-right .root")) {
      expect(r.querySelector(".level")?.getAttribute("data-level")).toBe("≈");
    }
  });
});

describe("typing a polynomial", () => {
  it("reads it, reframes the panes, and is one undo step", () => {
    const { app } = mount();
    app.actions().type("(z-1)^2*(z+2)");
    expect(app.currentState().poly).toEqual({ kind: "text", text: "(z-1)^2*(z+2)" });
    expect(app.currentState().rootCam.half).toBeGreaterThan(1.2);
    // A polynomial whose roots are far from the default view is framed, not left off screen.
    app.actions().type("(z-10)(z-11)(z-12)");
    expect(app.currentState().rootCam.cx).toBeCloseTo(11, 10);
    app.actions().undo();
    const claims = [...document.querySelectorAll(".rail-right .claim")].map(
      (c) => c.textContent,
    );
    expect(claims.some((c) => /= ?.*a double root/.test(c ?? ""))).toBe(true);
    app.actions().undo();
    expect(app.currentState().poly).toEqual(DEFAULT_STATE.poly);
    app.actions().redo();
    expect(app.currentState().poly).toEqual({ kind: "text", text: "(z-1)^2*(z+2)" });
  });

  it("refuses by name, keeps the last polynomial, and does not commit", () => {
    const { app } = mount();
    app.actions().type("sin(z)");
    expect(q(".rail-left .refusal").textContent).toMatch(
      /Not read: .*not a rational function/,
    );
    expect(q(".rail-left .refusal").getAttribute("role")).toBe("alert");
    expect(app.currentState()).toEqual(DEFAULT_STATE);
    // The box keeps what the reader typed, so it can be corrected.
    expect(q<HTMLInputElement>(".poly-input").value).toBe("sin(z)");
  });

  it("reads through the input's change event", () => {
    const { app } = mount();
    const input = q<HTMLInputElement>(".poly-input");
    input.value = "z^3 - 2";
    input.dispatchEvent(new Event("change"));
    expect(app.currentState().poly).toEqual({ kind: "text", text: "z^3 - 2" });
  });
});

describe("the coefficient ring", () => {
  it("refuses ℝ for a Gaussian coefficient, by name, and stays where it was", () => {
    const { app } = mount();
    app.actions().setRing("C");
    app.actions().type("z^2 + i");
    app.actions().setRing("R");
    expect(app.currentState().ring).toBe("C");
    expect(app.refusal()).toMatch(/not real/);
  });

  it("carries a float polynomial into ℚ by snapping each coefficient, and shows it exactly", () => {
    const { app } = mount();
    app.actions().setRing("C");
    app.actions().moveTo({ kind: "coeff", index: 0 }, [-1.25, 0]);
    app.actions().release();
    expect(app.currentState().poly.kind).toBe("coeffs");
    app.actions().setRing("Q");
    expect(app.currentState()).toMatchObject({
      ring: "Q",
      poly: { kind: "text", text: "z^5 - z - 5/4" },
    });
  });
});

describe("dragging", () => {
  it("in ℝ, a complex root drags its conjugate and a real root stays on the axis", () => {
    const { app } = mount();
    app.actions().setRing("R");
    const p = livePoly(app);
    const complex = p.roots.findIndex((r) => r[1] > 0);
    const real = p.roots.findIndex((r) => r[1] === 0);
    app.actions().moveTo({ kind: "root", index: complex }, [0.3, 1.2]);
    const after = livePoly(app);
    expect(after.roots[complex]).toEqual([0.3, 1.2]);
    expect(after.roots.some((r) => r[0] === 0.3 && r[1] === -1.2)).toBe(true);
    expect(after.coeffs.every((c) => c[1] === 0)).toBe(true);
    app.actions().moveTo({ kind: "root", index: real }, [1.4, 0.7]);
    expect(livePoly(app).roots[real]).toEqual([1.4, 0]);
  });

  it("in ℚ, a release snaps to rationals, and a coefficient drag moves only that coefficient", () => {
    const { app } = mount();
    // 123/1000 has a simpler neighbour (1/8) within half a pixel: only a coefficient that MOVED may snap.
    app.actions().type("z^5 + 0.123z^2 - z - 1");
    const committed = app.currentState();
    const before = livePoly(app).exact as NonNullable<Polynomial["exact"]>;
    app.actions().moveTo({ kind: "coeff", index: 1 }, [-0.7, 0.4]);
    // Mid-drag: real (the imaginary part is ignored in ℚ) and not yet committed.
    expect(livePoly(app).coeffs[1]).toEqual([-0.7, 0]);
    expect(app.currentState()).toEqual(committed);
    app.actions().release();
    const after = livePoly(app).exact as NonNullable<Polynomial["exact"]>;
    expect(after.coeff(1).re.d).toBeLessThan(1000n); // snapped to a simple rational
    for (const k of [0, 2, 3, 4, 5])
      expect(after.coeff(k).equals(before.coeff(k))).toBe(true);
    expect(app.currentState().poly.kind).toBe("text");
  });

  it("keeps root LABELS through a coefficient drag", () => {
    const { app } = mount();
    app.actions().setRing("C");
    const before = livePoly(app);
    app.actions().moveTo({ kind: "coeff", index: 0 }, [-1.02, 0.01]);
    const after = livePoly(app);
    after.roots.forEach((r, i) =>
      expect(
        Math.hypot(r[0] - before.roots[i][0], r[1] - before.roots[i][1]),
      ).toBeLessThan(0.05),
    );
    expect(after.labels).toEqual(before.labels);
  });

  it("will not let the leading coefficient reach zero", () => {
    const { app } = mount();
    app.actions().setRing("C");
    app.actions().moveTo({ kind: "coeff", index: 5 }, [0, 0]);
    expect(livePoly(app).degree).toBe(5);
  });
});

describe("the keyboard", () => {
  it("selects with ] and moves the selection with the arrows, one undo step each", () => {
    const { app } = mount();
    app.actions().setRing("C");
    const ink = q<HTMLCanvasElement>('[data-pane="roots"] canvas.ink');
    const r0 = livePoly(app).roots[0];
    ink.dispatchEvent(new KeyboardEvent("keydown", { key: "]", bubbles: true }));
    ink.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    const r1 = livePoly(app).roots[0];
    expect(r1[0]).toBeGreaterThan(r0[0]);
    expect(app.currentState().poly.kind).toBe("roots");
    expect(q('[data-pane="roots"] [role="status"]').textContent).toMatch(/^root 1 at /);
    app.actions().undo();
    expect(livePoly(app).roots[0]).toEqual(r0);
  });

  it("pans with the arrows when nothing is selected, and zooms with + and −", () => {
    const { app } = mount();
    const ink = q<HTMLCanvasElement>('[data-pane="coefficients"] canvas.ink');
    const cam = app.currentState().coeffCam;
    ink.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(app.currentState().coeffCam.cy).toBeGreaterThan(cam.cy);
    ink.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true }));
    expect(app.currentState().coeffCam.half).toBeLessThan(cam.half);
  });
});

describe("undo", () => {
  it("does not record an edit that changed nothing", () => {
    const { app } = mount();
    app.actions().setDiscs(true); // already on
    expect(q<HTMLButtonElement>(".buttons button").disabled).toBe(true);
    app.actions().setDiscs(false);
    expect(q<HTMLButtonElement>(".buttons button").disabled).toBe(false);
  });
});

describe("a cluster is reported as groups, in the card and in the figure", () => {
  it("says how many SEPARATE groups there are when a component holds more than one root", () => {
    const { app } = mount();
    app.actions().setRing("C");
    app.actions().type("(z-1)^2*(z+2)");
    expect(q(".rail-right .summary").textContent).toMatch(/2 separate groups of discs/);
    expect(verdictLine(app.live())).toMatch(/2 separate groups of discs/);
  });
});

describe("the view toggles", () => {
  it("overlay hides the coefficient pane and puts the coefficients on the root plane", () => {
    const { app } = mount();
    app.actions().setOverlay(true);
    expect(q('[data-pane="coefficients"]').hidden).toBe(true);
    expect(q("#pane-roots").textContent).toBe("Roots and coefficients");
    expect(q<HTMLInputElement>('.rail-left input[type="checkbox"]').checked).toBe(true);
  });
});

describe("applyState restores a state the app is NOT in (M6.1's test, not the fixed point)", () => {
  const A: ShellState = {
    ring: "Q",
    poly: { kind: "text", text: "z^4 - 2" },
    discs: true,
    overlay: false,
    critical: true,
    coefficient: 0,
    trails: false,
    pseudozero: null,
    loop: null,
    lattice: false,
    family: null,
    ladder: null,
    rootCam: { cx: 0.25, cy: -0.5, half: 2 },
    coeffCam: { cx: 1, cy: 0, half: 3 },
  };
  const B: ShellState = {
    ring: "C",
    poly: {
      kind: "roots",
      roots: [
        [1, 1],
        [-2, 0.5],
        [0, -1],
      ],
      lead: [2, -1],
    },
    discs: false,
    overlay: true,
    critical: false,
    coefficient: 2,
    trails: true,
    pseudozero: -8,
    loop: { kind: "lasso", point: 1, sign: -1 },
    lattice: true,
    family: { text: "x^5 - x - t", base: "1", open: false },
    ladder: null,
    rootCam: { cx: -1, cy: 2, half: 0.75 },
    coeffCam: { cx: 0, cy: 0, half: 1.5 },
  };

  it("lands on the state applied, in both directions, with every field different", () => {
    for (const [from, to] of [
      [A, B],
      [B, A],
    ] as const) {
      const { app } = mount();
      app.applyState(from);
      expect(app.currentState()).toEqual(from);
      app.applyState(to);
      expect(app.currentState()).toEqual(to);
      // And the SCREEN follows, not only the object.
      expect(q('[data-pane="coefficients"]').hidden).toBe(to.overlay);
      const boxes = [
        ...document.querySelectorAll<HTMLInputElement>(
          '.rail-left input[type="checkbox"]',
        ),
      ];
      expect(boxes.map((b) => b.checked)).toEqual([
        to.overlay,
        to.discs,
        to.critical,
        to.trails,
        to.pseudozero !== null,
      ]);
      expect(q<HTMLSelectElement>(".rail-left select").value).toBe(
        to.coefficient === null ? "none" : String(to.coefficient),
      );
      expect(q<HTMLInputElement>(`.rail-left input[value="${to.ring}"]`).checked).toBe(
        true,
      );
      expect(document.querySelectorAll(".rail-right .root")).toHaveLength(
        to === A ? 4 : 3,
      );
    }
  });
});

describe("the permalink", () => {
  const states: ShellState[] = [
    DEFAULT_STATE,
    {
      ...DEFAULT_STATE,
      ring: "C",
      poly: {
        kind: "coeffs",
        coeffs: [
          [-1, 0.5],
          [0, 0],
          [3.25, -1e-7],
          [1, 0],
        ],
      },
      discs: false,
    },
    {
      ...DEFAULT_STATE,
      ring: "R",
      poly: {
        kind: "roots",
        roots: [
          [1, 2],
          [1, -2],
          [0.1, 0],
        ],
        lead: [3, 0],
      },
      overlay: true,
    },
    // Every PRA-2 field away from its default.
    {
      ...DEFAULT_STATE,
      critical: false,
      coefficient: 3,
      trails: true,
      pseudozero: -9.5,
    },
    { ...DEFAULT_STATE, coefficient: null },
  ];

  it("round-trips every form of the polynomial exactly", () => {
    for (const s of states) {
      const d = decodeShell(encodeShell(s));
      expect(d?.ok && d.state).toEqual(s);
    }
    expect(decodeShell("")).toBeNull();
  });

  it("opens a link on mount, and writes the address bar after a commit", async () => {
    vi.useFakeTimers();
    const { app } = mount(encodeShell(states[1]));
    expect(app.currentState()).toEqual(states[1]);
    app.actions().setDiscs(true);
    vi.advanceTimersByTime(300);
    const d = decodeShell(window.location.hash);
    expect(d?.ok && d.state.discs).toBe(true);
  });

  it("refuses a link it cannot honour, by name, and says so on the page", () => {
    const enc = (state: Record<string, unknown>, app = NAMESPACE) =>
      encodeViewState(app, state);
    const base = { r: "Q", t: "z^2+1", d: 1, o: 0, rc: [0, 0, 1], cc: [0, 0, 1] };
    const cases: [string, RegExp][] = [
      ["#vs=%%%", /truncated or malformed/],
      [enc(base, "ci"), /another app \('ci'\)/],
      [enc({ ...base, r: "Z" }), /unknown coefficient ring 'Z'/],
      [enc({ ...base, t: undefined }), /carries no polynomial/],
      [
        enc({ ...base, t: undefined, r: "C", c: [1, 0, "x", 0] }),
        /not a list of finite number pairs/,
      ],
      [enc({ ...base, t: undefined, r: "C", c: Array(52).fill(1) }), /cap of 24/],
      [
        enc({ ...base, t: undefined, r: "R", z: [1, 2, 3, 0], l: [1, 0] }),
        /no conjugate partner/,
      ],
      [enc({ ...base, t: "sin(z)" }), /not a rational function/],
      [enc({ ...base, rc: [0, 0, -1] }), /root camera/],
      [enc({ ...base, t: "z^2 + i" }), /not real/],
      [enc({ ...base, j: 3 }), /selects a3 of a degree-2 polynomial/],
      [enc({ ...base, j: 1.5 }), /'1.5' does not name a coefficient/],
      [enc({ ...base, pz: 1 }), /outside 10⁻¹⁷ … 1/],
      [enc({ ...base, pz: -18 }), /outside 10⁻¹⁷ … 1/],
    ];
    for (const [hash, why] of cases) {
      const d = decodeShell(hash);
      expect(d && !d.ok && d.reason, hash).toMatch(why);
    }
    mount(cases[2][0]);
    expect(q(".link-refusal").hidden).toBe(false);
    expect(q(".link-refusal").textContent).toMatch(
      /could not be opened: unknown coefficient ring 'Z'/,
    );
  });
});

describe("the words on screen", () => {
  function screenText(): string {
    const labels = [...document.querySelectorAll("[aria-label]")].map((e) =>
      e.getAttribute("aria-label"),
    );
    return `${document.body.textContent}\n${labels.join("\n")}`;
  }

  it("never carries a method's house name, across ordinary and refusing states", () => {
    const { app } = mount();
    const texts: string[] = [screenText()];
    app.actions().type("(z-1)^2*(z+2)^3");
    texts.push(screenText());
    app.actions().setRing("C");
    app.actions().moveTo({ kind: "root", index: 0 }, [0.3, 0.3]);
    texts.push(screenText());
    app.actions().type("sin(z)");
    texts.push(screenText());
    app.actions().setRing("R");
    texts.push(screenText());
    for (const t of texts) for (const bad of DENYLIST) expect(t).not.toMatch(bad);
  });

  it("the figure's caption is the Roots card's verdict, and refuses with the refusal", () => {
    expect(verdictLine(resolveState(DEFAULT_STATE))).toMatch(
      /^= degree 5: every root in its own disc/,
    );
    expect(
      verdictLine(
        resolveState({ ...DEFAULT_STATE, poly: { kind: "text", text: "sin(z)" } }),
      ),
    ).toMatch(/^No polynomial: .*not a rational function/);
  });
});

describe("the figure caption wraps rather than being cut off", () => {
  it("breaks at words, every line within the width, nothing lost", async () => {
    const { wrap } = await import("../src/shell/figure.js");
    const ctx = { measureText: (t: string) => ({ width: 7 * t.length }) };
    const text =
      "= degree 5: every root in its own disc, each holding exactly one root (proved in exact arithmetic); coordinates ≈.";
    const lines = wrap(ctx, text, 200);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(7 * l.length).toBeLessThanOrEqual(200);
    expect(lines.join(" ")).toBe(text);
  });
});

describe("the Analysis card", () => {
  const card = (): HTMLElement => q('section[aria-labelledby="card-analysis"]');

  it("states the discriminant exactly, the critical points against the hull, and aⱼ's branch points", () => {
    mount();
    // disc(z⁵ + az + b) = 5⁵b⁴ + 4⁴a⁵; at a = −1, b = −1 that is 3125 − 256.
    const disc = card().querySelector(".claim");
    expect(disc?.querySelector(".level")?.getAttribute("data-level")).toBe("=");
    expect(disc?.querySelector("[aria-label]")?.getAttribute("aria-label")).toBe(
      "discriminant 2869",
    );
    expect(card().textContent).toMatch(/4 critical points, all inside the convex hull/);
    // As a polynomial in a₀: Δ(a₀) = 3125a₀⁴ − 256 — four branch points.
    expect(card().textContent).toMatch(/4 branch points of a₀/);
    expect(card().querySelectorAll(".branch-list li")).toHaveLength(4);
    expect(
      card().querySelector(".formula [aria-label]")?.getAttribute("aria-label"),
    ).toBe("the discriminant as a polynomial in a0");
  });

  it("is honest during a drag: no exact Δ, no pseudozero count, until release", () => {
    const { app } = mount();
    app.applyState({ ...DEFAULT_STATE, pseudozero: -8 });
    expect(card().querySelectorAll(".regions li").length).toBeGreaterThan(0);
    app.actions().moveTo({ kind: "root", index: 0 }, [1.3, 0.05]);
    expect(card().querySelector(".claim")?.textContent).toMatch(/Δ ≈/);
    expect(card().textContent).toMatch(/Certified when the drag is released/);
    app.actions().release();
    expect(card().querySelectorAll(".regions li").length).toBeGreaterThan(0);
  });

  it("counts every root inside a certified pseudozero region, and the counts add to the degree", () => {
    const { app } = mount();
    app.applyState({ ...DEFAULT_STATE, pseudozero: -8 });
    const a = app.live().analysis;
    const regions = a?.pseudozero?.regions ?? [];
    expect(regions.length).toBe(5);
    expect(regions.every((g) => g.certified && g.count === 1)).toBe(true);
    const items = [...card().querySelectorAll(".regions li")];
    for (const li of items)
      expect(li.querySelector(".level")?.getAttribute("data-level")).toBe("=");
  });

  it("drops the branch points when no coefficient is selected, and the critical row when unticked", () => {
    const { app } = mount();
    app.applyState({ ...DEFAULT_STATE, coefficient: null, critical: false });
    expect(card().querySelector(".branch")).toBeNull();
    expect(card().textContent).not.toMatch(/critical point/);
  });

  it("never carries a house name, with every analysis layer on", () => {
    const { app } = mount();
    app.applyState({ ...DEFAULT_STATE, pseudozero: -4, coefficient: 2, trails: true });
    const labels = [...document.querySelectorAll("[aria-label]")]
      .map((e) => e.getAttribute("aria-label"))
      .join("\n");
    for (const bad of DENYLIST)
      expect(`${document.body.textContent}\n${labels}`).not.toMatch(bad);
  });
});

describe("the gain matrix as a heat row", () => {
  const light = (e: Element): number =>
    Number(/(\d+)%\)$/.exec(e.getAttribute("style") ?? "")?.[1] ?? NaN);

  it("gives each root one cell per draggable coefficient, on ONE shared scale, the selected one outlined", () => {
    const { app } = mount();
    const rows = [...document.querySelectorAll(".rail-right .root .gain-row")];
    expect(rows).toHaveLength(5);
    const cond = app.live().conditioning ?? [];
    const all = cond.flatMap((c) => c.gains);
    let brightest = -1;
    rows.forEach((row, i) => {
      const cells = [...row.querySelectorAll(".gain-cell")];
      expect(cells).toHaveLength(5);
      expect(cells.filter((c) => c.getAttribute("data-selected") === "true")).toEqual([
        cells[0],
      ]);
      // Brighter moves more: the order of the cells' lightness is the order of the gains.
      const ls = cells.map(light);
      const gs = cond[i].gains;
      for (let a = 0; a < gs.length; a++)
        for (let b = 0; b < gs.length; b++)
          if (gs[a] < gs[b]) expect(ls[a]).toBeLessThanOrEqual(ls[b]);
      brightest = Math.max(brightest, ...ls);
    });
    // Shared scale: the largest gain in the MATRIX, not in each row, reaches the top.
    expect(brightest).toBe(72);
    expect(Math.max(...all)).toBeGreaterThan(0);
    const dim = rows.flatMap((r) => [...r.querySelectorAll(".gain-cell")].map(light));
    // (A conjugate pair shares its gains, so the top is reached once per root at the matrix maximum.)
    const top = Math.max(...all);
    expect(dim.filter((l) => l === 72)).toHaveLength(
      all.filter((g) => g > top * (1 - 1e-12)).length,
    );
  });

  it("names the coefficient that moves a root most when none is selected", () => {
    const { app } = mount();
    app.applyState({ ...DEFAULT_STATE, coefficient: null });
    expect(q(".rail-right .root .root-gain").textContent).toMatch(
      /moves most per unit of a\S+ \(≈ /,
    );
    expect(document.querySelectorAll('.gain-cell[data-selected="true"]')).toHaveLength(0);
  });
});

describe("the Monodromy card (PRA-3)", () => {
  const card = (): HTMLElement => q('section[aria-labelledby="card-monodromy"]');
  const sigma = (): string => card().querySelector(".claim")?.textContent ?? "";

  it("offers one lasso per branch point of the selected coefficient, and nothing without one", () => {
    const { app } = mount();
    expect(card().querySelectorAll(".lasso-chips button")).toHaveLength(4);
    app.actions().setCoefficient(null);
    expect(card().textContent).toMatch(/Select a coefficient below the leading one/);
    app.actions().setCoefficient(5);
    expect(card().querySelectorAll(".lasso-chips button")).toHaveLength(0);
  });

  it("a lasso prints a proved swap, carries it in the link, and the two roots trade labels", () => {
    const { app } = mount();
    const before = [...(app.live().poly?.labels ?? [])];
    app.actions().lasso(3);
    expect(card().querySelector(".claim .level")?.getAttribute("data-level")).toBe("=");
    expect(sigma()).toMatch(/σ = \(\d \d\)$/);
    expect(app.currentState().loop).toEqual({ kind: "lasso", point: 3, sign: 1 });
    const after = app.live().poly?.labels ?? [];
    expect(after.filter((l, i) => l !== before[i])).toHaveLength(2);
    const d = decodeShell(encodeShell(app.currentState()));
    expect(d?.ok && d.state.loop).toEqual({ kind: "lasso", point: 3, sign: 1 });
    // Re-resolving (an unrelated commit) neither re-runs the swap on the labels nor changes σ.
    const s = sigma();
    app.actions().setDiscs(false);
    expect(app.live().poly?.labels).toEqual(after);
    expect(sigma()).toBe(s);
  });

  it("builds a word and makes a commutator of its last two parts: a 3-cycle", () => {
    const { app } = mount();
    // Two lassos whose swaps share exactly one root, found by running each alone.
    const swaps = [0, 1, 2, 3].map((k) => {
      app.actions().setLoop({ kind: "lasso", point: k, sign: 1 });
      const r = app.live().loopRun;
      if (!r?.ok) throw new Error("a lasso was refused");
      return r.perm;
    });
    let pair: [number, number] | null = null;
    for (let a = 0; a < 4 && !pair; a++)
      for (let b = a + 1; b < 4 && !pair; b++)
        if (swaps[a].filter((x, i) => x !== i && swaps[b][i] !== i).length === 1)
          pair = [a, b];
    if (!pair) throw new Error("no two lassos share a root");
    app.actions().setLoop(null);
    app.actions().setBuilding(true);
    app.actions().lasso(pair[0]);
    app.actions().lasso(pair[1]);
    expect(card().querySelector(".word-tree")?.textContent).toMatch(/γ\S+·γ\S+/);
    app.actions().commute();
    expect(app.currentState().loop?.kind).toBe("commutator");
    expect(sigma()).toMatch(/σ = \(\d \d \d\)$/);
  });

  it("a drawn loop through a branch point refuses by name, and no σ is printed", () => {
    const { app } = mount();
    const b = app.live().loopContext?.branchPoints[0] ?? [0, 0];
    app.actions().pen();
    for (const z of [
      [-1, 0],
      [b[0], b[1]],
      [b[0], b[1] - 0.4],
      [-1, -0.4],
    ] as Cx[])
      app.actions().penAt(z);
    app.actions().pen();
    expect(card().querySelector(".claim .level")?.getAttribute("data-level")).toBe("⚠");
    expect(sigma()).toMatch(/no permutation: the loop passes through branch point #1/);
    expect(sigma()).not.toMatch(/σ =/);
  });

  it("plays σ on the roots, drawing a braid; names the group of every lasso", () => {
    const { app } = mount();
    expect(app.braid()).toBeNull();
    app.actions().lasso(0);
    expect(app.braid()?.strands).toBe(5);
    app.actions().play();
    expect(card().textContent).toMatch(/coefficients trace a closed loop/);
    expect(q("canvas.braid-canvas").getAttribute("aria-label")).toMatch(
      /Braid of the last motion: 5 strands, \d+ crossings?\./,
    );
    app.actions().group();
    expect(card().textContent).toMatch(/the symmetric group S₅, order 120\./);
  });

  it("a new polynomial or coefficient clears the loop", () => {
    const { app } = mount();
    app.actions().lasso(0);
    app.actions().setCoefficient(1);
    expect(app.currentState().loop).toBeNull();
    app.actions().lasso(0);
    app.actions().type("z^3 - 2");
    expect(app.currentState().loop).toBeNull();
  });

  it("refuses a link whose loop it cannot honour, by name", () => {
    const enc = (lp: unknown, extra: Record<string, unknown> = {}) =>
      encodeViewState(NAMESPACE, {
        r: "Q",
        t: "z^5 - z - 1",
        d: 1,
        o: 0,
        j: 0,
        lp,
        rc: [0, 0, 1],
        cc: [0, 0, 1],
        ...extra,
      });
    const cases: [string, RegExp][] = [
      [enc([0, 8, 1]), /goes round branch point #9 of a0, which has 4/],
      [enc([0, 4, 1]), /goes round branch point #5 of a0, which has 4/],
      [enc([0, 1, 2]), /a lasso in the loop is malformed/],
      [enc([7]), /unknown kind 7/],
      [enc([4, 1, 2]), /at least three finite points/],
      [enc([0, 1, 1], { j: null }), /no coefficient below the leading one/],
      [enc([1]), /word in the loop is empty/],
    ];
    for (const [hash, why] of cases) {
      const d = decodeShell(hash);
      expect(d && !d.ok && d.reason, hash).toMatch(why);
    }
    // And every kind of node round-trips.
    const loop = {
      kind: "word",
      parts: [
        {
          kind: "commutator",
          a: { kind: "lasso", point: 0, sign: 1 },
          b: { kind: "lasso", point: 1, sign: -1 },
        },
        {
          kind: "inverse",
          of: {
            kind: "drawn",
            vertices: [
              [-1, 0],
              [0, 0.5],
              [0.5, -0.5],
            ],
          },
        },
      ],
    } as const;
    const s = { ...DEFAULT_STATE, loop } as unknown as ShellState;
    const d = decodeShell(encodeShell(s));
    expect(d?.ok && d.state.loop).toEqual(loop);
  });

  it("never carries a house name, and the monodromy card never says Galois", () => {
    const { app } = mount();
    app.actions().setBuilding(true);
    app.actions().lasso(0);
    app.actions().lasso(2);
    app.actions().commute();
    app.actions().play();
    app.actions().group();
    const labels = [...document.querySelectorAll("[aria-label]")]
      .map((e) => e.getAttribute("aria-label"))
      .join("\n");
    for (const bad of DENYLIST)
      expect(`${document.body.textContent}\n${labels}`).not.toMatch(bad);
    expect(card().textContent).not.toMatch(/Galois/);
  });
});

describe("the Galois card (PRA-4)", () => {
  const card = (): HTMLElement => q("section[aria-labelledby='card-galois']");
  async function settled(app: App): Promise<void> {
    await vi.waitFor(() => expect(app.galois()?.kind).toBe("done"), { timeout: 5000 });
  }

  it("says it is reading the primes, then names S₅ for the opening polynomial, with its rows", async () => {
    const { app } = mount();
    expect(app.galois()?.kind).toBe("busy");
    expect(card().textContent).toMatch(/reading the primes/);
    await settled(app);
    const text = card().textContent ?? "";
    expect(text).toMatch(/The polynomial is irreducible over ℚ\./);
    expect(text).toMatch(/It is the symmetric group S₅ \(5T5\), of order 120\./);
    expect(text).toMatch(/a 5-cycle at p = 3/);
    expect(text).toMatch(/type \(3, 2\) at p = 2, cubed is a swap/);
    expect(text).toMatch(/the discriminant 2869 is not a square/);
    expect(card().querySelector(".galois-group .level")?.getAttribute("data-level")).toBe(
      "=",
    );
    // The list of cycle types, each drawn and each labelled exactly.
    const types = card().querySelectorAll(".cycle-types li");
    expect(types.length).toBe(6);
    expect(types[0].querySelectorAll(".cycle")).toHaveLength(2);
    expect(types[0].querySelectorAll(".cycle-dot")).toHaveLength(5);
  });

  it("does not name a group no tier reaches, and says so", async () => {
    // z¹⁶ + 1 = Φ₃₂: its group is abelian (no swap, no 3-cycle), and degree 16 is past every table.
    const { app } = mount();
    app.actions().type("z^16 + 1");
    await settled(app);
    const text = card().textContent ?? "";
    expect(text).toMatch(/Contains the elements below; not yet identified\./);
    expect(text).not.toMatch(/symmetric|alternating|cyclic|16T/);
    expect(card().querySelector(".galois-group .level")?.getAttribute("data-level")).toBe(
      "⚠",
    );
  });

  it("shows a reducible polynomial's factors, each with its own group", async () => {
    const { app } = mount();
    app.actions().type("(z^2-2)*(z^3-2)");
    await settled(app);
    expect(card().textContent).toMatch(/factors over ℚ into 2 irreducible factors/);
    expect(card().querySelectorAll(".factor")).toHaveLength(2);
    expect(card().textContent).toMatch(/S₂ \(2T1\), of order 2.*S₃ \(3T2\), of order 6/s);
  });

  it("refuses a Gaussian coefficient and a dragged float polynomial, by name", () => {
    const { app } = mount();
    app.actions().setRing("C");
    app.actions().type("z^2 + i");
    expect(card().textContent).toMatch(
      /No Galois group: Galois groups over ℚ need rational coefficients/,
    );
    app.actions().moveTo({ kind: "root", index: 0 }, [0.3, 0.3]);
    app.actions().release();
    expect(card().textContent).toMatch(
      /No Galois group: it needs exact rational coefficients/,
    );
  });

  it("never shows a previous polynomial's answer beside the next one", async () => {
    const { app } = mount();
    app.actions().type("z^5 + 20z + 16");
    app.actions().type("z^3 + 2");
    await settled(app);
    expect(card().textContent).toMatch(/S₃/);
    expect(card().textContent).not.toMatch(/A₅/);
  });

  it("never carries a house name", async () => {
    const { app } = mount();
    const texts: string[] = [];
    for (const t of [
      "z^5 - z - 1",
      "z^5 - 5z + 12",
      "(z-1)^2*(z^4+1)",
      "z^7 - 56z + 48",
    ]) {
      app.actions().type(t);
      await settled(app);
      const labels = [...card().querySelectorAll("[aria-label]")].map((e) =>
        e.getAttribute("aria-label"),
      );
      texts.push(`${card().textContent}\n${labels.join("\n")}`);
    }
    for (const t of texts) for (const bad of DENYLIST) expect(t).not.toMatch(bad);
  });
});

describe("the degree-8–15 table arrives lazily on the main thread (PRA-5 follow-up)", () => {
  it("a degree-8 polynomial is ranked once it has loaded, and never shows a stale refusal", async () => {
    const { app } = mount();
    app.actions().type("z^8 - 3z^6 + 4z^4 - 2z^2 + 1");
    await vi.waitFor(
      () => {
        const g = app.galois();
        if (g?.kind !== "done" || !g.evidence.ok) throw new Error("not yet");
        const id = g.evidence.factors[0].galois?.identification;
        expect(id?.tier).toBe(2);
      },
      { timeout: 10_000 },
    );
    const card = q("section[aria-labelledby='card-galois']");
    expect(card.textContent).toMatch(/8T10/);
    expect(card.textContent).not.toMatch(/has not loaded/);
  });
});

describe("the Galois correspondence (PRA-6)", () => {
  const card = (): HTMLElement => q("section[aria-labelledby='card-galois']");
  async function settled(app: App): Promise<void> {
    await vi.waitFor(() => expect(app.galois()?.kind).toBe("done"), { timeout: 10_000 });
  }
  const toggle = (): HTMLInputElement =>
    card().querySelector<HTMLInputElement>(
      ".lattice input[type=checkbox]",
    ) as HTMLInputElement;

  it("is off until asked for, and costs nothing then", async () => {
    const { app } = mount();
    await settled(app);
    expect(app.lattice()).toBeNull();
    expect(toggle().checked).toBe(false);
    expect(card().querySelector(".lattice-nodes")).toBeNull();
  });

  it("opens on x³ − 2 with S₃'s six subgroups and their fields, and travels in the link", async () => {
    const { app } = mount();
    app.actions().type("z^3 - 2");
    await settled(app);
    toggle().checked = true;
    toggle().dispatchEvent(new Event("change"));
    expect(app.currentState().lattice).toBe(true);
    await vi.waitFor(() => expect(app.lattice()?.kind).toBe("done"), { timeout: 10_000 });
    const nodes = card().querySelectorAll(".lattice-node");
    expect(nodes).toHaveLength(6);
    const text = card().textContent ?? "";
    expect(text).toMatch(/the fixed field is ℚ: the invariant is the integer 0/);
    const labels = [...card().querySelectorAll(".lattice-node [aria-label]")].map((e) =>
      e.getAttribute("aria-label"),
    );
    expect(labels).toContain("T^3 − 2");
    expect(labels).toContain("T^2 + 108");
    // The permalink carries it.
    const decoded = decodeShell(encodeShell(app.currentState()));
    expect(decoded?.ok && decoded.state.lattice).toBe(true);
  });

  it("after a Galois generator is played, each invariant says whether it stayed", async () => {
    const { app } = mount();
    app.actions().type("z^5 - 5z + 12");
    await settled(app);
    toggle().checked = true;
    toggle().dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(app.lattice()?.kind).toBe("done"), { timeout: 10_000 });
    const play = card().querySelector<HTMLButtonElement>("button.play");
    if (!play) throw new Error("no Play button");
    play.click();
    await vi.waitFor(() => expect(card().textContent).toMatch(/After the last motion/));
    const moved = [...card().querySelectorAll(".moved")].map((e) => e.textContent ?? "");
    expect(moved.some((t) => /unchanged/.test(t))).toBe(true);
    expect(moved.some((t) => /moved/.test(t))).toBe(true);
    // The whole group's invariant, and the F₂₀ copy containing it, can never move under a Galois element.
    expect(card().querySelector(".lattice-node .moved")?.textContent).toMatch(
      /unchanged/,
    );
    // A new polynomial is a new set of roots: a motion of the old ones says nothing about it.
    app.actions().type("z^5 - z - 1");
    await settled(app);
    await vi.waitFor(() => expect(app.lattice()?.kind).toBe("done"), { timeout: 10_000 });
    expect(card().textContent).not.toMatch(/After the last motion/);
    expect(card().querySelector(".moved")).toBeNull();
  });
});

describe("families (PRA-7)", () => {
  const card = (): HTMLElement => q("section[aria-labelledby='card-family']");
  const button = (text: string | RegExp): HTMLButtonElement => {
    const b = [...document.querySelectorAll<HTMLButtonElement>("button")].find((x) =>
      typeof text === "string" ? x.textContent === text : text.test(x.textContent ?? ""),
    );
    if (!b) throw new Error(`no button ${String(text)}`);
    return b;
  };

  it("a preset opens the family: the t-plane, p(t₀, z) in the root pane, the flower and the bridge", () => {
    const { app } = mount();
    button("x⁵ − x − t").click();
    const s = app.currentState();
    expect(s.family).toEqual({ text: "x^5 - x - t", base: "0", open: true });
    expect(s.poly).toEqual({ kind: "text", text: "z^5 - z" });
    expect(q("#pane-coefficients").textContent).toBe("Parameter plane (t)");
    const text = card().textContent ?? "";
    expect(text).toMatch(/4 branch points in t\./);
    expect(card().querySelectorAll(".flower li")).toHaveLength(4);
    expect(
      [...card().querySelectorAll(".flower li")].every((li) =>
        /σ = \(\d \d\)/.test(li.textContent ?? ""),
      ),
    ).toBe(true);
    expect(text).toMatch(/Over ℂ\(t\): the symmetric group S₅, order 120\./);
    expect(text).toMatch(/Over ℚ\(t\): S₅, the symmetric group\./);
    // The monodromy card's loops are now loops of t.
    expect(q("section[aria-labelledby='card-monodromy']").textContent).toMatch(
      /Group of every loop round a branch point of t/,
    );
  });

  it("specialising at t = 1 opens x⁵ − x − 1 in the sandbox, and the bridge cites the Galois card's = S₅", async () => {
    const { app } = mount();
    app.actions().openFamily("x^5 - x - t");
    app.actions().setBase("1");
    expect(app.currentState().family?.base).toBe("1");
    app.actions().specialise();
    const s = app.currentState();
    expect(s.family).toEqual({ text: "x^5 - x - t", base: "1", open: false });
    expect(s.poly).toEqual({ kind: "text", text: "z^5 - z - 1" });
    expect(q("#pane-coefficients").textContent).toBe("Coefficient plane");
    await vi.waitFor(() => expect(app.galois()?.kind).toBe("done"), { timeout: 10_000 });
    const text = card().textContent ?? "";
    expect(text).toMatch(/This is the member t = 1 of the family x\^5 - x - t\./);
    expect(text).toMatch(
      /The Galois group of p\(1, z\) over ℚ is S₅: all of the group over ℚ\(t\) — t = 1 is outside the thin set\./,
    );
    // Back, and out.
    button("Back to the family").click();
    expect(app.currentState().family?.open).toBe(true);
    button("Leave the family").click();
    expect(app.currentState().family).toBeNull();
  });

  it("Trinks' member lands in the thin set", async () => {
    const { app } = mount();
    button("x⁷ − 7x + t at t = 3 (Trinks)").click();
    expect(app.currentState().poly).toEqual({ kind: "text", text: "z^7 - 7 z + 3" });
    await vi.waitFor(() => expect(app.galois()?.kind).toBe("done"), { timeout: 10_000 });
    expect(card().textContent).toMatch(
      /order 168|lies in the thin set Hilbert's theorem allows/,
    );
    expect(card().textContent).toMatch(/lies in the thin set Hilbert's theorem allows/);
  });

  it("a base point whose tether crosses another branch point refuses that lasso; the group is asked of a clear base", () => {
    const { app } = mount();
    app.actions().openFamily("x^5 - x - t", "1");
    const items = [...card().querySelectorAll(".flower li")].map(
      (li) => li.textContent ?? "",
    );
    expect(
      items.filter((t) => /passes through the circle round branch point/.test(t)),
    ).toHaveLength(1);
    // The GROUP does not depend on the base point: it is asked of one whose tethers are all clear.
    expect(card().textContent).toMatch(
      /Over ℂ\(t\): the symmetric group S₅, order 120 \(from the lassos at t = 0, where every tether is clear\)\./,
    );
  });

  it("dragging the base point moves the member, and the release snaps it to a simple rational", () => {
    const { app } = mount();
    app.actions().openFamily("x^4 - 4x^2 + t");
    expect(app.currentState().family?.base).toBe("1");
    app.actions().moveTo({ kind: "base", index: 0 }, [2.0000001, 0]);
    expect(app.live().family?.base?.toTuple()[0]).toBeCloseTo(2.0000001, 9);
    expect(app.currentState().family?.base).toBe("1"); // nothing committed mid-drag
    app.actions().release();
    expect(app.currentState().family?.base).toBe("2");
    expect(app.currentState().poly).toEqual({ kind: "text", text: "z^4 - 4 z^2 + 2" });
    // A release ON a branch point is refused, and the base stays where it was.
    app.actions().moveTo({ kind: "base", index: 0 }, [4, 0]);
    app.actions().release();
    expect(app.currentState().family?.base).toBe("2");
    expect(card().textContent).toMatch(/is a branch point/);
  });

  it("refuses what it cannot follow, by name, and keeps the box's text", () => {
    const { app } = mount();
    app.actions().openFamily("t x^2 + x + 1");
    expect(app.currentState().family).toBeNull();
    expect(card().textContent).toMatch(
      /Not read: the leading coefficient in x depends on t/,
    );
    expect(q<HTMLInputElement>(".family-input").value).toBe("t x^2 + x + 1");
  });

  it("an edited member is no longer the member: the bridge goes, the family box stays", () => {
    const { app } = mount();
    app.actions().openFamily("x^5 - x - t", "1");
    app.actions().specialise();
    expect(card().textContent).toMatch(/This is the member t = 1/);
    app.actions().moveTo({ kind: "coeff", index: 0 }, [-2, 0]);
    app.actions().release();
    expect(app.currentState().poly).toEqual({ kind: "text", text: "z^5 - z - 2" });
    expect(card().textContent).not.toMatch(/This is the member/);
  });

  it("two families with the same member at t₀ do not share lassos", () => {
    const a = resolveState({
      ...DEFAULT_STATE,
      family: { text: "x^5 - x - t", base: "0", open: true },
    }).family?.runs?.[0];
    const b = resolveState({
      ...DEFAULT_STATE,
      family: { text: "x^5 - x - 2t", base: "0", open: true },
    }).family?.runs?.[0];
    if (!a?.ok || !b?.ok) throw new Error("refused");
    // Both are p(0, z) = z⁵ − z, but the second's branch points are half as far out.
    expect(Math.hypot(...b.path[1])).toBeLessThan(0.75 * Math.hypot(...a.path[1]));
  });

  it("in a family only t₀ moves: a root or a coefficient, moved directly, stays put", () => {
    const { app } = mount();
    app.actions().openFamily("x^5 - x - t");
    const before = app.currentState();
    app.actions().moveTo({ kind: "root", index: 0 }, [2, 2]);
    app.actions().release();
    app.actions().moveTo({ kind: "coeff", index: 0 }, [3, 0]);
    app.actions().release();
    expect(app.currentState()).toEqual(before);
  });

  it("typing a polynomial leaves the family", () => {
    const { app } = mount();
    app.actions().openFamily("x^3 + t x + 1");
    app.actions().type("z^3 - 2");
    expect(app.currentState().family).toBeNull();
  });

  it("travels in the link, and a link naming a base point on a branch point is refused by name", () => {
    const { app } = mount();
    app.actions().openFamily("x^4 - 4x^2 + t");
    const hash = encodeShell(app.currentState());
    const d = decodeShell(hash);
    const closed = decodeShell(
      encodeShell({
        ...app.currentState(),
        family: { text: "x^4 - 4x^2 + t", base: "1", open: false },
      }),
    );
    expect(closed?.ok && closed.state.family?.open).toBe(false);
    expect(d?.ok && d.state.family).toEqual({
      text: "x^4 - 4x^2 + t",
      base: "1",
      open: true,
    });
    const bad = encodeShell({
      ...app.currentState(),
      family: { text: "x^4 - 4x^2 + t", base: "4", open: true },
    });
    const r = decodeShell(bad);
    expect(r?.ok).toBe(false);
    if (r && !r.ok) expect(r.reason).toMatch(/t₀ = 4 is a branch point/);
    const unread = encodeShell({
      ...app.currentState(),
      family: { text: "x^2 - 1/t", base: "1", open: true },
    });
    const u = decodeShell(unread);
    expect(u?.ok).toBe(false);
    if (u && !u.ok)
      expect(u.reason).toMatch(/the family cannot be read: not a polynomial in t/);
  });
});

describe("the ladder (PRA-8)", () => {
  const card = (): HTMLElement => q("section[aria-labelledby='card-ladder']");
  const button = (text: string | RegExp): HTMLButtonElement => {
    const b = [...document.querySelectorAll<HTMLButtonElement>("button")].find((x) =>
      typeof text === "string" ? x.textContent === text : text.test(x.textContent ?? ""),
    );
    if (!b) throw new Error(`no button ${String(text)}`);
    return b;
  };

  it("a rung opens its polynomial, Cardano, the words, the identities and the derived series", () => {
    const { app } = mount();
    button("Cubic").click();
    const s = app.currentState();
    expect(s.ladder).toMatchObject({ rung: 3, word: null });
    expect(s.poly.kind).toBe("roots");
    const text = card().textContent ?? "";
    expect(text).toMatch(/2 levels of radicals/);
    expect(text).toMatch(/\[\(1 2\), \(2 3\)\] = \(1 2 3\)/);
    expect(text).toMatch(/S₃: 6 → 3 → 1\./);
    expect(card().querySelectorAll(".words button")).toHaveLength(4);
  });

  it("running the depth-1 word: the cube root does not close, so the word cannot rule Cardano out", () => {
    const { app } = mount();
    app.actions().openLadder(3);
    app.actions().runWord("d1");
    const text = card().textContent ?? "";
    expect(text).toMatch(/The roots undergo \(1 2 3\)\./);
    expect(text).toMatch(/level 2: ∛[^]*does not close/);
    expect(text).toMatch(/does not close, so this word cannot rule the formula out/);
    // The roots have moved: each took the label the motion carried it to.
    expect(livePoly(app).labels).not.toEqual([1, 2, 3]);
    expect(app.braid()?.strands).toBe(3);
  });

  it("the quintic: the depth-2 candidate is killed by the depth-2 word, and the series stalls at 60", () => {
    const { app } = mount();
    app.actions().openLadder(5);
    app.actions().setFormula("cbrt(-20.875 - 27.75*i + sqrt(disc))");
    app.actions().runWord("d2");
    const text = card().textContent ?? "";
    expect(text).toMatch(
      /depth 2 is killed by this word, and a formula needs at least 3/,
    );
    expect(text).toMatch(/S₅: 120 → 60 → 60\./);
    expect(text).toMatch(/no depth of radicals is ever enough/);
    expect(card().querySelector(".verdict")?.textContent).toMatch(/^=/);
  });

  it("a formula that does not read is refused by name and keeps the box", () => {
    const { app } = mount();
    app.actions().openLadder(4);
    app.actions().setFormula("exp(a0)");
    expect(card().textContent).toMatch(/Not read: 'exp\(…\)' is not a radical/);
    expect(q<HTMLInputElement>(".formula-input").value).toBe("exp(a0)");
    expect(app.currentState().ladder?.formula).toMatch(/^p = a2/);
  });

  it("a rung state is a permalink: rung, formula and word travel; a gallery formula travels as its id", () => {
    const { app } = mount();
    app.actions().openLadder(4);
    app.actions().runWord("d2");
    const hash = encodeShell(app.currentState());
    // Ferrari's text is ~400 characters; on the wire it is its id.
    const env = decodeViewState<{ ld: unknown[] }>(hash);
    expect(env?.state.ld).toEqual([4, "#ferrari", "d2"]);
    const d = decodeShell(hash);
    expect(d?.ok && d.state.ladder).toEqual(app.currentState().ladder);
    const { app: again } = mount(hash);
    expect(again.currentState().ladder).toEqual(app.currentState().ladder);
    expect(card().textContent).toMatch(/The roots undergo \(1 4\)\(2 3\)\./);
    const bad = decodeShell(
      encodeShell({
        ...app.currentState(),
        ladder: { rung: 4, formula: "x", word: "d9" },
      }),
    );
    expect(bad?.ok).toBe(false);
    const noWord = decodeShell(
      encodeShell({
        ...app.currentState(),
        ladder: { rung: 4, formula: "sqrt(a0)", word: "d9" },
      }),
    );
    expect(noWord?.ok === false && noWord.reason).toBe(
      "the quartic rung has no word 'd9'",
    );
  });

  it("typing a polynomial, or opening a family, leaves the ladder; the ladder's roots cannot be dragged", () => {
    const { app } = mount();
    app.actions().openLadder(3);
    const before = app.currentState().poly;
    app.actions().moveTo({ kind: "root", index: 0 }, [2, 2]);
    app.actions().release();
    expect(app.currentState().ladder).not.toBeNull();
    expect(app.currentState().poly).toEqual(before);
    app.actions().type("z^2 - 2");
    expect(app.currentState().ladder).toBeNull();
    app.actions().openLadder(2);
    app.actions().openFamily("x^3 + t x + 1");
    expect(app.currentState().ladder).toBeNull();
  });
});
