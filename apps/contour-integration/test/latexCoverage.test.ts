// Every mathematical string the gallery DISPLAYS can be typeset.
//
// M8 step 0.4. Phase 1 renders the app in KaTeX, so a record whose closed form cannot be parsed
// cannot be shown — and the failure mode is not a blank space but a fallback to raw source in the
// middle of a typeset page, which reads as a bug in the mathematics rather than in the printer.
//
// Two checks per string, because they fail differently. `@cas/expr`'s `toLatex` says whether the
// APP can read it; KaTeX's `renderToString` with `throwOnError` says whether the RENDERER can — and
// the second is not implied by the first, since `toLatex` will happily emit `\operatorname{…}` for a
// function nobody has ever heard of.
//
// **`closedForm.expr` is deliberately not here.** M8 step 0.1 measured it: it is the DERIVATION —
// `2*pi*i*Sum(Res(P(z)/Q(z), z_k), im(z_k) > 0)` — a statement of the method in the gallery's own
// notation, and 26 of the 28 do not parse as expressions at all. What a reader is shown is
// `Golden.value` (the closed form at this fixture) and `closedForm.simplified` (the general one),
// which are both here.
import { describe, expect, it } from "vitest";
import katex from "katex";
import { parse, toLatex } from "@cas/expr";

import { FAMILIES } from "../src/families/index.js";
import type { BranchFactor } from "../src/families/schema.js";
import { PRESETS } from "../src/shell/presets.js";

/**
 * The two `simplified` fields that are PROSE rather than an expression, declared rather than
 * skipped.
 *
 * D4 and D5 determine several unknowns at once, and their general form is a sentence about which —
 * `T1 = -pi/4 and T0 = pi/4 for R = 1/(1+x^2)^2`. That is a true statement and not a closed form, so
 * no printer can typeset it as one. Listing them here means a THIRD record that quietly becomes
 * prose fails this test, where an exemption by regex would absorb it.
 */
const PROSE_SIMPLIFIED: readonly string[] = ["log-squared-keyhole", "log-cubed-keyhole"];

/** A branch factor's exponent, whichever kind it is. */
function exponentOf(order: BranchFactor["order"]): string {
  return order.kind === "power" ? order.alpha : String(order.power);
}

/** Every expression the app shows a reader, with where it came from. */
function displayed(): { readonly where: string; readonly src: string }[] {
  const out: { where: string; src: string }[] = [];
  for (const family of FAMILIES) {
    for (const target of family.targets) {
      if (target.integrand !== undefined) {
        out.push({ where: `${family.id} · target ${target.id} integrand`, src: target.integrand });
      }
      if (target.summand !== undefined) {
        out.push({ where: `${family.id} · target ${target.id} summand`, src: target.summand });
      }
      out.push({ where: `${family.id} · target ${target.id} lower`, src: target.lower });
      out.push({ where: `${family.id} · target ${target.id} upper`, src: target.upper });
    }
    if (family.auxiliary !== undefined) {
      out.push({ where: `${family.id} · auxiliary integrand`, src: family.auxiliary.integrand });
    }
    const { simplified } = family.closedForm;
    if (simplified !== undefined && !PROSE_SIMPLIFIED.includes(family.id)) {
      out.push({ where: `${family.id} · closedForm.simplified`, src: simplified });
    }
    family.golden.forEach((golden, k) => {
      out.push({ where: `${family.id} · golden[${k}].value`, src: golden.value });
    });
    // The singularities themselves — `i*abs(b)`, `exp(i*pi/n)` — which the pole list shows and the
    // stage labels.
    for (const w of family.contour.windings) {
      out.push({ where: `${family.id} · pole ${w.pole}`, src: w.pole });
    }
    for (const factor of family.branch?.factors ?? []) {
      out.push({ where: `${family.id} · branch point ${factor.at}`, src: factor.at });
      out.push({ where: `${family.id} · exponent at ${factor.at}`, src: exponentOf(factor.order) });
    }
    if (family.branch !== undefined) {
      out.push({ where: `${family.id} · rational part`, src: family.branch.rationalPart });
      if (family.branch.constant !== undefined) {
        out.push({ where: `${family.id} · branch constant`, src: family.branch.constant });
      }
    }
  }
  for (const preset of PRESETS) out.push({ where: `preset ${preset.label}`, src: preset.src });
  return out;
}

/** What went wrong, or `null`. */
function typesetFailure(src: string): string | null {
  let tex: string;
  try {
    tex = toLatex(parse(src));
  } catch (e) {
    return `does not read: ${(e as Error).message}`;
  }
  // `toLatex` returns `undefined` inside the string for a constant outside its table rather than
  // throwing, which is the one failure a `try` would not catch.
  if (tex.includes("undefined")) return `prints as ${tex}`;
  try {
    katex.renderToString(tex, { throwOnError: true, displayMode: true });
  } catch (e) {
    return `KaTeX refuses ${tex}: ${(e as Error).message}`;
  }
  return null;
}

describe("everything the gallery displays", () => {
  it("parses, prints as LaTeX, and renders in KaTeX", () => {
    const failures = displayed()
      .map(({ where, src }) => {
        const why = typesetFailure(src);
        return why === null ? null : `${where}\n     ${src}\n     ${why}`;
      })
      .filter((x): x is string => x !== null);
    expect(failures).toEqual([]);
  });

  it("covers every record, so the sweep cannot pass by looking at nothing", () => {
    const rows = displayed();
    expect(new Set(rows.map((r) => r.where.split(" · ")[0])).size).toBe(28 + PRESETS.length);
    expect(rows.length).toBeGreaterThan(200);
  });

  it("reads the two general forms that are prose, and says so", () => {
    // The declaration above is only worth anything if it is CHECKED: a record listed there whose
    // `simplified` is in fact an expression would silently stop being typeset.
    for (const id of PROSE_SIMPLIFIED) {
      const family = FAMILIES.find((f) => f.id === id);
      expect(family?.closedForm.simplified, id).toBeDefined();
      expect(typesetFailure(family?.closedForm.simplified ?? ""), id).not.toBeNull();
    }
  });

  it("typesets the geometry expressions a record computes its contour from", () => {
    // Not displayed today, and that is the point of checking them now: a `derived` parameter is
    // `theta1 = pi*sgnA` and an `orientation` is `sgn(a) > 0 ? 1 : -1` — definitions a reader of a
    // parameterised contour wants to see, and the first thing Phase 1 will reach for when a slider
    // needs a caption. Cheap here, and a gap found now is a gap that never reaches a page.
    const failures: string[] = [];
    let seen = 0;
    for (const family of FAMILIES) {
      for (const d of family.contour.derived ?? []) {
        seen += 1;
        const why = typesetFailure(d.expr);
        if (why !== null) failures.push(`${family.id} · derived ${d.name}: ${d.expr} — ${why}`);
      }
      const orientation = family.contour.orientation;
      if (typeof orientation !== "string") {
        seen += 1;
        const why = typesetFailure(orientation.expr);
        if (why !== null) failures.push(`${family.id} · orientation: ${orientation.expr} — ${why}`);
      }
      for (const w of family.contour.windings) {
        seen += 1;
        const why = typesetFailure(w.n);
        if (why !== null) failures.push(`${family.id} · winding about ${w.pole}: ${w.n} — ${why}`);
      }
    }
    expect(failures).toEqual([]);
    // Not vacuous: B1's orientation and every record's windings are here, and the count says so.
    expect(seen).toBeGreaterThan(30);
  });
});
