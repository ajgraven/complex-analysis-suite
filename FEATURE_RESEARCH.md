# Feature & Algorithm Research — Complex-Dynamics References

> Standing reference for **ComplexDynamicsJS**, compiled 2026-06-29 from a multi-agent survey of:
> **Tools** — Mandel (Wolf Jung, mndynamics.com), FractalASM / FractalStream / SaddleDrop / Mandelbrain (Cornell), the Medusa polynomial-matings tool (Cornell).
> **Papers** — Hubbard–Schleicher *Spider Algorithm*; arXiv:2109.06863v2 (Pfrang–Petrat–Reinke–Schleicher, transcendental spiders); Ratis Laude *Continuity of matings of Kleinian groups and polynomials* (arXiv:2411.08748) + Bullett–Penrose/Bullett–Harvey/Lyubich–Mukherjee Schwarz-reflection line.
> **Wikipedia** — Plotting algorithms for the Mandelbrot set, Julia set, Mandelbrot set, Complex dynamics, Orbit portrait, Siegel disc, Herman ring.
>
> Purpose: capture implementable algorithms (formulas, recurrences, oracles, pitfalls) + a prioritized feature roadmap, assessed against what the app **already has**. Companion to `PERFORMANCE_REVIEW.md`. The prioritized list is in **§9**; jump there for the roadmap, come back here for the how.

---

## 0. What the app already has (so "NEW" below is precise)

Engine: editable `f(z,c)` (AST → GLSL + CSP-safe compiled JS closures; symbolic ∂f/∂z, ∂f/∂c; Newton transform). Precision f32 → df64 → perturbation deep zoom (z²+c, double-double reference orbit + rebasing/glitch-free, ~1e28). Hybrid fast paths for z²+c / zⁿ+c.

Coloring: smooth (normalized iteration), histogram, exterior distance estimation (analytic + screen-space), orbit-trap (cross/point/line/circle/gaussian), domain, stripe average, triangle-inequality average, binary decomposition, period, multiplier-map; relief lighting (analytic + finite-diff normals); post-FX; gradient editor + palette rotation + colourblind palettes; boundary outline; equipotential contours; temporal AA.

Instruments: orbit + fate overlay; critical-orbit overlay; click-inspect (period via cycle detection, multiplier λ=∏f′, combinatorial rotation number, exterior DE); located-cycle overlay; nucleus finder (Newton on fᵖ(crit)−crit carrying dz/dc); external rays (parameter + dynamic, Newton-on-Böttcher, z²+c); Farey bulb labels + bulb ray pairs; exterior/Böttcher Laurent coefficients (any polynomial dynamically; z^d+c multibrot; rational w/ superattracting ∞) + boundary reconstruction; Julia-properties panel (connectivity, parameter type, fractal dimension, area, Lyapunov, capacity, symmetry, bounding region); rigorous Fatou–Julia connectivity via all critical points (Durand–Kerner); cardioid/period-2-bulb interior bailout; Newton root-basin coloring; auto-iterations.

UX/infra: places, permalinks, saved views, undo/redo, WebM/GIF export studio (morph/zoom/keyframes, scale bar, live `a` slider), KaTeX, guided tour, glossary, mobile/touch, PNG/clipboard export at arbitrary resolution.

Constraints: pure WebGL2 (no WebGPU); CSP-safe (no eval / new Function); GPU = per-pixel escape-time of one complex variable; heavy combinatorial/topological/iterative geometry runs on CPU (TypeScript, with `dd.ts` double-double + `compileComplex` closures + Durand–Kerner available); small trusted libs OK. Verify in-browser via `window.__views` (screenshots time out on the live canvas). New controls must fit a ~280–360px `.controls-pane` column.

Architecture: `src/render/` (glPlot, plotView, overlay, perturbation, dd, rays, farey, inspect, critical, uniformize, juliaProperties, jacobian, bla); `src/expr/` (ast, parser, evaluate, glsl, derivative, rational); `src/state/`; `src/ui/`.

---

## 1. Cross-cutting reusable infrastructure (build once, unlocks many features)

Three small CPU utilities + two one-line engine primitives recur across the feature list. Building these first makes most of §2–§8 cheap.

### 1.1 `conj` operator (antiholomorphic primitive) — **one-op engine change, enormous leverage**
Add `conj(z)` to the AST → GLSL (`vec2(z.x, -z.y)`) and JS closure (`compileComplex`). This alone unlocks: the **Tricorn/Multicorn** (`z̄²+c`) and **Mandelbar** families, and is the prerequisite for the entire *feasible* Kleinian-mating avenue (Schwarz reflections are anti-rational maps of `z̄`). Caveat: antiholomorphic f has an **anti-linear** derivative — no holomorphic ∂f/∂z; route any λ/Lyapunov/normal computations for these maps through the existing real **Jacobian** path (`jacobian.ts`), not the symbolic-derivative path.

### 1.2 `weightedBirkhoff.ts` — robust rotation numbers + quasiperiodicity test (~60 lines)
The Das–Saiki–Sander–Yorke weighted Birkhoff average. Superconverges (faster than any power of N) on smooth quasiperiodic orbits; powers Siegel/Herman detection and rotation-number readouts.
```
bump weight:   w(t) = exp( -1 / ( t^p (1-t)^p ) )   for t∈(0,1), else 0   (p=1)
weighted avg:  WB_N(g) = Σ_n ŵ_{n,N} g(z_n) / Σ_n ŵ_{n,N},   ŵ_{n,N}=w((n+½)/N)
rotation no.:  θ_n = arg( (z_{n+1}-ẑ)/(z_n-ẑ) ) ;  α ≈ WB_N(θ)/(2π)   (ẑ = center / fixed point / orbit centroid)
quasiperiodicity test: compare WB_N vs WB_2N — tiny diff ⇒ quasiperiodic (Siegel/Herman); O(1/N) ⇒ not.
```
Reuse `compileComplex` for fast CPU orbits. Oracle: golden-mean orbit ⇒ α = 0.6180339887….

### 1.3 `brjuno.ts` — continued fractions + Brjuno/Diophantine classification (~50 lines)
```
θ = [a₀;a₁,a₂,…], convergents pₙ/qₙ.
Brjuno sum  B(θ) = Σ_{n≥0} log(q_{n+1})/q_n   (finite ⇔ linearizable ⇔ Siegel disc exists, for quadratics — Yoccoz)
bounded type ⇔ aₙ ≤ M (nicest discs; boundary = quasicircle through the critical point)
conformal-radius estimate:  log r(θ) ≈ -B(θ) + O(1)   (Yoccoz/Buff–Chéritat)
```
Fuzz-test against known CFs (golden mean qₙ = Fibonacci). Powers the Siegel features. Caveat: every f64 is rational — you never detect a *true* irrational; you detect `||λ|-1|<δ` then *interpret* θ via its CF, flagging huge early partial quotients (Cremer-like, tiny/no disc) vs small (Siegel-like).

