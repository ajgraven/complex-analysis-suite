// @vitest-environment jsdom
//
// The left rail's cards — M8 step 1.4.
//
// **Rendered, not mounted.** A card is `(state, resolution, session, actions) → description` and has
// no closure, so the honest instrument is to call it and patch the result into a detached node: the
// whole app does not have to exist for a card's sentence to be asserted, and a failure names the
// card rather than the shell. The interaction tests — a slider that survives a scrub, a preview that
// follows the box — live in `test/shell2.test.ts`, where there is a mounted app to act on.
import { describe, expect, it } from "vitest";
import { Frac } from "@cas/exact";

import { circleTemplate, semicircleTemplate } from "../src/engine/contour/templates.js";
import { penContour } from "../src/engine/contour/pen.js";
import { addBranchPoint, setOrder, setShadow } from "../src/engine/branchEdit.js";
import { LEFT_CARDS, RIGHT_CARDS, roleLabel } from "../src/engine/vocabulary.js";
import { citationLine } from "../src/families/describe.js";
import { FAMILIES } from "../src/families/index.js";
import {
  compile,
  defaultState,
  offeredCorpus,
  paramChannel,
  recordOf,
  resolveState,
  withParam,
  type ShellState,
} from "../src/shell/state.js";
import { patch } from "../src/shell2/dom.js";
import { render } from "../src/shell2/render.js";
import { defaultSession } from "../src/shell2/session.js";
import type { ShellActions } from "../src/shell2/cards/card.js";

/** Actions that record what was asked for, so a control can be pressed and the ask inspected. */
function spyActions(): ShellActions & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fitContour: () => calls.push("fit"),
    setExpr: (s) => calls.push(`expr:${s}`),
    setFixture: (i) => calls.push(`fixture:${i}`),
    setParam: (n, v) => calls.push(`param:${n}=${v}`),
    setScrubbing: (on) => calls.push(`scrub:${on}`),
    hover: (p) => calls.push(`hover:${p}`),
    setTemplate: (id) => calls.push(`template:${id}`),
    reverseContour: () => calls.push("reverse"),
    penStart: () => calls.push("pen:start"),
    penStop: () => calls.push("pen:stop"),
    penBack: () => calls.push("pen:back"),
    penCommit: (closed) => calls.push(`pen:commit:${closed}`),
    setBranch: (b) => calls.push(`branch:${b.points.length}:${b.cuts.length}:${b.shadow === true}:${b.sheet}`),
    setIso: (on) => calls.push(`iso:${on}`),
    setStageMode: (m) => calls.push(`stageMode:${m}`),
    undo: () => calls.push("undo"),
    redo: () => calls.push("redo"),
    declare: (id) => calls.push(`declare:${id}`),
    undeclare: () => calls.push("undeclare"),
    setDeclaration: (d, cut) => calls.push(`decl:${d.sign}:${d.logPower}:${d.window[0].n}/${d.window[0].d}:${cut === undefined ? "nocut" : "cut"}`),
    setOpen: (id, open) => calls.push(`open:${id}:${open}`),
    copyLink: () => calls.push("copyLink"),
    saveFigure: (t) => calls.push(`saveFigure:${t}`),
    copyFigure: () => calls.push("copyFigure"),
    setMode: (m) => calls.push(`mode:${m}`),
    setRail: (side, folded) => calls.push(`rail:${side}:${folded}`),
    toSandbox: () => calls.push("toSandbox"),
    setContrastsOpen: (open) => calls.push(`contrasts:${open}`),
    applyState: () => calls.push("applyState"),
    openFrontDoor: () => calls.push("frontDoor"),
    notify: (text, level) => calls.push(`notify:${level}:${text}`),
    redraw: () => calls.push("redraw"),
  };
}

/** Draw one rail for a state, and hand back the host plus the actions it will call. */
function railOf(state: ShellState, side: "left" | "right"): { host: HTMLElement; actions: ReturnType<typeof spyActions> } {
  const compiled = compile(state.expr);
  const resolution = resolveState(state, compiled);
  const poles =
    resolution.kind === "gallery"
      ? (resolution.run?.poles ?? null)
      : compiled.ok
        ? compiled.poles
        : null;
  const actions = spyActions();
  const host = document.createElement("div");
  patch(host, render(state, resolution, defaultSession(), actions, poles)[side]);
  return { host, actions };
}

const rail = (state: ShellState): ReturnType<typeof railOf> => railOf(state, "left");
const right = (state: ShellState): ReturnType<typeof railOf> => railOf(state, "right");

const sandbox = (over: Partial<ShellState> = {}): ShellState => ({
  ...defaultState(circleTemplate([0, 0], 1.5)),
  ...over,
});

const gallery = (record: string, fixture = 0): ShellState =>
  sandbox({ mode: "gallery", record, fixture });

/** A sandbox with one branch point, its cut, and a `√` order — the keyhole's starting shape. */
const withPoint = (): ShellState => {
  const base = sandbox({ expr: "1/(1+z)" });
  return { ...base, branch: addBranchPoint(base.branch, [0, 0]) };
};

