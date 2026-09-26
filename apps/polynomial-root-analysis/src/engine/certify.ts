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
import type { Identification } from "./galois/identify.js";
import type { DescentStep } from "./galois/descent.js";
import type { CorrespondenceNode, Overgroup } from "./galois/correspondence.js";
import { groupByLabel } from "./galois/tables.js";
import { formatCycles, groupElements, type Perm } from "@cas/monodromy";
import type { LoopRun } from "./loops/run.js";
import type { Recognition } from "@cas/monodromy";
import type { FamilyReading } from "./family/family.js";
import type { Arithmetic, Relation } from "./family/bridge.js";
import type { LadderRun } from "./ladder/run.js";
import type { RadicalOutcome } from "./formula/evaluate.js";

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
  const id = g.identification;
  const label = id.tier === 1 ? ` (${id.label})` : "";
  let group: Certificate;
  if (g.verdict === "S")
    group = exact(
      `the symmetric group S${sub(n)}${label}, of order ${factorial(n)}`,
      g.transposition ? METHOD.symmetric : METHOD.alternatingOdd,
      { provenance },
    );
  else if (g.verdict === "A")
    group = exact(
      `the alternating group A${sub(n)}${label}, of order ${factorial(n) / 2n}`,
      METHOD.alternating,
      { provenance },
    );
  else if (id.tier === 1)
    group = exact(`${id.name} (${id.label}), of order ${id.order}`, METHOD.descent, {
      provenance: id.steps.map((st) => ({ ok: true, text: stepText(st) })),
    });
  else if (id.tier === 2 && id.candidates.length > 0) {
    const top = id.candidates[0];
    group = estimate(
      `probably ${top.name} (${top.label}), of order ${top.order}`,
      METHOD.statistics(id.primesUsed),
      {
        ...(top.indistinguishableFrom.length
          ? {
              restriction: GALOIS.indistinguishable(top.label, top.indistinguishableFrom),
            }
          : {}),
      },
    );
  } else
    group = refuse(
      "the Galois group",
      `${GALOIS.open}: ${id.tier === 0 && id.reason !== "" ? id.reason : GALOIS.openWhy}`,
      { provenance },
    );
  return { types, rows, group };
}

const ORDINAL = ["", "first", "second", "third", "fourth"];

/** One step of the descent, as a sentence. */
export function stepText(st: DescentStep): string {
  const K = groupByLabel(st.to);
  const name = `${K.name} (${K.label})`;
  if (st.via === "discriminant")
    return st.outcome === "descend"
      ? `inside ${name}: the discriminant is a square`
      : `not inside ${name}: the discriminant is not a square`;
  const which = st.classOf
    ? ` of the ${ORDINAL[st.classOf.k]} of its ${st.classOf.of} kinds`
    : "";
  return st.outcome === "descend"
    ? `inside a copy of ${name}${which}: the resolvent of degree ${st.index} has the simple integer root ${st.root?.replace(/^-/, "−")}`
    : `inside no copy of ${name}${which}: the resolvent of degree ${st.index} has no integer root`;
}

export interface IdentityCerts {
  /** Solvable by radicals or not — at the group's own level. */
  readonly solvable: Certificate | null;
  /** The descent, step by step (Tier 1 by descent only). */
  readonly steps: readonly Certificate[];
  /** Generators on the numbered roots (Tier 1 only), each with its certificate. */
  readonly generators: readonly { readonly perm: Perm; readonly cert: Certificate }[];
  /** Tier 2: every candidate still consistent, ranked. */
  readonly candidates: readonly Certificate[];
}