### 1.4 Inspector + fate-classifier extension (edit existing instruments)
Add the indifferent branch: after the existing cycle/λ computation, if `||λ|-1| < δ` → **indifferent**; θ = arg(λ)/2π; if θ≈rational(small q) → parabolic, else run `brjuno.ts`. Add the basin-vs-rotation-domain discriminator: attracting basin ⇒ consecutive iterates contract (`d_min→0`); Siegel/Herman ⇒ recurrent, non-contracting, bounded. This upgrades the existing "undetermined fate" bucket and the existing λ/rotation-number readout.

### 1.5 Already-available assets that make new items cheap
Running derivative `der` (→ normal-map lighting, interior DE). Inspector period + Newton-on-fᵖ(z)−z + λ (→ interior DE, periodicity bailout, Fatou-type label, orbit portraits). External-ray renderer (→ orbit portraits). Perturbation center `c*` (→ log-polar zoom). `compileComplex` + Durand–Kerner (→ inverse-iteration preimages, exact Misiurewicz points). `dd.ts` (→ spider precision, deep landings).

---

## 2. Rendering / plotting algorithms (mostly GPU; quick→moderate)

### 2.1 Interior distance estimation (interior DEM) — **NEW, marquee coloring**
Smooth, structurally meaningful shading of the *interior* (currently flat/period-only). Koebe-¼ quality inside hyperbolic components; pairs with relief/normal-map for a "carved" interior.

