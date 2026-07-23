// ESM (Phase 2 port) — twin of ui-strings.js (classic stays frozen). Registers onto the QD namespace.
import _QD from './solver.mjs';
// =============================================================================
// ui-strings.js  —  Single source of truth for editable UI prose (QD.Strings).
//
// THIS IS THE FILE TO EDIT when reworking descriptions / helptext / tooltips /
// example blurbs. Each value below is the exact text shown to the user. The code
// reads from here; nothing else needs to change.
//
// How the text reaches the screen:
//   • JS prose (the "?" help-popovers, Faber/oracle help, example blurbs, the
//     solve-failure guidance) is read directly, e.g. QD.Strings.help.cCard.
//   • Static HTML text (the family hints, card hints, overlay tooltips/notes,
//     coachmark) is injected by QD.Strings.apply() into elements that carry a
//     data-str* attribute in index.html:
//        data-str="path"        -> el.textContent = QD.Strings.path
//        data-str-html="path"   -> el.innerHTML   = QD.Strings.path   (tags render)
//        data-str-title="path"  -> el.title       = QD.Strings.path   (PLAIN text)
//     apply() runs once at page load (inline, just after the script loader).
//
// EDITING RULES
//   • help.* / familyHints.* / hints.* / notes.* / faber.help / oracle.help are
//     HTML — <b> <i> <sub> <sup> <code> <br> <kbd> all work; keep entities
//     (&gt; &amp;) as entities.
//   • tooltips.* are PLAIN TEXT (title attributes) — no HTML tags; use Unicode
//     (Fₙ, φ′, ζ², Dₙ) instead.
//   • Preserve the true minus '−' (U+2212), sub/superscripts, and Greek/blackboard
//     glyphs (φ θ κ λ ζ ∂Ω 𝔻 𝔻* ℂ Ω̄) exactly.
//
// NOT centralized here (edit in the named module; see HELPTEXT.md for the full map):
//   • Pure control labels / buttons / options / tab names (index.html).
//   • Value-interleaved micro-labels and computed status lines (ui-solve.js,
//     ui-faber.js property rows, oracle row names in thesis-examples.js).
//   • Family external-field labels and validation errors (ui-modes.js).
//
// After editing ANY app/ file: run `npm run version:sync` (then lint + test).
// =============================================================================

