// The bodies this app transplants a reference flow onto — the roster behind the one-page Body selector
// (ADR-0038). Flow past a body B is flow past the unit disk 𝔻* = {|z| ≥ 1} carried through a univalent
// conformal map ψ: 𝔻* → ext(B). The airfoil has its own controls (thickness / camber / the Kutta
// condition → lift); the closed-form bodies are the exterior maps ψ, whose ids match @cas/flow's
// EXTERIOR_MAP_PRESETS (bodies.test.ts pins that correspondence, so the selector, the `#vs=` body id, and
// the executable maps can never fall out of sync).
//
// This is the DISPLAY roster (label + formula for the selector and the readout); the executable maps live
// in @cas/flow (the closed-form bodies) and bodyModel.ts (the airfoil-as-ψ).

export type BodyKind = "airfoil" | "closed-form";

export interface BodyEntry {
  /** Stable id. For a closed-form body it is the @cas/flow EXTERIOR_MAP_PRESET id (and the `#vs=` body id). */
  readonly id: string;
  /** Human label for the Body selector. */
  readonly label: string;
  /** The conformal map ψ: 𝔻* → ext(B), as a display formula (shown in the readout). */
  readonly psi: string;
  /** The body B that ψ carries 𝔻* onto (shown in the body-pane caption). */
  readonly body: string;
  /** Whether this body imposes the Kutta condition → lift (the airfoil only; the closed-form bodies leave
   *  the circulation free). */
  readonly lift: boolean;
  /** "airfoil" reveals the thickness/camber/Kutta controls; "closed-form" bodies show the Γ slider. */
  readonly kind: BodyKind;
}

export const BODIES: readonly BodyEntry[] = [
  {
    id: "airfoil",
    label: "Joukowski / Kármán–Trefftz airfoil",
    psi: "ζ + b²/ζ",
    body: "a cambered wing with a sharp trailing edge",
    lift: true,
    kind: "airfoil",
  },
  {
    id: "vslit-ext",
    label: "Flat plate (vertical slit)",
    psi: "½(z − 1/z)",
    body: "the segment [−i, i]",
    lift: false,
    kind: "closed-form",
  },
  {
    id: "ellipse-ext",
    label: "Ellipse",
    psi: "z + 1/(2z)",
    body: "an ellipse (semi-axes 3/2 and 1/2)",
    lift: false,
    kind: "closed-form",
  },
  {
    id: "deltoid-ext",
    label: "Deltoid",
    psi: "z + 1/(2z²)",
    body: "a 3-cusped hypocycloid",
    lift: false,
    kind: "closed-form",
  },
  {
    id: "astroid-ext",
    label: "Astroid",
    psi: "z + 1/(3z³)",
    body: "a 4-cusped hypocycloid",
    lift: false,
    kind: "closed-form",
  },
  {
    id: "star5-ext",
    label: "5-cusp star",
    psi: "z + 1/(4z⁴)",
    body: "a 5-cusped hypocycloid",
    lift: false,
    kind: "closed-form",
  },
] as const;
