// Is this cut system legal?
//
// Research 06 §2.1 calls this "the core new idea", and it is the rule that makes MOVABLE cuts
// tractable. The monodromy of `f` around a loop γ is `f ↦ f·exp(2πi Σ α_k·wind(γ, b_k))`, and a cut
// system Γ is admissible exactly when every loop in ℂ̂∖Γ has trivial monodromy. Because Γ is a
// forest, that reduces to three checks a program runs in microseconds:
//
//   (a) every branch point with α ∉ ℤ lies on Γ;
//   (b) every connected component of Γ that does NOT touch ∞ has Σ α_k ∈ ℤ;
//   (c) any component containing a `log` branch point must touch ∞.
//
// One rule explains the whole gallery. The keyhole's `z^{α−1}` has branch points at 0 and ∞ and no
// bounded component is possible, so its cut MUST join 0 to ∞ — but it may be any arc doing so, which
// is why dragging it from ℝ₋ to ℝ₊ is legal and is the lesson. The dogbone's two `−1/2` points are
// individually non-integral, so both are genuine; but they sum to `−1 ∈ ℤ`, so the single arc `a→b`
// is admissible — **and so is the pair of rays to ∞**, which is why research 06 calls dragging
// between those two "the single most valuable interaction in the app". And a `log` never has a
// bounded cut, so the UI must refuse to close one and say why.
//
// DECIDED, NOT MEASURED. Every exponent is a `Frac`, so "is the sum an integer" is `d === 1n`. There
// is no tolerance here and there must not be: D7's admissibility condition IS `μ + ν ∈ ℤ`, and its
// record warns that the equivalent phase equality `exp(2πiμ) = exp(−2πiν)` is the sort of thing an
// engine gets subtly wrong with nothing to warn you.
import { Frac } from "@cas/exact";
import { exact, refuse, type Certificate } from "@cas/rigor";
import { INFINITY, type BranchChoice, type BranchPoint } from "./model.js";

/** Why a cut system was rejected. */
export type AdmissibilityFailure =
  /** A cut names an endpoint that is neither a declared branch point nor infinity. */
  | "malformed"
  /** Γ is not a forest: two cuts close a loop, which would disconnect the plane. */
  | "cycle"
  /** Rule (a): a genuine branch point is not on any cut. */
  | "unplaced"
  /** Rule (b): a bounded component's exponents do not sum to an integer. */
  | "component-not-integral"
  /** Rule (c): a `log` sits on a bounded component. */
  | "log-bounded";

export interface Component {
  readonly points: readonly string[];
  readonly touchesInfinity: boolean;
  /** `Σ α` over the component, or null when it contains a `log` (infinite order, no finite sum). */
  readonly sum: Frac | null;
}

export interface AdmissibilityReport {
  readonly ok: boolean;
  readonly failure?: AdmissibilityFailure;
  /** One line, renderable — what is wrong, or what was checked. */
  readonly detail: string;
  readonly repair?: string;
  readonly components: readonly Component[];
  readonly certificate: Certificate;
}

/** Union–find over branch-point ids plus the reserved {@link INFINITY}. */
class Forest {
  private readonly parent = new Map<string, string>();

