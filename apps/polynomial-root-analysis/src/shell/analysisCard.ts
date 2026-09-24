// The Analysis card (right rail): the discriminant, the critical points against Gauss–Lucas, the
// branch points of the selected coefficient, and the pseudozero regions — each row a certificate.
import type { Frac, Gauss, QiPoly } from "@cas/exact";
import { h, type Child, type Desc } from "@cas/ui";
import { math } from "@cas/ui/math";
import type { Analysis } from "../engine/analysis/analyse.js";
import { branchCert, discriminantCert, hullCert, regionCert } from "../engine/certify.js";
import type { Polynomial } from "../engine/polynomial.js";
import { ANALYSIS, CARD } from "../engine/vocabulary.js";
import { subscript } from "../ui/ink.js";
import { formatCx } from "./format.js";
import { level } from "./rails.js";

const DIGITS_SHOWN = 24;

function fracLatex(f: Frac): string {
  const n = f.n < 0n ? -f.n : f.n;
  const body = f.d === 1n ? `${n}` : `\\tfrac{${n}}{${f.d}}`;
  return f.n < 0n ? `-${body}` : body;
}

/** An exact value in LaTeX; an integer too long to read is shown by its size, still exact. */
export function gaussLatex(g: Gauss): { latex: string; plain: string } {
  const re = g.re;
  const long = (f: Frac): boolean =>
    f.n.toString().length + f.d.toString().length > DIGITS_SHOWN;
  if (g.im.isZero()) {
    if (long(re)) {
      const digits =
        (re.n < 0n ? -re.n : re.n).toString().length - (re.d.toString().length - 1);
      const sign = re.n < 0n ? "negative, " : "";
      return {
        latex: `\\approx ${re.toNumber().toExponential(6).replace("e", "\\times 10^{").replace("+", "")}}`,
        plain: `about ${re.toNumber().toExponential(6)} — exactly known, ${sign}${digits} digits`,
      };
    }
    return {
      latex: fracLatex(re),
      plain: fracLatex(re).replace(/\\tfrac\{(\d+)\}\{(\d+)\}/, "$1/$2"),
    };
  }
  const im = g.im;
  const imAbs = im.n < 0n ? im.neg() : im;
  const imL = fracLatex(imAbs) === "1" ? "" : fracLatex(imAbs);
  const latex = `${re.isZero() ? "" : fracLatex(re)}${im.n < 0n ? "-" : re.isZero() ? "" : "+"}${imL}i`;
  return { latex, plain: latex.replace(/\\tfrac\{(\d+)\}\{(\d+)\}/g, "$1/$2") };
}

/** disc as a polynomial in aⱼ, when short enough to read. */
function polyLatex(p: QiPoly, j: number): string | null {
  const v = `a_{${j}}`;
  const terms: string[] = [];
  for (let k = p.degree(); k >= 0; k--) {
    const c = p.coeff(k);
    if (c.isZero()) continue;
    if (!c.im.isZero()) return null;
    const f = c.re;
    if (f.n.toString().length + f.d.toString().length > 14) return null;
    const mag = fracLatex(f.n < 0n ? f.neg() : f);
    const coef = mag === "1" && k > 0 ? "" : mag;
    const mono = k === 0 ? "" : k === 1 ? v : `${v}^{${k}}`;
    terms.push(`${f.n < 0n ? "-" : terms.length ? "+" : ""}${coef}${mono}`);
  }
  return terms.length && terms.length <= 8 ? terms.join(" ") : null;
}

export interface AnalysisModel {
  readonly poly: Polynomial | null;
  readonly analysis: Analysis | null;
  readonly coefficient: number | null;
  readonly critical: boolean;
  readonly pseudozero: number | null;
}

export function epsLatex(log10eps: number): { latex: string; plain: string } {
  if (Math.abs(log10eps - Math.log10(2 ** -53)) < 1e-9)
    return { latex: "2^{-53}", plain: "2 to the −53 (rounding level)" };
  const r = Math.round(log10eps * 100) / 100;
  return { latex: `10^{${r}}`, plain: `10 to the ${r}` };
}