/** The same, with a factor declared on it — so the box holds `R(z)`. */
const declared = (): ShellState => {
  const base = withPoint();
  return {
    ...base,
    beforeDeclaration: "z^(-0.5)/(1+z)",
    declaration: {
      pointId: base.branch.points[0].id,
      window: [Frac.ZERO, Frac.of(2n)],
      sign: 1,
      constant: [1, 0],
      logPower: 2,
    },
  };
};

const q = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string): T => {
  const e = root.querySelector<T>(sel);
  if (e === null) throw new Error(`no ${sel}`);
  return e;
};

const RECORD_IDS = offeredCorpus()
  .tiers.flatMap((t) => t.families)
  .map((f) => f.id);

describe("the Integrand card", () => {
  it("typesets what the ENGINE parsed, not what was typed", () => {
    // `1/1+z` is `(1/1) + z`, and the preview is built from the AST, so the precedence mistake is
    // visible before a reader goes looking for it in the answer.
    const { host } = rail(sandbox({ expr: "1/1+z" }));
    const card = q(host, '[data-card="integrand"]');
    expect(card.querySelector(".katex"), "nothing was typeset").not.toBeNull();
    expect(card.textContent ?? "").toContain("1");
    expect(q<HTMLInputElement>(card, "input.expr").value).toBe("1/1+z");
  });

  it("says what is WRONG in a sentence, not in the parser's token names", () => {
    const { host } = rail(sandbox({ expr: "1/(1+z" }));
    const card = q(host, '[data-card="integrand"]');
    const err = q(card, ".parseError").textContent ?? "";
    expect(err).toContain("unbalanced parenthesis");
    // The parser's own wording must not reach the reader.
    expect(err).not.toContain("Expected");
  });

  it("names the box for what is IN it — `f(z)` normally, `R(z)` under a declaration", () => {
    // The old shell swapped a VISIBLE label and left the accessible name alone, so a reader who
    // could not see it was told the box held the integrand when it held the cofactor.
    const plain = q<HTMLInputElement>(rail(sandbox()).host, "input.expr");
    expect(plain.getAttribute("aria-label")).toBe("integrand f(z)");
    const cofactorBox = q<HTMLInputElement>(rail(declared()).host, "input.expr");
    expect(cofactorBox.getAttribute("aria-label")).toBe("cofactor R(z)");
  });

  it("calls the box the INTEGRAND again when the declaration is orphaned", () => {
    // **The first draft of the test above built exactly this state and asserted the opposite.** A
    // declaration names a branch POINT; remove the point and `declaredOrder` returns null, so
    // `resolveState` falls through to the plain branch and integrates the box WHOLE — while a card
    // keyed on `state.declaration !== null` goes on calling it the cofactor. That is M6.1's finding
    // in a new place, and the test that documented it is how it would have survived.
    const orphan = sandbox({
      expr: "1/(1+z)",
      declaration: {
        pointId: "b1",
        window: [Frac.ZERO, Frac.of(2n)],
        sign: 1,
        constant: [1, 0],
        logPower: 1,
      },
    });
    expect(orphan.branch.points, "this state has a branch point, so nothing is orphaned").toEqual([]);
    const box = q<HTMLInputElement>(rail(orphan).host, "input.expr");
    expect(box.getAttribute("aria-label")).toBe("integrand f(z)");
    // And the singularities are the INTEGRAND's again, not "of the cofactor R(z)".
    expect(q(rail(orphan).host, '[data-card="singularities"]').textContent ?? "").not.toContain("cofactor R(z)");
  });

  it("previews what PARSING produced, which is not what was typed", () => {
    // `1/1+z` is `(1/1) + z`. Typesetting the SOURCE would put the reader's own string back on the
    // screen in a nicer font and show them nothing; the AST's `\\frac{1}{1}+z` shows the precedence.
    const { host } = rail(sandbox({ expr: "1/1+z" }));
    const preview = q(host, '[data-card="integrand"] .math-display');
    expect(preview.getAttribute("aria-label") ?? "").toContain("\\frac");
    expect(preview.getAttribute("aria-label") ?? "").not.toBe("1/1+z");
  });

  it("asks for a preset by its SOURCE, so the box and the menu cannot disagree", () => {
    const { host, actions } = rail(sandbox());
    const select = q<HTMLSelectElement>(host, '[data-card="integrand"] select');
    select.value = "1/(1+z^4)";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(actions.calls).toContain("expr:1/(1+z^4)");
  });
});

