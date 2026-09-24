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
import { encodeViewState } from "@cas/interchange";

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
