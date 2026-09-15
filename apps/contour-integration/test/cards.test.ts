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

import { circleTemplate } from "../src/engine/contour/templates.js";
import { LEFT_CARDS } from "../src/engine/vocabulary.js";
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
  };
}

/** Draw the left rail for a state, and hand back the host plus the actions it will call. */
function rail(state: ShellState): { host: HTMLElement; actions: ReturnType<typeof spyActions> } {
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
  patch(host, render(state, resolution, defaultSession(), actions, poles).left);
  return { host, actions };
}

const sandbox = (over: Partial<ShellState> = {}): ShellState => ({
  ...defaultState(circleTemplate([0, 0], 1.5)),
  ...over,
});

const gallery = (record: string, fixture = 0): ShellState =>
  sandbox({ mode: "gallery", record, fixture });

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
    const declared = q<HTMLInputElement>(
      rail(
        sandbox({
          expr: "1/(1+z)",
          declaration: {
            pointId: "b1",
            window: [Frac.of(0n), Frac.of(2n)],
            sign: 1,
            constant: [1, 0],
            logPower: 1,
          },
        }),
      ).host,
      "input.expr",
    );
    expect(declared.getAttribute("aria-label")).toBe("cofactor R(z)");
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

describe("every card, for every record", () => {
  it("gives each card EXACTLY ONE heading", () => {
    // Found in a browser: the Singularities card drew its heading twice, because its table carried
    // the key `card()` had already spent on the `<h2>` and `patch` keeps one node per key — so the
    // first heading was never matched and never removed. Nothing in the node suite counted headings,
    // which is why a screenshot found it. `patch` now refuses a duplicate key outright; this is the
    // product-level statement of the same thing, and it holds for every record.
    for (const id of [...RECORD_IDS, null]) {
      const { host } = rail(id === null ? sandbox() : gallery(id));
      for (const card of host.querySelectorAll("[data-card]")) {
        const headings = card.querySelectorAll("h2");
        expect(headings.length, `${id ?? "sandbox"}: ${card.getAttribute("data-card")} has ${headings.length} headings`).toBe(1);
      }
    }
  });


  it("renders all 28 records at fixture 0 with no throw and no empty card", () => {
    for (const id of RECORD_IDS) {
      const { host } = rail(gallery(id));
      // Every left-rail card is present (the Target one included, since this is gallery mode).
      for (const card of LEFT_CARDS) {
        const node = host.querySelector(`[data-card="${card}"]`);
        expect(node, `${id}: no ${card} card`).not.toBeNull();
        // A heading and SOMETHING under it. An empty card is the failure mode the plan names.
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