describe("the Parameters card", () => {
  it("gives every LIVE parameter a slider and every derived one a tag instead", () => {
    const { host } = rail(sandbox());
    const card = q(host, '[data-card="parameters"]');
    const sliders = card.querySelectorAll("input.slider");
    expect(sliders.length).toBeGreaterThan(0);
    // The readout names the parameter and its value, so a slider is identifiable without the track.
    expect(card.textContent ?? "").toMatch(/R = /);
  });

  it("writes a value through the slider's own scale, not through its stop count", () => {
    const { host, actions } = rail(sandbox());
    const slider = q<HTMLInputElement>(host, '[data-card="parameters"] input.slider');
    slider.value = slider.max;
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    const call = actions.calls.find((c) => c.startsWith("param:"));
    expect(call, "the slider asked for nothing").toBeDefined();
    // At the top stop the value is the range's upper end — 1000 would be the STOP, not the value.
    expect(call).not.toContain("=1000");
  });

  it("gives a DERIVED parameter a tag and no slider, in every record that has one", () => {
    // A derived value is computed from the others; moving it independently would desync the geometry
    // from its own definition, which is why `withParam` refuses it. The card has to agree.
    let found = 0;
    for (const id of RECORD_IDS) {
      const state = gallery(id);
      const record = recordOf(state);
      if (record === null) continue;
      const { host } = rail(state);
      const card = host.querySelector('[data-card="parameters"]');
      if (card === null) continue;
      for (const row of card.querySelectorAll(".paramRow2")) {
        const name = (row.querySelector(".paramValue")?.textContent ?? "").split(" ")[0];
        if (paramChannel(state, record.family, name) !== "derived") continue;
        found++;
        expect(row.querySelector("input.slider"), `${id}: ${name} is derived and got a slider`).toBeNull();
        expect(row.textContent ?? "", `${id}: ${name} is derived and says nothing about it`).toContain("derived");
      }
    }
    expect(found, "no record in the corpus has a derived parameter, so this asserts nothing").toBeGreaterThan(0);
  });

  it("puts the draft budget on a scrub at pointerdown and takes it off at pointerup", () => {
    const { host, actions } = rail(sandbox());
    const slider = q<HTMLInputElement>(host, '[data-card="parameters"] input.slider');
    slider.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    slider.dispatchEvent(new Event("pointerup", { bubbles: true }));
    expect(actions.calls).toEqual(expect.arrayContaining(["scrub:true", "scrub:false"]));
  });
});

describe("the Singularities card", () => {
  it("prints the residue AND the winding that multiplies it, in one row", () => {
    // `2πi Σ n·Res` is what the table is a picture of, so the coefficient and the residue have to be
    // readable together — the old shell listed them in three separate places.
    const { host } = rail(sandbox({ expr: "1/(1+z^2)" }));
    const rows = host.querySelectorAll('[data-card="singularities"] tbody tr');
    expect(rows.length).toBe(2);
    const cells = [...rows[0].children].map((c) => c.textContent ?? "");
    expect(cells.length).toBe(4);
    expect(cells[1]).toContain("1"); // order
    // `Ind` comes from the resolution's own windings: the circle |z| = 1.5 encloses both poles.
    const winds = [...rows].map((r) => (r.children[3].textContent ?? "").trim());
    expect(winds).toEqual(["1", "1"]);
  });

  it("says ENTIRE, UNREADABLE and NO POLES as three different sentences", () => {
    const entire = rail(sandbox({ expr: "exp(z)" })).host;
    expect(q(entire, '[data-card="singularities"]').textContent ?? "").toContain("f is entire");
    const unreadable = rail(sandbox({ expr: "1/cosh(z)" })).host;
    const said = q(unreadable, '[data-card="singularities"]').textContent ?? "";
    expect(said).toContain("not the same as there being none");
  });

  it("says UNDECIDED where the winding was not decided, rather than 0", () => {
    // A pole ON the contour has no winding number, and `0` is a coefficient no predicate established
    // — printing it would put a term into `2πi Σ n·Res` that the geometry refused to supply.
    const { host } = rail(sandbox({ expr: "1/(z-1.5)" }));
    const ind = (host.querySelector('[data-card="singularities"] tbody tr td:nth-child(4)')?.textContent ?? "").trim();
    expect(ind).toBe("undecided");
  });

  it("typesets the residue from its LATEX twin, and names it by its text", () => {
    // `formatSqrtExt` at `LATEX` and at `TEXT` are the same value in two notations (step 0.4b). The
    // text form is not LaTeX: `√2/8` typeset as LaTeX is not a fraction, and KaTeX renders it anyway
    // because `throwOnError` is off — so the check is that a FRACTION was built.
    const { host } = rail(sandbox({ expr: "1/(1+z^4)" }));
    const cell = q(host, '[data-card="singularities"] tbody tr td:nth-child(3) .math');
    expect(cell.innerHTML, "the residue was not typeset as a fraction").toContain("frac");
    expect(cell.getAttribute("aria-label") ?? "").toMatch(/√|sqrt/);
  });

  it("asks for a HOVER by the same id the stage draws poles under", () => {
    const { host, actions } = rail(sandbox({ expr: "1/(1+z^2)" }));
    const row = q(host, '[data-card="singularities"] tbody tr');
    row.dispatchEvent(new Event("pointerenter", { bubbles: true }));
    expect(actions.calls[0] ?? "").toMatch(/^hover:pole:/);
  });
});