For parameter `c` with attracting cycle point `z₀` of period `p` (`f_c^p(z₀)=z₀`):
```
DE_interior = (1 - |dz|²) / | dcdz + dzdz·dc/(1 - dz) |
```
Accumulate over p steps starting at z=z₀ (order matters — use temporaries):
```c
// init: z=z0, dz=1, dzdz=0, dc=0, dcdz=0 ; repeat p times:
dcdz = 2*(z*dcdz + dz*dc);   // ∂²/∂z∂c f^p
dc   = 2*z*dc + 1;           // ∂/∂c  f^p
dzdz = 2*(dz*dz + z*dzdz);   // ∂²/∂z² f^p
dz   = 2*z*dz;               // ∂/∂z  f^p  (= multiplier λ)
z    = z*z + c;
```
Procedure: escape-time → if max-iter (candidate interior) → find period p (reuse `classifyOrbit`/`cyclePoints`) → Newton-refine z₀ on fᵖ(z)−z=0 (reuse inspector PR #106) → if `|dz|≤1` plug in.
- **Build:** GPU per-pixel for low period (cap p≤16, inline fixed-iteration Newton) **or** CPU progressive/worker for arbitrary p. Feasibility **Moderate** (GPU low-p) → **Moderate-Hard** (general-f/arbitrary p). Strongly reuses inspector code.
- **Oracles:** at a component **center** (superattracting nucleus) dz=0 ⇒ DE = 1/|dcdz| (finite, largest) — brightest interior pixel should sit at the nucleus our finder locates. Pitfall: rounding reports period 2p instead of p ⇒ overestimates distance (re-test smallest divisor period). Denominator (1−dz)→0 at parabolic roots ⇒ guard NaN.

### 2.2 Normal-map / "fake-3D" lighting via derivative normal — **Quick win**
The iconic embossed metallic look, free given our exterior `der`. Distinct lighting *law* from finite-diff relief; compare A/B and ship alongside.
```
der = 0; loop: der = 2*der*z + 1; z = z*z + c     // running derivative
u = z/der; u = u/|u|                               // unit normal (gradient of potential)
v = exp(i·angle·π/180)                             // light azimuth (deg)
t = (Re u·Re v + Im u·Im v + h) / (1 + h)          // h = light height ≈ 1.5
if t<0: t=0                                         // facing away ⇒ dark
brightness = t
```
- **Build:** pure fragment-shader addition (one normalize + dot). UI: azimuth + height + optional ambient/back-light, in `.controls-pane`. Needs large bailout (≥2¹⁶). Combine with §2.1 interior DE for a *fully-lit interior+exterior* (the killer combo). Feasibility **Quick win**. (If our analytic relief already uses z/der, this collapses to exposing height/ambient/back-light controls — verify.)
- **Oracle:** angle=45°, h=1.5 reproduces the canonical Wikipedia normal-map image.

### 2.3 General periodicity bailout in the GPU loop — **Quick win, perf**
Extend the cardioid/bulb-2 bailout to *all* hyperbolic components (period 3,4,5,…, minibrots). Directly attacks the "iterations × interior cost" diagnosis in `PERFORMANCE_REVIEW.md`.
```
xold=yold=0; period=0
loop: z=z²+c; iter++
  if |z - zold| < eps: iter=max; break        // trapped in a cycle ⇒ interior
  if ++period > 20: period=0; xold=x; yold=y  // periodic reference refresh (O(1) memory)
```
- **Build:** ~4 registers + one compare/iter in the escape loop; reuse the proven `eps = 1e-6·max(1,|z|)` tolerance. Gate behind a flag / high-iter only (adds mild GPU divergence). Must be byte-identical on the **exterior** (only ever converts max-iter pixels). Feasibility **Quick win**. **Improvement** (generalizes existing bailout).

### 2.4 Inverse-iteration Julia (IIM / MIIM) — **NEW, Moderate (scope z^d+c)**
Draw the Julia set as the closure of backward orbits `z ↦ ±√(z−c)`. Paints the *boundary* directly; excellent for thin/dendrite/Cantor sets where escape-time struggles, and for an animated reveal / the hover inset.
```
IIM (chaos game):  z = repelling fixed point ((1±√(1-4c))/2, pick |2z|>1); warmup ~50;
                   then loop: z = (random ±) csqrt(z-c); plot(z)
MIIM: BFS/DFS the binary preimage tree; prefer un-plotted pixels; cap preimages/pixel using
      the inverse-derivative |1/(2z)| so dense regions stop and sparse lobes fill; bound depth.
```
- **Build:** CPU point-cloud → coverage texture → blend over plot. Closed-form inverse only for **z^d+c** (d complex d-th roots); general f would need per-step all-roots solving (Durand–Kerner) — expensive, out of scope. Could power the existing Julia hover inset (#98–99). Feasibility **Moderate** (z^d+c). **NEW.**
- **Oracles:** c=0 ⇒ unit circle; c=−1 ⇒ basilica figure-eight; c=−0.123+0.745i ⇒ rabbit.

### 2.5 Mariani–Silver rectangle subdivision — **NEW, Moderate, throughput**
Compute only a rectangle's border; if uniform, flood-fill; else split (√2 aspect, halve, reuse shared borders). Wikipedia cites ~93% iteration reduction in flat regions.
- **Build:** awkward on pure-GPU (shades the whole quad). Best as **DE-guarded tile-skip**: coarse pass → if a tile's border DE ≫ tile diagonal, stencil/scissor it out so the deep loop never runs there. Combines with perturbation deep zoom. Feasibility **Moderate**; payoff concentrated at deep/high-iter scenes. Pitfall: a thin filament can cross a tile touching the border only at equal-count points ⇒ false fill — gate on min tile size + DE. **NEW.**

### 2.6 Exponential / log-polar zoom remap — **NEW, Moderate (still = Quick)**
Re-parameterize around the zoom target `c*` so a zoom-in is a linear shift along log-radius. Yields (1) buttery infinite-zoom videos with cross-frame reuse, (2) a gorgeous "exponential map" projection (set unrolled around a log-spiral).
```
screen (u,v) → plane:  θ = 2π u/W ;  ρ = ρ0 + (v/H)(ρ1-ρ0) ;  c = c* + exp(ρ)(cosθ + i sinθ)
video frame at zoom-time t: re-project a horizontal window centered at ρ = ρ0 + t (strip periodic in θ).
```
- **Build:** projection still = one remap in the fragment shader (**Quick**); zoom-video = strip cache + reprojection + export loop (**Moderate**). Aligns perfectly with perturbation (whole strip shares one `c*`; compute `c−c*` in high precision). Pair with temporal AA (extreme anisotropic stretch near center). **NEW.**

### 2.7 Housekeeping verifications (Quick)
- **Histogram CDF:** ensure coloring uses the *cumulative* fraction (color ∝ #pixels with ≤ this iteration count) ⇒ independent of max-iter. (B1.)
- **Smooth/normal-map bailout:** `ν = n + 1 − log₂(log|z|/log N)`; use large N (≥2¹⁶) for accurate fractional parts. (B2.)
- **Boundary scanning method (BSM):** flag pixel as boundary if a neighbor differs in iteration count — likely subsumed by our outline+DE; low priority.

---

## 3. Combinatorial instruments (CPU; the biggest *new* territory — Mandel's distinctive strength)

> All angle arithmetic must be **exact rational** (integer p/q); float angles break the doubling-map combinatorics. These are pure CPU + CSP-safe, a perfect fit for our TS layer.

### 3.1 Spider algorithm: external angle / kneading sequence → parameter `c` — **NEW, Moderate (lite = Quick)**
The inverse of our ray drawing: globally convergent, no initial guess (unlike our nucleus-Newton which needs a nearby click). Lands centers (periodic angle) and **Misiurewicz points** (preperiodic angle).

**Normalization (critical):** paper uses `P_λ(z)=λ(1+z/2)²` (critical value 0, critical point −2). Convert to our `z²+c` by **c = λ/2**, with **λ = z₂** (the 2nd foot). Degree-d: `λ(1+z/d)^d`, angle map t↦d·t, inverse = d-th root, d sectors.

**Kneading sequence K(θ):** cut the circle at θ/2 and (θ+1)/2 into arcs A (contains θ) and B; itinerary of θ under doubling; K(θ) has a `∗` iff θ periodic. Tells you which sector each preimage must lie in.

**Spider:** `{ feet: Complex[n], legs: Complex[][] }`, n=preperiod+period; standard start = feet at roots of unity `e^{2πi·2^{j-1}θ}`, straight radial legs. The map σ_θ pulls back: `z = −2 ± 2√(z_{j+1}/λ)`, branch chosen by the **algebraic intersection number** `I(leg γ₁, segment [z₂, z_{j+1}])` (signed crossings; parity selects the √-branch) — *not* the naive principal root (that gives the wrong homotopy and silently lands a different root). Lift legs as polylines; recursively subdivide a hyperbola arc if it "encloses" a foot (3 inequalities: same side as −2; z_{j+1},0 on opposite sides of the chord line; subtended angle < π/2); **prune** redundant vertices each step.

**Iterate** from the standard spider until `max_j|z_j^{(m+1)}−z_j^{(m)}| < tol`; return c=λ/2; optionally Newton-polish in dd. **Obstruction detection (cheap, no geometry):** if the periodic part of K(θ) has period strictly dividing θ's period, feet collide ⇒ no injective convergence ⇒ report Thurston obstruction (e.g. 9/56, 27/60) instead of spinning.
- **Build order:** **spider-lite** (feet-only, intersection-number sectors, no leg polylines — Quick win, ~100 lines) → full spider (leg lifting, Moderate) → Misiurewicz finder (preperiodic branch) → dd-Newton polish. New `src/render/spider.ts`. Ties to `rays.ts` (same θ) + `critical.ts` (Durand–Kerner) + bulb labels.
- **Oracles:** 1/3 & 2/3 → c=−0.75; 3/7 & 4/7 → c=−7/4; period-3 roots = roots of c³+2c²+c+1=0 (airplane −1.7549, rabbit −0.1226+0.7449i, corabbit conj); 1/7→rabbit, 2/7→corabbit; **1/6 → c=i** (Misiurewicz, preperiod 1 period 2); 4/15 periodic period 4 (K=AAB∗₂).

### 3.2 Stripping algorithm: internal address ↔ kneading ↔ external angles — **NEW, Moderate (flagship symbolic layer)**
Turns "I know the internal address `1-2-4` / kneading sequence" into the characteristic external angles θ⁻,θ⁺ (and via §3.1 the landing parameter + the drawn component/rays). Recursive over the address; each step computes `β1=α⁻/2, β2=α⁺/2, β3=(α⁻+1)/2, β4=(α⁺+1)/2`, branches when `α⁻<β1<α⁺`, takes preimages by the A/B rule, records the unique n-periodic angles. Equivalent "with strips" formulation: wake W bounded by α± rays; `U_n=f⁻¹(W)`; pull back recording n-periodic rays when `U_1⊄W`.
- **Build:** new `src/combinatorics/` module, rational arithmetic; render result via the existing ray drawer. Feasibility **Moderate**. Handle branching + Bruin–Schleicher admissibility + early returns.
- **Oracles:** `1-3 → {1/7, 2/7}`; `1-3-6 → {10/63, 17/63}`.

### 3.3 Core entropy & biaccessibility dimension — **NEW, Moderate/Research (flagship readout)**
For a PCF parameter/angle, `h = log λ`, biaccessibility `B = h/log2` (Thurston: `h(c)=log2·B_top(c)`), λ = Perron–Frobenius eigenvalue, λ∈[1,2].

**Thurston angle-pair matrix (easier — only needs doubling + rationals):** `post(θ)` = doubling orbit; states S = unordered pairs of postcritical angles; for a pair {x,y}, if non-separated by the critical diameter (joining θ/2,(θ+1)/2): `A{x,y}={σx,σy}`; else split at the crossed critical leaves and sum. λ = leading eigenvalue via **power iteration** `v←Av, λ=lim‖v_{n+1}‖/‖v_n‖`.

**Hubbard-tree Markov matrix (alternative):** build the tree (regulated hull of the critical orbit), each edge maps onto adjacent edges (0/1; the central edge entry is 2 in the preperiodic case), λ = leading eigenvalue. Piecewise-linear shortcut: edge lengths λ,λ²,… + one matching equation.
- **Build:** `src/render/coreEntropy.ts`; reuse the inspector's angle + a small power-iteration. Pairs with the Julia-properties panel (which already shows Lyapunov/dimension). **Flagship:** the 1-D graph `B_comb(θ)` over θ∈[0,1] (Thurston's iconic entropy graph) and a 2-D coloring of M by `B_top(c)` (compute per-pixel on a worker). Feasibility **Moderate** (angle-pair) → **Research** (full tree/2-D map). Reducible/imprimitive matrices for renormalizable maps ⇒ use the irreducible block or just power-iterate a positive vector.
- **Oracles (1/3-limb):** θ=3/15 → λ⁴−λ²−1=0, λ=1.395337; θ=1/4 → λ=2^{1/3}=1.259921; θ=1/6 (c=i) → λ³−λ−2=0, λ=1.521380. General p/q-limb: β-Misiurewicz `xq−x^{q−1}−2=0`, primitive center `x^{q+1}−2x−1=0`, α-Misiurewicz `x^q=2`.

### 3.4 Orbit-portrait overlay — **NEW, Moderate**
For a repelling/parabolic cycle {z₁…zₙ}, draw the external rays landing at each cycle point + readout: **valence** v (rays/point), **rotation number** p/q (cyclic-order step of D^n on one Aⱼ), **characteristic arc** (shortest complementary arc; a complete invariant), primitive (r=1,v=2; cusp/baby-Mandelbrot) vs satellite (r=v≥2; parabolic bulb attachment).
```
P(O) = {A₁…Aₙ}, Aⱼ = external angles landing at zⱼ ; D:θ↦2θ sends Aⱼ→A_{j+1} preserving cyclic order.
```
- **Build:** reuse inspector cycle + the external-ray renderer; the new code is angle enumeration (rationals m/(2ⁿ−1)), landing-match to cycle points, and rotation-number arithmetic. Scope z²+c. Feasibility **Moderate**. Rays land only at repelling/parabolic points (Douady–Hubbard) — pick the repelling cycle.
- **Oracles:** rabbit fixed point A={1/7,2/7,4/7}, v=3, rot 1/3, D-cycle 1/7→2/7→4/7→1/7; basilica period-2 root angles 1/3,2/3.

### 3.5 Tuning / cascade navigator — **NEW, Moderate**
"Next center in the period-doubling cascade" and general p/q tuning jumps. Feigenbaum rescaling `x ← c_Fb + (x−c_Fb)/δ_Fb` (c_Fb≈−1.401155, δ_Fb≈4.6692) + Newton-refine (reuse nucleus finder); general tuning = Douady substitution on internal addresses/angles. A couple of buttons near the inspector.

### 3.6 Yoccoz puzzles — **NEW, Hard**
Partition the dynamic plane by the dynamic rays at the α-fixed-point angles + equipotentials, then pull back by f⁻ⁿ for depth-n pieces. We have equipotentials + z²+c rays ⇒ "ray-pair sectors ∩ equipotential annuli, then pull back." Mandel's mode 8 colors the 1/2,1/3,2/3 partition.

### 3.7 Spider convergence animation — **NEW, Moderate (teaching)**
Animate the spider feet/legs pulling back to the Julia set (legs → external rays landing at the critical orbit). Reuses the overlay renderer + §3.1. High wow-factor; ties rays + Julia set together.

---

## 4. New map families (engine extensions; high "benchmark parity" payoff)

### 4.1 Antiholomorphic — Tricorn / Multicorn / Mandelbar — **Quick win** (needs §1.1 `conj`)
Parameter plane of `z̄²+c` is the **tricorn**; `z̄^q+c` multicorns. One operator unlocks the whole family + the Kleinian door. Metrics/λ via the Jacobian path.

### 4.2 Quadratic rational families — **Moderate** (engine supports rational f)
Presets in named normal forms; the parameter plane is driven by the **critical orbit** (not z=0), so a general critical-point finder is the prerequisite (we have Durand–Kerner for poly f′; rational needs roots of the f′ numerator).
```
symmetric:  (z²+c)/(1+c z²)         (commutes with z↦1/z)
V2 (∞ is 2-periodic):  (z²+b)/(1-z²)
V3 (∞ is 3-periodic):  (z²+A)/(c²-z²),  A = c³-c-1
Chebyshev: (-z²+a+2)/(z²+a)          (Petersen transform of symmetric)
```

### 4.3 Newton-family parameter planes — **Moderate** (we have Newton dynamics, not its parameter locus)
Beyond our Newton root-basin coloring, render the *parameter* plane of Newton's method for a parametrized polynomial (the Newton connectedness locus). Plus **Mandelbrain polish**: auto-detect roots (Durand–Kerner) → auto-assign basin colors (Quick win on existing Newton mode).

### 4.4 Transcendental families (`λe^z`, `λsin z`) — **Moderate** (engine evals them; coloring differs)
Entire-map dynamics with hairs/escaping sets. Needs a different bailout (e.g. for e^z, escape ⇔ Re(z)→+∞; Julia often all of ℂ) and a non-Böttcher smooth coloring. arXiv:2109.06863v2 is the theory (filaments/dreadlocks generalize rays; external-address itineraries replace external angles) — **research-grade** for the combinatorics; the *rendering* is Moderate as a curated mode.

### 4.5 Hénon real-2D escape-time slice — **Moderate (MVP) / Research (full)**
Iterate (x,y)↦(1−a x²+y, b x), color by escape — a self-contained GPU shader (state = vec2) giving the `HenonK` picture for a fixed slice. The full ℂ² world (Siegel balls, unstable-manifold Julia sets, connectedness/horseshoe loci, monodromy — SaddleDrop) is genuinely 2-complex-dimensional and **out of scope**.

### 4.6 Riemann-sphere render mode for rational maps — **Moderate, broadly reusable**
Stereographic/orthographic sphere view with the ζ↦1/ζ chart (escape-time evaluated in two charts to stay accurate near ∞). Benefits rational-map readout, Newton basins, and is needed for matings (§6). We have `cintpow`/complex-sqrt GLSL + a 1/z-style Newton transform, so chart machinery is partly present.

---

## 5. Rotation domains — Siegel discs & Herman rings (CPU; extends "undetermined fate")

### 5.1 Siegel discs — detection & visualization
A Siegel disc is a Fatou component where f is conjugate to irrational rotation `w↦e^{2πiθ}w`. Occurs at an irrationally-indifferent fixed point (`|f'|=1`, θ∉ℚ) when θ is **Brjuno** (for quadratics, Yoccoz: Siegel ⇔ Brjuno; else Cremer, no disc). In our z²+c parametrization an indifferent fixed point of multiplier λ=e^{2πiθ} sits on the **main-cardioid boundary** at:
```
c = λ/2 − λ²/4,    λ = e^{2πiθ}        (also: cardioid c(θ) = ½e^{2πiθ} − ¼e^{4πiθ})
```
**Features (each reuses §1.2–§1.4):**
- **Indifferent-point readout** (Quick): inspector shows "neutral, θ=arg λ/2π, Brjuno? y/n, est. disc size ≈ e^{−B(θ)}".
- **Brjuno/CF calculator** (Quick): CF, Brjuno sum, Diophantine/bounded-type/Cremer verdict.
- **"Go to Siegel parameter"** (Quick): type θ (e.g. golden mean) → jump to c=λ/2−λ²/4; reuse places/permalink.
- **Weighted-Birkhoff rotation-number tool** (Quick): click → robust α + quasiperiodicity verdict.
- **Invariant-curve overlay** (Moderate): iterate seeds from the center outward, plot nested rotation loops; sweep radius until orbits leave the disc. Reuse orbit-overlay polyline.
- **Critical-orbit boundary overlay** (Moderate): for bounded-type θ, ∂U = closure of the critical orbit (contains the critical point) — iterate from the critical point, plot. Reuse `findCriticalPoints`. Gate to bounded type (general Brjuno boundaries can be non-locally-connected/fractal — warn).
- **Rotation-domain pixel layer** (Hard): per-pixel quasiperiodicity test (WB convergence) painting Siegel/Herman distinctly from attracting basins; debounced CPU like the Julia Tier-2 mask.
- **Oracles:** golden mean θ=(√5−1)/2, c≈−0.390541+0.586788i (quasicircle boundary through critical point; WB→0.6180339887). Cremer negative test: Liouville-like CF (huge early partial quotients) ⇒ disc size ≈0, don't draw.

### 5.2 Herman rings — annular rotation domains (rational maps, degree ≥3)
Annulus where f^p is conjugate to rotation of a round annulus; **no fixed point inside**. Polynomials/entire maps never have them; minimum degree **3** (Shishikura) ⇒ our default z²+c can't (good negative test). Detection mirrors Siegel but the orbit's distance-to-center has a strictly positive minimum (annular), and **both** boundaries are each accumulated by *some* critical orbit. Use the orbit centroid as center for WB; readout the annulus **modulus** mod=(1/2π)log(R_out/R_in).
- **Features:** Herman-ring example **presets** (Quick — just f strings the engine already parses), both-boundary critical-orbit overlay (Moderate), modulus+rotation readout (Moderate), Blaschke rotation-number solver (Moderate, bisection on the phase τ).
- **Oracles:** `f(z)=e^{2πiτ}z²(z−4)/(1−4z)`, τ=0.6151732 → ring with rot (√5−1)/2; degree-3 Blaschke `e^{2πi t_θ}z²(z−3)/(1−3z)`; period-2 example `z²(z−a)/(z−b)+c` with the listed a,b,c. Negative oracle: any degree-2 rational ⇒ no Herman ring.

### 5.3 Fatou-component-type label — **Moderate, high value-to-effort** (we already compute λ)
Classify the component under the cursor from the multiplier we already have: `|λ|<1`→attracting, `λ=0`→superattracting, `λ=e^{2πip/q}`→parabolic (q petals; Leau–Fatou flower), `|λ|=1` irrational→Siegel/Herman. A readout + a color-by-Fatou-type mode. Pairs naturally with the orbit-portrait bundle (§3.4).

---

## 6. Matings (CPU engine + sphere render; research-grade with feasible MVPs)

### 6.1 Theory (enough to scope)
Mating glues two filled Julia sets along their boundaries by `γ₁(t) ~ γ₂(−t)` (Carathéodory loops), producing a quadratic **rational** map. **Existence (Rees–Shishikura–Tan Lei):** PCF quadratics c₁,c₂ mate iff they are **not in complex-conjugate limbs** of M; the 1/3–2/3 (1/2-)limb is the unique self-conjugate one (so any c outside it self-mates). Polynomials named by rational angle θ: 1/7=rabbit, 1/3=basilica, 3/7=airplane, 1/2=z²−2 (segment), 1/6=z²+i (dendrite). q even ⇔ preperiodic ⇔ dendrite (empty interior).

### 6.2 The Medusa algorithm (Boyd–Henriksen) — Research-grade
Runs Thurston's pullback storing only finite curve-sampling data (a "double spider"). Normalized family `ℱ = {deg-2 rational : 0,∞ critical, F(1)=1}`; **Lemma 3.2 magic:** unique `F_{u,v}` with F(0)=u,F(∞)=v:
```
F(z) = ((u-1)v z² - u(v-1)) / ((u-1)z² - (v-1))
chart R_{a,b}(z) = (a z² + 1-a)/(b z² + 1-b),  a = v(u-1)/(u-v), b = (u-1)/(u-v)   ← mate_interact output
```
Step: u=s(x₁), v=s(y₁) (current critical values) → F_{u,v} → pull back the two-spider through g (angle doubling). Render: `pullback → rectify ("circlify" hyperbola arcs to circle arcs without crossing distinguished points) → prune`. Convergence: strongly mateable (not conjugate limbs + disjoint critical orbits) ⇒ (a_n,b_n)→(a,b). Pitfalls: **even-q dendrites diverge after a few steps**; conjugate limbs → refuse; postcritical collision → Teichmüller-boundary drift (rational maps may still converge while moduli degenerate). The rectify/prune is the hard part.

### 6.3 The easier alternative — Thurston marked-point pullback (recommended engine) — Hard
Track a few marked points x_i(t) on Ĉ normalized to {0,1,∞}; each map f_t(z)=m_t(z²); pull back `x_i(t+1)=±√[m_t⁻¹(…)]`, sign by continuity; "slow mating" inits with shrinking equipotential radius R_t=exp(2^{1−t}). Substantially simpler than Medusa's curve gymnastics. Obstruction signature: marked points collide.
```
x₁(t+1)=±√((x₁−x₂)/(1−x₂)),  x₂(t+1)=±√(2x₁/(1+x₁))   (example marked-point recurrence)
```

### 6.4 Feasible features
- **Conjugate-limb "mateable?" oracle** (**Quick win**, NEW, no engine): pick two c's/angles → "mateable?" via the limb test; highlight the conjugate limb (1/7–2/7 ⇒ shade 5/7–6/7); "self-mateable iff outside 1/3–2/3". Pure angle combinatorics on data we already compute (Farey/rays). High pedagogy, stepping-stone.
- **Mating mode (curated)** (**Moderate** MVP): ship a small table of precomputed (a,b) for ~8 classic matings (rabbit⊨basilica, rabbit⊨airplane, 1/5⊨1/5, Lattès 1/6⊨5/14, c_{1/4} self-mate) and render their **rational-map Julia sets** via the existing AST→GLSL rational path + a **sphere view** (§4.6). No Teichmüller code.
- **Full mating engine** (**Hard/Research**): §6.3 marked-point pullback for arbitrary θ₁,θ₂ → (a,b) → render; surface conjugate-limb/even-q/collision caveats.
- **Inverse-iteration painted-sphere** (**Moderate**, NEW technique): Medusa's Julia picture = pull back a 2-tone painted sphere (black=J(f₂) upper, white=J(f₁) lower) under R⁻¹; clean basin boundaries; the only sane way to show space-filling matings. Usable for any rational map.
- **Oracles:** rabbit⊨basilica (1/7⊨1/3); shared mating rabbit⊨airplane = 1/7⊨3/7=3/7⊨1/7; Lattès four-fold 1/6⊨5/14=3/14⊨3/14=3/14⊨1/2=5/6⊨1/2 (space-filling); z²+i⊨z²−1 → (z²+2)/(z²−1).

### 6.5 Kleinian-group matings (Schwarz-reflection avenue) — feasible door
Holomorphic correspondences (Bullett–Penrose 𝓕_a mating z²+c with PSL(2,ℤ)) are multivalued ⇒ render limit sets by **backward-iteration IFS** (Hard/Research). The **feasible** door is the **anti-holomorphic / Schwarz-reflection** realization (single-valued, GPU escape-time friendly):
- **Schwarz reflection** σ_Ω across a quadrature-domain boundary (deltoid, cardioid) is an anti-rational map of z̄ ⇒ iterate as escape-time (escapes to "tiling" region vs stays in filled-Julia). Visually a Tricorn-class picture. The **deltoid** = conformal mating of z̄² with the ideal triangle group; the **cardioid-and-circles** connectedness locus = part of the **Tricorn**.
- **Apollonian gasket** (Moderate, standalone): Julia set of a cubic critically-fixed anti-rational map ≅ Apollonian gasket ≅ deltoid Schwarz limit set; render by circle-inversion IFS / Descartes circle theorem.
- **Features:** anti-holomorphic `conj` (§1.1/§4.1) is the enabling primitive; Schwarz-reflection/deltoid explorer (Moderate); cardioid-and-circles ↔ Tricorn parameter map (Moderate); Apollonian/Kleinian limit-set overlay (Moderate, CPU IFS); Sullivan-dictionary explainer (Quick, KaTeX/glossary). Don't "render the theorem" (the assigned paper's analyticity/continuity results) — render the *parameter spaces* it studies (Mandelbrot/Tricorn-class loci, already feasible).
- **anti-Blaschke piece:** `B_d(z)=((d+1)z̄^d+(d−1))/((d−1)z̄^d+(d+1))` mated with the anti-Farey map.

---

## 7. Self-similarity & navigation (Mandel)

- **Misiurewicz self-similar ρ-snap** (**Moderate**, NEW): click a Misiurewicz point → compute ρ=(f^p)'(α) at the periodic endpoint (inspector already finds the cycle + f') → one-click "zoom by ρ" rescaling+rotating the view; rescale the dynamic pane by the same ρ (Tan Lei local similarity M↔K_c). Reuse the animation studio for the spiral zoom. Strong wow-factor.
- **Local similarity two-pane sync** (**Moderate**): z-zoom param + p-rescale dynamic by matching ρ.
- **Renormalization / embedded Julia sets** (**Research**): mark small-M and embedded-Julia structures K_M^{(m,p)} by period pair (Jung embed.pdf geometry).

