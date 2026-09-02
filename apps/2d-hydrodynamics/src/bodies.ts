// The bodies this app transplants a reference flow onto. Flow past a body B is flow past the unit disk
// 𝔻* = {|z| ≥ 1} carried through a univalent conformal map ψ: 𝔻* → ext(B). Where B has a single sharp
// TRAILING EDGE (a critical point of ψ on |z| = 1), the Kutta condition fixes the circulation so the
// velocity stays finite there, and by Kutta–Joukowski that circulation is a lift; a smooth body (or one
// with several cusps and no distinguished trailing edge) has no such condition — its circulation is a
// free slider (default 0).
//
// HD-0: this is the DISPLAY roster shown on the hub. The executable closed-form maps ψ arrive with the
// gallery (HD-2), as the second-consumer extraction of Riemann-Map's EXTERIOR_MAP_PRESETS into @cas/flow
// (ADR-0037); the airfoil's own engine (airfoil.ts) arrives with the airfoil page (HD-1). The `expr`
// forms below mirror those EXTERIOR_MAP_PRESETS entries so the extraction lands byte-for-byte.

export type BodyKind = "airfoil" | "closed-form";

export interface BodyEntry {
  /** Stable id (URL / preset key). */
  readonly id: string;
  /** Human label for the hub and the gallery picker. */
  readonly label: string;
  /** The conformal map ψ: 𝔻* → ext(B), as a display formula. */
  readonly psi: string;
  /** The body B that ψ carries 𝔻* onto. */
  readonly body: string;
  /**
   * True where B has a single sharp trailing edge, so the Kutta condition is well-posed and produces a
   * lift. False for smooth bodies (no edge) and for multi-cusp bodies (no distinguished trailing edge).
   */
  readonly kutta: boolean;
  /** "airfoil" is the dedicated Kutta/lift page (HD-1); "closed-form" bodies live in the gallery (HD-2). */
  readonly kind: BodyKind;
}

export const BODIES: readonly BodyEntry[] = [
  {
    id: "airfoil",
    label: "Joukowski / Kármán–Trefftz airfoil",
    psi: "ζ + b²/ζ",
    body: "a cambered wing with a sharp trailing edge",
    kutta: true,
    kind: "airfoil",
  },
  {
    id: "slit",
    label: "Flat plate (vertical slit)",
    psi: "½(z − 1/z)",
    body: "the segment [−i, i]",
    kutta: true,
    kind: "closed-form",
  },
  {
    id: "ellipse",
    label: "Ellipse",
    psi: "z + 1/(2z)",
    body: "an ellipse (semi-axes 3/2 and 1/2)",
    kutta: false,
    kind: "closed-form",
  },
  {
    id: "deltoid",
    label: "Deltoid",
    psi: "z + 1/(2z²)",
    body: "a 3-cusped hypocycloid",
    kutta: false,
    kind: "closed-form",
  },
  {
    id: "astroid",
    label: "Astroid",
    psi: "z + 1/(3z³)",
    body: "a 4-cusped hypocycloid",
    kutta: false,
    kind: "closed-form",
  },
  {
    id: "star5",
    label: "5-cusp star",
    psi: "z + 1/(4z⁴)",
    body: "a 5-cusped hypocycloid",
    kutta: false,
    kind: "closed-form",
  },
] as const;
