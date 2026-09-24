// @vitest-environment jsdom
//
// **Every NAME this app speaks, over the whole corpus** — M8 step 3.6.
//
// The app sets its mathematics with KaTeX, and there are a handful of places a fragment cannot go:
// an `aria-label`, an `srOnly` sentence, a PNG's text chunk. Those take the SOURCE instead, and for
// three milestones the source went out through `mathPlain`, which strips the `$` and nothing else —
// so the stepper announced *step 5 of 8 — Boundary terms · the R \to \infty semicircle*, with the
// backslashes read aloud, for the two steps of every record that has a limit.
//
// **The defect had been noticed and half fixed.** Step 3.1b saw the dollars, removed them, and
// recorded the whole thing as closed; what was left was invisible in the DOM — the attribute reads
// as ordinary text — and invisible to `axe`, whose question is whether a name EXISTS. It took
// reading the accessibility tree in a browser at the Phase 3 gate. M6.4 learned the same lesson
// twice and wrote it down: the accessibility tree is the instrument, not the DOM.
//
// So this file is the standing instrument for the half that IS decidable in node: a name that still
// carries a backslash after `mathSpoken` is a macro nobody mapped, and the failure names it. It
// deliberately does not police the FORMULAS — a certified bound has no honest short reading, which
// is why the stage's callout chips are `aria-hidden` instead.
import { describe, expect, it } from "vitest";

import { loadFamilies } from "../src/families/index.js";
import { argumentOf } from "../src/shell/argument.js";
import { DRILL_TASKS } from "../src/shell/drill.js";
import { defaultState, resolveState } from "../src/shell/state.js";
import { math, mathSpoken, mathText } from "@cas/ui/math";
import { patch } from "@cas/ui";
import { TEMPLATES } from "../src/shell/templates.js";

const ALL = [...loadFamilies().families.values()];

/** Every step title the stepper can turn into an accessible name, with the record it came from. */
function everyTitle(): { readonly where: string; readonly title: string }[] {
  const out: { where: string; title: string }[] = [];
  for (const family of ALL) {
    for (let i = 0; i < family.golden.length; i++) {
      const state = {
        ...defaultState(TEMPLATES[0].build()),
        mode: "gallery" as const,
        record: family.id,
        fixture: i,
      };
      for (const step of argumentOf({ state, resolution: resolveState(state, null), poles: null }).steps) {
        out.push({ where: `${family.id}#${i}`, title: step.title });
      }
    }
  }
  return out;
}

const TITLES = everyTitle();

describe("what the app SAYS, over all 28 records", () => {
  it("reaches every record at every fixture, so the sweeps below are about something", () => {
    // The count first, because the two sweeps are `filter`s and an `everyTitle` that returned one
    // entry would satisfy both perfectly — `denylist.test.ts`'s own guard against itself.
    expect(new Set(TITLES.map((t) => t.where.split("#")[0])).size).toBe(ALL.length);
    expect(TITLES.length).toBeGreaterThan(150);
  });

  it("leaves NO backslash in a spoken step title — an unmapped macro would be read aloud", () => {
    const bad = TITLES.filter((t) => mathSpoken(t.title).includes("\\")).map(
      (t) => `${t.where}: ${mathSpoken(t.title)}`,
    );
    expect(bad).toEqual([]);
  });

  it("leaves no `$` and no braces either", () => {
    const bad = TITLES.filter((t) => /[${}]/.test(mathSpoken(t.title))).map(
      (t) => `${t.where}: ${mathSpoken(t.title)}`,
    );
    expect(bad).toEqual([]);
  });

  it("does the reading a reader would do, on the titles that carry mathematics", () => {
    // **The anti-vacuity clause.** Everything above is satisfied by `mathSpoken = () => ""`. These
    // are the four shapes the corpus actually contains, spelled out — the arrow, the two limits at
    // the ends of a keyhole's lips, an operator name, and a Greek parameter.
    const spoken = TITLES.map((t) => mathSpoken(t.title));
    expect(spoken).toContain("Boundary terms · the R to infinity semicircle");
    expect(spoken).toContain("Boundary terms · the lower edge, arg z = 2pi from below");
    expect(spoken).toContain("Boundary terms · the line Im z = 2pi");
    expect(spoken).toContain("Boundary terms · the rho to 0 indentation over z = 0");
    expect(spoken).toContain("Let R to infinity");
  });

  it("carries the drill's four task names through unchanged, because they are already spoken", () => {
    // `labelText` is a twin written by hand (step 2.1's pattern), so this passes today by
    // construction — which is the claim: a twin that GREW a macro would start announcing it, and
    // this is where that would show up rather than in a browser three milestones later.
    for (const task of DRILL_TASKS) {
      expect(mathSpoken(task.labelText), task.id).toBe(task.labelText);
    }
  });
});