/** The identification's own rows: solvability, the descent, the labelled generators, the candidates. */
export function identityCerts(
  id: Identification,
  labels: readonly number[] | null,
): IdentityCerts {
  if (id.tier === 0) return { solvable: null, steps: [], generators: [], candidates: [] };
  if (id.tier === 2) {
    const top = id.candidates[0];
    return {
      solvable: top
        ? estimate(
            top.solvable ? GALOIS.solvable : GALOIS.notSolvable,
            METHOD.solvableTable,
          )
        : null,
      steps: [],
      generators: [],
      candidates: id.candidates.map((c) =>
        estimate(
          `${c.name} (${c.label}), of order ${c.order}`,
          `distance ${c.score.toFixed(1)} from the counts seen${
            c.indistinguishableFrom.length
              ? `; ${GALOIS.indistinguishable(c.label, c.indistinguishableFrom)}`
              : ""
          }`,
        ),
      ),
    };
  }
  const steps = id.steps.map((st) =>
    exact(
      stepText(st),
      st.via === "discriminant"
        ? METHOD.discSquare
        : METHOD.resolvent(
            st.bits,
            st.transform.length === 2 && st.transform[0] === 0 && st.transform[1] === 1,
          ),
    ),
  );
  const how =
    id.by === "theorem"
      ? METHOD.generatorsTheorem
      : id.witness
        ? METHOD.generatorsFix(id.witness.root.replace(/^-/, "−"))
        : METHOD.generatorsDescent;
  return {
    solvable: exact(
      id.solvable ? GALOIS.solvable : GALOIS.notSolvable,
      METHOD.solvableTable,
    ),
    steps,
    generators: id.generators.map((g) => ({
      perm: [...g],
      cert: exact(permText(g, labels), how),
    })),
    candidates: [],
  };
}

/** A permutation of the roots in cycle notation on the reader's labels: (r₁ r₃ r₂). */
export function permText(g: readonly number[], labels: readonly number[] | null): string {
  const text = formatCycles([...g], 0);
  if (text === "()") return "the identity";
  return text.replace(
    /\d+/g,
    (d) => `r${sub(labels ? labels[Number(d)] : Number(d) + 1)}`,
  );
}

function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

/** A subgroup's fixed field: ℚ at the top (an integer), else the field polynomial, else why not. */
export function latticeNodeCert(node: CorrespondenceNode): Certificate {
  if (node.integer !== null)
    return exact(
      `the fixed field is ℚ: the invariant is the integer ${node.integer.replace(/^-/, "−")}`,
      METHOD.fixedByAll,
    );
  if (node.resolvent)
    return exact(
      `a field of degree ${node.index}, generated by a root of `,
      METHOD.fieldPolynomial(
        node.resolvent.transform.length === 2 &&
          node.resolvent.transform[0] === 0 &&
          node.resolvent.transform[1] === 1,
      ),
    );
  return refuse(
    `its fixed field, of degree ${node.index}`,
    node.resolventWhy ?? "not computed",
  );
}

/** A transitive group containing Gal: its invariant is an integer. */
export function overgroupCert(o: Overgroup): Certificate {
  return exact(
    `inside a copy of ${o.name} (${o.label}): its invariant is the integer ${o.integer.replace(/^-/, "−")}`,
    METHOD.fixedByAll,
  );
}

/**
 * What the last motion did to one invariant: unchanged, exactly, when the motion lies in the group the
 * invariant belongs to; otherwise its new value, in floating point.
 */
export function movedCert(
  pi: readonly number[],
  gens: readonly (readonly number[])[],
  after: readonly [number, number] | null,
): Certificate {
  const n = pi.length;
  const inside = groupElements(
    gens.map((g) => [...g]),
    n,
    10_000,
  ).elements.some((g) => g.every((v, i) => v === pi[i]));
  if (inside) return exact("after the motion: unchanged", METHOD.membership);
  if (!after) return exact("after the motion: moved to its conjugate", METHOD.membership);
  const [re, im] = after;
  const f = (x: number): string => (Math.abs(x) < 1e-9 ? "0" : x.toPrecision(6));
  return estimate(
    `after the motion: moved, to ${f(re)}${Math.abs(im) < 1e-9 * Math.max(1, Math.abs(re)) ? "" : `${im < 0 ? " − " : " + "}${f(Math.abs(im))}i`}`,
    METHOD.movedValue,
  );
}

/** A family's branch points: `=` when every one is alone in its Smith disc. */
export function familyBranchCert(fam: FamilyReading): Certificate {
  const alone = fam.discs.every((d) => d.ok && d.discs.every((x) => x.count === 1));
  return alone
    ? exact("each branch point in its disc", METHOD.familyBranch)
    : estimate("the branch points", "their discs could not be separated");
}

const SUBS = (n: number): string =>
  String(n)
    .split("")
    .map((d) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)])
    .join("");