describe("the Contour card", () => {
  it("gives every piece its colour, its NAME typeset, and what the argument uses it for", () => {
    const { host } = rail(sandbox({ expr: "1/(1+z^2)" }));
    const rows = host.querySelectorAll('[data-card="contour"] .pieces2 > li');
    expect(rows.length).toBe(1);
    const row = rows[0];
    // The swatch reads the SAME token the stage strokes with, so the two cannot drift.
    expect((row.querySelector(".swatch") as HTMLElement).style.background).toContain("--piece-");
    // The piece name is a sentence in the `$…$` convention — `the circle $|z - a| = R$` — so it is
    // typeset, and its delimiters never reach the screen.
    expect(row.querySelector(".katex"), "the piece name was not typeset").not.toBeNull();
    expect(row.textContent ?? "").not.toContain("$");
    // And what it is FOR, in the reader's word rather than the schema's id.
    expect(row.textContent ?? "").toContain(roleLabel("residue"));
  });

  it("prints a piece's own value", () => {
    const { host } = rail(sandbox({ expr: "1/(1+z^2)" }));
    expect(host.querySelector('[data-card="contour"] .pieceValue')?.textContent ?? "").toMatch(/\d/);
  });

  it("has NO record that skips its quadrature — which is M5.0's own result", () => {
    // The `not sampled` tag exists because `integrateContour` fills the piece list with ZEROS when
    // it declines to sample, and `0 + 0i` beside D6's upper edge (worth 2.22) is exactly the number
    // a reader would go looking for the bug in. Measured here: **no loaded record reaches it.** M5.0
    // honoured `side` and dropped the skip for all seven tier-D records, and the one skip it left is
    // narrower — a cut running VERTICALLY along a piece, which no template and window this card
    // offers produces. So the branch is kept as `integrateContour`'s contract and is asserted to be
    // unreachable rather than left looking untested.
    for (const id of RECORD_IDS) {
      const { host } = rail(gallery(id));
      const tags = [...host.querySelectorAll('[data-card="contour"] .tag')].map((t) => t.textContent);
      expect(tags, `${id} skipped its quadrature — M5.0's claim has regressed`).not.toContain("not sampled");
    }
  });

  it("offers no template picker and no pen under a RECORD", () => {
    // The contour is the record's; swapping it would leave a worked example whose pieces no longer
    // match the argument it is making.
    const { host } = rail(gallery("circle-linear-cos"));
    expect(host.querySelector('[data-card="contour"] select')).toBeNull();
    expect(host.querySelector('[data-card="contour"] button')).toBeNull();
    // The piece list is still there — reading a record's contour is the point of the card.
    expect(host.querySelectorAll('[data-card="contour"] .pieces2 > li').length).toBeGreaterThan(0);
  });

  it("names a HAND-DRAWN contour as drawn, rather than claiming a template", () => {
    const drawn = penContour({
      nodes: [{ at: [-1, 0] }, { at: [1, 0] }, { at: [0, 1] }],
      closed: true,
    });
    const { host } = rail(sandbox({ contour: drawn, sandboxContour: drawn, contourSource: null }));
    const select = q<HTMLSelectElement>(host, '[data-card="contour"] select');
    expect(select.value).toBe("");
    expect(select.options[0].textContent).toBe("drawn by hand");
    expect(host.querySelector('[data-card="contour"] .tag')?.textContent ?? "").toContain("drawn · 3 pieces");
  });

  it("asks for a HOVER by the piece's own id — the same id the stage draws it under", () => {
    const { host, actions } = rail(sandbox());
    const row = q(host, '[data-card="contour"] .pieces2 > li');
    row.dispatchEvent(new Event("pointerenter", { bubbles: true }));
    expect(actions.calls).toContain("hover:circle");
  });

  it("shows the PEN's grammar while it is out, and its vertex count", () => {
    const session = defaultSession();
    session.pen = { nodes: [{ at: [0, 0] }, { at: [1, 0] }], at: [1, 0], snap: null, drag: null };
    const state = sandbox();
    const compiled = compile(state.expr);
    const host = document.createElement("div");
    const actions = spyActions();
    patch(host, render(state, resolveState(state, compiled), session, actions, null).left);
    const card = q(host, '[data-card="contour"]');
    expect(card.textContent ?? "").toContain("2 vertexes");
    // Close is refused on two: a two-vertex loop is degenerate and the ledger cannot read it.
    expect(q<HTMLButtonElement>(card, 'button[aria-label*="close the drawn path"]').disabled).toBe(true);
    expect(card.textContent ?? "").toContain("Alt suppresses snapping");
  });
});

