// The bodies this app transplants a reference flow onto, for the hub roster. Flow past a body B is flow
// past the unit disk 𝔻* = {|z| ≥ 1} carried through a univalent conformal map ψ: 𝔻* → ext(B). The airfoil
// is its own page (thickness / camber / the Kutta condition → lift); the gallery bodies are the
// closed-form exterior maps ψ, whose ids match @cas/flow's EXTERIOR_MAP_PRESETS (bodies.test.ts pins that
// correspondence) and whose page is gallery.html, deep-linked by `#<id>`.
//
// This is the DISPLAY roster for the hub landing page; the executable maps live in @cas/flow.

export type BodyKind = "airfoil" | "closed-form";

export interface BodyEntry {
  /** Stable id. For a closed-form body it is the @cas/flow EXTERIOR_MAP_PRESET id (and the gallery hash). */
  readonly id: string;
  /** Human label for the hub card. */
  readonly label: string;
  /** The conformal map ψ: 𝔻* → ext(B), as a display formula. */
  readonly psi: string;
  /** The body B that ψ carries 𝔻* onto. */
  readonly body: string;
  /** This body's page imposes the Kutta condition → lift (the airfoil page only; the gallery leaves the
   *  circulation free). */
  readonly lift: boolean;
  /** "airfoil" is the dedicated Kutta/lift page; "closed-form" bodies live in the gallery. */
  readonly kind: BodyKind;
  /** The page this card opens. */
  readonly href: string;
}

export const BODIES: readonly BodyEntry[] = [
  {
    id: "airfoil",
    label: "Joukowski / Kármán–Trefftz airfoil",
    psi: "ζ + b²/ζ",
    body: "a cambered wing with a sharp trailing edge",
    lift: true,
    kind: "airfoil",
    href: "airfoil.html",
  },
  {
    id: "vslit-ext",
    label: "Flat plate (vertical slit)",
    psi: "½(z − 1/z)",
    body: "the segment [−i, i]",
    lift: false,
    kind: "closed-form",
    href: "gallery.html#vslit-ext",
  },
  {
    id: "ellipse-ext",
    label: "Ellipse",
    psi: "z + 1/(2z)",
    body: "an ellipse (semi-axes 3/2 and 1/2)",
    lift: false,
    kind: "closed-form",
    href: "gallery.html#ellipse-ext",
  },
  {
    id: "deltoid-ext",
    label: "Deltoid",
    psi: "z + 1/(2z²)",
    body: "a 3-cusped hypocycloid",
    lift: false,
    kind: "closed-form",
    href: "gallery.html#deltoid-ext",
  },
  {
    id: "astroid-ext",
    label: "Astroid",
    psi: "z + 1/(3z³)",
    body: "a 4-cusped hypocycloid",
    lift: false,
    kind: "closed-form",
    href: "gallery.html#astroid-ext",
  },
  {
    id: "star5-ext",
    label: "5-cusp star",
    psi: "z + 1/(4z⁴)",
    body: "a 5-cusped hypocycloid",
    lift: false,
    kind: "closed-form",
    href: "gallery.html#star5-ext",
  },
] as const;