/** The group over ℚ(t), named only when the monodromy and the discriminant pin it. */
export function arithmeticCert(a: Arithmetic, n: number): Certificate {
  const claim = "the Galois group over ℚ(t)";
  if (a.kind === "unknown") return refuse(claim, a.why);
  if (a.kind === "contains")
    return refuse(
      claim,
      "the monodromy group alone does not pin it: it contains the monodromy group as a normal subgroup",
    );
  return exact(
    `${a.name}${SUBS(n)}, the ${a.name === "S" ? "symmetric" : "alternating"} group`,
    a.why === "symmetric"
      ? METHOD.arithmeticSymmetric
      : a.why === "square"
        ? METHOD.arithmeticSquare
        : METHOD.arithmeticNotSquare,
  );
}

/** How the specialisation's group over ℚ stands against the group over ℚ(t). */
export function specialisationCert(r: Relation, t0: string, group: string): Certificate {
  const claim = `at t = ${t0}`;
  if (r.kind === "unknown") return refuse(claim, r.why);
  return exact(
    r.kind === "equal"
      ? `the Galois group of p(${t0}, z) over ℚ is ${group}: all of the group over ℚ(t) — t = ${t0} is outside the thin set`
      : `the Galois group of p(${t0}, z) over ℚ is ${group}: a proper subgroup of the group over ℚ(t) — t = ${t0} lies in the thin set Hilbert's theorem allows`,
    METHOD.hilbert,
  );
}

/** `[a, b] = c`: composed, `=`. */
export function identityCert(text: string): Certificate {
  return exact(text, METHOD.composed);
}

/** A radical along a word: measured (≈), since the winding is read at samples. */
export function radicalCert(
  o: RadicalOutcome,
  samples: number,
  halvings: number,
): Certificate {
  const claim = o.closes
    ? `closes (its radicand winds ${o.winding} time${Math.abs(o.winding ?? 0) === 1 ? "" : "s"} round 0)`
    : o.returns
      ? `does not close (its radicand winds ${o.winding} time${Math.abs(o.winding ?? 0) === 1 ? "" : "s"} round 0, not a multiple of ${o.radical.k})`
      : "does not close (its radicand does not come back)";
  return estimate(claim, METHOD.measuredWinding(samples, halvings));
}

/** What the theorem says about a radical of this level along a word of this depth, when it says anything. */
export function radicalTheoremCert(level: number, depth: number): Certificate | null {
  return level <= depth
    ? exact(
        `closes: level ${level} ≤ the word's depth ${depth}`,
        METHOD.commutatorTheorem,
      )
    : null;
}

/** The run's verdict. */
export function ladderVerdict(run: LadderRun, permText: string): Certificate {
  const o = run.outcome;
  if (!run.evaluation.ok)
    return refuse("the formula along this word", run.evaluation.reason);
  if (!run.agrees)
    return refuse(
      "the formula along this word",
      "the permutation read off the motion disagrees with the one composed",
    );
  if (!o) return refuse("the formula along this word", "nothing was measured");
  switch (o.kind) {
    case "contradiction":
      return refuse(
        "the formula along this word",
        `the radical ${run.formula.radicals[o.radical].text} was measured not to close, which the theorem rules out — the measurement is wrong, so nothing is claimed`,
      );
    case "trivial":
      return exact(
        `the roots come back to their places (${permText}): this word rules nothing out`,
        METHOD.composed,
      );
    case "refuted":
      return exact(
        `every radical closes and the roots undergo ${permText}: no formula with at most ${o.depth} level${o.depth === 1 ? "" : "s"} of radicals can follow a root — depth ${o.depth} is killed by this word, and a formula needs at least ${o.depth + 1}`,
        METHOD.commutatorTheorem,
      );
    case "refutedMeasured":
      return estimate(
        `every radical was measured to close while the roots undergo ${permText}: this word rules the formula out`,
        METHOD.measuredWinding(run.evaluation.samples, run.evaluation.halvings),
      );
    case "survives":
      return estimate(
        `${run.formula.radicals[o.radical].text} does not close, so this word cannot rule the formula out`,
        METHOD.measuredWinding(run.evaluation.samples, run.evaluation.halvings),
      );
  }
}

/** The derived series' orders, enumerated. */
export function derivedCert(orders: readonly number[]): Certificate {
  return exact(orders.join(" → "), METHOD.derivedEnumerated);
}