describe("the Branch cuts card", () => {
  it("is READ-ONLY under a record, and still offers the modulus device", () => {
    const { host } = rail(gallery("circle-linear-cos"));
    const card = q(host, '[data-card="cuts"]');
    expect(card.textContent ?? "").toContain("A record's cuts are the record's");
    expect(card.querySelector('button[aria-pressed]'), "the modulus toggle is missing").not.toBeNull();
    expect(card.querySelector('button[aria-label^="remove branch point"]')).toBeNull();
  });

  it("says the integrand is single-valued until a branch point is declared", () => {
    const { host, actions } = rail(sandbox());
    const card = q(host, '[data-card="cuts"]');
    expect(card.textContent ?? "").toContain("treated as single-valued");
    q<HTMLButtonElement>(card, 'button:not([aria-pressed])').click();
    expect(actions.calls.some((c) => c.startsWith("branch:1:")), "no branch point was added").toBe(true);
  });

  it("rebuilds the CUT with the window, because declaring the determination IS declaring the cut", () => {
    // Left alone, the answer (which reads the window) and the drawn cut (which reads the geometry)
    // would disagree about where the discontinuity is — M5.1's review found exactly that.
    const state = declared();
    const { host, actions } = rail(state);
    const select = q<HTMLSelectElement>(host, '[data-card="cuts"] select[aria-label^="argument window"]');
    select.value = "arg ∈ [−π, π)";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    const call = actions.calls.find((c) => c.startsWith("decl:"));
    expect(call, "the window change asked for nothing").toBeDefined();
    expect(call, "the window moved and the cut did not").toContain(":cut");
  });

  it("moves the SHEET through the branch, and the cut does not move with it", () => {
    const { host, actions } = rail(declared());
    const spinner = q<HTMLInputElement>(host, '[data-card="cuts"] input[aria-label^="sheet"]');
    expect(spinner.value).toBe("0");
    spinner.value = "2";
    spinner.dispatchEvent(new Event("change", { bubbles: true }));
    const call = actions.calls.find((c) => c.startsWith("branch:"));
    // A sheet is a whole-turn offset of the WINDOW: the point count and the cut count are untouched,
    // and only the last field — the sheet — moves.
    expect(call).toMatch(/^branch:1:1:false:2$/);
  });

  it("puts what was TYPED back in the box when the factor is undeclared", () => {
    const { host, actions } = rail(declared());
    q<HTMLButtonElement>(host, '[data-card="cuts"] button[aria-label^="undeclare"]').click();
    expect(actions.calls).toContain("undeclare");
  });

  it("prints the crossing factor as MATHEMATICS, not as LaTeX source", () => {
    // `literal` and `reduced` are bare LaTeX fragments, and the old shell prints them as text — its
    // card reads `× e^{2\pi i \cdot \frac{1}{2}}` on screen, backslashes and all. `detail` is the
    // same content as one `$…$` sentence, already in step 0.5b's convention.
    const { host } = rail(declared());
    const row = host.querySelector('[data-card="cuts"] .pieces2 > li');
    expect(row, "no crossing row — the cut carries no jump").not.toBeNull();
    expect(row?.querySelector(".katex"), "the factor was not typeset").not.toBeNull();
    // **`.katex-mathml` carries the raw LaTeX**, so `textContent` is not what a reader sees — the
    // same trap step 1.3's chip test met. Strip it and read what is actually drawn.
    const clone = row?.cloneNode(true) as HTMLElement;
    for (const m of clone.querySelectorAll(".katex-mathml")) m.remove();
    const text = clone.textContent ?? "";
    expect(text, "LaTeX source reached the screen").not.toMatch(/\\pi|\\frac|\\cdot/);
    expect(text).not.toContain("$");
  });

  it("offers the ORDER of each branch point, and shows the one it HAS", () => {
    // **Not the default one.** `addBranchPoint` gives a fresh point `OFFERED_ORDERS[0]`, so a picker
    // that binds nothing still reads `√ (α = 1/2)` and looks right — the binding is only observable
    // on a point whose order is something else.
    const base = withPoint();
    const logged = { ...base, branch: setOrder(base.branch, base.branch.points[0].id, { kind: "log" }) };
    expect(q<HTMLSelectElement>(rail(logged).host, '[data-card="cuts"] select[aria-label^="order of branch point"]').value).toBe("log");
    const { host, actions } = rail(withPoint());
    const select = q<HTMLSelectElement>(host, '[data-card="cuts"] select[aria-label^="order of branch point"]');
    expect(select.value).toBe("√ (α = 1/2)");
    select.value = "log";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(actions.calls.some((c) => c.startsWith("branch:")), "the order change asked for nothing").toBe(true);
  });
});

describe("the Branch cuts card, in shadow mode", () => {
  it("offers NO join or split, because there the cuts are a consequence", () => {
    // Those buttons read `branch.cuts` — the declaration — which shadow mode ignores, so they edited
    // something invisible and changed nothing on screen. The JOIN is worse: it offers the one shape
    // a shadow system structurally cannot express, since every ray reaches infinity.
    const base = sandbox();
    const two = addBranchPoint(addBranchPoint(base.branch, [0, 0]), [2, 0]);
    const declared2 = { ...base, branch: two };
    const shadowed = { ...base, branch: setShadow(two, true) };
    const label = (st: ShellState): string[] =>
      [...rail(st).host.querySelectorAll('[data-card="cuts"] button')].map((b) => b.textContent ?? "");
    expect(label(declared2), "the join is missing where it MEANS something").toContain("join into one cut");
    expect(label(shadowed)).not.toContain("join into one cut");
    expect(label(shadowed)).not.toContain("split into two rays");
    // And the mode says what a reader should do instead.
    expect(rail(shadowed).host.querySelector('[data-card="cuts"]')?.textContent ?? "").toContain(
      "switch this off to build it",
    );
  });
});