describe("what a typeset node puts in the accessibility tree", () => {
  // **Three changes were needed and each one alone changed NOTHING**, measured against Chrome's
  // accessibility tree at 1440 px: `mathText` passed the LaTeX as its span's `aria-label` (65 of
  // the 66 formulas on the landing page), and KaTeX's own `<annotation encoding="application/
  // x-tex">` held the same source inside the MathML, which the name computation flattens into
  // whatever is above it. Remove the label: identical. Remove the annotation: identical. Both:
  // identical, because `mathText` supplies a label explicitly. All three, and the tree reads zero
  // names carrying a backslash, from six.
  //
  // The tree itself is a browser instrument. What is checkable here is the three PRIMITIVES that
  // make it true, which is `figure.ts`'s lesson: a number is only evidence if nothing else could
  // have produced it, so assert the thing that was changed rather than a consequence with other
  // causes.
  const render = (sentence: string): HTMLElement => {
    const host = document.createElement("div");
    patch(host, [...mathText(sentence, "t")]);
    return host;
  };

  it("keeps no LaTeX source in the DOM where a name can be computed from it", () => {
    const host = render("the bound is $\\left|\\int g\\right| \\le 2$");
    expect(host.querySelectorAll("annotation")).toHaveLength(0);
    // Anti-vacuity: KaTeX really did run, and the MathML half it is meant to leave behind is there.
    expect(host.querySelectorAll(".katex").length).toBeGreaterThan(0);
    expect(host.querySelectorAll(".katex-mathml").length).toBeGreaterThan(0);
  });

  it("gives a `$…$` fragment NO accessible name, because it has no plain-text twin", () => {
    // The fallback was the source, which is the one thing worse than uneven MathML support: a
    // reader heard `\oint_\gamma f(z)\,dz = 2\pi i \sum_k …` character by character.
    const node = render("the bound is $\\le 2$").querySelector('[role="math"]');
    expect(node?.hasAttribute("aria-label")).toBe(false);
  });

  it("carries the source in `data-tex`, where a test can read it and a screen reader cannot", () => {
    // The `aria-label` had been doing two jobs and only the second one worked — a dozen tests
    // needed to know WHICH formula a node holds, and the accessible name was the only place that
    // said so. A `data-` attribute is not in the accessibility tree at all.
    const node = render("the bound is $\\le 2$").querySelector('[role="math"]');
    expect(node?.getAttribute("data-tex")).toBe("\\le 2");
  });

  it("KEEPS a name where the caller has a real one", () => {
    // `Value` carries `text` beside `latex` (step 0.4b), and that sentence is what a reader should
    // hear. The rule is "no name invented", not "no name".
    const host = document.createElement("div");
    patch(host, [math("\\frac{\\pi}{e}", { key: "v", label: "pi over e" })]);
    expect(host.querySelector('[role="math"]')?.getAttribute("aria-label")).toBe("pi over e");
  });
});

describe("mathSpoken, on the cases the corpus cannot reach", () => {
  it("reads a limit from above and from below, and leaves an EXPONENT alone", () => {
    // `2\pi^-` is a direction of approach and `z^{-1}` is an exponent; the same two characters, and
    // the rule that tells them apart is whether anything follows. Without the lookahead `z^{-1}`
    // would be read as *z from below1*, which is not a slip a reader could recover from.
    expect(mathSpoken("$0^+$")).toBe("0 from above");
    expect(mathSpoken("$2\\pi^-$")).toBe("2pi from below");
    expect(mathSpoken("$z^{-1}$")).toBe("z^{-1}");
  });

  it("unwraps an operator name and an upright multi-letter symbol", () => {
    expect(mathSpoken("$\\operatorname{Ind}_\\gamma$")).toBe("Ind_gamma");
    expect(mathSpoken("Let $\\mathrm{wedgeAngle} \\to 0$")).toBe("Let wedgeAngle to 0");
  });

  it("speaks the SANDBOX headline, the one sentence in the app that is a formula", () => {
    // **`figureCaption` is the second consumer of this map, and it found two gaps** — the
    // 2026-09-20 review. `HEADLINES.sandbox` reached the exported plate and `cas:verdict` raw,
    // because every one of the 28 records' headlines is prose and nothing else captioned it.
    // `\oint` had no entry, and `\,` is not a `\word` so the macro map could not see it at all.
    expect(mathSpoken("$\\oint_\\gamma f(z)\\,dz$ is established exactly.")).toBe(
      "∮_gamma f(z) dz is established exactly.",
    );
    // The subscript stays as it is, which is the shape `Ind_gamma` above already pins: a subscript
    // is not a macro, and inventing a reading for it would be this map doing LaTeX-to-speech.
    expect(mathSpoken("$a\\;b$")).toBe("a b");
  });

  it("leaves an UNMAPPED macro visible rather than dropping it", () => {
    // Which is what makes the corpus sweep above an instrument: a macro nobody mapped comes out as
    // a backslash and names itself, instead of vanishing into a name that reads almost right.
    expect(mathSpoken("$a \\oplus b$")).toBe("a \\oplus b");
  });
});
