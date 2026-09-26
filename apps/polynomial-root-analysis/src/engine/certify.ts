// Evidence → certificates (DESIGN §3). The ONLY module that imports @cas/rigor, so a label on screen
// has exactly one place it can have come from.
import { estimate, exact, refuse, type Certificate } from "@cas/rigor";
import type { DiscReport } from "./roots/discs.js";
import type { GroupReport, RootGroup } from "./roots/multiplicity.js";
import type { Analysis } from "./analysis/analyse.js";
import type { PseudozeroRegion } from "./analysis/pseudozero.js";
import {
  GALOIS,
  METHOD,
  aCycle,
  discClaim,
  multiplicityClaim,
  typeText,
  witnessText,
} from "./vocabulary.js";
import type { FactorEvidence, GaloisEvidence } from "./galois/tier0.js";
import type { LoopRun } from "./loops/run.js";
import type { Recognition } from "@cas/monodromy";

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

/** A loop's permutation: `=` when every segment was proved, a refusal by name otherwise. */
export function monodromyCert(run: LoopRun): Certificate {
  return run.ok
    ? exact(
        "the permutation of the roots",
        METHOD.tracker(run.evidence.steps, run.evidence.bisections),
      )
    : refuse("the permutation of the roots", run.reason);
}

/** The group the lassos generate — named only when a theorem or a full listing names it. */
export function monodromyGroupCert(
  r: Recognition,
  missing: string | null,
  n: number,
): Certificate {
  if (missing) return refuse("the group of the loops", missing);
  if (r.name === null)
    return r.order === null
      ? refuse(
          "the group of the loops",
          "it is too large to list and no theorem named it",
        )
      : exact(`a group of order ${r.order}`, METHOD.groupEnumerated(r.order));
  const method =
    r.how === "transpositions"
      ? METHOD.groupTranspositions
      : r.how === "jordan"
        ? METHOD.groupPrimitive
        : METHOD.groupEnumerated(r.order ?? 0);
  const sub = String(n)
    .split("")
    .map((d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)])
    .join("");
  return exact(
    `the ${r.name === "S" ? "symmetric" : "alternating"} group ${r.name}${sub}`,
    method,
  );
}

const SUB = "₀₁₂₃₄₅₆₇₈₉";
const sub = (n: number): string =>
  String(n)
    .split("")
    .map((d) => SUB[Number(d)])
    .join("");

function factorial(n: number): bigint {
  let f = 1n;
  for (let k = 2n; k <= BigInt(n); k++) f *= k;
  return f;
}

/** The factorisation over ℚ: irreducible, or the factors. */
export function factorisationCert(
  ev: Extract<GaloisEvidence, { ok: true }>,
): Certificate {
  return ev.irreducible
    ? exact("irreducible over ℚ", METHOD.irreducible)
    : exact(
        `factors over ℚ into ${ev.factors.reduce((a, f) => a + f.multiplicity, 0)} irreducible factors`,
        METHOD.factorExact,
      );
}

export interface GaloisCerts {
  /** "contains an element of type λ", one per cycle type seen, first prime first. */
  readonly types: readonly Certificate[];
  /** The hypotheses the theorem needs, each with its witness; absent ones are simply not listed. */
  readonly rows: readonly Certificate[];
  /** The group, or the refusal that names nothing. */
  readonly group: Certificate;
}

/** The certificates for one irreducible factor of degree n ≥ 2. */
export function galoisCerts(
  g: NonNullable<FactorEvidence["galois"]>,
  n: number,
  irreducible: boolean,
): GaloisCerts {
  const types = g.cycleTypes.map((w) =>
    exact(`contains an element of type ${typeText(w.type)}`, METHOD.modPrime(w.prime)),
  );
  const rows: Certificate[] = [
    exact(
      "moves any root to any other",
      irreducible ? METHOD.irreducible : "this factor is irreducible over ℚ",
    ),
  ];
  if (g.primitive) {
    const l = g.primitive.cycle;
    const why =
      l === n - 1 && !(l > 1 && 2 * l > n && isPrime(l))
        ? `one fewer than ${n}`
        : `${l} is a prime greater than ${n}/2`;
    rows.push(
      exact(
        `contains ${aCycle(l)} — ${why}, so no grouping of the roots survives it`,
        witnessText(g.primitive),
      ),
    );
  }
  if (g.transposition)
    rows.push(exact("contains a swap of two roots", witnessText(g.transposition)));
  if (g.threeCycle && !g.transposition)
    rows.push(exact("contains a 3-cycle", witnessText(g.threeCycle)));
  const disc = g.discriminant.replace(/^-/, "−");
  rows.push(
    exact(
      g.discSquare
        ? `the discriminant ${disc} is a square, so every element is an even permutation`
        : `the discriminant ${disc} is not a square`,
      METHOD.discSquare,
    ),
  );
  const provenance = rows.map((r) => ({ ok: true, text: `${r.claim} (${r.method})` }));
  let group: Certificate;
  if (g.verdict === "S")
    group = exact(
      `the symmetric group S${sub(n)}, of order ${factorial(n)}`,
      g.transposition ? METHOD.symmetric : METHOD.alternatingOdd,
      { provenance },
    );
  else if (g.verdict === "A")
    group = exact(
      `the alternating group A${sub(n)}, of order ${factorial(n) / 2n}`,
      METHOD.alternating,
      {
        provenance,
      },
    );
  else
    group = refuse("the Galois group", `${GALOIS.open}: ${GALOIS.openWhy}`, {
      provenance,
    });
  return { types, rows, group };
}

function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}