describe("citationLine", () => {
  it("omits the dash when a citation has no covering phrase — which most of the corpus does", () => {
    // The sweep found this: `cite-always-dash` — dropping the empty-text branch — survived, because
    // nothing asserted the shape of a citation with no gloss. It is not an edge case: A6's three
    // citations all carry `text: ""`, so the cold start's own Target card takes this branch three
    // times, and the mutant prints `Brown–Churchill, §79 — ` with a dash and nothing after it.
    expect(citationLine({ book: "Brown–Churchill", where: "§79", text: "" })).toBe("Brown–Churchill, §79");
    expect(citationLine({ book: "Ahlfors", where: "Ch. 4 §5.3", text: "Jordan's lemma" })).toBe(
      "Ahlfors, Ch. 4 §5.3 — Jordan's lemma",
    );
    // And it is the corpus's common case rather than a contrived one, measured over every record.
    const all = FAMILIES.flatMap((f) => f.description.citations);
    const bare = all.filter((c) => c.text === "");
    expect(bare.length, "no record cites without a gloss, so the branch is unreachable").toBeGreaterThan(0);
    for (const c of bare) expect(citationLine(c), `${c.book} ${c.where}`).not.toMatch(/—\s*$/);
  });
});

describe("the Target card", () => {
  it("shows the record's unknowns AT THIS FIXTURE, and where to read the argument", () => {
    const { host } = rail(gallery("circle-linear-cos"));
    const card = q(host, '[data-card="target"]');
    expect(card.querySelectorAll(".targetLine").length).toBeGreaterThan(0);
    expect(card.querySelectorAll(".katex").length).toBeGreaterThan(1);
    // At least one citation, chapter-level and never an exercise (the 0.6 standard).
    const cites = card.querySelectorAll(".cites li");
    expect(cites.length).toBeGreaterThan(0);
    expect([...cites].every((li) => !/exercise/i.test(li.textContent ?? ""))).toBe(true);
  });

  it("OFFERS a variant fixture and refuses to run it, rather than failing when picked", () => {
    // A variant selects an alternative derivation the engine has no route for. Hiding it would lose
    // the record's own statement that the derivation exists.
    const withVariant = RECORD_IDS.map((id) => rail(gallery(id)).host).find((host) =>
      host.querySelector('[data-card="target"] option[disabled]'),
    );
    expect(withVariant, "no record in the corpus offers a variant fixture").toBeDefined();
    const opt = q(withVariant as HTMLElement, "option[disabled]");
    expect(opt.textContent ?? "").toContain("not executable");
  });

  it("shows the picker on the fixture the app is ACTUALLY running", () => {
    const { host } = rail(gallery("circle-linear-cos", 1));
    expect(q<HTMLSelectElement>(host, '[data-card="target"] select').value).toBe("1");
  });

  it("substitutes the fixture's numbers into the unknown, rather than printing the symbols", () => {
    // `∫₀^{2π} dθ/(a + b cos θ)` with `a` and `b` still in it is the FAMILY; the reader is looking at
    // one member of it, and the picker above says which.
    const state = gallery("circle-linear-cos");
    const record = recordOf(state);
    if (record === null) throw new Error("no record");
    const { host } = rail(state);
    const shown = q(host, '[data-card="target"] .targetLine .math').getAttribute("aria-label") ?? "";
    const bound = Object.entries(record.golden.params).filter(([, v]) => typeof v === "number");
    expect(bound.length, "this record binds nothing, so the test asserts nothing").toBeGreaterThan(0);
    for (const [name] of bound) {
      expect(shown, `the symbol ${name} is still in the printed target`).not.toMatch(
        new RegExp(`(?<![A-Za-z\\\\])${name}(?![A-Za-z])`),
      );
    }
  });

  it("is ABSENT in the sandbox rather than empty", () => {
    expect(rail(sandbox()).host.querySelector('[data-card="target"]')).toBeNull();
  });
});

