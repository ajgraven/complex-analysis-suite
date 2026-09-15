// **THE STRIP A RECORD DECLARES, RESOLVED AT ONE BINDING.**
//
// A tier-E family says `strip: { heightOverPi }` and nothing else about its singular set, because
// nothing else is needed: the integrand decides WHERE the lattices are (`kernel/expLattice.ts`) and
// the height decides which band of them the argument is about. This turns those two into the
// {@link PoleReport} the rest of the pipeline already knows how to read, plus the margin the theorem
// uses to check the declaration against the contour that was actually drawn.
//
// **The margin is one period on each side, and one is enough.** A contour that encloses a lattice
// point more than a period outside its declared strip has to enclose the ones in between as well —
// they lie on the same vertical line between it and the strip — so the nearest band catches every
// such mistake. Two periods would be a wider net over the same fish.
import { Frac } from "@cas/exact";
import type { Node } from "@cas/expr";
import { ExpSum, formatExpSum } from "../kernel/expSum.js";
import { asExponentialLattice, polesInBand, polesInStrip, type LatticePole } from "../kernel/expLattice.js";
import type { PoleReport } from "../kernel/poles.js";
import type { Certificate } from "@cas/rigor";
import { realRational } from "./branchFactor.js";

import type { Bindings, Family } from "./schema.js";

export type StripFactorResult =
  | {
      readonly ok: true;
      readonly poles: readonly LatticePole[];
      readonly margin: readonly LatticePole[];
      readonly certificate: Certificate;
      /** Shaped so `analyse` hands these poles to the quadrature and the ledger unchanged. */
      readonly report: PoleReport;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * The strip's poles at one binding, or a reason there are none to use.
 *
 * `ok: false` for a family with no `strip` at all is not an error — every record outside tier E is
 * in some other shape, and the caller reads the absence as "take one of the other routes".
 */
export function stripFactorOf(family: Family, bindings: Bindings, ast: Node): StripFactorResult {
  if (family.strip === undefined) return { ok: false, reason: "the family declares no strip" };

  const height = realRational(family.strip.heightOverPi, bindings, "the strip height");
  if (typeof height === "string") return { ok: false, reason: height };
  if (height.n <= 0n) return { ok: false, reason: "the strip height must be positive" };

  const form = asExponentialLattice(ast);
  if (form === null) {
    return {
      ok: false,
      reason:
        "the integrand does not read as e^{az}·N(e^z)/D(e^z), so the substitution w = e^z that makes " +
        "a strip argument work does not apply to it",
    };
  }

  const inside = polesInStrip(form, height);
  if (!inside.ok) return { ok: false, reason: inside.reason };

  // ONE PERIOD ON EACH SIDE. The lattice spacing is exactly one turn, so a contour enclosing a point
  // further out than that must also enclose one of these — they lie between it and the strip on the
  // same vertical line — which is why the nearest band catches every such mistake and a wider one
  // would be a bigger net over the same fish. Both bands are needed and neither is the other's
  // mirror: E2's strip is HALF a period, so its second lattice (`turns = 3/4`) sits outside the
  // declared band while still being inside the first period above it.
  const top = height.div(Frac.of(2n));
  const above = polesInBand(form, top, top.add(Frac.ONE));
  const below = polesInBand(form, Frac.of(-1n), Frac.ZERO);
  if (!above.ok) return { ok: false, reason: above.reason };
  if (!below.ok) return { ok: false, reason: below.reason };
  const margin = [...below.poles, ...above.poles];

  let total = ExpSum.ZERO;
  for (const p of inside.poles) total = total.add(p.residue);

  const report: PoleReport = {
    poles: inside.poles.map((p) => ({
      at: [p.at[0], p.at[1]],
      order: p.order,
      orderCertain: true,
      possiblyRemovable: false,
      residue: { value: p.residue.toTuple(), text: p.residueText, latex: p.residueLatex },
      isExact: true,
    })),
    // `f` is NOT a rational function of z — the substitution is what makes it one of `w` — and the
    // report says so, while still being exactly complete FOR THIS STRIP. The two are independent:
    // `rational` is about how `f` was read, `exactlyComplete` about whether the list can be summed.
    rational: false,
    exactlyComplete: true,
    exactResidueSum: { value: total.toTuple(), text: formatExpSum(total) },
    certificates: [inside.certificate],
  };

  return {
    ok: true,
    poles: inside.poles,
    margin,
    certificate: inside.certificate,
    report,
  };
}