---

## 8. FractalASM / FractalStream ideas (DSL & studio)

- **Parametric-curve (Bézier) parameter-animation studio** (**Moderate**, NEW): author a path in the parameter plane, render a movie sweeping c(t) along it (FractalASM `*-vary-*` movies). Reuse the WebM/GIF studio + coupling.setC + a path-editor overlay. Big UX win over linear/keyframe export.
- **Color-expression layer** (**Quick→Moderate**, enhancement): expose `iterations`, `stuck` (= didn't escape ⇒ in-set), `|z|`, `arg z`, last-z, `der`, `trap` as named quantities a small CSP-safe color expression can consume (FractalStream's `iterate … until …` / `stuck` abstraction). Lets power users build colorings without engine changes.
- **Newton-on-parameter-space basins** (**Moderate**, NEW viz): color each parameter pixel by which period-k center Newton converges to (FractalASM `Newton M-Period k`) — turns our single-point nucleus finder into a global picture. Small k on GPU; large k (center poly degree 2^{k−1}−1) Hard (reuse Durand–Kerner/far-field).
- **`ParamComp`** (**Moderate**, NEW primitive): pre-solve a derived quantity (attracting fixed point + multiplier) once per c before the per-pixel loop; inject as a uniform. Enables "distance to immediate basin", "iterate on the unstable manifold".
- **In-plane annotation primitives** (**Quick win**, NEW): `draw point/line/circle` + `write text` in model coordinates (FractalStream), surviving permalinks. Reuse the overlay canvas + KaTeX. Great for the export studio + tour.
- **Riemann-sphere Julia view** (Mandel) — see §4.6.
- **Marty / spherical-derivative coloring** (**Quick win**, NEW): color by the normality test `f^{n#}=|（f^n)'|/(1+|f^n|²)` — a Julia-set visualizer robust for rational/transcendental maps; reuses the running derivative.

