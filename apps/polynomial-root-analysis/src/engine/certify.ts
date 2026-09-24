// Evidence → certificates (DESIGN §3). The ONLY module that imports @cas/rigor, so a label on screen
// has exactly one place it can have come from.
import { estimate, exact, refuse, type Certificate } from "@cas/rigor";
import type { DiscReport } from "./roots/discs.js";
import type { GroupReport, RootGroup } from "./roots/multiplicity.js";
import type { Analysis } from "./analysis/analyse.js";
import type { PseudozeroRegion } from "./analysis/pseudozero.js";
import { METHOD, discClaim, multiplicityClaim } from "./vocabulary.js";

export function coordinateCert(): Certificate {
  return estimate("the root's coordinates", METHOD.coordinate);
}

/** One certificate per disc component: `exactly k roots here`, or the refusal that says why not. */
export function discCerts(report: DiscReport): Certificate[] {
  if (!report.ok) return [refuse("roots enclosed in discs", report.reason)];
  const seen = new Map<number, Certificate>();
  for (const d of report.discs) {
    if (!seen.has(d.component))
      seen.set(d.component, exact(discClaim(d.count), METHOD.discs));
  }
  return [...seen.values()];
}

export function groupCert(g: RootGroup): Certificate {
  const claim = multiplicityClaim(g.multiplicity, g.exact, g.distinct);
  return g.exact
    ? exact(
        claim,
        g.multiplicity === 1 && g.distinct === 1
          ? METHOD.discs
          : METHOD.multiplicityExact,
      )
    : estimate(claim, METHOD.cluster);
}

export function groupCerts(report: GroupReport): Certificate[] {
  return report.ok
    ? report.groups.map(groupCert)
    : [refuse("multiplicities", report.reason)];
}

export function kappaCert(): Certificate {
  return estimate("condition number", METHOD.kappa);
}

export function discriminantCert(a: Analysis): Certificate {
  return a.discriminant
    ? exact("the discriminant", METHOD.discriminantExact)
    : estimate("the discriminant", METHOD.discriminantApprox);
}

export function branchCert(a: Analysis): Certificate | null {
  if (!a.branch) return null;
  if (a.branch.route === "numeric")
    return estimate("the branch points", METHOD.branchNumeric);
  const allIsolated = a.branch.discs.every(
    (d) => d.ok && d.discs.every((x) => x.count === 1),
  );
  return allIsolated
    ? exact("each branch point in its disc", METHOD.branchExact)
    : estimate("the branch points", "their discs could not be separated");
}

export function hullCert(a: Analysis): Certificate | null {
  if (!a.critical) return null;
  return a.critical.inHull
    ? exact(
        "every plotted critical point is in the hull of the plotted roots",
        METHOD.hullCheck,
      )
    : refuse(
        "every plotted critical point is in the hull of the plotted roots",
        "a plotted critical point lies OUTSIDE it, so the plotted points are not accurate enough",
      );
}

export function regionCert(g: PseudozeroRegion): Certificate {
  return g.certified
    ? exact(
        `every polynomial within ε has exactly ${g.count} root${g.count === 1 ? "" : "s"} in this region`,
        METHOD.pseudozero,
      )
    : refuse("a count for this region", g.reason ?? "not shown");
}