(function (global) {
  'use strict';

  const QD = _QD;

  const S = {

    // ---- Algebra operation help (the three-tier rule) ------------------------
    // `short` is the one-line title (hard rule: nothing over ~120 chars in a `title` —
    // invisible on touch, unreachable by keyboard, gone on pointer-move). `detail` is the
    // full explanation, shown in the section's `?` popover — the ORIGINAL tooltip text, moved
    // across essentially unchanged (two were reworded on purpose: alg-groebner and
    // alg-copy-latex). The content was good; it was stored in the least readable affordance
    // the platform offers. `section` is the panel whose `?` renders it.
    //
    // Single source for both: the title and the popover entry come from the same record, so
    // they cannot drift the way a hand-copied summary would.
    algebraOps: {
      'alg-w0-fix': {
        section: `header`,
        short: `Bake the solve’s centre into the seed as φ(0) = w₀. Untick for a symbolic w₀.`,
        detail: `Seed the workspace with the selected φ(0) = w₀ substituted in as an exact rational (centroid of the poles by default; set manually under Map parameters). Removes w₀/w̄₀ from the variables — 2 fewer for elimination / Gröbner — and the same value is substituted into any univalence constraint added later (e.g. the star form's φ − w₀). Untick for the fully-symbolic system.`,
      },
      'alg-real-apply': {
        section: `Assume`,
        short: `Identify v̄ ≡ v for the picked variables — the biggest tractability lever.`,
        detail: `Assert the chosen variables are real (z̄ⱼ ≡ zⱼ, …) and re-seed. This substitutes each variable's conjugate away, simplifying the system — often the difference between an intractable and a feasible Gröbner basis. Pick the variables, then click to regenerate.`,
      },
      'alg-gauge-elim': {
        section: `Reduce`,
        short: `Eliminate one shared variable between the gauge equation and every other, at once.`,
        detail: `Eliminate a variable between the gauge equation and every other equation at once (one shared variable each). Because the gauge is linear in the A_{j,1}, this applies the gauge normalization throughout.`,
      },
      'alg-groebner': {
        section: `Reduce`,
        short: `Gröbner basis of the current column in the order set under Advanced.`,
        detail: `Compute a Gröbner basis of the selected equality nodes (or, with no selection, the current column) — the multivariate generalization of the resultant — in the monomial order set under Advanced. To remove variables instead, use "Eliminate picked variables" above. Buchberger over ℚ(i) with the Gebauer–Möller criteria + sugar selection; runs off the main thread (cancellable). A cost blow-up suggests assuming variables real or using the CAS export.`,
      },
      'alg-dimension': {
        section: `Analyze`,
        short: `Dimension and solution count of the current equality system.`,
        detail: `Report whether the equality system has finitely many solutions (zero-dimensional) and, if so, the solution count with multiplicity — the quotient-ring dimension of a grevlex Gröbner basis.`,
      },
      'alg-solve': {
        section: `Analyze`,
        short: `Numeric solutions of the current system (Gröbner → FGLM → roots).`,
        detail: `Solve the equality system numerically: a grevlex Gröbner basis → FGLM to a lex basis → if it is in shape position, the univariate factor is solved by Durand–Kerner and back-substituted; otherwise it falls back to Möller–Stetter eigenvalue solving (the multiplication matrices of the quotient ring), which handles any radical zero-dimensional system. Solutions print to the console; truly unsolvable systems (positive-dimensional, or past the size cap) report why (route to the CAS bridge).`,
      },
      'alg-bifurc': {
        section: `Analyze`,
        short: `Exact critical parameter values and the certified real-solution count on each interval.`,
        detail: `1-parameter bifurcation: the EXACT critical parameter values (eliminant border polynomial + Sturm isolation) and the CERTIFIED real-solution count (Hermite trace form) on each interval between them.`,
      },
      'alg-bifurc-var': {
        label: `Bifurcation parameter`,
        section: `Analyze`,
        short: `The real parameter to vary. Needs a 1-parameter family.`,
        detail: `The real parameter to vary. Reports how the number of real solutions (= quadrature domains) changes as this variable ranges over ℝ: the critical values where the count jumps, and the count on each interval. Needs a 1-parameter family — a system that becomes zero-dimensional once this variable is fixed.`,
      },
      'alg-classify': {
        section: `Analyze`,
        short: `Count the real solutions (= quadrature domains) of the current system, exactly.`,
        detail: `Existence / uniqueness: count the REAL solutions (= actual quadrature domains) of the current system via the Hermite trace form, plus distinct-complex / inconsistent / positive-dimensional verdicts`,
      },
      'alg-resolvent': {
        section: `Analyze`,
        short: `The univariate eliminant in the chosen variable; a repeated root signals a degeneracy.`,
        detail: `Resolvent / discriminant: the univariate eliminant χ_v(x)=det(x·I − M_v) of the current system in the chosen variable. squareFreePart = distinct v-values; a repeated root (discriminant 0) ⇒ coincident solutions / a degeneracy (e.g. a cusp). NB a repeat can also be fibre multiplicity if v does not separate the solutions.`,
      },
      'alg-resolvent-var': {
        label: `Resolvent variable`,
        section: `Analyze`,
        short: `The real variable to eliminate to.`,
        detail: `The real variable to eliminate to. The resolvent χ_v is the characteristic polynomial of multiplication-by-v on the quotient ring; its roots are v’s values across the solutions.`,
      },
      'alg-univalence': {
        section: `Analyze`,
        short: `Reconstruct each candidate φ and report how many real solutions are genuine QDs.`,
        detail: `Certify univalence: solve for the real solutions, reconstruct each candidate Riemann map φ, and test whether it is univalent (schlicht) on 𝔻 — reports how many real solutions are GENUINE quadrature domains (the rest are algebraic solutions whose φ folds or self-intersects)`,
      },
      'alg-real-auto': {
        section: `Assume`,
        short: `If h is real-axis symmetric, assume every base variable real in one step.`,
        detail: `Detect real-axis symmetry of h and, if the data is fully real, assume every base variable real in one step (the biggest tractability lever)`,
      },
      'alg-real-detect': {
        section: `Assume`,
        short: `Scan for forced-real, forced-imaginary or identified variables and offer one-click fixes.`,
        detail: `Scan the current equations for variable symmetries — a variable forced real (v − v̄ = 0, e.g. the gauge) or imaginary (v + v̄ = 0), or two variables identified (x ∓ y = 0) — and surface one-click suggestions`,
      },
      'alg-abbrev': {
        section: `Edit system`,
        short: `Apply the best detected substitution repeatedly until none remain.`,
        detail: `Repeatedly apply the highest-value detected substitution (repeated expressions / structural regularities) until none remain — abbreviate the whole system in one step`,
      },
      'alg-eq-conj': {
        section: `Edit system`,
        short: `Also add the conjugate equation, keeping the system conjugation-closed.`,
        detail: `In the conjugate model, also add the conjugate equation p̄ = 0 (keeps the system conjugation-closed for reim / existence analysis).`,
      },
      'alg-cas-dialect': {
        label: `CAS dialect`,
        section: `Export`,
        short: `Maple RCTD = the parametric real route; Singular / Sage = Gröbner cross-checks.`,
        detail: `Maple RCTD = parametric REAL triangular decomposition (RealComprehensiveTriangularize) — the fully-parametric uniqueness route; Singular / Sage = equality-ideal Gröbner cross-checks of the variety.`,
      },
      'alg-cas-params': {
        label: `CAS parameters`,
        section: `Export`,
        short: `Variable names to treat as parameters. Blank ⇒ non-parametric.`,
        detail: `Comma-separated variable names to treat as PARAMETERS — declared last for Maple RealComprehensiveTriangularize. Blank ⇒ non-parametric RealTriangularize.`,
      },
      'alg-copy-cas': {
        section: `Export`,
        short: `The chosen column as input for your own Maple / Singular / Sage — nothing runs in-browser.`,
        detail: `Copy the chosen column (above) as CAS input for the selected dialect (runs in your own Maple / Singular / Sage — nothing executes in-browser)`,
      },
      'alg-copy-derivation': {
        section: `Export`,
        short: `The active branch as a literate LaTeX derivation, one align block per column.`,
        detail: `Copy the active branch as a literate LaTeX derivation — one align block per column, each annotated with the transition that produced it + the active hypotheses`,
      },
      'alg-copy-latex': {
        section: `Export`,
        short: `Every equation in the session — all columns and branches — as one gathered LaTeX block.`,
        detail: `Copy EVERY equation in the session — all columns and all branches — as one gathered LaTeX block. For just the active branch, use Copy derivation.`,
      },
      'alg-copy-msolve': {
        section: `Export`,
        short: `The chosen column as msolve .ms input, to run offline.`,
        detail: `Copy the chosen column as msolve .ms input (over ℚ; complex coefficients become a variable i with i²+1). Run offline: msolve -f sys.ms -o out. Nothing executes in-browser.`,
      },
      'alg-copy-sympy': {
        section: `Export`,
        short: `The active branch as a runnable SymPy script.`,
        detail: `Copy the active branch as a runnable SymPy script — substitution steps are recomputed by SymPy from the previous column; engine reductions (Gröbner / resultant) are given as exact ℚ(i) literals`,
      },
      'alg-import-json': {
        section: `Export`,
        short: `Load a downloaded DAG JSON, rebuilding the whole workspace. Replaces the graph (undoable).`,
        detail: `Load a previously downloaded DAG JSON — rebuilds the whole workspace (nodes, branches, assumptions). Replaces the current graph (undoable).`,
      },
      'alg-rctd-json': {
        label: `RCTD paste box`,
        section: `Export`,
        short: `Paste the qd-rctd JSON from your Maple run; imports as a new RCTD column.`,
        detail: `Paste the parametric RealComprehensiveTriangularize result, serialized to the qd-rctd term-list JSON by the documented Maple post-script. Imports as a new RCTD column (one node per cell constraint / chain poly).`,
      },
      'alg-decompose': {
        section: `Reduce`,
        short: `Minimal primes — split the variety into irreducible components you can enter one at a time.`,
        detail: `Minimal primes: split the variety into its irreducible components, V(I)=⋃ₖV(componentₖ). The standard way out of a positive-dimensional (underdetermined) verdict — enter one component and analyze it alone; the branches\\' existence counts add up. Runs in a worker.`,
      },
      'alg-factor-scan': {
        section: `Reduce`,
        short: `Factor every equation and report which split; each becomes a one-click case column.`,
        detail: `Factor every equation in the current system and report which ones split — each becomes a one-click case column V(p)=⋃ₖV(fₖ). Equations past the in-browser factorizer caps are reported as UNDETERMINED, never as irreducible.`,
      },
      'alg-pin-data': {
        section: `Reduce`,
        short: `Substitute the solved nodes and principal parts as exact values, in one new column.`,
        detail: `Substitute the SOLVED quadrature data (the nodes a_j and principal parts C_{j,s}) as exact ℚ(i) values, in one new column. They are kept symbolic by default so the workspace describes the whole family; pin them to see what the specific domain collapses to — e.g. when a node sits at φ(0), the locator equation loses its (a−w₀) group and factors.`,
      },
      'alg-propagate-all': {
        section: `Reduce`,
        short: `Carry every univalence constraint into the current system, assumptions applied.`,
        detail: `Carry EVERY univalence constraint into the current system in one step, with all assumptions (reality, imaginary, fixed φ(0), pinned values) applied to each`,
      },
      'alg-regular-chains': {
        section: `Reduce`,
        short: `Saturated triangular decomposition — resolves the degenerate cases a Wu chain leaves implicit.`,
        detail: `Regular chains (saturated triangular decomposition): like Triangular decomp. above, but SATURATED by its initials — the degenerate cases where an initial vanishes are resolved rather than left as an unstated caveat, so back-substitution is sound on every branch. Runs in a worker.`,
      },
      'alg-saturate': {
        section: `Reduce`,
        short: `Remove the |z_j| = 1 boundary stratum, making the count the exact algebraic QD count.`,
        detail: `Saturate the current system by the Möbius denominators ∏(1−z̄_j z_j) — removes the |z_j|=1 boundary stratum the cleared (●)/(★) denominators carry, so the existence count becomes the EXACT number of algebraic quadrature-domain solutions (e.g. the unit disk 4 → 2). Safe: a genuine QD has |z_j|<1, so nothing genuine is dropped.`,
      },
      'alg-triangular': {
        section: `Reduce`,
        short: `Wu triangular chain — an alternative to Gröbner that exposes free variables and no-solution.`,
        detail: `Triangular decomposition (Wu pseudo-elimination) of the current system — an alternative to Gröbner that exhibits the solution structure (free variables, no-solution)`,
      },
      'alg-moments-go': {
        section: `Shape from moments`,
        short: `Exact Prony–Hankel reconstruction: QD-order, Prony polynomial, numeric nodes and weights.`,
        detail: `Exact Prony–Hankel reconstruction: the QD-order (Hankel rank drop), the exact Prony polynomial, and the numeric nodes/weights + a reconstruction residual.`,
      },
      'alg-autosolve': {
        section: `header`,
        short: `Auto-assume reality, propagate, then count and solve — each step a new column.`,
        detail: `Semi-autonomous: auto-assume reality (if h is symmetric), propagate linear consequences, then determine existence/uniqueness and the explicit real solutions — each step a new labeled column`,
      },
      'alg-seed': {
        section: `header`,
        short: `Build the original (●)/(★)/gauge system at column 0 from the current solve. Replaces the graph.`,
        detail: `Generate the original (●)/(★)/gauge system from the current bounded solve at column 0 (replaces the graph; assumptions are then added as columns)`,
      },
      'alg-seed-moment': {
        section: `header`,
        short: `Seed the Aharonov–Shapiro moment system for order-2 QDs. Needs no solve.`,
        detail: `Seed the Aharonov–Shapiro moment system: order-2 quadrature domains from their harmonic moments M₀, M₁ (symbolic — needs no solve; pin the moments via “Set values” to determine a specific QD)`,
      },
    },

    // ---- "?" help-popovers (HTML) -------------------------------------------
    help: {
      // App title — "What is this?" intro.
      intro:
        `<b>What is this?</b> A <b>quadrature domain</b> Ω is a region where the area integral of any
         analytic function f equals a linear combination of point evaluations of f and its derivatives,
         encoded by the <b>quadrature function h(w)</b>. This tool solves the <i>inverse</i>
         problem: given h(w) it finds the domain Ω and its conformal map φ(z), then analyzes the
         boundary (cusps, curvature, symmetry, accuracy).<br><br>
         <b>To start:</b> pick a <b>Preset</b> or <b>Thesis example</b>, drag the red poles on the plot
         to reshape Ω, and read the solution properties in the panel. The <b>Schwarz dynamics</b> and
         <b>Parameter slice</b> tabs enable further analysis. Press <b>?</b> for shortcuts.`,

      domainType:
        `<b>Domain type.</b> The quadrature identity Ω must satisfy.
         <b>QD</b>: classical (unweighted). <b>PQD</b>: power weight
         |w|<sup>2(α−1)</sup> (α on the card below). <b>LQD</b>: log weight 1/|w|².
         <b>Bounded</b> = finite Ω; <b>unbounded</b> = Ω reaches ∞.
         <b>Singular</b> = 0 ∈ Ω (φ gains a Blaschke factor); non-singular = 0 ∉ Ω.
         Classical QDs have no singular variant.`,

      hCard:
        `<b>Quadrature function h(w).</b> A rational function encoding the quadrature identity.
         Edit poles + residues structurally below, or enter a rational function
         in the textbox at the top. The inverse solver finds Ω whose
         quadrature identity matches h.`,

      mapParams:
        `<b>Map parameters.</b> The scalar knobs of the Riemann map, shown per family.
         <b>PQD power α</b> (PQD modes): the weight is |w|<sup>2(α−1)</sup>; α = 1 is
         classical. <b>Center φ(0)</b> (bounded families): the image of 0 ∈ 𝔻 — a free
         parameter (Manual, or Auto = pole centroid, recomputed as you drag a pole);
         implicit for unbounded families. <b>Residue q at origin</b> (singular LQDs,
         0 ∈ Ω): the residue of the log-weighted Schwarz function at w=0, linked to
         the finite poles and any polynomial part by a closed-form constraint. 
         The unbounded conformal radius c has its own control beside φ(z) in the
         Domain-type card.`,

      cCard:
        `<b>Conformal radius c = φ′(∞).</b> Unbounded QDs form a
         one-parameter family with respect to c — sweep the slider to explore it; past the
         critical c* the simply-connected QD ceases to exist (its boundary forms cusps,
         then self-intersections). <b>Estimate max c</b> finds c* automatically (bracket +
         bisection on the solver's univalence + identity gate), then caps the slider
         at c* and jumps to it — the extremal domain (its boundary just cusps).`,

      solverSettings:
        `<b>Solver settings.</b> The <i>Aggressiveness</i> preset
         (Quick / Standard / Thorough) balances Newton iterations, identity-check
         samples, and how many alternate branches are sought; fine-tune via
         <i>Search options</i>. Also here: the boundary-sample count, the
         vector-field overlay (Pólya h̄(w), or the family-specific external potential),
         the critical-set overlay, and <i>Auto-switch singular ⇄ non-singular PQD</i> 
         — which re-solves in the correct family when a PQD boundary crosses the origin.`,

      searchOptions:
        `<b>Search options.</b> Each phase is a distinct strategy for finding a φ
         consistent with h(w). Direct = single Newton from the initial guess;
         continuation = parameter-homotopy from a related solved scenario;
         multistart = many random seeds; diverse + deflation = explicit
         branch-finding.`,

      status:
        `<b>Status.</b> Live readout of the solver: convergence diagnostics,
         identity residual, univalence, and which branches succeeded.`,

      geom:
        `<b>Geometric properties.</b> Special univalence classes of the solved Ω,
         checked asynchronously after each solve. <i>Star-like</i>: every ray from
         the center (w₀ for bounded; ∞ for unbounded) stays in Ω
         — Re(z·φ′/(φ−w₀)) &gt; 0. <i>Convex</i> (bounded): Re(1 + z·φ″/φ′) &gt; 0.
         <i>Spiral-like</i>: a log-spiral generalization of star-like; λ is the
         optimal spiral angle. The hierarchy is convex ⟹ star-like ⟹ spiral-like,
         all ⟹ univalent.`,

      cusps:
        `<b>Boundary singularities.</b> Cusps of ∂Ω, found asynchronously after each
         solve. A cusp sits where the Riemann map's derivative vanishes on the unit
         circle, φ′(e<sup>iθ</sup>) = 0; the order m of that zero fixes the local
         <i>type</i> (p,q) = (m+1, m+2): m = 1 is the ordinary 3⁄2-power (2,3) cusp.
         A filled ● / magenta triangle marks an actual cusp; a hollow ○ marks an
         <i>incipient</i> one — a φ′-zero near but not yet on ∂𝔻, shown with its
         distance d (a "how close to a cusp" gauge). The (p,q) type is read exactly
         from φ's Taylor coefficients and cross-checked numerically.`,

      alternates:
        `<b>Alternate solutions.</b> When more than one φ satisfies the same h
         (multiple branches), the solver lists them here. Click an alternate to
         promote it to the primary.`,
    },

    // ---- Family hint blocks under the Domain-type card (HTML) ---------------
    familyHints: {
      pqdBounded:
        `<b>Power-weighted QD.</b> Bounded Ω, weight <code>|w|<sup>2(α−1)</sup></code>; <code>φ = (R<sup>#</sup>)<sup>1/α</sup></code>.
        <details><summary>Details</summary>
        <code>∫<sub>Ω</sub> f(w)·|w|<sup>2(α−1)</sup> dA = ∮<sub>∂Ω</sub> f·h dw</code>
        for real <code>α &gt; 0, α ≠ 1</code> (α=1 is the classical case). Riemann map
        factors as <code>φ(z) = (R<sup>#</sup>(z))<sup>1/α</sup></code>, where
        <code>R</code> is rational with poles at the preimages <code>z<sub>j</sub></code> of <code>p<sub>j</sub></code>.
        Realizability constraint: <code>C<sub>j,1</sub></code> must be large enough that
        the preimages stay inside <code>𝔻</code>.
        </details>`,

      pqdBoundedSingular:
        `<b>Bounded singular PQD.</b> <code>0 ∈ Ω</code>; φ gains a Blaschke factor pinned by the mass constraint.
        <details><summary>Details</summary>
        The Riemann map gains a
        Blaschke factor, <code>φ(z) = b<sub>z₀</sub>(z)·(R<sup>#</sup>(z))<sup>1/α</sup></code>,
        where <code>φ(z<sub>0</sub>) = 0</code> (the origin's preimage). No point
        charge: the <code>|w|<sup>2(α−1)</sup></code> weight makes the quadrature
        data unique, and the <b>mass/area constraint</b> (the <code>f=1</code> case
        of the identity) pins <code>|z<sub>0</sub>|</code>. <code>w₀ = φ(0) ≠ 0</code>
        is a non-origin interior point.
        </details>`,

      pqdUnbounded:
        `<b>Unbounded PQD.</b> Ω reaches ∞ (<code>0 ∉ Ω</code>); <code>φ = z·(r<sup>#</sup>)<sup>1/α</sup></code> on <code>𝔻*</code>, conformal radius c.
        <details><summary>Details</summary>
        Ω is unbounded with bounded complement K
        (<code>0 ∉ Ω</code>). The test class is <code>A₀(Ω)</code> (analytic,
        vanishing at ∞), so the weighted integral converges for all α &gt; 0.
        Riemann map <code>φ(z) = z·(r<sup>#</sup>(z))<sup>1/α</sup></code> on
        <code>𝔻*</code> with <code>r<sup>#</sup>(∞) = c<sup>α</sup></code>
        (conformal radius <code>c</code>, a user input). Supports finite poles
        and a polynomial part of any degree (pole at ∞), e.g. monomial
        <code>h = α·k·w<sup>k−1</sup></code> (Thm 4.5.3).
        </details>`,

      pqdUnboundedSingular:
        `<b>Unbounded singular PQD.</b> Ω unbounded with <code>0 ∈ Ω</code>; φ gains a Blaschke factor on <code>𝔻*</code>.
        <details><summary>Details</summary>
        The Riemann map gains a Blaschke factor,
        <code>φ(z) = z·b<sub>z₀</sub>(z)·(r<sup>#</sup>(z))<sup>1/α</sup></code> on
        <code>𝔻*</code>, where <code>z₀ ∈ 𝔻*</code> is the origin's preimage
        (<code>φ(z₀)=0</code>) and <code>r<sup>#</sup>(∞)=|cz₀|<sup>α</sup></code>.
        No point charge; z₀ is pinned by <code>r(z₀)=0</code> (Prop 4.6.3, h
        analytic at 0). c is the conformal radius.
        </details>`,

      lqdBounded:
        `<b>Log-weighted QD.</b> Weight <code>1/|w|²</code>, non-singular (<code>0 ∉ Ω̄</code>).
        <details><summary>Details</summary>
        <code>∫<sub>Ω</sub> f(w)/|w|² dA = ∮<sub>∂Ω</sub> f·h dw</code>.
        Non-singular only: requires <code>0 ∉ Ω̄</code>, so <code>w₀ = φ(0)</code> must be nonzero.
        </details>`,

      lqdSingular:
        `<b>Singular log-weighted QD.</b> <code>0 ∈ Ω</code>; residue q at the origin; <code>φ = γ·b<sub>z₀</sub>·exp(r#)</code>.
        <details><summary>Details</summary>
        Test functions
        <code>f ∈ L¹<sub>a</sub>(Ω; ρ₀)</code> automatically vanish at 0. Riemann map
        factors as <code>φ(z) = γ · b<sub>z₀</sub>(z) · exp(r#(z))</code>. The pole of
        <code>h</code> at the origin contributes residue <code>q</code> (complex);
        <code>q = 0</code> is the degenerate case with no log-charge.
        </details>`,

      lqdUnbounded:
        `<b>Unbounded log-weighted QD.</b> <code>0 ∉ Ω̄</code>, <code>∞ ∈ Ω</code>; <code>φ = c·z·exp(r#−r#(∞))</code> on <code>𝔻*</code>.
        <details><summary>Details</summary>
        Test functions <code>f ∈ L¹<sub>a</sub>(Ω; ρ₀)</code> vanish at <code>∞</code>.
        Riemann map: <code>φ(z) = c·z · exp(r#(z) − r#(∞))</code> on <code>𝔻*</code>,
        with conformal radius <code>c = φ′(∞)</code>. The <code>− r#(∞)</code>
        subtraction pins the leading coefficient at ∞ to exactly <code>c</code>.
        </details>`,

      lqdUnboundedSingular:
        `<b>Unbounded singular log-weighted QD.</b> <code>0 ∈ Ω</code> and <code>∞ ∈ Ω</code>; Blaschke factor + residue q.
        <details><summary>Details</summary>
        Test functions <code>f</code> vanish at BOTH 0 and ∞ (e.g.
        <code>w/(w−b)<sup>k</sup></code> for <code>k ≥ 2</code>, <code>b ∈ K</code>).
        Riemann map: <code>φ(z) = c·|z₀|·z·b<sub>z₀</sub>(z) · exp(r#(z) − r#(∞))</code>
        with <code>z₀ ∈ 𝔻*</code> the preimage of 0, and <code>q</code> (complex)
        the residue of <code>h</code> at the origin. <code>q = 0</code> is the
        degenerate case with no log-charge.
        </details>`,
    },

    // ---- Card hints (HTML) --------------------------------------------------
    hints: {
      hSum:
        `h(w) = Σ<sub>j</sub> Σ<sub>s=1..m<sub>j</sub></sub> C<sub>j,s</sub> / (w − a<sub>j</sub>)<sup>s</sup>.
         Enter complex values as e.g. <code>1+2i</code>.`,

      newHere:
        `New here? Pick a <strong>Preset</strong> below to start, drag poles
         directly on the plot to reposition them, and press <kbd>?</kbd> for
         keyboard shortcuts.`,

      polyPart:
        `Polynomial part of h(w) = Σ<sub>l=0..m<sub>∞</sub></sub> C<sub>∞,l</sub> w<sup>l</sup>.
         Quadrature nodes at infinity.`,

      alpha:
        `Weight is <code>|w|<sup>2(α−1)</sup></code> for any real <code>α &gt; 0</code>
         (<code>α ≠ 1</code>). <code>α &gt; 1</code>: weight vanishes at 0;
         <code>α &lt; 1</code>: weight blows up at 0 (the LQD-limit regime,
         <code>→ |w|<sup>−2</sup></code> as <code>α → 0⁺</code>). <code>α = 1</code>
         is classical QD — use the Classical group above.`,

      qResidue:
        `Complex residue of <code>h</code> at the simple pole at <code>w = 0</code>
         (the singular pole inside Ω). Dial via text or the |q| / arg(q) sliders.`,

      faberCard:
        `Faber polynomials F<sub>n</sub>(ζ) of the bounded complement K = ℂ∖Ω, read off φ's
         Laurent expansion at ∞. Their roots cluster inside K.`,

      qdEquationsCard:
        `The explicit algebraic system relating the quadrature data
         <code>{a<sub>j</sub>, C<sub>j,s</sub>, w<sub>0</sub>}</code> to the Riemann-map
         coefficients <code>{z<sub>j</sub>, A<sub>j,k</sub>}</code>. Pick a representation,
         then Generate; export as LaTeX or a CAS-ready JSON term list.`,

      algebraCard:
        `Symbolic workspace for the solved QD system below. Add assumptions and reductions —
         each becomes a new column. Hover any control for details, click <b>?</b> above for the
         full guide, or press the <b>?</b> key for the keyboard shortcuts.`,

      searchOptions:
        `Overrides for the aggressiveness preset. Leave a field blank to use
         the preset's default. Phase checkboxes are enabled by default.`,

      directProblem:
        `Given a Riemann map <code>φ : 𝔻 → Ω</code>, compute the quadrature
         function <code>h</code> for which <code>Ω ∈ QD(h)</code>. Supports
         bounded classical QD (polynomial and rational <code>φ</code>),
         unbounded classical QD (Laurent at ∞), and a numerical-fallback
         mode for arbitrary expressions.`,

      schwarzDynamics:
        `For a Riemann map <code>φ : 𝔻 → Ω</code>, the Schwarz reflection
         <code>σ(w) = conj(F(ψ(w)))</code> is anti-meromorphic in Ω and fixes
         <code>∂Ω</code>. This tab colors each <code>w ∈ Ω</code> by the
         smallest <code>n</code> for which <code>σⁿ(w) ∈ Ω^c</code> (the
         "fundamental tile"). Points whose orbit diverges to ∞ before
         re-entering <code>Ω^c</code> are flagged as the escaping set.`,

      coachmark:
        `<strong>On the plot:</strong> drag poles to reshape · double-click to add a pole · scroll to zoom · drag empty space to pan`,
    },

    // ---- Tooltips (title="" — PLAIN TEXT, no HTML) --------------------------
    tooltips: {
      weightQD: `Classical quadrature domain — unweighted area integral ∫_Ω f dA.`,
      weightPQD: `Power-weighted QD — weight |w|^(2(α−1)) in the area integral.`,
      weightLQD: `Log-weighted QD — weight 1/|w|² in the area integral.`,
      riemannSym: `Show / hide the symbolic form`,
      thesisSelect: `Curated canonical quadrature domains, each with an analytic oracle. Loading one frames the view, turns on the annotated-phenomena overlay, and shows a computed-vs-expected oracle card.`,
      estimateMaxC: `Estimate the critical conformal radius c* — the largest c with a valid unbounded QD. Sets the slider to c* (the extremal, just-cusped domain).`,
      criticalPoints: `Plot the w-plane images of {z : φ'(z) = 0}. Critical points inside the relevant disk (𝔻 for bounded, 𝔻* for unbounded) predict univalence loss; those near |z|=1 predict imminent degeneracy.`,
      curvature: `Color ∂Ω by its curvature |κ| (cool → hot). The hottest stretch marks the sharpest bend; κ → ∞ at a cusp. Reads the same data as the Geometry & accuracy panel.`,
      phenomena: `Annotate the phenomena the cusp / critical-set overlays don't: the harmonic-measure hot spot (the tip, where ρ = 1/(2π|φ′|) peaks), the maximum-curvature point on ∂Ω, and the domain's symmetry axes (dashed) with its dihedral (Dₙ) or cyclic (Zₙ) symmetry group.`,
      faberRoots: `Plot the roots of the Faber polynomials Fₙ of the bounded complement K (classical unbounded QD only). Roots cluster inside K. Teal circles = union of all roots up to N; violet diamonds = the single selected Fₙ. Drive N / the mode from the Faber polynomials card.`,
      openAlgebra: `Open this system in the Algebra tab — an interactive workspace for adding univalence constraints and eliminating variables (resultants).`,
      eliminateVars: `Remove the picked variables from the whole current system (exact; details below the buttons).`,
      qdeqFixW0: `Substitute the selected Riemann-map center w₀ = φ(0) into the equations as an exact rational, regenerating the system for that normalization (w₀/w̄₀ stop being parameters). The value comes from Map parameters ▸ "Riemann map center φ(0)" — the centroid of the poles by default, or your manual choice; changing it re-solves and regenerates here. Untick to keep w₀ symbolic.`,
      qdeqFormClassical: `Classical (forward) formulation: the principal-part block (★) computes the quadrature coefficients C_{j,s} directly from the Riemann-map coefficients A_{j,k} via the local power series of φ (no compositional inverse). The default.`,
      qdeqFormSchwarz: `Schwarz-function formulation: the (★) block is replaced by (★_S), which matches each C_{j,s} to the principal parts of the Schwarz function σ(w) at the quadrature node a_j = φ(z_j) — the inverse-direction dual of the forward block (via series reversion). Same solution variety, algebraically different polynomials; useful for cross-validation and matching the uniqueness literature. "Open in Algebra workspace" seeds whichever formulation is selected here.`,
      fit: `Fit view to data`,
      reset: `Reset view`,
      dock: `Dock the panel into the sidebar (clear the plot)`,
      collapse: `Collapse panel`,
    },

    // ---- Overlay legend notes (.ov-note — HTML) ----------------------------
    notes: {
      criticalPoints: `zeros of φ′ — red inside, orange near ∂Ω`,
      curvature: `|κ| on ∂Ω, blue → red (→ Geometry &amp; accuracy)`,
      phenomena: `tip · max-κ · symmetry axes`,
      faberRoots: `roots of Fₙ — cluster in K (UQD only)`,
    },

    // ---- Faber-polynomials card (HTML help + whole-sentence messages) -------
    faber: {
      help:
        `Faber polynomials F_n(ζ) of the bounded complement K = ℂ∖Ω. For a classical ` +
        `unbounded QD the solved map φ is the EXTERIOR map of K, so the F_n are read off ` +
        `φ(z) = c·z + c₀ + c₁/z + … directly. Their roots cluster inside K ` +
        `— tick "Plot roots on domain" to overlay them. The capacity ` +
        `cap(K) = c = φ′(∞). High orders are ill-conditioned; non-convergence is flagged.`,
      pending: `solving… Faber analysis pending`,
      unavailablePrefix: `Faber analysis unavailable: `,
    },

    // ---- Quadrature↔map equation-system card (HTML help + messages) ---------
    qdEquations: {
      help:
        `For a classical BOUNDED QD the solved map ` +
        `φ(z) = w₀ + Σ Āⱼ,ₖ zᵏ/(1−z̄ⱼz)ᵏ and the quadrature function ` +
        `h(w) = Σ Cⱼ,ₛ/(w−aⱼ)ˢ are tied by an explicit polynomial system: a LOCATOR ` +
        `block φ(zⱼ)=aⱼ, a PRINCIPAL-PART (★) block giving each Cⱼ,ₛ from the Aⱼ,ₖ, and a ` +
        `gauge normalization that fixes the rotational freedom. Choose the conjugate ` +
        `model over ℚ(i) (z̄, Ā independent indeterminates) or the real/imaginary split ` +
        `(zⱼ=xⱼ+iyⱼ, …). Tick "Fix φ(0) = w₀" to bake the selected Riemann-map center ` +
        `(centroid of the poles by default) into the equations as an exact rational. ` +
        `"self-check" evaluates every equation at the numeric solution — it must be ≈0. ` +
        `"Open in Algebra workspace" hands the system to the in-browser elimination / ` +
        `Gröbner reducer (the Algebra tab); Export also feeds an external CAS.`,
      unavailablePrefix: `Equation generation unavailable: `,
      pending: `solving… equation system pending`,
    },

    // ---- Algebra workspace tab (HTML help + status messages) ----------------
    algebra: {
      help:
        `Symbolic workspace for the classical bounded QD system, organised as an AUDIT TRAIL ` +
        `of columns: column 0 is the original (●/★/gauge) system, and every assumption or ` +
        `reduction appends a new labeled column (the lane header names the step; the ` +
        `breadcrumb jumps between lanes). Reductions: Assume real (and one-click Auto when h ` +
        `is real-axis symmetric), Set values (fix variables to exact ℚ(i) values — each also ` +
        `fixes its conjugate — auto-propagating the linear cascade), select two nodes + a ` +
        `shared variable to Eliminate by Sylvester resultant, batch gauge elimination, ` +
        `“Gröbner basis” (the multivariate generalization; an “eliminate” list switches it to ` +
        `a lex elimination order), and Triangular decomposition (Wu). Select one equation to ` +
        `Attempt to factor it — V(p)=⋃V(fᵢ) — and pursue a factor as a new “case” column. ` +
        `Analyze the CURRENT (last) column: Existence / uniqueness counts the REAL solutions ` +
        `(= quadrature domains) via the Hermite trace form; Dimension / count and Solve ` +
        `(numeric); ★ Auto-reduce & solve chains the reductions and reports the verdict. ` +
        `Add univalence constraints (convex/star/spiral, φ′≠0, boundary injectivity, geometric ` +
        `borders). The φ / h reference shows the symbolic forms. Export as DAG-JSON, LaTeX, or ` +
        `Mathematica (a column, all columns, or one equation); the export also feeds an ` +
        `external CAS (Gröbner / RCTD) for systems beyond the in-browser engine.`,
      noSolve: `No classical bounded QD solved yet — solve one on the QD tab first.`,
      ready: `Ready — click “Generate / re-seed” to load the system.`,
      seeded: `Seeded`,
      unavailablePrefix: `Generation unavailable: `,
    },

    // ---- Analytic-oracle card (HTML help + whole-sentence messages) --------
    oracle: {
      help:
        `Curated canonical quadrature domains, each with an ANALYTIC ORACLE — the ` +
        `closed-form quantities a correct solve must reproduce (area, symmetry, cusps, ` +
        `c*, accuracy). Rows show computed vs expected: ✓ pass, ⚠ marginal, ✗ off. The ` +
        `c* row is verified on demand (it runs the conformal-radius estimator).`,
      pickExample: `— pick an example —`,
      pending: `solving… oracle pending`,
      noValid: `no valid solution to check against the oracle`,
      matches: `✓ matches the analytic oracle`,
      someDiffer: `⚠ some rows differ from the oracle`,
      verifyCmax: `Verify c* (slow)`,
      estimating: `estimating c*…`,
    },

    // ---- Thesis-example blurbs (HTML) --------------------------------------
    blurbs: {
      disk:
        `The simplest QD: h = 1/w gives the unit disk. Area π, constant curvature, ` +
        `uniform harmonic measure — an exact analytic baseline.`,
      twoPointSym:
        `h = 1.5/(w−1) + 1.5/(w+1): two equal poles at ±1. The domain is a symmetric ` +
        `oval with D₂ symmetry (a half-turn + two mirror axes).`,
      triangle:
        `Three equal poles at the cube roots of unity → a rounded triangle with D₃ ` +
        `symmetry (3-fold rotation + 3 mirror axes).`,
      square4pole:
        `Four equal poles at ±1, ±i → a rounded square with D₄ symmetry.`,
      cardioidUnbounded:
        `h = 1.5/w + 0.5/w² on the exterior. As the conformal radius c grows the ` +
        `boundary cusps at c* ≈ 1.46 (a Hele-Shaw / Polubarinova–Galin blow-up).`,
      deltoidUnbounded:
        `h = w² on the exterior → the deltoid (3-cusp hypocycloid). The QD branch ends ` +
        `at c* ≈ 0.5, where three Z₃-symmetric cusps form simultaneously.`,
      singlePoleUnbounded:
        `h = 1/(w−2): one simple pole off the origin. A smooth, mirror-symmetric ` +
        `exterior QD — the canonical one-pole unbounded example.`,
    },

    // ---- Solve-failure guidance (plain text) -------------------------------
    guidance: {
      noSolutionPrefix: `No quadrature domain found. Suggestions: `,
      tryHarder: `try the “Try harder (exhaustive search)” button or raise Aggressiveness`,
      lqd: `this h may have no log-weighted QD — try smaller residues, or adjust c`,
      pqd: `PQDs need a large-enough residue and an interior w₀ — try a bigger |C| or move w₀`,
      poles: `move poles away from each other and the boundary, or adjust residue magnitudes`,
    },
  };

  // Resolve a dotted path ("help.cCard") against S.
  function get(path) {
    if (!path) return undefined;
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), S);
  }

  // Populate every [data-str*] element from S. Safe to call multiple times.
  function apply(root) {
    if (typeof document === 'undefined') return;
    root = root || document;
    const each = (attr, set) => {
      const els = root.querySelectorAll('[' + attr + ']');
      for (let i = 0; i < els.length; i++) {
        const key = els[i].getAttribute(attr);
        const val = get(key);
        if (val == null) {
          if (typeof console !== 'undefined') console.warn('[ui-strings] missing key: ' + key);
          continue;
        }
        set(els[i], val);
      }
    };
    each('data-str',       (el, v) => { el.textContent = v; });
    each('data-str-html',  (el, v) => { el.innerHTML = v; });
    each('data-str-title', (el, v) => { el.setAttribute('title', v); });
  }

  S.get = get;
  S.apply = apply;
  QD.Strings = S;

})(typeof globalThis !== 'undefined' ? globalThis : this);