---

## 9. PRIORITIZED FEATURE ROADMAP

> **Status (updated 2026-07-03): this roadmap is largely executed.** All of **Tier 1** and most of **Tier 2** shipped across PRs **#159–#193** (per-stage log in the `feature-research` memory). The tables below are kept for provenance, annotated **✅ shipped · ◧ partial · ◻ open/deferred**. For the *current* forward-looking roadmap (deep-zoom, rigor, new mathematics, visual/3D), see **`FRONTIER_ROADMAP.md`**.

Ordered by value-weighted effort. "Reuses" notes the existing asset that makes it cheap. Build the **§1 shared infra** as you go (it's tiny and unlocks clusters).

### Tier 1 — Quick wins (hours → ~1 day; high value, mostly reuse) — ✅ all shipped (#159–#169)
1. **`conj` operator → Tricorn / Mandelbar / antiholomorphic family** — one AST/GLSL/closure op; unlocks a whole family + the Schwarz-reflection/Kleinian door. *Highest leverage-per-line in the whole list.* (§1.1, §4.1)
2. **Normal-map / directional-light coloring** (u=z/der lighting law + azimuth/height/ambient controls) — reuses the running derivative; iconic look. (§2.2)
3. **General periodicity bailout** in the GPU escape loop — extends cardioid/bulb-2 to all components; perf + correctness; reuses the `1e-6·max(1,|z|)` tolerance. (§2.3)
4. **Fatou-component-type label** in the inspector (attracting/superattracting/parabolic/Siegel-Herman from the λ we already compute). (§5.3)
5. **Brjuno/CF calculator + indifferent-point inspector branch + "go to Siegel parameter"** (cardioid c=λ/2−λ²/4) — `brjuno.ts` + inspector edit + a navigation button. (§1.3, §5.1)
6. **Weighted-Birkhoff rotation-number + quasiperiodicity tool** — `weightedBirkhoff.ts`, tiny + robust. (§1.2)
7. **Conjugate-limb "mateable?" oracle** in the parameter plane — pure angle combinatorics; reuses Farey/rays; novel + pedagogical. (§6.4)
8. **More named "places"** (Seahorse/Elephant/Triple-Spiral/Scepter valleys, Feigenbaum, Misiurewicz tips) + exact Misiurewicz points via Durand–Kerner. (§2 appendix / §10)
9. **Marty spherical-derivative coloring** + **Mandelbrain Newton-basin auto-coloring** + **in-plane annotations** (three small independent wins). (§8)
10. **Housekeeping:** histogram-CDF + large-bailout verification; Sullivan-dictionary glossary entry. (§2.7, §6.5)

### Tier 2 — Moderate (a few days each; strong differentiation)
11. ✅ **Interior distance estimation** coloring — the marquee new coloring; reuses inspector period+Newton; pairs with #2 for a fully-lit interior+exterior. (§2.1) — shipped #170–171. *Julia-plane interior DE still open (`interiorDE.ts:21`).*
12. ◧ **Spider algorithm: angle/kneading → c** (spider-lite first, then full + Misiurewicz finder + obstruction detection) — the inverse of our ray drawing; `spider.ts`. (§3.1) — *"go-to-angle" navigation shipped (#175); the full spider realization + external-ray landing are open (`FRONTIER_ROADMAP.md` B1, B4).*
13. ✅ **Orbit-portrait overlay** (valence, rotation number, characteristic arc) — reuses ray renderer + inspector cycle. (§3.4) — shipped #172–174.
14. ✅ **Combinatorics console** (kneading ↔ internal address ↔ external angle, stripping algorithm) — the symbolic layer; draws the resulting component/rays. (§3.2) — shipped #67, #181.
15. ✅ **Core entropy & biaccessibility readout** (angle-pair matrix + power iteration) + optional **Thurston entropy graph**. (§3.3) — shipped #176.
16. ✅ **Inverse-iteration (IIM/MIIM) Julia** renderer (scope z^d+c) — crisp boundary/dust; could power the hover inset. (§2.4) — shipped #177.
17. ✅ **Rational-map family presets** (symmetric/V2/V3) + critical-orbit-driven parameter plane + **Riemann-sphere view**. (§4.2, §4.6) — shipped #182 (+ live sphere #192–193). *V3 window + multi-basin Fatou coloring open (task #71).*
18. ✅ **Siegel invariant-curve + critical-orbit boundary overlays**; **Herman-ring presets + detection + modulus**. (§5.1, §5.2) — shipped #178, #183.
19. ◧ **Exponential-map projection** (still = quick) + **log-polar zoom-video export** (aligns with perturbation). (§2.6) — projections shipped #184; *log-polar zoom-video export open (task #75).*
20. ◻ **Parametric-curve (Bézier) parameter-animation studio**. (§8) — open.
21. ◻ **Schwarz-reflection / deltoid explorer** (needs #1; renders via escape-time) + **Apollonian gasket** limit set (CPU IFS). (§6.5) — *research showed the deltoid/cardioid Schwarz map is a degree-2 antiholomorphic mating, not a `conj` preset (renders flat as escape-time); folded into the mating track (`FRONTIER_ROADMAP.md` B9). Apollonian still open.*
22. ✅ **Misiurewicz self-similar ρ-snap zoom** + Tan Lei two-pane local similarity. (§7) — shipped #180.
23. ◻ **Newton-on-parameter-space basins** (period-k nucleus basins as a picture); **tuning/cascade navigator**. (§8, §3.5) — open.

### Tier 3 — Hard / research-grade (flagship or later) — ◻ all open/deferred (updated scoping in `FRONTIER_ROADMAP.md` §4)
24. **Mating mode** — curated (a,b) table MVP rendering classic matings' Julia sets on the sphere (Moderate-ish), then the **Thurston marked-point pullback** engine for arbitrary θ₁,θ₂ (Hard). (§6.2–§6.4)
25. **Rotation-domain pixel layer** (per-pixel quasiperiodicity classification, Siegel/Herman vs basin). (§5.1)
26. **Mariani–Silver tile-skip** render acceleration (DE-guarded), payoff at deep/high-iter scenes. (§2.5)
27. **Yoccoz puzzles**; **renormalization / embedded Julia-set marking**. (§3.6, §7)
28. **Transcendental families** (λe^z, λsin z) with hairs; **Hénon real-2D slice** mode. (§4.4, §4.5)
29. **Kleinian correspondence limit sets** (Bullett–Penrose backward-iteration IFS); **full Medusa** rectify/prune. (§6.5, §6.2)
30. **Leau–Fatou petals**, **linearizing-coordinate grids**, non-locally-connected boundary handling. (§5.3, §3)

*Shipped since this table was written:* the **live Riemann-sphere render mode** (#192–193, superseding the §6a snapshot). The mating (24), Yoccoz-puzzle / renormalization (27), and transcendental / Hénon (28) items are re-scoped with concrete algorithms + oracles in `FRONTIER_ROADMAP.md` §4 (B5–B12).

### Already have / deliberately deferred (no action)
Smooth/histogram/exterior-DE/orbit-trap/domain/stripe/TIA/binary/period/multiplier coloring; relief + post-FX + equipotentials + boundary outline; external rays + Farey labels + bulb ray pairs (z²+c); Böttcher/exterior coefficients + boundary reconstruction; inspector (period/λ/rotation/exterior-DE); critical-orbit overlay; nucleus/center finder; rigorous all-critical connectivity; Julia-properties panel; Newton basins; perturbation + rebasing + glitch-free deep zoom; cardioid/bulb-2 bailout; auto-iterations; export studio; permalinks/saved-views/undo-redo; KaTeX/tour/glossary/mobile. **Perturbation series-approximation iteration-skipping** is the one classical sub-item not done — and it's the already-deferred **D2b** (GPU BLA traversal) in `performance-review` memory (narrow ≳1e25 payoff).

---

## 10. Consolidated oracles & test cases (for unit tests when building)

- **Spider/landing:** 1/3,2/3→c=−0.75; 3/7,4/7→−7/4; period-3 roots = c³+2c²+c+1=0 (airplane −1.7548776662, rabbit −0.1225611669+0.7448617666i, corabbit conj); 1/7→rabbit, 2/7→corabbit; **1/6→c=i** (Misiurewicz); 4/15 period-4 (K=AAB∗₂); obstructed angles 9/56 (1 curve), 27/60 (2 curves).
- **Core entropy:** 3/15→λ=1.395337; 1/4→λ=2^{1/3}; 1/6→λ=1.521380 (λ³−λ−2=0).
- **Orbit portrait:** rabbit fixed point {1/7,2/7,4/7}, v=3, rot 1/3; basilica period-2 root {1/3,2/3}.
- **Siegel:** golden mean θ=(√5−1)/2 → c≈−0.390541+0.586788i, WB α→0.6180339887; quasicircle boundary through critical point.
- **Herman:** e^{2πi·0.6151732}z²(z−4)/(1−4z) → ring rot (√5−1)/2; any degree-2 rational → no ring (negative).
- **Matings:** rabbit⊨basilica 1/7⊨1/3; rabbit⊨airplane = 1/7⊨3/7=3/7⊨1/7; Lattès 1/6⊨5/14 (space-filling); z²+i⊨z²−1→(z²+2)/(z²−1).
- **Interior DE:** brightest interior pixel of a component = its nucleus (dz=0 ⇒ DE=1/|dcdz|).
- **Inverse-iteration Julia:** c=0→unit circle; c=−1→basilica; c=−0.123+0.745i→rabbit.
- **Mandelbrot geometry:** cardioid c(θ)=½e^{2πiθ}−¼e^{4πiθ}; p/q bulb roots c(r)=(r/2)(1−r/2), r=e^{2πip/q}; period-q limb has q−1 antennae, diameters ~1/q².
- **Places:** Seahorse Valley −0.745+0.113i; Elephant Valley 0.275+0i; Triple Spiral −0.088+0.654i; Feigenbaum −1.401155+0i (δ=4.6692); Misiurewicz −0.10109+0.95628i and 0+i and −2+0i; real minibrot −1.7548+0i.

---

## 11. Key citations
- **Mandel / Jung:** mndynamics.com/indexp.html; core1.pdf (core entropy/biaccessibility), goettingen11.pdf (stripping), cmate/tmate/qmate.pdf (spider path / matings), embed.pdf (renormalization), thesis/hom.pdf (QC surgery). Wikibooks Fractals/mandel.
- **Spider:** Hubbard–Schleicher *The Spider Algorithm* (pi.math.cornell.edu/~hubbard/SpidersFinal.pdf); [BFH] J.AMS 1992; [DH] Acta 1993; Poirier 1993; Schleicher *Rational parameter rays* (arXiv:math/9711213).
- **Core entropy:** Gao–Tan (arXiv:1511.06513); Tiozzo (arXiv:1409.3511).
- **Matings:** Boyd–Henriksen *Medusa* (arXiv:1102.5047, CGD 16 2012); *Thurston Algorithm for quadratic matings* (arXiv:1706.04177); Rees/Shishikura/Tan Lei; Milnor (mating exposition); Cornell Matings hub.
- **Siegel/Herman:** Siegel 1942; Brjuno 1971; Yoccoz 1988; Buff–Chéritat (Acta 2006, Annals 2006 arXiv:math/0401044); Das–Saiki–Sander–Yorke weighted Birkhoff (arXiv:1706.02595, 1811.03148); Geyer (TAMS 2001); Fagella–Garijo; survey arXiv:2512.24118.
- **Kleinian matings:** Ratis Laude (arXiv:2411.08748); Bullett–Penrose 1994; Bullett–Harvey 2000; Bullett–Lomonaco (arXiv:1611.05257, 2010.04273); Lyubich–Mukherjee (arXiv:2310.03316); Lee–Lyubich–Makarov–Mukherjee (arXiv:1907.09107).
- **Transcendental spiders:** Pfrang–Petrat–Reinke–Schleicher (arXiv:2109.06863v2); Benini–Rempe (filaments); Rottenfußer–Rückert–Rempe–Schleicher (rays, finite order).
- **Wikipedia:** Plotting algorithms for the Mandelbrot set; Julia set; Mandelbrot set; Complex dynamics; Orbit portrait; Siegel disc; Herman ring. Practical: Chéritat (Toulouse wiki), mathr.co.uk (interior DE, deep zoom), MROB Mu-Ency.
- **FractalASM lineage:** Cornell FA/SD pages; FractalStream (github.com/matt-noonan/FractalStream, LANGUAGE.md).
