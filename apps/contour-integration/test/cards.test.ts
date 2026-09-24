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
import { addBranchPoint, moveBranchPoint, setOrder, setShadow } from "../src/engine/branchEdit.js";
import { LEFT_CARDS, RIGHT_CARDS, paramSymbol, roleLabel } from "../src/engine/vocabulary.js";
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
import { patch } from "@cas/ui";
import { mathSpoken } from "@cas/ui/math";
import { fmt } from "../src/kernel/decimal.js";
import { render } from "../src/shell/render.js";
import { defaultSession } from "../src/shell/session.js";
import type { ShellActions } from "../src/shell/cards/card.js";

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
    setStep: (step) => calls.push(`step:${step}`),
    playSweep: (a: { stepId: string }) => calls.push(`playSweep:${a.stepId}`),
    stopSweep: () => calls.push("stopSweep"),
    copyLink: () => calls.push("copyLink"),
    saveFigure: (t) => calls.push(`saveFigure:${t}`),
    copyFigure: () => calls.push("copyFigure"),
    setMode: (m) => calls.push(`mode:${m}`),
    setRail: (side, folded) => calls.push(`rail:${side}:${folded}`),
    toSandbox: () => calls.push("toSandbox"),
    setContrastsOpen: (open) => calls.push(`contrasts:${open}`),
    openContrast: (id: string) => calls.push(`contrast:${id}`),
    setPieceRole: (id: string, role: string, lemma?: string) => calls.push(`role:${id}:${role}:${lemma ?? "-"}`),
    renamePiece: (id: string, name: string) => calls.push(`rename:${id}:${name}`),
    deletePiece: (id: string) => calls.push(`delete:${id}`),
    insertPiece: (afterId: string, kind: string) => calls.push(`insert:${afterId}:${kind}`),
    movePiece: (id: string, by: number) => calls.push(`move:${id}:${by}`),
    reversePiece: (id: string) => calls.push(`reversePiece:${id}`),
    setRenaming: (id: string | null) => calls.push(`renaming:${id ?? "-"}`),
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
    expect(preview.getAttribute("data-tex") ?? "").toContain("\\frac");
    expect(preview.getAttribute("data-tex") ?? "").not.toBe("1/1+z");
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

  it("tags a limit parameter with the limit IT is taken to, and not with the other one", () => {
    // **The tag does not name its parameter, so the ROW is what says which limit belongs to which.**
    // D1 takes `R → ∞` and `eps → 0⁺` at once, and swapping the two labels — telling a reader that
    // the radius goes to zero and the lip to infinity — passed the whole suite before step 2.1's
    // sweep. The tag is typeset, so it is read through its accessible name.
    const { host } = rail(gallery("mellin-keyhole"));
    const tags = new Map<string, string>();
    for (const row of host.querySelectorAll('[data-card="parameters"] .paramRow2')) {
      // **`data-param`, not the row's text.** The readout is typeset since the 2026-09-20 review
      // (`R_lim` through `paramSymbol`), and KaTeX lays a formula down twice — HTML and MathML — so
      // `textContent` for `a` reads `aa`. The row's id is an attribute for exactly this reason.
      const name = row.getAttribute("data-param") ?? "";
      const tag = row.querySelector('.tag [role="math"]')?.getAttribute("data-tex");
      if (tag !== null && tag !== undefined) tags.set(name, tag);
    }
    expect([...tags.keys()].sort(), "D1's two limit parameters are not both tagged").toEqual(["R", "eps"]);
    expect(tags.get("R")).toBe("\\to \\infty");
    expect(tags.get("eps")).toBe("\\to 0^+");
  });

  it("prints each parameter by the SYMBOL the rest of the app prints, typeset and spoken", () => {
    // **`R_lim` and `sgnA` reached a reader** — the 2026-09-20 review. `vocabulary.ts`'s
    // `paramSymbol` exists to print `R`, with its reason written out: tier B renames its radius
    // `R_lim` so a record's limit parameter cannot collide with a template's `R`, an internal
    // disambiguation — and the derivation's limit step, on screen at the same moment, prints `R`.
    // Two names for one quantity at the one place the two are read together.
    const { host } = rail(gallery("jordan-cosine-kernel"));
    const row = q(host, '[data-card="parameters"] [data-param="R_lim"]');
    const tex = row.querySelector(".paramValue [data-tex]")?.getAttribute("data-tex") ?? "";
    expect(tex, "the readout is not typeset at all").not.toBe("");
    expect(tex).toBe(paramSymbol("R_lim"));
    expect(tex, "the internal disambiguation is on screen").not.toContain("lim");
    // And the slider is NAMED by the spoken form of the same symbol, not by the id either.
    const name = row.querySelector("input.slider")?.getAttribute("aria-label") ?? "";
    expect(name).toBe(`${mathSpoken(`$${paramSymbol("R_lim")}$`)}, currently ${fmt(4)}`);
    expect(name, "a macro reached the accessible name").not.toContain("\\");
    // The anti-vacuity clause: a parameter `paramSymbol` leaves alone still reads as itself, so the
    // assertions above are about the MAP rather than about the readout having been emptied.
    const plain = q(host, '[data-card="parameters"] [data-param="a"]');
    expect(plain.querySelector(".paramValue [data-tex]")?.getAttribute("data-tex")).toBe("a");
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
        const name = row.getAttribute("data-param") ?? "";
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

  it("says undecided where the winding was not decided, rather than 0", () => {
    // A pole ON the contour has no winding number, and `0` is a coefficient no predicate established
    // — printing it would put a term into `2πi Σ n·Res` that the geometry refused to supply.
    //
    // Read through the tag's accessible name rather than its `textContent`: since step 2.1 the tag
    // NAMES the quantity, `$\operatorname{Ind}_\gamma$ undecided`, and KaTeX lays every formula
    // down twice — so the raw text carries two copies of the symbol around the word.
    const { host } = rail(sandbox({ expr: "1/(z-1.5)" }));
    const cell = host.querySelector('[data-card="singularities"] tbody tr td:nth-child(4)');
    const ind = (cell?.querySelector('[role="math"]')?.getAttribute("data-tex") ?? "") +
      (cell?.querySelector('[role="math"]')?.nextSibling?.nodeValue ?? "");
    expect(ind.trim()).toBe("\\operatorname{Ind}_\\gamma undecided");
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

  it("shows a RECORD's own crossing monodromy, read from the system the stage draws", () => {
    // The 2026-09-20 review (REPORT §2.1): `state.branch` is the sandbox's system, so under a
    // tier-D record the "Crossing a cut" block was absent — and present under NO record at all.
    const { host } = rail(gallery("mellin-keyhole"));
    const card = q(host, '[data-card="cuts"]');
    expect(card.textContent ?? "").toContain("Crossing a cut");
    expect(card.querySelectorAll("ul.pieces2 li").length, "no monodromy row").toBeGreaterThan(0);
    // and a record with no branch says nothing about crossing one.
    const plain = q(rail(gallery("circle-linear-cos")).host, '[data-card="cuts"]');
    expect(plain.textContent ?? "").not.toContain("Crossing a cut");
  });

  it("names each branch point's controls by its LABEL, not by its internal id", () => {
    // **`order of branch point b1`** — the 2026-09-20 review, measured on the sandbox keyhole. `b1`
    // is the id M6.1's `SINGLE_POINT_ID` bug was about, and the row typesets the reader's name for
    // the point two lines above. The denylist's rendered half reads `aria-label`s but applies only
    // the WORD list to them, so a bare id passed.
    const { host } = rail(withPoint());
    const card = q(host, '[data-card="cuts"]');
    const point = withPoint().branch.points[0];
    expect(point.label, "the point carries no reader-facing label").not.toBe("");
    const spoken = mathSpoken(`$${point.label}$`);
    for (const prefix of ["order of branch point", "remove branch point"]) {
      const control = card.querySelector(`[aria-label^="${prefix}"]`);
      expect(control, `no '${prefix}' control`).not.toBeNull();
      expect(control?.getAttribute("aria-label")).toBe(`${prefix} ${spoken}`);
      expect(control?.getAttribute("aria-label"), "the internal id is announced").not.toContain(point.id);
    }
    // Anti-vacuity: the label and the id are genuinely different strings here, so the assertion
    // above is about which one was used.
    expect(spoken).not.toBe(point.id);
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
    expect(label(declared2), "the join is missing where it MEANS something").toContain("Join into one cut");
    expect(label(shadowed)).not.toContain("Join into one cut");
    expect(label(shadowed)).not.toContain("Split into rays");
    // And the mode says what a reader should do instead.
    expect(rail(shadowed).host.querySelector('[data-card="cuts"]')?.textContent ?? "").toContain(
      "switch it off to build one",
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

describe("the empty states", () => {
  it("INVITES an integrand where the box is empty, and diagnoses one where it is broken", () => {
    // **An empty box is not an error**, and it was told it was one: `compile` refuses an empty
    // string with `Empty expression`, which the parse rules turn into *there is no expression to
    // read* — true, and addressed to somebody who has just cleared the box on purpose.
    const said = (expr: string): string =>
      (q(rail(sandbox({ expr })).host, '[data-card="integrand"]').textContent ?? "").replace(/\s+/g, " ");
    expect(said("")).toContain("Type an integrand to begin");
    expect(said("   "), "whitespace is an empty box too").toContain("Type an integrand to begin");
    expect(said("1/(1+z"), "a broken expression got the invitation instead of the reason").toContain(
      "unbalanced parenthesis",
    );
    expect(said("1/(1+z")).not.toContain("Type an integrand to begin");
  });

  it("says a worked example could not be RUN, rather than that there is no integrand", () => {
    // The Result card is where a reader looks for an explanation, and for a record whose run failed
    // it said "There is no integrand." — false, and the reason was reachable only from the
    // Derivation card. Driven through a resolution rather than a record that happens to fail today,
    // so the test does not depend on the corpus having a broken entry.
    const state = gallery("circle-linear-cos");
    const base = resolveState(state, compile(state.expr));
    if (base.kind !== "gallery") throw new Error("not a gallery resolution");
    const host = document.createElement("div");
    patch(host, render(state, { ...base, run: null, solved: null, fatal: "its contour has no pieces" }, defaultSession(), spyActions(), null).right);
    const said = (q(host, '[data-card="result"]').textContent ?? "").replace(/\s+/g, " ");
    expect(said).toContain("could not be run");
    expect(said).toContain("its contour has no pieces");
    expect(said, "the old sentence is still there").not.toContain("There is no integrand");
  });

  it("says the DECLARATION was refused, rather than that there is no integrand", () => {
    // **The same defect as the one above, in the sandbox's declared route** — found in step 5.1's
    // browser pass, by grabbing the keyhole's branch point with the keyboard and moving it up. The
    // engine's refusals are exact and well-worded, and three cards already show them — Integrand,
    // Branch cuts, Derivation. The Result card, which is where a reader looks for an answer, showed
    // none of it and said "There is no integrand." with `1/(1+z)` still in the box.
    //
    // Asserted as EQUALITY against the resolution's own reason, over BOTH refusals the move can
    // reach: off the real axis is `declaredRun`'s and away from the origin along it is
    // `buildDeclaration`'s, and a card that printed a sentence of its own would satisfy "not the
    // false one" while still keeping the engine's words from the reader.
    const base = declared();
    for (const to of [[0, 1], [1, 0]] as const) {
      const moved = { ...base, branch: moveBranchPoint(base.branch, base.branch.points[0].id, to) };
      const res = resolveState(moved, compile(moved.expr));
      if (res.kind !== "declared-refused") throw new Error(`not refused at ${to.join(",")}`);
      const said = (q(right(moved).host, '[data-card="result"]').textContent ?? "").replace(/\s+/g, " ");
      expect(said, "the sentence that is false").not.toContain("There is no integrand");
      expect(said).toContain(res.reason.replace(/\s+/g, " "));
    }
    // The two reasons really are different, so the loop is two cases rather than one run twice.
    const reasonAt = (to: readonly [number, number]): string => {
      const r = resolveState(
        { ...base, branch: moveBranchPoint(base.branch, base.branch.points[0].id, to) },
        compile(base.expr),
      );
      return r.kind === "declared-refused" ? r.reason : "";
    };
    expect(reasonAt([0, 1])).not.toBe(reasonAt([1, 0]));
    // And the card is unchanged where the declaration is SOUND: a refusal is a third state, not a
    // relabelling of the empty one.
    const sound = (q(right(base).host, '[data-card="result"]').textContent ?? "");
    expect(sound).not.toContain("The declared factor was refused");
    expect(sound).not.toContain("There is no integrand");
    // (It says plenty ABOUT the branch point — its ledger refuses a circle round one. That is the
    // ledger's row, not this card's placeholder, which is why the check names the sentence.)
    expect(sound).toContain("Hypotheses");
  });

  it("TYPESETS the refusal, which the table below it was already doing", () => {
    // **The same sentence was on the card twice, spelled two ways** — M8 step 5.1's browser pass.
    // Every claim in `engine/claims.ts` is written in the `$…$` convention; the hypothesis table
    // renders it through `mathText` and the headline block printed it raw, so a reader met
    // `the $R \to \infty$ circle crosses the cut $\Gamma$` above the typeset copy of itself.
    //
    // Driven from a circle round a branch point, which is `legality.cut-crossed`: the refused claim
    // and its repair both carry math.
    const base = declared();
    const said = (q(right(base).host, '[data-card="result"]').textContent ?? "");
    expect(said, "the fixture must actually refuse").toContain("Refused");
    expect(said, "delimiters on screen").not.toContain("$");
    expect(said, "and the backslashes with them").not.toContain("\\operatorname");
    // Not vacuous: the claim this fixture refuses with really does carry math, and the KaTeX span
    // for it is inside the card.
    expect(q(right(base).host, '[data-card="result"] .katex')).toBeTruthy();
  });

  it("shows the REPAIR beside the refusal, which is the half a reader can act on", () => {
    // **The sweep's survivor.** `integralRefusal` returns a claim and a repair, and its own comment
    // says why — *"a refusal a reader cannot act on is half a message"* — but nothing asserted that
    // the second half reaches the card, so dropping the line entirely left every test green.
    const said = (q(right(declared()).host, '[data-card="result"]').textContent ?? "").replace(/\s+/g, " ");
    const REPAIR = "Exclude the branch point (a keyhole), or enclose the whole cut (a dogbone).";
    expect(said).toContain("Refused");
    // **By POSITION, because `toContain` cannot see this at all** — the first draft passed with the
    // line deleted. The failed hypothesis row carries the same repair further down the card, so the
    // sentence is on screen either way; what the deletion costs is the repair standing WITH the
    // refusal, above a table the reader has to open. The claim is therefore where it is.
    expect(said.indexOf(REPAIR)).toBeGreaterThan(said.indexOf("Refused"));
    expect(said.indexOf(REPAIR)).toBeLessThan(said.indexOf("What was checked"));
  });

  it("says WHY there is no target value, where the ledger is sound and the solve refused", () => {
    // **Pass 5 may refuse while the run itself is perfectly readable**, and `StateResolution.note`
    // has carried that sentence since step 1.1 with no reader: the card showed `∮` and left the
    // integral the example set out to determine unmentioned — the reader seeing a result card with
    // an answer on it and no way to learn that the answer is not the one they asked for.
    //
    // Found in the CORPUS rather than staged, so the branch is one a reader can reach: D3 at an
    // integer exponent is the record's own declared refusal — the two edges of the cut carry the
    // same phase, so they cancel and the contour says nothing about the target.
    const found = RECORD_IDS.flatMap((id) =>
      FAMILIES.find((f) => f.id === id)?.golden.map((_, i) => gallery(id, i)) ?? [],
    )
      .map((s) => ({ state: s, resolution: resolveState(s, compile(s.expr)) }))
      .find(({ resolution }) => resolution.kind === "gallery" && resolution.note !== null && resolution.run !== null);
    expect(found, "no record in the corpus refuses the solve with its run intact").toBeDefined();
    const { state, resolution } = found as NonNullable<typeof found>;
    const host = document.createElement("div");
    patch(host, render(state, resolution, defaultSession(), spyActions(), null).right);
    const said = (q(host, '[data-card="result"]').textContent ?? "").replace(/\s+/g, " ");
    expect(said).toContain("No value for the target");
    // The reason itself, not only the fact that there is one — and the ledger is still shown, which
    // is why the card cannot simply refuse: `∮` is sound here and the target is what is missing.
    expect(said).toContain("carries no information about the target");
    expect(q(host, '[data-card="result"]').querySelectorAll(".katex").length).toBeGreaterThan(0);
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

  it("leads with the identity — the target AND what it comes to", () => {
    // The record's own statement, which is what the front door's cards lead with too. It is not a
    // verdict: the right rail says whether the argument establishes it, and this line says what it
    // is. `= ` appears in the typeset form and in the spoken one, which are a pair.
    const { host } = rail(gallery("circle-linear-cos"));
    const line = q(host, '[data-card="target"] .targetLine .math');
    expect(line.getAttribute("aria-label") ?? "").toContain("= 2*pi/sqrt(3)");
    expect(line.textContent ?? "", "the typeset identity has no equals sign").toContain("=");
  });

  it("follows the SLIDER, and drops the record's answer once it is off the fixture", () => {
    // **The two rails were describing different functions** — the 2026-09-20 review. Both cards
    // rendered at `golden.params`, never merged with `state.bindings`, so A1 at `a = 5` answered
    // `= π√6/6` under a left rail headed *what is being integrated* still typesetting the `a = 2`
    // fixture. They render at the run's own bindings now, which is the merge `solveFamily` performs
    // and therefore the one the Result card's number came out of.
    const a1 = gallery("circle-linear-cos");
    const found = recordOf(a1);
    if (found === null) throw new Error("A1 is not in the corpus");
    const at5 = withParam(a1, found.family, "a", 5);
    const host = rail(at5).host;

    const integrand = q(host, '[data-card="integrand"] .math-display').getAttribute("data-tex") ?? "";
    expect(integrand, "the integrand is still at the fixture's binding").toContain("5");
    expect(integrand, "the fixture's own binding is still being typeset").not.toContain("{2 +");

    const line = q(host, '[data-card="target"] .targetLine .math').getAttribute("data-tex") ?? "";
    expect(line, "the target is still at the fixture's binding").toContain("5 + 1 \\cdot \\cos");

    // **And the right hand side is GONE, which measuring is what settled.** `golden.value` is the
    // record's answer AT ITS FIXTURE and is already a constant — A1's is `2*pi/sqrt(3)` — so
    // substituting the new binding into it changes nothing, and printing it beside the integral at
    // `a = 5` would be a false identity carrying the record's authority. The value is on the Result
    // card, where it is computed.
    expect(line, "the fixture's answer is still pinned to a different integral").not.toContain("=");
    const answer = q(right(at5).host, '[data-card="result"] .resultValue').textContent ?? "";
    expect(answer, "the Result card is not answering at the moved binding").toContain("6");
  });

  it("does NOT append the answer at a VARIANT fixture, where it belongs to another quantity", () => {
    // **`golden.value` belongs to the record's first target.** A5's variant is the half-range
    // corollary, worth `pi/4`, under a target written `\int_{-\infty}^{\infty}` — worth `pi/2`.
    // Appending the fixture's value there would print an identity that is simply false.
    const variantAt = (id: string): number =>
      (recordOf(gallery(id))?.family.golden ?? []).findIndex((g) => g.params.halfRange === true);
    const k = variantAt("semicircle-order2");
    expect(k, "A5 no longer carries its half-range variant").toBeGreaterThan(0);
    const plain = q(rail(gallery("semicircle-order2", 0)).host, '[data-card="target"] .targetLine .math');
    const variant = q(rail(gallery("semicircle-order2", k)).host, '[data-card="target"] .targetLine .math');
    expect(plain.getAttribute("aria-label") ?? "").toContain("= pi/2");
    expect(variant.getAttribute("aria-label") ?? "", "the variant's value is on the wrong integral").not.toContain("=");
  });

  it("says what the argument turns on — the record's own one line, under the contour", () => {
    // `description.point` is the second line of every front-door card and was on no rail card at
    // all: the Target card named the contour and then went straight to the citations, so the one
    // sentence saying why THIS contour was chosen was reachable only from the picker.
    for (const id of ["circle-linear-cos", "mellin-keyhole", "indented-sinc"]) {
      const record = recordOf(gallery(id));
      if (record === null) throw new Error(`no ${id}`);
      const said = (q(rail(gallery(id)).host, '[data-card="target"]').textContent ?? "").replace(/\s+/g, " ");
      const want = record.family.description.point.split("$")[0].trim().slice(0, 25);
      expect(want.length, `${id}: the point starts with a formula, so this asserts nothing`).toBeGreaterThan(8);
      expect(said, `${id}: the card does not say what the argument turns on`).toContain(want);
    }
  });

  it("folds away HOW THE VALUE WAS CHECKED, shut, carrying this fixture's own method", () => {
    // The capability the rebuild dropped: a value with no method is an assertion, and the shell
    // rendered the field nowhere for five milestones. Shut by default — it is not what a reader
    // needs first — and it is the METHOD of the fixture on screen, not of the record's first.
    const { host } = rail(gallery("circle-linear-cos", 1));
    const det = q<HTMLDetailsElement>(host, '[data-card="target"] details');
    expect(det.open, "the method disclosure opens itself").toBe(false);
    expect(q(det, "summary").textContent ?? "").toBe("How the value was checked");
    const said = (det.textContent ?? "").replace(/\s+/g, " ");
    expect(said, "not the fixture's own method").toContain("splits over");
    expect(said, "the record's first method, not this fixture's").not.toContain("reciprocal pair");
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
    // **Both halves of the pair.** `aria-label` is the spoken form and `data-tex` carries the TeX
    // the node was given, so this reads the typeset form too — measured by a mutant that dropped
    // the bindings from the LATEX alone and passed, leaving the picture in symbols and the
    // accessible name in numbers. The source is read off `data-tex` rather than out of KaTeX's
    // `<annotation>` because step 3.6 strips that element — Chrome was flattening it into the
    // accessible name of whatever contained it — and `data-tex` is where the source went.
    const node = q(host, '[data-card="target"] .targetLine .math');
    const tex = node.getAttribute("data-tex") ?? "";
    const shown = `${node.getAttribute("aria-label") ?? ""} ${tex}`;
    expect(tex, "no typeset source to read").not.toBe("");
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

  it("gives a record whose answer has NO printable form a decimal and a sentence, not silence", () => {
    // **`jordan-quartic`, 2 of the 92 (record, fixture) pairs that solve** — the 2026-09-20 review.
    // Pass 5 returns `solved.value = 1.5442760096181358` with `text` and `latex` both undefined, so
    // the solved block was skipped (it needs one of them) AND the note explaining the skip was
    // skipped too, because its guard asked `solved === null`. The record's own answer appeared
    // nowhere on the card and nothing said why.
    const state = gallery("jordan-quartic");
    const res = resolveState(state, compile(state.expr));
    expect(res.kind, "B3 no longer resolves").toBe("gallery");
    if (res.kind !== "gallery") return;
    expect(res.solved, "B3 no longer solves, so this asserts nothing").not.toBeNull();
    expect(res.solved?.text, "B3 grew a printable form; pick another record for this case").toBeUndefined();
    expect(res.solved?.latex).toBeUndefined();

    const card = q(right(state).host, '[data-card="result"]');
    // The number is there, badged `≈`, because a decimal is an estimate whatever the argument that
    // reached it was certified at.
    const decimal = [...card.querySelectorAll(".resultValue")].find((v) => /1\.544/.test(v.textContent ?? ""));
    expect(decimal, "the record's own answer is still missing from its card").toBeDefined();
    expect(decimal?.querySelector(".badge")?.getAttribute("data-level")).toBe("≈");
    // And the sentence, which is the half that makes it an answer rather than a stray number.
    expect(card.textContent ?? "").toContain("its closed form is not one this app can print");
  });

  it("prints the theorem's identity WHOLE, left hand side included", () => {
    // There was a `.replace("∮ f dz = ", "")` on this line that could never match: all three
    // identities are written in the `$…$` convention and begin `$\oint_\gamma f(z)\,dz = `, so the
    // literal occurs in none of them. Removed rather than implemented — the value above this line
    // carries no `∮` of its own, so a stripped left hand side would leave a right hand side with
    // nothing to be equal to. Pinned so the dead intent cannot be revived by accident.
    const { host } = right(sandbox({ expr: "1/(1+z^2)" }));
    const line = [...host.querySelectorAll('[data-card="result"] p.muted.small')].find((p) =>
      /from exact residues over/.test(p.textContent ?? ""),
    );
    expect(line, "the identity line is gone").toBeDefined();
    const tex = [...(line?.querySelectorAll("[data-tex]") ?? [])].map((n) => n.getAttribute("data-tex") ?? "");
    expect(tex.join(" "), "the identity's left hand side was stripped").toContain("\\oint_\\gamma f(z)\\,dz =");
    expect(line?.textContent ?? "").toContain("from exact residues over");
  });

  it("leads with the EXACT value and its own badge, not the ledger's meet", () => {
    const { host } = right(sandbox({ expr: "1/(1+z^2)" }));
    const value = q(host, '[data-card="result"] .resultValue');
    expect(value.querySelector(".katex"), "the value was not typeset").not.toBeNull();
    // `=` is the residue theorem's own level. The ledger's meet carries the weakest step's `≤`,
    // which is a true statement about that step and a false one about the answer.
    expect(value.querySelector(".badge")?.getAttribute("data-level")).toBe("=");
  });

  it("leads with the SANDBOX's own target value, where a record would lead with Pass 5's", () => {
    // M8 step 4.1. A sandbox contour with one `target` piece and every other piece certified
    // determines its target's integral by reading `∮ = Σ pieces` backwards — the app's first real
    // answer outside the gallery. The circle the sandbox boots on has no target piece, so this is
    // the semicircle, which is also the shape the plan names.
    const { host } = right(sandbox({ expr: "1/(1+z^2)", contour: semicircleTemplate(200) }));
    const values = [...host.querySelectorAll('[data-card="result"] .resultValue')];
    const named = host.textContent ?? "";
    expect(named).toContain("the integral over the target piece, in the limit");
    // It LEADS: the exact `∮` is the machinery and comes after.
    expect(values[0]?.querySelector(".katex")).not.toBeNull();
    expect(values[0]?.textContent ?? "").toContain("π");
    // **The badge is the ledger's meet**, not the residue theorem's own level — the answer rests on
    // the arc's `≤` bound as much as on the residues, so a `=` here would be the guardrail broken
    // at the one place a reader reads a number.
    expect(values[0]?.querySelector(".badge")?.getAttribute("data-level")).toBe("≤");
  });

  it("shows no target value where a piece is left free, and the card says so", () => {
    // The pairing: the same contour and integrand with the arc undisposed. Nothing is reported, and
    // the check list carries the reason — which is what stops the line above passing because the
    // card happens to print π somewhere.
    const base = semicircleTemplate(200);
    const freed = {
      ...base,
      pieces: base.pieces.map((p) => (p.id === "arc" ? { ...p, role: "free" as const } : p)),
    };
    const { host } = right(sandbox({ expr: "1/(1+z^2)", contour: freed }));
    expect(host.textContent ?? "").not.toContain("the integral over the target piece, in the limit");
    expect(host.textContent ?? "").toContain("neither bounded by a lemma nor carrying a known limit");
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

/**
 * States in which a record's own ledger REFUSES, one binding at a time.
 *
 * **Measured, not reasoned** — the 2026-09-20 review swept the sliders in a browser and found the
 * duplicate-key throw on these; each entry was then re-measured through `render` + `patch` here,
 * which is why C1's is `rho = 0` and C3's is `rho = 1` rather than the browser's `1e-6` (that value
 * closes on both, and the browser's slider was at a different stop). Seven of the 28 records — the
 * ones whose parameters can be moved onto a singularity or through a hypothesis — and every one of
 * them was a state in which the Result card threw.
 */
const REFUSING: readonly { readonly record: string; readonly param: string; readonly value: number }[] = [
  { record: "circle-linear-cos", param: "a", value: 0 },
  { record: "circle-linear-cos", param: "b", value: 32.9 },
  { record: "jordan-cosine-kernel", param: "b", value: 0 },
  { record: "indented-sinc", param: "rho", value: 0 },
  { record: "indented-sinc", param: "R", value: 0 },
  { record: "pv-sine-over-x-times-quadratic", param: "rho", value: 1 },
  { record: "mellin-keyhole", param: "eps", value: 1 },
  { record: "keyhole-two-poles", param: "p", value: -3.04 },
  { record: "keyhole-two-poles", param: "q", value: -3.04 },
  { record: "dogbone-inverse-sqrt", param: "a", value: 0 },
  { record: "dogbone-inverse-sqrt", param: "eta", value: 1 },
];

/** The same states as `ShellState`s, through the channel each parameter really belongs to. */
function refusingStates(): { readonly name: string; readonly state: ShellState }[] {
  return REFUSING.map(({ record, param, value }) => {
    const base = gallery(record);
    const found = recordOf(base);
    if (found === null) throw new Error(`${record} is not in the corpus`);
    return { name: `${record} at ${param} = ${value}`, state: withParam(base, found.family, param, value) };
  });
}

describe("a REFUSING gallery state, patched over a closing one", () => {
  // **The defect no node test could see, and the reason it could not** — the 2026-09-20 review.
  // `result.ts` gave the refusal's line and the solve note the same key `"why"`, and both are direct
  // children of the card's `<section>`, so `patch` threw `two children of <section> share the key
  // 'why'` out of `render2` and therefore out of `commit`. Measured consequences in a browser: the
  // headline updated while the two `=`-badged values stayed at the PREVIOUS binding, and the `#vs=`
  // hash was left at the old state because the throw precedes `syncHash`. The two corpus loops
  // below iterate fixture 0 with no bindings — every one of which closes — so nothing reached it.
  //
  // The instrument is `patch` over a host that already holds the closing render, because that is
  // what the app does and it is the only way the stale-value half is observable at all.
  for (const { name, state } of refusingStates()) {
    it(`does not throw, and shows no value: ${name}`, () => {
      const host = document.createElement("div");
      const before = gallery(state.record ?? "");
      const first = render(before, resolveState(before, compile(before.expr)), defaultSession(), spyActions(), null);
      patch(host, [...first.left, ...first.right]);
      const closing = q(host, '[data-card="result"]').textContent ?? "";
      expect(closing, "the previous binding did not close, so there is no stale value to leave").toContain(
        "The argument is complete.",
      );

      const res = resolveState(state, compile(state.expr));
      const out = render(state, res, defaultSession(), spyActions(), null);
      patch(host, [...out.left, ...out.right]);

      const card = q(host, '[data-card="result"]');
      // The headline MOVED: this is the anti-vacuity clause, since a card that failed to re-render
      // at all would satisfy every negative assertion below.
      expect(card.textContent ?? "", "the card did not re-render").not.toContain("The argument is complete.");
      // No value block of any kind — which is the whole of "no number, not a greyed-out number".
      // (`=` badges DO survive on the check list, and should: a row the argument certified exactly
      // is still certified exactly. What may not survive is a value.)
      expect(card.querySelector(".resultValue"), "a value survived the refusal").toBeNull();
      // The card LEADS with the refusal, which is the reading order the card's own doc sets out.
      expect(card.querySelector(".badge")?.textContent, "the first badge is not the refusal's").toBe("⚠");
      expect(card.textContent ?? "").toContain("Refused");
      // And the previous binding's number is not still on screen.
      expect(/π√6\/6|2π\/√3/.test(card.textContent ?? ""), "the previous binding's closed form is still there").toBe(
        false,
      );

      // **The Numerics disclosure is SHUT, and prints no total** — the same review's §1.7. Its
      // default was `refused !== null || …`, so the one state that prints no `∮` was the state that
      // opened the numbers and led with `≈ 6.283i`: the figure a reader takes away, three lines
      // under `⚠ Refused`.
      const numerics = [...card.querySelectorAll("details")].find(
        (d) => (d.querySelector("summary")?.textContent ?? "").includes("Numerics"),
      );
      expect(numerics, "there is no Numerics disclosure to judge").toBeDefined();
      expect(numerics?.hasAttribute("open"), "Numerics opened itself under a refusal").toBe(false);
      expect(
        [...(numerics?.querySelectorAll(".verdict") ?? [])].map((p) => p.textContent ?? ""),
        "a total was printed under a refusal",
      ).toEqual([]);
    });
  }

  it("reaches seven distinct records, so the table is not one case eleven times", () => {
    expect(new Set(REFUSING.map((r) => r.record)).size).toBe(7);
    expect(REFUSING).toHaveLength(11);
  });
});

describe("every card, for every record", () => {
  it("gives each card EXACTLY ONE heading", () => {
    // Found in a browser: the Singularities card drew its heading twice, because its table carried
    // the key `card()` had already spent on the `<h2>` and `patch` keeps one node per key — so the
    // first heading was never matched and never removed. Nothing in the node suite counted headings,
    // which is why a screenshot found it. `patch` now refuses a duplicate key outright; this is the
    // product-level statement of the same thing, and it holds for every record.
    // **The refusing states are in the loop too**, which is the half that was missing: these ran
    // fixture 0 with no bindings, i.e. only states where the argument closes, and the duplicate-key
    // throw needed a refusal AND a solve note at once. `patch` rather than `render` for the same
    // reason — the throw is `patch`'s.
    const states: { name: string; state: ShellState }[] = [
      ...[...RECORD_IDS, null].map((id) => ({ name: id ?? "sandbox", state: id === null ? sandbox() : gallery(id) })),
      ...refusingStates(),
    ];
    for (const { name, state } of states) {
      const host = document.createElement("div");
      const out = render(state, resolveState(state, compile(state.expr)), defaultSession(), spyActions(), null);
      patch(host, [...out.left, ...out.right]);
      for (const card of host.querySelectorAll("[data-card]")) {
        const headings = card.querySelectorAll("h2");
        expect(headings.length, `${name}: ${card.getAttribute("data-card")} has ${headings.length} headings`).toBe(1);
      }
    }
  });


  it("renders all 28 records at fixture 0 with no throw and no empty card", () => {
    // **And every refusing binding the sweep found**, under the same rule: a card with a heading
    // and nothing under it is the failure mode, and a refused state is exactly where a card is
    // most tempted to render nothing at all.
    for (const { name, state } of refusingStates()) {
      for (const [side, cards] of [["left", LEFT_CARDS], ["right", RIGHT_CARDS]] as const) {
        const host = railOf(state, side).host;
        for (const card of cards) {
          const node = host.querySelector(`[data-card="${card}"]`);
          expect(node, `${name}: no ${card} card`).not.toBeNull();
          expect((node?.textContent ?? "").trim().length, `${name}: ${card} is empty`).toBeGreaterThan(
            (node?.querySelector("h2")?.textContent ?? "").length,
          );
        }
      }
    }
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