function card(...body: Child[]): Desc {
  return h(
    "section",
    { key: "analysis", class: "card", "aria-labelledby": "card-analysis" },
    h("h2", { key: "t", id: "card-analysis" }, CARD.analysis),
    ...body,
  );
}

export function analysisCard(m: AnalysisModel): Desc | null {
  const p = m.poly;
  const a = m.analysis;
  if (!p || !a) return null;
  const rows: Child[] = [];

  // The discriminant.
  const dc = discriminantCert(a);
  const value = a.discriminant ? gaussLatex(a.discriminant) : null;
  rows.push(
    h(
      "p",
      { key: "disc", class: "claim" },
      level(dc, "lv"),
      value
        ? math(`\\Delta = ${value.latex}`, {
            key: "m",
            label: `discriminant ${value.plain}`,
          })
        : h("span", { key: "v" }, `Δ ≈ ${formatCx(a.discriminantApprox, 6)}`),
    ),
  );

  // Critical points and Gauss–Lucas.
  if (m.critical && a.critical) {
    const hc = hullCert(a);
    rows.push(
      h(
        "p",
        { key: "crit", class: "claim" },
        hc ? level(hc, "lv") : null,
        `${a.critical.points.length} critical point${a.critical.points.length === 1 ? "" : "s"}, ${
          a.critical.inHull
            ? "all inside the convex hull of the roots"
            : "one OUTSIDE the convex hull of the roots"
        }.`,
      ),
      h("p", { key: "critWhy", class: "legend" }, ANALYSIS.critical),
    );
  }

  // Branch points of aⱼ.
  if (m.coefficient !== null && a.branch) {
    const j = m.coefficient;
    const bc = branchCert(a);
    const exactPoly = a.branch.route === "exact" ? polyLatex(a.branch.poly, j) : null;
    const pts = a.branch.points;
    rows.push(
      h(
        "div",
        { key: "branch", class: "branch" },
        h(
          "p",
          { key: "head", class: "claim" },
          bc ? level(bc, "lv") : null,
          `${pts.length} branch point${pts.length === 1 ? "" : "s"} of a${subscript(j)}`,
          a.branch.route === "exact" && a.branch.multiplicity.some((x) => x > 1)
            ? " (at some, two collisions at once)"
            : "",
          ".",
        ),
        exactPoly
          ? h(
              "p",
              { key: "poly", class: "formula" },
              math(`\\Delta(a_{${j}}) = ${exactPoly}`, {
                key: "m",
                label: `the discriminant as a polynomial in a${j}`,
                display: false,
              }),
            )
          : null,
        pts.length
          ? h(
              "ul",
              {
                key: "list",
                class: "branch-list",
                "aria-label": `Branch points of a${j}`,
              },
              ...pts.map((z, i) => h("li", { key: `b${i}` }, `≈ ${formatCx(z, 6)}`)),
            )
          : null,
        h("p", { key: "why", class: "legend" }, ANALYSIS.branch(j)),
      ),
    );
  }

  // The pseudozero regions.
  if (m.pseudozero !== null) {
    const eps = epsLatex(m.pseudozero);
    const pz = a.pseudozero;
    rows.push(
      h(
        "div",
        { key: "pz", class: "pz" },
        h(
          "p",
          { key: "eps", class: "claim" },
          "Pseudozero set at ",
          math(`\\varepsilon = ${eps.latex}`, {
            key: "m",
            label: `epsilon ${eps.plain}`,
          }),
        ),
        pz
          ? h(
              "ul",
              { key: "regions", class: "regions" },
              ...pz.regions.map((g, i) => {
                const c = regionCert(g);
                return h(
                  "li",
                  { key: `g${i}` },
                  level(c, "lv"),
                  g.certified ? c.claim : `no count: ${g.reason}.`,
                );
              }),
            )
          : h(
              "p",
              { key: "stale", class: "legend" },
              "Certified when the drag is released.",
            ),
        h("p", { key: "why", class: "legend" }, ANALYSIS.pseudozero),
      ),
    );
  }
  return card(...rows);
}
