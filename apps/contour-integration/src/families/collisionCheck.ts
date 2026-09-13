// SG-6: the hypothesis that FAILS while the argument stays rigorous — and the record's own arithmetic
// about it, checked.
//
// G1's stated hypothesis is *"`f` has no pole at an integer"*, and `f = 1/z²` violates it at the one
// point where the kernel also has a pole. `refuse` is wrong (the answer is correct); `warn` is wrong
// (nothing is uncertain). What is true is that the hypothesis is SUFFICIENT for the clean form of the
// theorem and not NECESSARY for the contour argument: `π cot(πz)/z²` is meromorphic at 0 with a pole
// of order 3, and the residue theorem applies to the product. `onFail: "escalate"` with
// `escalateTo: "merge-collision"` is the record saying so, and this is what reads it.
//
// **THE ESCALATION IS NOT A LICENCE, IT IS AN OBLIGATION.** A record that escalates must then declare
// what the merged pole IS — `residueSelection.collisions[]` carries the order arithmetic and the
// residue — and every one of those declarations is checked against `mergedResidue`'s own computation.
// So the schema's first three-valued hypothesis outcome costs the record MORE precision rather than
// less: `refuse` would have stopped the argument and `warn` would have waved it through, while this
// requires a number and falsifies it.
//
// What it cannot excuse is an ESSENTIAL singularity, where no finite order exists and no residue
// formula applies. That is refused here by the same check that verifies the order: `mergedResidue`
// works from a polynomial denominator's vanishing order, so a collision it can describe at all has a
// finite one.
import { parse } from "@cas/expr";
import { exact, type Certificate } from "@cas/rigor";
import { mergedResidue } from "../kernel/mergedResidue.js";
import { formatRatPi } from "../kernel/ratPi.js";
import type { SummationKernel } from "../kernel/summationKernel.js";
import { exactPiConstant } from "./piConstant.js";
import type { Bindings, Family } from "./schema.js";

/** The escalations this engine implements. A record naming anything else is dropped by the loader. */
export const ESCALATIONS: ReadonlySet<string> = new Set(["merge-collision"]);

export type CollisionCheck =
  | { readonly ok: true; readonly certificates: readonly Certificate[] }
  | { readonly ok: false; readonly reason: string };

/**
 * Check every declared collision against what the engine computes — order AND residue.
 *
 * Both halves matter and they fail differently. A wrong `mergedOrder` is a record that has
 * mis-counted "orders add"; a wrong `residue` is one that has taken `Res(K,0)·f(0)` — meaningless,
 * since `f(0)` is infinite — or reached for the order-`m` derivative formula and slipped. G1's own
 * traps name both, and this is what makes them arithmetic rather than prose.
 */
export function checkDeclaredCollisions(
  family: Family,
  kernel: SummationKernel,
  bindings: Bindings = {},
): CollisionCheck {
  const declared = family.collisions ?? [];
  if (declared.length === 0) return { ok: true, certificates: [] };

  const certificates: Certificate[] = [];
  for (const c of declared) {
    let n: bigint;
    try {
      const parsed = parse(c.at);
      const v = parsed.kind === "num" ? parsed.value : Number.NaN;
      if (!Number.isInteger(v)) {
        return { ok: false, reason: `the collision at '${c.at}' is not an integer, so the kernel has no pole there` };
      }
      n = BigInt(v);
    } catch {
      return { ok: false, reason: `the collision's position '${c.at}' does not parse` };
    }

    const got = mergedResidue(kernel.kind, kernel.num, kernel.den, n);
    if (!got.ok) return { ok: false, reason: `the declared collision at z = ${n}: ${got.reason}` };
    if (got.order !== c.mergedOrder) {
      return {
        ok: false,
        reason:
          `the record declares a merged order of ${c.mergedOrder} at z = ${n}, and the orders ADD to ` +
          `${got.order}`,
      };
    }
    const want = exactPiConstant(parse(c.residue), bindings);
    if (!want.ok) {
      return { ok: false, reason: `the declared residue '${c.residue}' is not an element of ℚ(i)(π): ${want.reason}` };
    }
    if (!want.value.equals(got.value)) {
      return {
        ok: false,
        reason:
          `the record declares Res = ${c.residue} at z = ${n}, and the Laurent route gives ` +
          `${formatRatPi(got.value)}`,
      };
    }
    certificates.push(got.certificate);
  }

  certificates.push(
    exact(
      `${declared.length} declared collision${declared.length === 1 ? "" : "s"} reproduce${declared.length === 1 ? "s" : ""} the engine's own merged residue`,
      "the record's `collisions[]` carries the order arithmetic and the residue, and both are checked against the Laurent route rather than trusted",
      {
        provenance: [
          {
            ok: true,
            text: "the hypothesis 'f has no pole at an integer' is SUFFICIENT for the clean form of the theorem and not NECESSARY for the contour argument, which is why `escalate` is right where `refuse` and `warn` are both wrong",
          },
        ],
      },
    ),
  );
  return { ok: true, certificates };
}

/** The escalating hypotheses a record declares, for the row that reports them. */
export function escalations(family: Family): readonly { readonly id: string; readonly to: string }[] {
  return family.hypotheses.flatMap((h) =>
    h.onFail === "escalate" && h.escalateTo !== undefined ? [{ id: h.id, to: h.escalateTo }] : [],
  );
}

/** What a record that escalates but declares nothing to merge is missing. */
export const escalationRefusal = (family: Family): string | null => {
  const esc = escalations(family);
  if (esc.length === 0) return null;
  const unknown = esc.find((e) => !ESCALATIONS.has(e.to));
  if (unknown !== undefined) {
    return `hypothesis '${unknown.id}' escalates to '${unknown.to}', which this engine does not implement; it knows ${[...ESCALATIONS].map((x) => `'${x}'`).join(", ")}`;
  }
  if ((family.collisions ?? []).length === 0) {
    return `hypothesis '${esc[0].id}' escalates to '${esc[0].to}', but the record declares no collision to merge — an escalation is an obligation to say what the merged pole is, not a licence to skip the hypothesis`;
  }
  return null;
};