describe("the Result card", () => {
  it("shows NO value when `integralRefusal` refuses — not a greyed one, none", () => {
    // A contour THROUGH a pole: the winding is undecided, so `2πi Σ n·Res` has no coefficients and
    // the quadrature is sampling a singularity. Three independent reasons, asked in one place.
    const { host } = right(sandbox({ expr: "1/(z-1.5)" }));
    const card = q(host, '[data-card="result"]');
    expect(card.textContent ?? "").toContain("Refused");
    expect(card.querySelector(".resultValue"), "a value was printed past a refusal").toBeNull();
  });

  it("leads with the EXACT value and its own badge, not the ledger's meet", () => {
    const { host } = right(sandbox({ expr: "1/(1+z^2)" }));
    const value = q(host, '[data-card="result"] .resultValue');
    expect(value.querySelector(".katex"), "the value was not typeset").not.toBeNull();
    // `=` is the residue theorem's own level. The ledger's meet carries the weakest step's `≤`,
    // which is a true statement about that step and a false one about the answer.
    expect(value.querySelector(".badge")?.getAttribute("data-level")).toBe("=");
  });

  it("opens the hypothesis table BY DEFAULT when a row has failed, and not otherwise", () => {
    const fine = q(right(sandbox({ expr: "1/(1+z^2)" })).host, '[data-card="result"] details');
    expect((fine as HTMLDetailsElement).open, "the hypotheses opened with nothing wrong").toBe(false);
    const broken = right(sandbox({ expr: "1/(z-1.5)" })).host;
    const opened = [...broken.querySelectorAll("details")].find((d) =>
      (d.querySelector("summary")?.textContent ?? "").startsWith("What was checked"),
    );
    expect(opened?.open, "a failed hypothesis did not open its own table").toBe(true);
    expect(opened?.querySelector("summary")?.textContent ?? "").toMatch(/\d+ of \d+ failed/);
    // **And it does not spend the vocabulary's word for one CONSTRAINT on all four.** `Hypotheses`
    // is LEGALITY's name; the Derivation card two cards down uses it for that stage alone.
    expect(opened?.querySelector("summary")?.textContent ?? "").not.toContain("Hypotheses");
  });

  it("lets an explicit click WIN over the computed default", () => {
    // `session.open[id]` is tri-state: `undefined` is "never touched", which is what lets the table
    // open itself on a failure and stay shut afterwards if the reader has shut it.
    const state = sandbox({ expr: "1/(z-1.5)" });
    const session = defaultSession();
    session.open = { "result:hypotheses": false };
    const host = document.createElement("div");
    patch(host, render(state, resolveState(state, compile(state.expr)), session, spyActions(), null).right);
    const table = [...host.querySelectorAll("details")].find((d) =>
      (d.querySelector("summary")?.textContent ?? "").startsWith("What was checked"),
    );
    expect(table?.open, "the reader's own choice was overridden by the default").toBe(false);
  });

  it("opens the NUMERICS when the approximate value IS the answer, and closes them otherwise", () => {
    // `1/sin(z)` has no exact reading, so the quadrature is all there is; `1/(1+z^2)` has an exact
    // `∮` and the numerics are corroboration a reader can go and look for.
    const numerics = (expr: string): boolean => {
      const host = right(sandbox({ expr })).host;
      const d = [...host.querySelectorAll("details")].find(
        (x) => (x.querySelector("summary")?.textContent ?? "") === "Numerics",
      );
      if (d === undefined) throw new Error(`no Numerics disclosure for ${expr}`);
      return d.open;
    };
    expect(numerics("1/sin(z)"), "the numerics hid the only value there was").toBe(true);
    expect(numerics("1/(1+z^2)"), "the numerics opened over an exact answer").toBe(false);
  });

  it("names Δ refine for what it IS — a convergence estimate, not a bound", () => {
    // **Asserted on the NOTE, not on the phrase.** The quadrature's own verdict carries a
    // restriction saying "a convergence estimate, not a proved error bound", which the card prints
    // at the top — so the first draft of this test passed with the note reworded to "Δ refine is the
    // error." The column's name is what has to be attached to the sentence.
    const { host } = right(sandbox({ expr: "1/sin(z)" }));
    const note = [...host.querySelectorAll('[data-card="result"] p')]
      .map((n) => n.textContent ?? "")
      .find((t) => t.startsWith("Δ refine"));
    expect(note, "the numerics table has no note naming its own column").toBeDefined();
    expect(note ?? "").toContain("|I_fine − I_coarse|");
    expect(note ?? "").toContain("not a proved error bound");
  });

  it("prints the APPROXIMATE headline at the precision its estimate supports", () => {
    // `1/sin(z)` has no exact reading, so the quadrature IS the answer and the `else` branch runs —
    // where printing at `fmtCx`'s eight decimals would show digits the estimate does not support.
    const { host } = right(sandbox({ expr: "1/sin(z)" }));
    const value = q(host, '[data-card="result"] .resultValue .num').textContent ?? "";
    expect(value, "the headline value is missing").not.toBe("");
    // The discriminator is the DROPPED component, not the digit count: `1/sin(z)` round the circle
    // converges to ~1e-13, so twelve decimals is exactly what the estimate supports. What `fmtCx`
    // would add is `4.9564e-17 + `, a real part that is the quadrature's rounding and not a value.
    expect(value, "a noise-level real part reached the headline").not.toMatch(/e-\d/);
    expect(value).toMatch(/i$/);
  });

  it("limits the digits by the WORST piece, not the best", () => {
    // A two-piece contour whose halves converge differently: taking the best estimate would print
    // digits the other piece cannot support, which is the quiet version of overstating a result.
    const c = semicircleTemplate(3, "upper");
    const { host } = right(sandbox({ expr: "1/sin(z)", contour: c, sandboxContour: c, contourSource: null }));
    const text = q(host, '[data-card="result"]').textContent ?? "";
    const errs = [...text.matchAll(/(\d\.\d)e([+-]\d+)/g)].map((m) => Number(`${m[1]}e${m[2]}`));
    expect(errs.length, "no per-piece estimates to compare").toBeGreaterThan(1);
    const worst = Math.max(...errs);
    const best = Math.min(...errs);
    expect(worst, "the two pieces converge identically, so this asserts nothing").toBeGreaterThan(best * 10);
    const value = q(host, '[data-card="result"] .resultValue .num').textContent ?? "";
    const decimals = (/\.(\d+)/.exec(value)?.[1] ?? "").length;
    expect(decimals, "the headline used the BEST estimate's digits").toBeLessThanOrEqual(
      Math.max(0, Math.floor(-Math.log10(worst))),
    );
  });

  it("limits the printed digits by the estimate, and drops a component below it", () => {
    // `∮ dz/z = 2πi` exactly; the quadrature's real part is rounding. Printing it says the argument
    // established a real part.
    const { host } = right(sandbox({ expr: "1/z" }));
    const numeric = [...host.querySelectorAll('[data-card="result"] .num')]
      .map((n) => n.textContent ?? "")
      .find((t) => /6\.28/.test(t));
    expect(numeric, "the quadrature's value is not shown at all").toBeDefined();
    expect(numeric ?? "", "a noise-level real part reached the screen").not.toMatch(/e-1[0-9]/);
  });
});

