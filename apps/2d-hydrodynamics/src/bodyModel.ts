// bodyModel.ts — the unified "flow past a body B via a forward map ψ: 𝔻* → ext(B)" model (HD-6.1,
// ADR-0038). Every body — the closed-form gallery AND the Joukowski / Kármán–Trefftz airfoil — is one
// forward conformal map ψ from the unit-disk exterior, driven by the SAME reference flow past the unit
// disk (uniform U' + circulation Γ). The physical velocity in the body plane is dW/dz = W_ref'(w)/ψ'(w).
//
// The airfoil folds in because flow past the cylinder |ζ − ζ₀| = R carried through the Joukowski map J is
// identical to flow past the unit disk carried through ψ(w) = J(ζ₀ + R·w) with reference speed U' = U·R:
// the R cancels in dW/dz (W_ref'(w) = R·cylVel(ζ), ψ'(w) = J'(ζ)·R). bodyModel.test.ts pins that the
// ψ-form reproduces airfoil.ts's field exactly — the linchpin that the single-page unification changes no
// physics. This module is app-local (the airfoil engine is app-specific); the gallery ψ/ψ' come from
// @cas/flow's EXTERIOR_MAP_PRESETS.
import {
  refVelocity,
  refPotential,
  type RefFlow,
  type Pt,
  type ExteriorMapPreset,
} from "@cas/flow";
import {
  joukowski,
  joukowskiPrime,
  ktMap,
  ktMapPrime,
  cylinderRadius,
  type AirfoilParams,
} from "./airfoil.js";

const cdiv = (a: Pt, b: Pt): Pt => {
  // Floor |b|² (mirrors @cas/gpu's GLSL cdiv) so a cusp vertex — where ψ' = 0 exactly, e.g. the deltoid /
  // astroid / 5-cusp star at θ = 0 — yields a huge FINITE physical velocity rather than NaN. The velocity
  // genuinely diverges at a cusp, so a bright spot there is correct; a NaN would blacken the mesh triangle.
  const d = Math.max(b[0] * b[0] + b[1] * b[1], 1e-30);
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};

export interface ResolvedBody {
  /** Body id (the airfoil, or an @cas/flow gallery preset id). */
  readonly id: string;
  /** ψ: 𝔻* → ext(B). */
  psi(w: Pt): Pt;
  /** ψ'(w). */
  psiPrime(w: Pt): Pt;
  /** The reference flow past the UNIT disk driving the transplant. */
  readonly flow: RefFlow;
  /** True for the airfoil (carries a Kutta-fixed circulation + lift). */
  readonly isAirfoil: boolean;
  /** Lift L = −ρUΓ (ρ = 1, U = the free-stream speed at ∞), meaningful only for the airfoil. */
  readonly lift: number;
}

/** The airfoil as a ψ: 𝔻* → ext(wing) body: ψ(w) = J(ζ₀ + R·w) (Joukowski) or the KT map, with U' = U·R
 *  and the same circulation Γ. The free-stream speed at ∞ is U (the Joukowski leading coefficient cancels). */
export function airfoilBody(p: AirfoilParams): ResolvedBody {
  const R = cylinderRadius(p);
  const z0 = p.center;
  const n = p.n ?? 2;
  const toCylinder = (w: Pt): Pt => [z0[0] + R * w[0], z0[1] + R * w[1]]; // ζ = ζ₀ + R·w
  return {
    id: "airfoil",
    psi: (w: Pt): Pt => {
      const zeta = toCylinder(w);
      return n === 2 ? joukowski(zeta, p.b) : ktMap(zeta, p.b, n);
    },
    psiPrime: (w: Pt): Pt => {
      const zeta = toCylinder(w);
      const d = n === 2 ? joukowskiPrime(zeta, p.b) : ktMapPrime(zeta, p.b, n);
      return [d[0] * R, d[1] * R]; // chain rule: dψ/dw = (dJ/dζ)·R
    },
    flow: { U: p.U * R, alpha: p.alpha, gamma: p.circulation },
    isAirfoil: true,
    lift: -p.U * p.circulation,
  };
}

/** A closed-form gallery body from an @cas/flow preset, driven by uniform flow (U = 1) + free circulation. */
export function galleryBody(preset: ExteriorMapPreset, alpha: number, gamma: number): ResolvedBody {
  return {
    id: preset.id,
    psi: preset.psi,
    psiPrime: preset.psiPrime,
    flow: { U: 1, alpha, gamma },
    isAirfoil: false,
    lift: 0,
  };
}

/** dW/dz at the disk coordinate w — the physical (body-plane) complex velocity. */
export function physicalVelocity(body: ResolvedBody, w: Pt): Pt {
  return cdiv(refVelocity(w, body.flow), body.psiPrime(w));
}

/** W_ref(w) — the reference complex potential (Re = φ equipotentials, Im = ψ streamlines). */
export function potential(body: ResolvedBody, w: Pt): Pt {
  return refPotential(w, body.flow);
}
