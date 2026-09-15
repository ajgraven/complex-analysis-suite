// What each record says about itself, typeset — and checked against what it says in text.
//
// M8 step 0.4b. `families/latex.ts` prints the target, the contour integrand and the closed form by
// PARSING the record's own expression and running it through `@cas/expr`, so there is no second
// copy of any formula to drift. What the tests below check is the part that is this app's own: the
// Greek-letter convention, the bounds, and that KaTeX accepts every one of them.
import { describe, expect, it } from "vitest";
import katex from "katex";

import { FAMILIES } from "../src/families/index.js";
import { closedFormLatex, contourIntegrandLatex, targetLatex } from "../src/families/latex.js";
import { latexOf } from "../src/kernel/exprLatex.js";

const renders = (tex: string): string | null => {
  try {
    katex.renderToString(tex, { throwOnError: true, displayMode: true });
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};

/** Every printed form the module produces across the gallery. */
function everything(): { where: string; tex: string }[] {
  const out: { where: string; tex: string }[] = [];
  for (const family of FAMILIES) {
    for (const t of family.targets) {
      out.push({ where: `${family.id} · ${t.id}`, tex: targetLatex(t) });
      out.push({
        where: `${family.id} · ${t.id} at fixture`,
        tex: targetLatex(t, { at: family.golden[0]?.params }),
      });
    }
    out.push({ where: `${family.id} · contour integrand`, tex: contourIntegrandLatex(family) });
    family.golden.forEach((golden, k) => {
      const closed = closedFormLatex(family, golden);
      if (closed.atFixture !== null) {
        out.push({ where: `${family.id}[${k}] · value`, tex: closed.atFixture });
      }
      if (closed.general !== null) {
        out.push({ where: `${family.id}[${k}] · general`, tex: closed.general });
      }
    });
  }
  return out;
}

const ALL = everything();

describe("a record, typeset", () => {
  it("renders in KaTeX, everywhere in the gallery", () => {
    const refused = ALL.map((x) => {
      const why = renders(x.tex);
      return why === null ? null : `${x.where}: ${x.tex} — ${why}`;
    }).filter((x): x is string => x !== null);
    expect(refused).toEqual([]);
  });

  it("covers the whole gallery, so the sweep cannot pass by looking at nothing", () => {
    expect(new Set(ALL.map((x) => x.where.split(" · ")[0].replace(/\[\d+\]$/, ""))).size).toBe(28);
    expect(ALL.length).toBeGreaterThan(150);
  });

  it("shows a parameter named for a Greek letter AS one", () => {
    const mellin = FAMILIES.find((f) => f.id === "mellin-keyhole");
    expect(targetLatex(mellin?.targets[0] ?? ({} as never))).toBe(
      "\\int_{0}^{\\infty} \\frac{x^{\\alpha - 1}}{1 + x} \\,dx",
    );
    // And nowhere in the gallery does a Greek letter's NAME survive as italic letters — which is
    // the whole point of the convention and the thing a regex gets subtly wrong.
    const spelled = ALL.filter((x) =>
      /(?<![\\A-Za-z])(alpha|beta|delta|theta|lambda|mu|nu|xi|rho|sigma|tau|phi|psi|omega)(?![A-Za-z])/.test(
        x.tex,
      ),
    );
    expect(spelled.map((x) => `${x.where}: ${x.tex}`)).toEqual([]);
  });

  it("writes a sum under its sigma and an integral between its bounds", () => {
    const zeta = FAMILIES.find((f) => f.id === "series-cot-collision");
    expect(targetLatex(zeta?.targets[0] ?? ({} as never))).toBe(
      "\\sum_{n = 1}^{\\infty} \\frac{1}{n^{2}}",
    );
    const quartic = FAMILIES.find((f) => f.id === "semicircle-quartic");
    expect(targetLatex(quartic?.targets[0] ?? ({} as never))).toBe(
      "\\int_{-\\infty}^{\\infty} \\frac{1}{1 + x^{4}} \\,dx",
    );
  });

  it("substitutes a fixture's bindings, and leaves the symbols alone without them", () => {
    const fresnel = FAMILIES.find((f) => f.id === "wedge-fresnel");
    const target = fresnel?.targets[0] ?? ({} as never);
    expect(targetLatex(target)).toContain("x^{n}");
    expect(targetLatex(target, { at: { n: 2 } })).toContain("x^{2}");
    // A variant FLAG is not a binding and must not be substituted into the formula.
    expect(targetLatex(target, { at: { n: 3, halfRange: true } })).toContain("x^{3}");
  });

  it("returns null for a general form that is PROSE rather than a closed form", () => {
    // The two records that determine several unknowns at once state their general form as a
    // sentence — `T1 = -pi/4 and T0 = pi/4 for R = 1/(1+x^2)^2`. Printing that as mathematics would
    // be a claim the record does not make, so the module says it cannot.
    for (const id of ["log-squared-keyhole", "log-cubed-keyhole"]) {
      const family = FAMILIES.find((f) => f.id === id);
      expect(latexOf(family?.closedForm.simplified ?? ""), id).toBeNull();
      expect(closedFormLatex(family ?? ({} as never), family?.golden[0] ?? ({} as never)).general, id)
        .toBeNull();
    }
  });
});