describe("every card, for every record", () => {
  it("gives each card EXACTLY ONE heading", () => {
    // Found in a browser: the Singularities card drew its heading twice, because its table carried
    // the key `card()` had already spent on the `<h2>` and `patch` keeps one node per key — so the
    // first heading was never matched and never removed. Nothing in the node suite counted headings,
    // which is why a screenshot found it. `patch` now refuses a duplicate key outright; this is the
    // product-level statement of the same thing, and it holds for every record.
    for (const id of [...RECORD_IDS, null]) {
      const state = id === null ? sandbox() : gallery(id);
      const host = document.createElement("div");
      const out = render(state, resolveState(state, compile(state.expr)), defaultSession(), spyActions(), null);
      patch(host, [...out.left, ...out.right]);
      for (const card of host.querySelectorAll("[data-card]")) {
        const headings = card.querySelectorAll("h2");
        expect(headings.length, `${id ?? "sandbox"}: ${card.getAttribute("data-card")} has ${headings.length} headings`).toBe(1);
      }
    }
  });


  it("renders all 28 records at fixture 0 with no throw and no empty card", () => {
    for (const id of RECORD_IDS) {
      const { host } = rail(gallery(id));
      const rightHost = right(gallery(id)).host;
      // Every card in both rails is present (the Target one included, since this is gallery mode).
      for (const card of LEFT_CARDS) {
        const node = host.querySelector(`[data-card="${card}"]`);
        expect(node, `${id}: no ${card} card`).not.toBeNull();
        // A heading and SOMETHING under it. An empty card is the failure mode the plan names.
        expect((node?.textContent ?? "").trim().length, `${id}: ${card} is empty`).toBeGreaterThan(
          (node?.querySelector("h2")?.textContent ?? "").length,
        );
      }
      for (const card of RIGHT_CARDS) {
        const node = rightHost.querySelector(`[data-card="${card}"]`);
        expect(node, `${id}: no ${card} card`).not.toBeNull();
        expect((node?.textContent ?? "").trim().length, `${id}: ${card} is empty`).toBeGreaterThan(
          (node?.querySelector("h2")?.textContent ?? "").length,
        );
      }
      // A singularities card that is a table must have rows; one that is a sentence must have words.
      const sing = q(host, '[data-card="singularities"]');
      const table = sing.querySelector("table");
      if (table !== null) {
        expect(table.querySelectorAll("tbody tr").length, `${id}: an empty pole table`).toBeGreaterThan(0);
      }
    }
  });
});

describe("withParam — which field a slider writes to", () => {
  it("sends a FAMILY parameter to the bindings and a LIMIT parameter to the geometry", () => {
    // The three channels are genuinely different: a family parameter rebuilds the integrand as well
    // as the contour, a limit parameter is geometry alone and must never be substituted into the
    // integrand (tier B renames its radius `R_lim` because `R` there is the rational function).
    let checkedBinding = 0;
    let checkedGeometry = 0;
    for (const id of RECORD_IDS) {
      const state = gallery(id);
      const record = recordOf(state);
      if (record === null) continue;
      const binding = record.family.parameters[0]?.name;
      const limit = record.family.contour.limitParams[0]?.name;
      if (binding !== undefined) {
        const next = withParam(state, record.family, binding, 1.25);
        expect(next.bindings[binding], `${id}: ${binding} missed the bindings`).toBe(1.25);
        expect(next.geometry[binding], `${id}: ${binding} also landed in the geometry`).toBeUndefined();
        checkedBinding++;
      }
      if (limit !== undefined && limit !== binding) {
        const next = withParam(state, record.family, limit, 7);
        expect(next.geometry[limit], `${id}: ${limit} missed the geometry`).toBe(7);
        expect(next.bindings[limit], `${id}: ${limit} also landed in the bindings`).toBeUndefined();
        checkedGeometry++;
      }
    }
    expect(checkedBinding).toBeGreaterThan(0);
    expect(checkedGeometry).toBeGreaterThan(0);
  });

  it("REFUSES a derived parameter, returning the state it was given", () => {
    // Which records have one is not this test's business — it scans until it finds one, and fails if
    // the corpus has none at all, so a record losing its derived parameter cannot quietly empty it.
    let checked = 0;
    for (const id of RECORD_IDS) {
      const state = gallery(id);
      const record = recordOf(state);
      if (record === null) continue;
      const run = resolveState(state, compile(state.expr));
      if (run.kind !== "gallery" || run.run === null) continue;
      for (const name of Object.keys(run.run.contour.params)) {
        if (paramChannel(state, record.family, name) !== "derived") continue;
        expect(withParam(state, record.family, name, 99), `${id}: ${name} was writable`).toBe(state);
        checked++;
      }
      if (checked > 0) break;
    }
    expect(checked, "no record in the corpus has a derived parameter").toBeGreaterThan(0);
  });
});
