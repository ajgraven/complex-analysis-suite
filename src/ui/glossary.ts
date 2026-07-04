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
    id: "fatou-component",
    term: "Fatou component",
    defn: "A connected piece of the Fatou set (where nearby orbits behave alike). The inspector names the component a cycle bounds from its multiplier λ: attracting (|λ|<1), superattracting (λ=0, the cycle contains a critical point), parabolic (λ = e^(2πi·p/q)), or a rotation domain (|λ|=1, irrational rotation) — a Siegel disc.",
  },
  {
    id: "siegel-disc",
    term: "Siegel disc",
    defn: "A rotation domain: on it the map is conformally conjugate to an irrational rotation z ↦ e^(2πiθ)·z. It surrounds an irrationally-indifferent fixed/periodic point (|λ|=1, θ irrational) exactly when θ is a Brjuno number (Yoccoz's theorem); a larger Brjuno sum B(θ) means a smaller disc (radius ≈ e^(−B)). A non-Brjuno θ gives a Cremer point, with no disc. The inspector reports θ, the Brjuno verdict, and the estimated radius; the 'Siegel invariant curves' overlay draws the nested rotation curves that fill the disc.",
    latex: "B(\\theta) = \\sum_{n\\ge 0} \\frac{\\log q_{n+1}}{q_n} < \\infty",
  },
  {
    id: "mating",
    term: "Mating",
    defn: "Glue two filled Julia sets along their boundaries (by the angle-doubling identification of external rays) to build a single rational map that combines both dynamics. Two post-critically-finite quadratics z²+c₁, z²+c₂ admit a (conformal) mating iff c₁ and c₂ are NOT in complex-conjugate limbs of the Mandelbrot set (Rees–Shishikura–Tan Lei). For main-cardioid bulbs, the p/q limb's conjugate is the (q−p)/q bulb, so the obstruction is p₁/q₁ + p₂/q₂ = 1; the 1/2 bulb is the only self-conjugate one, so every other bulb can be mated with itself.",
  },
  {
    id: "misiurewicz",
    term: "Misiurewicz point",
    defn: "A parameter c where the critical orbit is strictly preperiodic: fᵐ⁺ᵏ(0) = fᵐ(0) with preperiod m ≥ 1, so after m steps the orbit lands exactly on a repelling k-cycle. These points sit on the Julia/Mandelbrot boundary, are dense there, and the set is asymptotically self-similar around them (Tan Lei). The finder Newton-solves fᵐ⁺ᵏ(0) − fᵐ(0) = 0 near the view centre. Examples: c = i (m=2, k=2); c = −2 (m=2, k=1).",
  },
  {
    id: "escape-time",
    term: "Escape time",
    defn: "How many iterations a point takes to cross the escape radius. Exterior points are coloured by it (smoothed, for continuous bands rather than steps).",
  },
  {
    id: "auto-iterations",
    term: "Auto iterations",
    defn: "Optionally raises the iteration cap as you zoom in, so deep views keep their detail without bumping the count by hand. Near the boundary the escape-time bands pile up geometrically, so each 10× of zoom needs a roughly constant number of extra iterations — the cap grows linearly in log₁₀(zoom). The 'strength' slider sets how many extra iterations are added per decade (as a fraction of the base count). It depends on zoom (magnification) alone, not on where the view is centred.",
  },
  {
    id: "auto-suggestions",
    term: "Suggestions",
    defn: "Occasional, non-obstructive tips shown over a plot when a setting is degrading or hiding the view — for example, too few iterations for the current zoom (boundary detail 'fattening'), deep zoom straining double-precision (offering perturbation), a rational map whose escape-time image is flat (offering period colouring), or a view sitting inside the set (offering the multiplier map). Each tip carries a one-click fix and a dismiss; nothing changes on its own. The 'suggestions' checkbox turns them off entirely.",
  },
  {
    id: "profiles",
    term: "Profiles",
    defn: "Use-case bundles of display / quality / instrument settings, applied in one click from the app bar and remembered across sessions. Explore is a balanced default; Artist maxes out visual quality (lighting, post-processing, anti-aliasing); Researcher raises accuracy and opens the metrics panel; Educator turns on the structure-revealing overlays; Performance strips everything back for slow devices or fast panning; Deep zoom turns on perturbation and auto-iterations for z²+c. A profile re-skins the current view — it never changes your formula, parameter, or zoom — and editing any setting afterwards shows the picker as 'Custom'.",
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
    id: "orbit-preview",
    term: "Orbit preview inset",
    defn: "An optional miniature dynamical-plane picture pinned to the parameter plot's corner. While you hover a point c it shows that map's filled Julia set with the critical orbit drawn on top — green if the orbit stays bounded (the Julia set there is connected), orange if it escapes (a Cantor dust). It's a quick 'what does the dynamical plane look like here?' hint; off by default, toggle it under Iteration & precision.",
  },
  {
    id: "color-legend",
    term: "Colour legend",
    defn: "The small key in each plot's corner explaining what its colours mean for the current colouring mode. Escape-time modes show the palette ramp (fast escape → the boundary) with a black swatch for the interior (the Mandelbrot / filled Julia set); domain, multiplier and Newton colouring show a hue wheel; period colouring keys the interior by cycle. It updates with the mode and palette, and is on by default (toggle under Iteration & precision).",
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
    defn: "The conformal change of variable φ near ∞ that turns a polynomial f into the pure power map w ↦ wᵈ (φ(z) ~ z/γ₁ near ∞, γ₁ the capacity; just z for a monic map). Its inverse ψ = φ⁻¹ uniformizes the outside of the filled Julia set; external rays and equipotentials are its straight rays and circles.",
    latex: "\\varphi(f(z)) = \\varphi(z)^d",
  },
  {
    id: "uniformization",
    term: "Exterior map / uniformization",
    defn: "The conformal map ψ from the outside of the unit disk onto the outside of the set — the filled Julia set Kᶜ (any polynomial f, or a rational map with a superattracting ∞), or the multibrot Mᵈ of z^d + c in parameter space — normalised ψ(w) = γ₁·w + O(1), γ₁ the capacity (1 for a monic map). The 'Exterior map' panel reconstructs its Laurent coefficients.",
    latex: "\\psi(w) = \\gamma_1 w + \\sum_{k\\ge 0} b_k\\, w^{-k}",
  },
  {
    id: "laurent-coefficients",
    term: "Laurent coefficients",
    defn: "The numbers bₖ in ψ(w) = γ₁·w + Σ bₖ·w⁻ᵏ. For the filled Julia set of ANY polynomial — or a rational map with a superattracting ∞ (deg p − deg q ≥ 2) — they follow an exact recurrence from the Böttcher functional equation f(ψ(w)) = ψ(wᴰ) (a triangular solve, γ₁ = a_D^{−1/(D−1)} the capacity); the multibrot Mᵈ uses a Böttcher-product reversion (z^d + c only). Computed, not curve-fitted — for the Mandelbrot set the classical rationals −½, ⅛, −¼, 15/128, …",
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
  {
    id: "marty",
    term: "Marty / spherical derivative",
    defn: "The Marty coloring highlights the Julia set using the normality test. The spherical derivative |（f^k)′(z₀)| / (1+|z_k|²) measures how fast the family {f^k} pulls nearby points apart on the Riemann sphere; it grows on the Julia set (where the family fails to be normal) and stays small in the Fatou set. Colouring by its running maximum lights up the Julia set — an alternative to distance estimation that works for any holomorphic map.",
    latex: "f^{k\\#}(z) = \\frac{|(f^k)'(z)|}{1 + |f^k(z)|^2}",
  },
  {
    id: "newton-basins",
    term: "Newton basins",
    defn: "Under Newton's method (iterating z − f/f′) almost every point converges to one of the roots of f. The Newton-basins coloring sets the hue to the argument of the value the orbit ends on — under Newton that is the root reached — so the basins of different roots take distinct hues (the classic multi-coloured Newton fractal), with brightness from the convergence speed. No root detection is needed: distinct roots simply have distinct arguments.",
  },
  {
    id: "interior-distance",
    term: "Interior distance estimate",
    defn: "The interior counterpart of exterior distance estimation. For a parameter c inside a hyperbolic component of the Mandelbrot set (z²+c), it estimates the distance from c to that component's boundary, carving the otherwise-flat interior into a smooth relief (brightest deep inside, fading to 0 at the edge). From the attracting cycle's period p and a cycle point it accumulates the partials of fᵖ and evaluates DE = (1−|λ|²)/|∂z∂c fᵖ + ∂²zz fᵖ · ∂c fᵖ/(1−λ)|, with λ the multiplier ∂z fᵖ. Parameter plane, z²+c only.",
    latex:
      "d = \\frac{1 - |\\partial_z f^p|^2}{\\left| \\partial_z\\partial_c f^p + \\partial_z^2 f^p \\cdot \\dfrac{\\partial_c f^p}{1 - \\partial_z f^p} \\right|}",
  },
  {
    id: "orbit-portrait",
    term: "Orbit portrait",
    defn: "The combinatorial fingerprint of a repelling periodic cycle: the sets of external angles whose rays land at each cycle point. The doubling map D(θ)=2θ permutes these sets cyclically, so D^p rotates the rays at one point rigidly — by the rotation number p/q. The valence v is the number of rays per point and the characteristic arc (the narrowest gap) is a complete invariant. On the dynamical plane the inspector draws the portrait of the α fixed point: e.g. the rabbit's α has rays {1/7, 2/7, 4/7} (valence 3, rotation 1/3); the basilica's has {1/3, 2/3} (valence 2, rotation 1/2). z²+c only.",
  },
  {
    id: "biaccessible",
    term: "Biaccessible point / angles of a point",
    defn: "The inverse of ray landing: the external angles whose rays land at a given point. A point is biaccessible when two or more rays land on it (it is reachable from the exterior along ≥ 2 accesses) — its valence is the number of rays. On the Julia set the α fixed point is biaccessible (the basilica's α ← {1/3, 2/3}, valence 2; the rabbit's ← {1/7, 2/7, 4/7}, valence 3) while the β fixed point is not (← {0} only). On ∂M a component root carries the two rays bounding its wake (−3/4 ← {1/3, 2/3}) and a Misiurewicz point its preperiodic angles (−2 ← {1/2}). The 'Angles of a point' tool finds them by landing every low-period angle and clustering. The Hausdorff dimension of the biaccessible angles is the biaccessibility dimension of the core entropy.",
  },
  {
    id: "core-entropy",
    term: "Core entropy",
    defn: "The topological entropy h(θ) = log λ of the map on its Hubbard tree, a measure of how 'chaotic' the postcritically-finite parameter at external angle θ is. By Thurston, h = log 2 · B, where B = h/log 2 ∈ [0,1] is the biaccessibility dimension (the Hausdorff dimension of the angles whose rays land at the same point as another). λ ∈ [1,2] is the leading eigenvalue of a transition matrix on pairs of postcritical angles (separated / not by the critical diameter). Satellite components like the rabbit (1/7) have h = 0; primitive ones like the airplane (3/7) have h = log φ. The 'Go to external angle' tool reports it.",
    latex: "h(\\theta) = \\log\\lambda = \\log 2 \\cdot B_{\\mathrm{top}}(\\theta)",
  },
  {
    id: "yoccoz-puzzle",
    term: "Yoccoz puzzle",
    defn: "A nested sequence of partitions of the neighbourhood of the Julia set, the combinatorial tool behind Yoccoz's local-connectivity arguments. Depth 0 cuts the region between an equipotential and the set with the q external rays landing at the repelling α fixed point (its orbit portrait). Depth n is the pullback under fⁿ: the rays whose angle doubles n times onto an α-angle — Θₙ = {θ : 2ⁿθ mod 1 ∈ A} — so q·2ⁿ rays. The pieces between them nest, and the nest around the critical point controls local connectivity. Drawn in violet on the dynamical plane, with an option to shade the critical piece (the one containing the critical point 0, found by flood fill) in gold so its nest is visible as the depth rises. The same angles drawn as parameter rays on ∂M give the parapuzzle, the parameter-space analogue, whose piece around the current c can be shaded too (its rays sealed to the exact wake roots first). z²+c, and only when α is repelling (c outside the main cardioid). Basilica α ← {1/3, 2/3}; the rabbit ← {1/7, 2/7, 4/7}.",
  },
  {
    id: "inverse-iteration",
    term: "Inverse-iteration Julia set",
    defn: "A way to paint the Julia set directly as the closure of backward orbits, rather than colouring by forward escape. For z²+c the preimages of a point are z ↦ ±√(z−c); iterating a random choice of branch from the repelling β fixed point converges onto the Julia set and samples it densely (the 'chaos game'). It draws the boundary crisply where forward escape-time struggles — thin dendrites and Cantor dusts. Overlay on the dynamical plane; z²+c only (a closed-form inverse). c=0 gives the unit circle, c=−1 the basilica.",
  },
  {
    id: "rational-map",
    term: "Rational map",
    defn: "An iteration f(z) = N(z)/D(z) of two polynomials, e.g. (z²+c)/(1+cz²). Unlike z²+c, ∞ is generally an ordinary point rather than a superattracting fixed point, so orbits converge to FINITE attracting cycles instead of escaping — escape-time colouring is blank, and the 'period' colouring (which detects the attracting cycle) reveals the Fatou structure. By Riemann–Hurwitz a degree-d rational map has 2d−2 critical points; the parameter plane tracks the orbit of a free critical point (0 for these even-symmetric families).",
  },
  {
    id: "herman-ring",
    term: "Herman ring",
    defn: "A doubly-connected rotation domain: an invariant annulus on which f acts as an irrational rotation, conjugate to a rigid rotation of a round annulus. Unlike a Siegel disc (a rotation domain around a fixed point), a ring surrounds a HOLE — a separate Fatou component. They exist only for degree ≥ 3 rational maps (Shishikura). The standard example e^{2πiτ}·z²(z−4)/(1−4z) keeps the unit circle invariant; at τ = 0.6151732 the rotation number on it is the golden mean. Detection reports the rotation number and the conformal modulus (1/2π)·log(R_out/R_in).",
  },
  {
    id: "internal-address",
    term: "Internal address & stripping",
    defn: "A combinatorial 'street address' for a hyperbolic component: the strictly-increasing periods 1 → S₁ → … → S_k of the principal components crossed from the main cardioid (1-3 is the rabbit, 1-2-4-8 the period-doubling cascade). The stripping algorithm turns an address into its kneading sequence ν and the two characteristic external angles θ⁻, θ⁺ whose parameter rays bound the component's wake. Not every increasing address is realised — 1-2-4-5-6 is the smallest non-admissible one (Bruin–Schleicher).",
  },
  {
    id: "riemann-sphere",
    term: "Riemann sphere",
    defn: "The complex plane plus a point at infinity, modelled as a sphere by stereographic projection (z = (X+iY)/(1−Z)). Viewing a set on it shows the whole plane at once, including the dynamics at ∞ (for z²+c, ∞ is a superattracting fixed point — the basin of ∞ is the exterior). The 'Riemann sphere (3D)' panel renders either plane live in interactive 3D: drag to rotate, scroll to zoom. The south pole is z=0, the equator is |z|=1, and the north pole is ∞; the sphere is lit as a ball with the fractal as its surface. Works for any f (single precision); overlays are hidden while it's active.",
    latex: "\\zeta = \\frac{X + iY}{1 - Z}",
  },
  {
    id: "poincare-disk",
    term: "Poincaré disk projection",
    defn: "A live view that compresses the whole plane into the open unit disk by treating the modulus as a hyperbolic distance: a plot point z maps to the disk point w = tanh(|z−c*|/2)·(z−c*)/|z−c*|, so the boundary circle is ∞. A flat counterpart to the Riemann-sphere view — you see the entire plane at once, with detail near c* magnified and far-field structure crowded against the rim. Single precision; overlays are hidden while it is active.",
    latex: "w = \\tanh\\!\\big(\\tfrac{|z-c^*|}{2}\\big)\\,\\frac{z-c^*}{|z-c^*|}",
  },
  {
    id: "log-polar",
    term: "Log-polar projection (exponential map)",
    defn: "A live view in which the screen's horizontal axis is the angle φ about a centre c* and the vertical axis is the log-radius ρ, so a pixel shows the plot point z = c* + e^{ρ+iφ}. Self-similar structure (e.g. spiralling around a Misiurewicz point) becomes periodic and straight, and sliding the log-radius is a constant-rate zoom toward c* — the basis of the log-polar zoom-video. Single precision.",
    latex: "z = c^* + e^{\\rho + i\\varphi}",
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
