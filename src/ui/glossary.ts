/**
 * Glossary of complex-dynamics terms + the app's non-textbook conventions, surfaced in an
 * in-app panel (and linked inline from the inspector / overlay labels). Pure data so it can
 * be unit-tested; `main.ts` renders it (KaTeX for the optional `latex`).
 *
 * `id`s are stable anchors used by the inline "?" links to jump to a term, so don't rename
 * them casually — the inspector-row and overlay-label maps in `main.ts` reference them.
 */

export interface GlossaryEntry {
  /** Stable anchor id (kebab-case). */
  id: string;
  /** Display name. */
  term: string;
  /** Plain-language definition. */
  defn: string;
  /** Optional KaTeX expression rendered under the definition. */
  latex?: string;
}

/** Core vocabulary. The inspector and overlay "?" links point at these by id. */
export const GLOSSARY: GlossaryEntry[] = [
  {
    id: "parameter-space",
    term: "Parameter space",
    defn: "The plane of parameters c — each point is one map f(·, c), coloured by the fate of its critical orbit. For z²+c this is the Mandelbrot set.",
  },
  {
    id: "dynamical-plane",
    term: "Dynamical plane",
    defn: "For a fixed c, the plane of starting points z₀. The set of points whose orbit stays bounded is the filled Julia set of that map.",
  },
  {
    id: "escape-time",
    term: "Escape time",
    defn: "How many iterations a point takes to cross the escape radius. Exterior points are coloured by it (smoothed, for continuous bands rather than steps).",
  },
  {
    id: "period",
    term: "Period",
    defn: "The length of the attracting cycle an interior point settles onto (1 = a fixed point). Every hyperbolic component has a single period.",
  },
  {
    id: "multiplier",
    term: "Multiplier (λ)",
    defn: "The derivative of f around the attracting cycle. |λ| < 1 is attracting, = 1 indifferent, > 1 repelling; |λ| = 0 at the component's centre (superattracting). arg λ is the internal angle.",
    latex: "\\lambda = \\prod_{k} f'(z_k)",
  },
  {
    id: "internal-angle",
    term: "Internal angle (p/q)",
    defn: "The combinatorial rotation number of the cycle — how far one step rotates around it, as a fraction p/q. It names the bulb: ½ at the period-2 neck, ⅓ and ⅔ at the period-3 bulbs, …",
  },
  {
    id: "critical-orbit",
    term: "Critical point & orbit",
    defn: "The orbit of the point where f′ = 0. Its fate decides the Julia set: a bounded critical orbit ⇒ the Julia set is connected; an escaping one ⇒ it is a Cantor dust. The critical point is 0 for zⁿ+c and ½ for the logistic 'lambda'.",
  },
  {
    id: "external-ray",
    term: "External ray",
    defn: "The image under the Böttcher map of a straight ray outside the set; as it approaches the boundary it lands at an 'external angle' θ measured in turns. Rays organise the boundary combinatorially.",
  },
  {
    id: "farey-bulb",
    term: "Farey bulb",
    defn: "A hyperbolic component attached to the main cardioid at internal angle p/q. Between two bulbs sits the one whose angle is the Farey mediant of theirs.",
    latex: "c = \\tfrac{\\mu}{2} - \\tfrac{\\mu^2}{4}, \\quad \\mu = e^{2\\pi i\\,p/q}",
  },
  {
    id: "nucleus",
    term: "Nucleus (centre)",
    defn: "The superattracting centre of a hyperbolic component — the parameter c at which the critical orbit is exactly periodic (|λ| = 0). The inspector's 'Find nucleus' Newton-snaps c to it.",
  },
  {
    id: "equipotential",
    term: "Equipotential",
    defn: "A level curve of the escape potential (the Böttcher 'altitude' outside the set). Equipotentials and external rays meet at right angles, forming a polar grid of the exterior.",
  },
  {
    id: "distance-estimate",
    term: "Distance estimate",
    defn: "An estimate of the distance from a point to the set, from the orbit and its running derivative — used to draw crisp, resolution-independent boundary filaments.",
    latex: "d \\approx \\frac{|z|\\,\\log|z|}{|z'|}",
  },
  {
    id: "perturbation",
    term: "Perturbation (deep zoom)",
    defn: "A deep-zoom method for z²+c: compute one high-precision reference orbit, then track every pixel as a small difference from it in ordinary precision — reaching far past the float64 zoom limit.",
  },
  {
    id: "bottcher",
    term: "Böttcher coordinate",
    defn: "The conformal change of variable φ near ∞ that turns f(z) = zᵈ + c into the pure power map w ↦ wᵈ (with φ(z) ~ z). Its inverse ψ = φ⁻¹ uniformizes the outside of the filled Julia set; external rays and equipotentials are its straight rays and circles.",
    latex: "\\varphi(f(z)) = \\varphi(z)^d",
  },
  {
    id: "uniformization",
    term: "Exterior map / uniformization",
    defn: "The conformal map ψ from the outside of the unit disk onto the outside of the set — the filled Julia set Kᶜ, or the multibrot Mᵈ in parameter space — normalised ψ(w) = w + O(1). The 'Exterior map' panel reconstructs its Laurent coefficients.",
    latex: "\\psi(w) = w + \\sum_{k\\ge 0} b_k\\, w^{-k}",
  },
  {
    id: "laurent-coefficients",
    term: "Laurent coefficients",
    defn: "The numbers bₖ in ψ(w) = w + Σ bₖ·w⁻ᵏ. For zᵈ + c they follow exact recursions (a triangular solve for Kᶜ; a Böttcher-product reversion for Mᵈ), so they are computed, not curve-fitted. For the Mandelbrot set they are the classical rationals −½, ⅛, −¼, 15/128, …",
  },
  {
    id: "capacity",
    term: "Logarithmic capacity",
    defn: "A conformal 'size' of a compact set, equal to the leading factor of its exterior map. A monic polynomial's filled Julia set and the multibrot set both have capacity 1, so the exterior map's leading term is exactly w.",
  },
];

/** The app's deliberate, non-textbook conventions — stated for honesty / research use. */
export const CONVENTIONS: GlossaryEntry[] = [
  {
    id: "conv-burning-ship",
    term: "Burning ship uses −c",
    defn: "Parameterised with −c on purpose, which places the classic 'ship' at a positive centre.",
  },
  {
    id: "conv-magnet",
    term: "Magnet",
    defn: "Magnet I, ((z²+c−1)/(2z+c−2))². It escapes on divergence (|z| > 3) or on convergence to its fixed point z = 1.",
  },
  {
    id: "conv-schwarz",
    term: "Butterfly / teardrop / exp 'Schwarz'",
    defn: "Custom maps — the 'Schwarz' names are decorative, not Schwarz-triangle maps.",
  },
  {
    id: "conv-distance-modes",
    term: "Distance (edges) vs (analytic)",
    defn: "'Distance (edges, screen-space)' is a screen-space edge estimate; 'Distance (analytic)' is the true exterior distance from the running derivative, sharp at any zoom.",
  },
  {
    id: "conv-newton",
    term: "Newton's method",
    defn: "A root-finder for f(z) = 0; it is degenerate on z²+c (no z-roots to find) — try it on a polynomial like z³−1.",
  },
];
