// The bridge (PLAN §7 PRA-7): what the monodromy of a family says about Galois groups over ℚ.
//
//   Gal(p / ℂ(t))  =  the monodromy group G            (Riemann's existence theorem; Harris 1979)
//   G  ⊴  A = Gal(p / ℚ(t))  ≤  Sₙ                      (G is the geometric part of the arithmetic group)
//   Gal(p(t₀, z) / ℚ)  ≤  A  for rational t₀ off the branch points, with EQUALITY outside a thin set
//                                                     (Hilbert's irreducibility theorem; Serre, Topics §3)
//
// So A is NAMED here only when those facts pin it: G = Sₙ forces A = Sₙ; G = Aₙ forces A = Aₙ or Sₙ,
// and the discriminant decides which (A ≤ Aₙ exactly when disc_z(p) is a square in ℚ(t)). Anything else
// is stated as a containment, never guessed. A specialisation is compared with A by ORDER — a subgroup
// of the same order is the group — and one smaller than A is a member of the thin set.
import { type Frac, type QiPoly, yunSquarefree } from "@cas/exact";
import type { LassoGroup } from "../loops/group.js";
import type { GaloisEvidence } from "../galois/tier0.js";

export type Arithmetic =
  | {
      readonly kind: "named";
      readonly name: "S" | "A";
      readonly order: bigint;
      readonly why: "symmetric" | "square" | "not-square";
    }
  | { readonly kind: "contains"; readonly geometricOrder: number | null }
  | { readonly kind: "unknown"; readonly why: string };

function factorial(n: number): bigint {
  let f = 1n;
  for (let k = 2n; k <= BigInt(n); k++) f *= k;
  return f;
}

function isSquareBig(x: bigint): boolean {
  if (x < 0n) return false;
  if (x < 2n) return true;
  let r = BigInt(Math.floor(Math.sqrt(Number(x))));
  // Newton to the exact floor square root.
  for (;;) {
    const next = (r + x / r) >> 1n;
    if (next >= r) break;
    r = next;
  }
  while (r * r > x) r--;
  while ((r + 1n) * (r + 1n) <= x) r++;
  return r * r === x;
}

/** Is a rational a square in ℚ? */
export function isRationalSquare(f: Frac): boolean {
  return f.n >= 0n && isSquareBig(f.n) && isSquareBig(f.d);
}

/**
 * Is `disc` (a non-zero polynomial in t over ℚ) a square in ℚ(t)? Exactly when every squarefree factor
 * appears to an even power and what is left over — the constant — is a square in ℚ.
 */
export function isSquareInQt(disc: QiPoly): boolean {
  if (disc.isZero()) return false;
  if (disc.coeffs.some((c) => !c.im.isZero())) return false;
  let unit = disc.leadingCoeff().re;
  for (const { factor, multiplicity } of yunSquarefree(disc)) {
    if (factor.degree() < 1) continue;
    if (multiplicity % 2 !== 0) return false;
    // disc = c·∏ fᵢ^mᵢ: divide the leading coefficients out to leave c.
    const lead = factor.leadingCoeff().re;
    for (let k = 0; k < multiplicity; k++) unit = unit.div(lead);
  }
  return isRationalSquare(unit);
}

/** The arithmetic group, from the certified geometric group and the exact discriminant. */
export function arithmeticGroup(group: LassoGroup, disc: QiPoly, n: number): Arithmetic {
  if (group.missing) return { kind: "unknown", why: group.missing };
  const r = group.recognition;
  if (r.name === "S")
    return { kind: "named", name: "S", order: factorial(n), why: "symmetric" };
  if (r.name === "A") {
    const square = isSquareInQt(disc);
    return square
      ? { kind: "named", name: "A", order: factorial(n) / 2n, why: "square" }
      : { kind: "named", name: "S", order: factorial(n), why: "not-square" };
  }
  return { kind: "contains", geometricOrder: group.order };
}

/** What the Galois card knows about p(t₀, z) over ℚ. */
export type SpecialGalois =
  | { readonly kind: "named"; readonly name: string; readonly order: number }
  | { readonly kind: "reducible" }
  | { readonly kind: "pending" }
  | { readonly kind: "open"; readonly why: string };

export type Relation =
  | { readonly kind: "equal" }
  | { readonly kind: "proper" }
  | { readonly kind: "unknown"; readonly why: string };

/** Compare the specialisation's group with A. */
export function relate(arith: Arithmetic, g: SpecialGalois): Relation {
  if (g.kind === "pending")
    return { kind: "unknown", why: "the Galois card is still working" };
  if (g.kind === "open") return { kind: "unknown", why: g.why };
  // A reducible specialisation's group is intransitive; A contains the transitive G, so it is proper.
  if (g.kind === "reducible")
    return arith.kind === "unknown"
      ? { kind: "unknown", why: arith.why }
      : { kind: "proper" };
  if (arith.kind !== "named")
    return {
      kind: "unknown",
      why:
        arith.kind === "unknown"
          ? arith.why
          : "the group over ℚ(t) is not pinned by the monodromy alone",
    };
  return BigInt(g.order) === arith.order ? { kind: "equal" } : { kind: "proper" };
}

/** What the Galois card's evidence says of p(t₀, z), in the bridge's terms (`null`: still working). */
export function specialGalois(ev: GaloisEvidence | null): SpecialGalois {
  if (ev === null) return { kind: "pending" };
  if (!ev.ok) return { kind: "open", why: ev.reason };
  if (!ev.irreducible || ev.factors.length !== 1 || ev.factors[0].multiplicity !== 1)
    return { kind: "reducible" };
  const id = ev.factors[0].galois?.identification;
  if (!id) return { kind: "pending" };
  if (id.tier === 1) return { kind: "named", name: id.name, order: id.order };
  return {
    kind: "open",
    why:
      id.tier === 2
        ? "the Galois card only estimates this group, so no equality can be claimed"
        : id.reason,
  };
}