  add(id: string): void {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  find(id: string): string {
    let root = this.parent.get(id) ?? id;
    while (root !== (this.parent.get(root) ?? root)) root = this.parent.get(root) ?? root;
    // Path compression, so a long chain of cuts does not make the check quadratic.
    let walk = id;
    while (walk !== root) {
      const next = this.parent.get(walk) ?? walk;
      this.parent.set(walk, root);
      walk = next;
    }
    return root;
  }

  /** Join, or report that the two were already connected — which is a cycle. */
  union(a: string, b: string): { readonly joined: boolean } {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return { joined: false };
    this.parent.set(ra, rb);
    return { joined: true };
  }
}

const isGenuine = (p: BranchPoint): boolean =>
  p.order.kind === "log" || p.order.alpha.d !== 1n;

const describe = (p: BranchPoint): string =>
  p.order.kind === "log"
    ? `${p.label} (log, infinite order)`
    : `${p.label} (α = ${p.order.alpha.n}/${p.order.alpha.d})`;

export function checkAdmissibility(branch: BranchChoice): AdmissibilityReport {
  const known = new Set(branch.points.map((p) => p.id));
  const forest = new Forest();
  forest.add(INFINITY);
  for (const p of branch.points) forest.add(p.id);

  // --- malformed endpoints, before anything is inferred from them ---------------------------
  for (const cut of branch.cuts) {
    for (const end of [cut.from, cut.to]) {
      if (end !== INFINITY && !known.has(end)) {
        return fail(
          "malformed",
          `the cut '${cut.id}' ends at '${end}', which is not a declared branch point`,
          "name an existing branch point, or infinity",
          [],
        );
      }
    }
  }

  // --- (forest) -------------------------------------------------------------------------------
  const placed = new Set<string>();
  for (const cut of branch.cuts) {
    if (cut.from !== INFINITY) placed.add(cut.from);
    if (cut.to !== INFINITY) placed.add(cut.to);
    const { joined } = forest.union(cut.from, cut.to);
    if (!joined) {
      return fail(
        "cycle",
        `the cut '${cut.id}' closes a loop, so the cut system is not a forest`,
        "remove a cut: a loop of cuts encircles a region and disconnects the plane rather than making it simply connected",
        [],
      );
    }
  }

  // --- components, before the rules read them ------------------------------------------------
  const byRoot = new Map<string, { points: string[]; touchesInfinity: boolean; sum: Frac | null }>();
  const infinityRoot = forest.find(INFINITY);
  for (const p of branch.points) {
    const root = forest.find(p.id);
    const entry = byRoot.get(root) ?? { points: [], touchesInfinity: root === infinityRoot, sum: Frac.ZERO };
    entry.points.push(p.id);
    if (p.order.kind === "log") entry.sum = null;
    else if (entry.sum !== null) entry.sum = entry.sum.add(p.order.alpha);
    byRoot.set(root, entry);
  }
  const components: Component[] = [...byRoot.values()].map((c) => ({
    points: c.points,
    touchesInfinity: c.touchesInfinity,
    sum: c.sum,
  }));

  // --- (a) every genuine branch point lies on Γ ----------------------------------------------
  for (const p of branch.points) {
    if (!isGenuine(p) || placed.has(p.id)) continue;
    return fail(
      "unplaced",
      `${describe(p)} is a genuine branch point and no cut reaches it`,
      "run a cut from it to another branch point, or to infinity",
      components,
    );
  }

  // --- (c) then (b), because a bounded log is the sharper complaint ---------------------------
  for (const c of components) {
    if (c.touchesInfinity) continue;
    if (c.sum === null) {
      return fail(
        "log-bounded",
        `a log branch point sits on a component that does not reach infinity (${c.points.join(", ")})`,
        "a logarithm has infinite-order monodromy, so no bounded cut can ever make it single-valued — extend this cut to infinity",
        components,
      );
    }
    if (c.sum.d !== 1n) {
      return fail(
        "component-not-integral",
        `the component {${c.points.join(", ")}} is bounded and its exponents sum to ${c.sum.n}/${c.sum.d}, which is not an integer`,
        "extend a cut from this component to infinity, or add a branch point to it so the sum closes",
        components,
      );
    }
  }

  const bounded = components.filter((c) => !c.touchesInfinity);
  return {
    ok: true,
    detail:
      bounded.length === 0
        ? "every cut reaches infinity, so no bounded component can carry monodromy"
        : `every bounded component has $\\sum\\alpha \\in \\mathbb{Z}$ (${bounded.map((c) => `{${c.points.join(", ")}}`).join(", ")})`,
    components,
    certificate: exact(
      "the cut system is admissible",
      "each bounded cut joins branch points whose exponents sum to an integer; every logarithmic branch point is joined to $\\infty$",
      {
        provenance: [
          { ok: true, text: `${branch.points.length} branch point(s), ${branch.cuts.length} cut(s), no cycle` },
          ...bounded.map((c) => ({
            ok: true,
            text: `bounded cut $\\{${c.points.join(", ")}\\}$: $\\sum\\alpha = ${c.sum?.n ?? "—"}/${c.sum?.d ?? "—"} \\in \\mathbb{Z}$`,
          })),
        ],
      },
    ),
  };
}

function fail(
  failure: AdmissibilityFailure,
  detail: string,
  repair: string,
  components: readonly Component[],
): AdmissibilityReport {
  return {
    ok: false,
    failure,
    detail,
    repair,
    components,
    certificate: refuse("the cut system", detail, {
      provenance: [
        { ok: false, text: detail },
        { ok: true, text: `suggested repair: ${repair}` },
      ],
    }),
  };
}
