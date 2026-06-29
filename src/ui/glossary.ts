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
    defn: "The derivative of f around the attracting cycle. |λ| < 1 is attracting, = 1 indifferent, > 1 repelling; |λ| = 0 at the component's centre (superattracting). arg λ is the internal angle. For a non-holomorphic f the magnitude |λ| is taken as the spectral radius of the product of the real 2×2 Jacobians around the cycle (arg λ then undefined).",
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
    defn: "A level curve of the escape potential — the Green's function G(z) = log|φ(z)| of the exterior (the Böttcher 'altitude' outside the set). The bands are drawn at integer escape counts, so they thin geometrically in G toward the boundary. Equipotentials and external rays meet at right angles, forming a polar grid of the exterior.",
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
    defn: "The logarithmic capacity (= transfinite diameter) of a compact set: the conformal radius at ∞ — the leading coefficient of the map w ↦ cap·w + O(1) uniformizing its exterior (cap = 1 for the normalised ψ(w) = w + O(1)). For a degree-d polynomial filled Julia set it is |a_d|^(−1/(d−1)) from the leading coefficient a_d — exactly 1 for a monic zᵈ+c (and the multibrot set), and 1/|λ| for the logistic λz(1−z). It is undefined for rational, transcendental, and non-holomorphic maps, where the panel leaves it '—'.",
    latex: "\\operatorname{cap}(K) = |a_d|^{-1/(d-1)}",
  },
  {
    id: "julia-connectivity",
    term: "Connectivity",
    defn: "The filled Julia set Kᶜ is connected exactly when the critical orbit stays bounded (c in the Mandelbrot / multibrot set); otherwise it is totally disconnected — a Cantor dust with no interior. For a general f the panel estimates it from the image instead: counting the components of the bounded set (bridging the thin pinches that join a connected set at single points), and reading an empty interior as a dendrite or dust by the critical-orbit fate.",
  },
  {
    id: "fractal-dimension",
    term: "Fractal dimension",
    defn: "How the detail of the Julia set fills space — between 1 (a smooth curve, e.g. c = 0) and 2. For z²+c the 'small-c' value is the Ruelle / Bodart–Zinsmeister Hausdorff-dimension asymptotic — accurate only for small |c|, and exact just at c = 0. Otherwise, and for every other map, a coarse box-counting estimate of the boundary is used (pixel-resolution dependent, ±~0.1, biased high on nearly-smooth boundaries). For these hyperbolic Julia sets the Hausdorff and box-counting dimensions coincide, so the two readings are comparable.",
    latex: "\\dim_H J_c = 1 + \\frac{|c|^2}{4\\ln 2} + O(|c|^3) \\quad (z^2+c)",
  },
  {
    id: "lyapunov-exponent",
    term: "Lyapunov exponent",
    defn: "The average exponential rate at which nearby orbits separate, measured along the critical orbit. Negative ⇒ an attracting cycle (−∞ at a superattracting centre); positive ⇒ chaotic; it diverges to +∞ when the orbit escapes. For a non-holomorphic f (no f′) it is estimated from the real 2×2 Jacobian (renormalized-tangent / Benettin method).",
    latex: "\\lambda = \\lim_{n\\to\\infty}\\tfrac1n\\sum_{k=0}^{n-1}\\log|f'(z_k)|",
  },
  {
    id: "julia-area",
    term: "Area of the filled Julia set",
    defn: "From the exterior-map coefficients, Gronwall's area theorem bounds the area by π(1 − Σ k|bₖ|²) — a rigorous upper bound, tight for c well inside the set and loose near its boundary. It is 0 for a disconnected (Cantor) Julia set.",
    latex: "\\operatorname{Area}(K_c) \\le \\pi\\Bigl(1 - \\sum_{k\\ge 1} k\\,|b_k|^2\\Bigr)",
  },
  {
    id: "julia-symmetry",
    term: "Symmetry",
    defn: "Symmetries of the filled Julia set, measured from the image: central (z → −z), mirror across the real or imaginary axis, and k-fold rotation. zᵈ+c is d-fold rotational (and real-axis symmetric when c is real); a general f is reported from whatever its image actually exhibits.",
  },
  {
    id: "bounding-region",
    term: "Bounding region",
    defn: "A region containing the whole filled Julia set. For zᵈ+c it is the escape-radius disk |z| ≤ R (the real root of Rᵈ − R − |c| = 0; every orbit with |z| > R escapes); for a general f it is the measured bounding box of the set.",
    latex: "R^d - R - |c| = 0",
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
