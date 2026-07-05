# Frontier Roadmap — ComplexDynamicsJS

> **Purpose.** A prioritized, well-sourced catalogue of high-value *frontier* features and improvements — the ambitious, differentiating work, as opposed to incremental breadth. Companion to `FEATURE_RESEARCH.md` (whose §9 roadmap is now largely executed) and `PERFORMANCE_REVIEW.md`.
>
> **Method.** Compiled 2026-07-03 from a five-front parallel research effort (deep-zoom rendering algorithms · complex-dynamics mathematics · validated/rigorous numerics · visual/3D/animation/UX · an internal code-grounded audit), plus deep sub-investigations of the highest-value clusters (external-ray landing, the spider/Thurston algorithms, Yoccoz puzzles & renormalization, laminations & Hubbard trees, advanced coloring, 3D relief, export/palettes/WebGPU). ~50 primary sources, listed in §6.
>
> **One caveat.** The *ordering* depends on what this project is *for* — art tool vs. research instrument vs. teaching aid vs. deep-zoom flagship. §3 shows how the top of the list reshuffles per goal. The **honesty bundle** sits in the top tier under *every* goal. *(An earlier draft also listed DE normal-map shading here — but that shading is **already shipped** (#159–169), so it's removed; see §4 D1.)*
>
> **Correction (post-merge):** the initial draft flagged **DE normal / slope lighting** as a top unbuilt "cheap win." A code check found it **already shipped** — the research agent was fed a wrong "app lacks it" assumption. Entries below are corrected; the lesson (verify "missing" claims against code) is recorded in memory.
>
> **Provenance note on citations.** The §6 list was assembled by research agents from public web sources. Canonical papers/books/sites (Milnor, Douady–Hubbard, McMullen, Hubbard–Schleicher, mathr.co.uk, MROB, iquilezles.org, Ultra Fractal, MDN) are reliable; individual URLs should be spot-checked before formal citation.

**Effort key:** **S** = days (a weekend) · **M** = 1–2 weeks · **L** = multi-week · **XL** = month+/research-grade.
**Axis tags:** `[depth]` `[math]` `[rigor]` `[visual]` `[reach]`.

## Shipped from this roadmap so far (2026-07-03)
- ✅ **Honesty bundle** — the top `[rigor]` win, complete: precision-exhaustion warning at the perturbation ceiling (**#217**); box-count-dimension standard error + pixel-area resolution uncertainty (**#218**); reproducibility metadata stamped into exported PNGs (**#219**). Covers §4 **C1–C5**.
- ✅ **External-ray landing** `[math]` — the whole B1→B2 arc, now complete:
  - **B1 (θ→point):** the precise landing-point primitive `parameterLanding` (the component **root**, not its centre; Misiurewicz Newton-refined) (**#220**) + dynamical-plane `dynamicalLanding` and the go-to-angle true-landing readout (**#221**), then the **general parabolic-root Newton** (2×2 complex Newton on {fⁿ=z, (fⁿ)′=1}) that lands the deeper **non-cardioid** roots the closed form couldn't — e.g. the period-4 cascade root −5/4 (**#223**). Covers §4 **B1**.
  - **B2 (point→θ, the inverse):** `angleOfPoint.ts` — click a point → its external **angle(s)**, **valence**, and **biaccessibility**, by landing every low-period angle and clustering (**#224** pure finder; **#225** the "Angles of a point" console + snap-to-nearest + cyan overlay rays). Covers §4 **B2** and the first §2 downstream unlock.
  - *Remaining tail (deferred):* a purpose-built quadratic solver for high-rotation satellites (the general Newton is only linear there); forward-mapping the drawn rays under an active projection.
- ✅ **Yoccoz puzzles** (§4 **B5**) `[math]`, **Stages 1–3** — the first downstream unlock of external-ray landing:
  - **Stage 1:** the depth-_n_ puzzle graph on the dynamical plane (the α orbit-portrait rays pulled back n times, Θₙ = {θ : 2ⁿθ ∈ A}, q·2ⁿ rays in violet), a depth slider + a repelling-α gate (**#227**).
  - **Stage 2:** the **critical piece** — the puzzle piece containing the critical point 0, shaded in gold, that nests down toward 0 as the depth rises (**#229**). Inside K the pieces aren't angular sectors, so it's a CPU flood fill of {G < level} minus the rays, with the rays barriered to their landing cells (the pinch points of K) so the flood respects K's lobes.
  - **Stage 3:** the **parapuzzle** — the same angles as parameter rays on ∂M, alongside the puzzle (**#231**); plus its **critical piece**, the parapuzzle piece around the current c, by the same flood with each parameter ray **sealed to its exact wake-root landing** so the barrier reaches the pinch (**#233**).
  - *Deferred (diminishing returns — the puzzle is now complete on both planes, graph + critical piece):* the **tableau** grid (research-grade, niche), itinerary/kneading labels (the interior-sector subtlety again), and equipotential piece-caps (largely redundant — the flood already caps pieces at {G = level}).
- ✅ **DE relief lighting** (§4 **D1**) — found already shipped (#159–169); roadmap corrected (**#216**). Remaining delta = interior lighting + material controls.
- ✅ **GPU BLA traversal** (§4 **A1**) `[depth]` — the deep-zoom flagship, **complete**: the BLA table (#155) is packed into a float texture and traversed in the perturbation kernel, skipping many iterations at once. **~20× faster deep zoom and pixel-identical** (63.6 → 3.2 ms at a deep minibrot, reference orbit 12 985 long; `uBLANumLevels = 0` keeps the exact single-step path, so shallow/non-BLA renders are unchanged). **#235** proved the render loop in plain JS (`traverseBLA` reproduces the naive per-step escape count exactly); **#236** wired it into the GLSL kernel; **#238** exposed the **"fast deep zoom (BLA)"** toggle (on by default, `cdjs.bla`), a live skip-depth status note, and glossary/README/in-app docs — and **verified the pixel-identity in-browser** (bit-identical at accurate-reference centres in escape *and* smooth mode; an apparent divergence at a non-exactly-representable centre was traced to an f64-only reference orbit, which never occurs in real double-double use). Its base coefficients also set up general-f perturbation.
- ✅ **General-f perturbation — polynomials** (§4 depth) `[depth]` — deep zoom generalised past the hardcoded z²+c to **any additive-c polynomial** `f = P(z) + B·c`, at full BLA speed and pixel-identical. Staged, de-risk-first: **#240** z^d+c multibrot core proven in JS (binomial step); **#241** multibrots render on the GPU (byte-identical z²+c preserved); **#242** multibrot BLA (`A = d·Z^{d−1}`, ~40× speedup); **#243** the general-polynomial core (the step telescopes into `Σⱼ pⱼ·[(Z+δz)ʲ − Zʲ] + B·δc`, so no per-orbit coefficient texture is needed); **#244** general polynomials render on the GPU (`uPolyMode` branch); **#245** general-polynomial BLA (`A = P′(Z)`, radius `min_{k≥2}(EPS·|A|/|c_k|)^{1/(k−1)}`). Now z²+c, multibrots, `z³−z+c`, `z²+a·z+c`, non-monic like `2z²+c` all deep-zoom (test count 606 → 635). Rational/transcendental f remain deferred.
- ✅ **Laminations — pinched-disk model** (§4 **B6**) `[math/teaching]`, **Stages 1–2** (2026-07-05) — Thurston's combinatorial model, on both planes. **Dynamical (Julia) lamination** (**#247**): chords join the external rays that co-land on ∂K_c. Built **measured, not by the Lavaurs pull-back this plan proposed** — a pull-back needs the delicate critical-chord pairing (easy to ship subtly wrong), so instead we enumerate the (pre)periodic angles, land each with the shipped `dynamicalLanding`, and cluster the co-landing ones, so every leaf is verified by a real ray landing. Screen-space corner disk widget; repelling-α gate. **QML — quadratic minor lamination** (**#248**): the parameter-plane analogue on ∂M (co-landing *parameter* rays at component roots = minor leaves), verified by the distinctive property that every minor leaf spans a shorter arc ≤ 1/3. Oracles: basilica α-leaf {1/3,2/3} + −α {1/6,5/6}; rabbit triangle {1/7,2/7,4/7}; the period-2/3 minor leaves (test 635 → 650).
- ✅ **Polynomial matings** (§4 **B9**) `[math]`, **Engine Stages 1–2** (2026-07-05) — THE marquee feature, now computing *and* rendering verified matings. Took the **marked-point Thurston pullback** (Jung, arXiv:1706.04177 — iterate the *formal*-mating pullback; the postcritical points collide but the rational maps converge to R), **not** the deferred Medusa rectify/prune. **Stage 1** (**#249**, pure de-risk): `matingEngine.ts` mates any PCF quadratic with the **basilica**, giving the closed form g(z) = (z² − x₁)/(z² − 1); verified to reproduce z²+i ⊔ basilica = **exactly (z²+2)/(z²−1)** (Jung's example) and rabbit/corabbit ⊔ basilica = (z² − e^{±2πi/3})/(z²−1), and to refuse the obstructed basilica ⊔ basilica (test 635 → 664). **Stage 2** (**#250**): a "Render a mating" control draws the mated map's Julia set on the live sphere with the **Marty (spherical-derivative)** colouring — the natural rational-map-on-Ĉ picture (period mode flattens a single-attractor mating to one basin colour). **Stage 3** (**#252**): a **conjugation-symmetry gate** (x₁(c̄) = conj(x₁(c)) — pull back both c and c̄, accept only if conjugate) generalises the engine to **any hyperbolic p/q-bulb ⊔ basilica**, *trustworthily* — it refuses a wrong-basin capture (the airplane) rather than drawing it, so an arbitrary bulb is computed correctly or refused, never silently wrong; a "Render p/q ⊔ basilica" input drives it. **Stage 4 — general second parent** (**#254** engine, **#255** UI): mate **two arbitrary hyperbolic bulbs** p₁/q₁ ⊔ p₂/q₂ (no longer basilica-only) via the **Boyd–Henriksen normal form** F_{u,v}(z) = (v(u−1)z²−u(v−1))/((u−1)z²−(v−1)) — both critical values free, solved by the same pullback tracking *both* parents' postcritical orbits. Trustworthy: obstruction gated by **Tan Lei** (refuse conjugate limbs p₁/q₁+p₂/q₂=1), and the correct basin picked by **swap-consistency** (the mating is order-independent up to z↦1/z, i.e. (u,v)↦(1/v,1/u), which for a diagonal A⊔A is exactly u·v=1). Verified: rabbit ⊔ basilica through the general engine equals the shipped (z²−ω)/(z²−1) up to Möbius (same Milnor multiplier invariant); a "Render p₁/q₁ ⊔ p₂/q₂" input drives it (test 669 → 677). **Remaining tail:** a Misiurewicz second parent, the full slow-mating homotopy (would extend trustworthiness to Misiurewicz/edge cases too), then full Medusa (deferred specialist tail).
- *(This roadmap document was first persisted in **#215**.)*

---

## Five headline findings (the cross-axis convergences)

1. **The standout cheap win is the honesty bundle** `[rigor]` — high research-credibility value, weekend-scale, reuses existing hooks (`lastConnectivityRigorous`, capacity-`—`, neutral-λ). *(The original draft paired it with DE normal-map shading, but that is **already shipped**: #159–169 give `reliefSlopeAnalytic` — the `z/der` normal — plus Blinn-Phong and azimuth/elevation/depth controls. Only **interior lighting + material controls** remain; see §4 D1.)*
2. **One primitive unlocks a whole mathematics cluster** — *external-ray landing (θ→point)*. Angles-of-a-point, wakes/limbs, Yoccoz puzzles, and Hubbard-tree embedding all fall out of it, and it de-risks the spider algorithm and matings.
3. **The depth flagship — GPU BLA — is now wired** ✅ — `src/render/bla.ts`'s BLA table (#155) is packed into a float texture and traversed in the perturbation kernel (#235 JS de-risk, #236 GPU), giving **~20× faster deep zoom, pixel-identical** (63.6 → 3.2 ms at a deep minibrot). Its base coefficients also powered **general-f perturbation — now shipped for all additive-c polynomials** (#240–245).
4. **Depth and trust: the precision banner shipped (#217); glitch detection proved ~unnecessary here** — the perturbation δz recurrence is an *exact identity* (glitch-free by construction) plus rebasing, so the only residual is the dd-centre precision ceiling, already surfaced by the banner. (Verifying this against the code avoided re-proposing a solved problem.)
5. **WebGPU is a throughput/enabler play, not a precision fix** — both the depth and visual fronts independently concluded it is *parity, not speed* for this ALU-bound workload, and WGSL still has **no f64** ([gpuweb#2805](https://github.com/gpuweb/gpuweb/issues/2805)). Defer it; it does not buy deep zoom.

---

## §1 — Cross-axis priority tiers

### Tier 0 — Cheap wins (do first; punch far above their cost)

| Item | Axis | Effort | Why it's here / what it reuses |
|---|---|---|---|
| **Interior lighting + material controls** *(base DE relief lighting already shipped #159–169)* | visual | **S–M** | Light the set *interior* via interior-DE (the "fully-lit set"); expose ambient/specular/back-light (currently hardcoded). The exterior `z/der`-normal + Blinn-Phong lighting is done. Secondary (communication) goal. |
| **Honesty bundle**: precision-exhaustion banner · "N/A / not-rigorous" gating for general-f metrics · MC-area error bars (σ/√N) + Gronwall labelled a one-sided *upper bound* · box-count dimension SE + scale/bias caveat · reproducibility stamps on exports | rigor | **S** each | Closes the two worst credibility holes (silent deep-zoom noise; authoritative `≈` off-hypothesis). Reuses `lastConnectivityRigorous`, capacity-`—`, the neutral-λ tolerance, the dd-permalink serializer. |
| **Internal rays inside hyperbolic components** (+ internal-angle readout) | math | **S–M** | Reuses the multiplier map (uMode 12): solve λ_p(c)=r·e^{2πit}. Answers "where *inside* the bulb am I." |
| **Palette studio** (iq cosine palette + viridis/magma/cividis/cubehelix + OKLab stops + Okabe-Ito discrete + Fractint `.MAP` import) | visual | **S–M** | Palette control is the #1 user knob; all closed-form. Plugs into `paletteRGB`/legend (#209). |
| **DE ambient occlusion + soft shadows** | visual | **S–M** | Same shader as DE lighting; the "rendered not plotted" polish. |
| **Lyapunov-exponent shading** | visual | **S** | New uMode reusing the running derivative (`Σ log|f′|`). |
| **Guided tours / bookmarks / story sequences** | reach | **S–M** | Reuses saved-view permalinks + the keyframe interpolator. |

### Tier 1 — Foundational unlocks (each opens a cluster)

| Item | Axis | Effort | Unlocks / anchor |
|---|---|---|---|
| **External-ray landing (θ→point)**, both planes | math | **M** | **The linchpin.** Unlocks angles-of-a-point, wakes/limbs, Yoccoz puzzles, Hubbard-tree embedding; de-risks spider + matings. Reuses the `C_n/D_n` recurrences + `uniformize.ts`. |
| **GPU BLA traversal** ✅ **shipped** (#235–236, #238) | depth | **M–L** | 3–1000× fewer iterations → interactive deep zoom. `bla.ts` table (#155) packed into a float texture + traversed in the perturbation kernel; toggle + status + docs shipped. |
| **Pauldelbrot glitch detection** (+ precision banner) | depth ∩ rigor | **M** | "No silently-wrong deep pixels." Closes the deferred correctness gap. |
| **Multi-layer compositor** (blend modes + opacity + masks) | visual | **M** | Multiplies the value of all ~15 existing coloring modes (Ultra Fractal's signature). |
| **Tiled poster / hi-res export** (beat the 16384 texture cap) | visual | **M** | Reuses the dd centre + perturbation-aware export. |
| **Reference-orbit reuse while panning** (+ tiled references) | depth | **M** | Fixes the deep-zoom drag freeze. |

### Tier 2 — Marquee differentiators

| Item | Axis | Effort | Note |
|---|---|---|---|
| **General-f perturbation** — polynomials ✅ **shipped** (#240–245) | depth | **M–L** | Deep zoom for any additive-c polynomial `f = P(z) + B·c` (multibrots z^d+c, z³−z+c, z²+a·z+c, …) at full BLA speed, pixel-identical; shares `A₁=f′(Z), B₁=∂f/∂c` with BLA. Rational/transcendental still deferred. |
| **3D relief height-field ray-march** | visual | **L** | Share-bait "fractal landscape"; complements the sphere. WebGL2-feasible, single-precision. |
| **Deep-zoom zoom-movie pipeline** | visual | **M–L** | Exp-zoom + ref-orbit reuse + temporal AA + resumable. Maps to pending task #75. |
| **Spider algorithm** (θ → center / Misiurewicz) | math | **L** | "Type 1/7 → land on the rabbit's center," no starting guess. |
| **floatexp extended range + BigInt reference orbit** | depth | **M / M–L** | Push depth 1e28 → 1e300 → effectively unbounded. |
| **Orbit-trap image/texture mapping** | visual | **M** | "Photo in the fractal"; reuses existing traps + a sampler. |
| **Yoccoz puzzles + parapuzzle + tableau** | math | **M–L** | The MLC picture. Reuses ray+equipotential tracing + inverse-branch pullback. |
| **Lavaurs laminations / pinched-disk** ✅ **shipped** (#247–248) **+ Hubbard trees + kneading/internal-address** | math | **M** | Both laminations shipped (dynamical + QML), **measured** not by the Lavaurs pairing. Hubbard trees + kneading still open. Exact/measured combinatorics; complements orbit portraits. |
| **Parameter wakes/limbs overlay** | math | **M** | Rigorous ray-bounded regions from Farey labels. |
| **Multi-basin Fatou coloring** (rational) | math/visual | **M** | Maps to pending task #71. |
| **Full-image rank-order coloring** | visual | **M** | Auto-adapting contrast; refines the histogram mode. |
| **Shareable gallery + embeddable widget** | reach | **M** | Biggest *audience* multiplier; reuses precise permalinks. |

### Tier 3 — Moonshots & strategic

| Item | Axis | Effort | Note |
|---|---|---|---|
| **Polynomial matings on the live sphere** ✅ **engine+render+general-2nd-parent shipped** (#249–255) | math | **XL** | THE marquee research feature — computes *and* renders trustworthy matings for *any two hyperbolic bulbs* (⊔ basilica via the symmetry gate, or p₁/q₁ ⊔ p₂/q₂ via the Boyd–Henriksen F_{u,v} form + Tan Lei obstruction gate + swap-consistency). Took the **marked-point Thurston pullback** (Jung), not Medusa/raw Thurston. Tail = Misiurewicz 2nd parent + full slow-mating homotopy + full Medusa. Reuses the sphere mode. *(Pending task #73 "Schwarz/deltoid" folds in here — it's a degree-2 antiholomorphic mating, not a preset.)* |
| **Renormalization / tuning navigator** | math | **L marker / XL straightening** | "Mandelbrot in Mandelbrot." Ship the tuning-marker + internal-address label first; defer qc straightening. |
| **Interval / ball-arithmetic "Rigorous mode"** | rigor | **L–XL** | Certified membership/dimension/connectivity, opt-in overlay. Browser has no directed rounding → ulp-pad or WASM kernel. (dd is *precision, not proof*.) |
| **WebGPU compute backend** | depth ∩ visual | **L–XL** | Throughput + storage-buffers-for-BLA + enables 3D/video/layers. **Not** a precision fix. Defer. |
| **Near-parabolic / Siegel-boundary engine** | math | **M tractable / XL full** | Golden-mean boundary via the Fibonacci critical orbit is tractable; full Inou–Shishikura renormalization is research-grade. |
| **Mariani–Silver adaptive subdivision + DE interior early-out** | depth | **S–M** | Constant-factor multipliers, biggest on interior-dominated views. |
| **NanoMB2 · general Thurston realization · rigorous set-covering** | depth/math/rigor | **XL** | Specialist tail — defer. |

---

## §2 — Dependency map (where the leverage is)

```
external-ray landing (θ→point)  ──┬─→ angles-of-a-point / biaccessibility
   [Tier 1, math]                 ├─→ parameter wakes & limbs
                                  ├─→ Yoccoz puzzles + parapuzzle
                                  ├─→ Hubbard-tree embedding
                                  └─→ de-risks spider ─→ matings ✅ engine+render+general shipped (#249–252)

BLA base coeffs  A₁=f′(Z), B₁=∂f/∂c  ← write ONCE, shared by:
   ├─ GPU BLA traversal          [Tier 1, depth]  (table already built, #155)
   └─ general-f perturbation     [Tier 2, depth]

DE gradient (z', already emitted) ─→ DE normal lighting ─→ AO + soft shadows ─→ interior lighting / 3D relief
   [SHIPPED #159-169  →  Tier 0/2, visual]

glitch detection + precision banner = the depth ∩ rigor correctness convergence  [Tier 1]

WebGPU ──→ enables: BLA storage buffers · 3D relief · zoom-movie batch · layer compositing
   (strategic substrate, Tier 3 — do AFTER the above prove out in WebGL2)

honesty labels reuse existing hooks: lastConnectivityRigorous · capacity "—" · neutral-λ  [Tier 0]
```

Two structural takeaways: **build the BLA base coefficients once** (they serve both depth items), and **external-ray landing is the keystone** of the whole math cluster — sequence it first.

---

## §3 — How the top-5 reshuffles by north-star

- **Art / visual tool** → palette studio → interior lighting → layer compositor → 3D relief → zoom-movie pipeline → gallery. *(base DE relief lighting already shipped)*
- **Research instrument** → external-ray landing → honesty bundle → spider algorithm → Yoccoz puzzles → matings → interval "Rigorous mode."
- **Teaching tool** → internal rays → guided tours → honesty labeling → laminations/Hubbard trees → puzzles → wakes overlay.
- **Deep-zoom flagship** → GPU BLA → general-f perturbation → glitch detection → floatexp/BigInt → reference reuse → zoom-movie pipeline.

---

## §4 — Detailed catalogue (algorithms · oracles · anchors)

### A. Deep-zoom & rendering performance

- **A1 · GPU BLA traversal** — `[depth]` **M–L**. Precomputed table of linear maps `Δz ≈ A·Δz₀ + B·Δc` skipping many iterations at once. Merge: `A=Aᵧ·Aₓ`, `B=Aᵧ·Bₓ+Bᵧ`, `r=min(rₓ, max(0,(rᵧ−|Bₓ|·max|Δc|)/|Aₓ|))`; binary-tree table, O(M) entries. Base (z²+c): `A₁=2Z, B₁=1`. Pack as a float texture, traverse per fragment. **Half-built:** `src/render/bla.ts` + `test/bla.test.ts`; unwired (D2b). Benchmarks report 36× vs series approximation (Thompson). Sources: mathr "Deep zoom (again)", Thompson BLA.
- **A2 · General-f perturbation** — `[depth]` **M (poly) / H (rational)**. Symbolically expand `F(Z+z,C+c)−F(Z,C)`. Base coeffs `A₁=f′(Z), B₁=∂f/∂c` — **generalizes the BLA base directly**, so A1+A2 share machinery. Rebasing generalizes (reset when `|Zₘ+zₙ|<|zₙ|`; one reference per critical point). BLA works for non-analytic `abs` (Burning Ship) where series approximation fails. Hardcoded z²+c today at `shaderBuilder.ts:187`, `perturbation.ts:52`, gated by `probeMandelbrot()`. Sources: mathr deep-zoom, fractalshades `Perturbation_mandelbrot_N`.
- **A3 · floatexp extended range** — `[depth]` **S–M**. Store `z = mantissa·2^exp` so deltas below ~1e-308 don't flush to zero; renormalize periodically. Extends usable depth past ~1e300 *before* needing a bigger reference. Emulate with `vec2(mantissa,exp)` (model on the df64 scaffolding). Sources: mathr, fractalshades (Xrange).
- **A4 · Arbitrary-precision BigInt reference orbit** — `[depth]` **M**. Iterate only the *reference* in fixed-point native `BigInt` (benchmarks beat decimal.js and gmp-wasm); deliver Zₙ to the GPU as df64/floatexp texels. Depth 1e28 → effectively unbounded. Precision ≈ `log2(zoom)+guard`. Browser precedent `bigfloat` reached 1e-238 (Ambrose Cavalier). Do it in a Worker.
- **A5 · Pauldelbrot glitch detection** — `[depth]∩[rigor]` **Low/M**. Flag pixel when `|Z+z|² < G·|Z|²`, `G∈[1e-2,1e-8]`; recompute flagged pixels against an interior reference. Rebasing (#154) avoids most; a detector catches the rest → correctness backstop. Sources: mathr, Fractal Wiki perturbation.
- **A6 · Reference-orbit reuse across frames + tiled references** — `[depth]` **M**. Cache the reference; recompute only when a pan leaves its validity region; tile references at extreme depth. Fixes the deep-zoom drag freeze; reduces glitch density.
- **A7 · Mariani–Silver adaptive subdivision** — `[depth]` **S–M**. Compute only a rectangle's boundary; if uniform, flood-fill; else quadtree-subdivide. 1.3–6× on typical views, more on interior-dominated ones (you already detect those). CPU/compute scheduler, not fragment-native. Sources: MROB, canonizer/mandelbrot-dyn.
- **A8 · DE-guided iteration early-out** — `[depth]` **S**. Use the emitted DE (`hasDeriv`) + a `dzndz` stationary test to early-out interior pixels; feed auto-iterations. Cheap constant-factor. Sources: fractalshades `interior_detect`.
- **A9 · WebGPU compute backend** — `[depth]∩[visual]` **L–XL**. Storage buffers make the BLA table natural; timeline-free reference compute; ~2–3× on ALU-bound work. **No f64 in WGSL** — still needs df64/floatexp. Parity-not-speed; defer. Sources: gpuweb#2805, ACM IMC 2025.
- **A10 · NanoMB2 (chained-minibrot period skipping)** — `[depth]` **XL, defer**. Biseries skip an entire period near minibrots; record-depth only, fragile ("fails for many locations"). BLA captures most of the practical benefit.

### B. Complex-dynamics mathematics

- **B1 · External-ray landing (θ→point)** — `[math]` **M**. Ray-follow with `r_k = R^{1/2^k}` (radius → 1⁺) wrapping Newton on `f_c^k(z)−t_k=0` (dynamical) or `C_k(c)−t_k=0` (parameter), using `C_n=C_{n-1}²+c, D_n=2C_{n-1}D_{n-1}+1`; continuation-seed each depth; branch via `±√`. **Oracles:** ray 0→c=¼; {⅓,⅔}→−¾; ray 0→β; 1/7→root of period-3 bulb; even-denominator angles → Misiurewicz (1/2→−2, 1/6→i). Precision-bound (period 23/52/112 for single/double/quad) → reuses the df64 stack. Only *rational* angles land rigorously. Sources: Milnor arXiv math/9905169, Zakeri, Douady angles, Wikibooks ParameterExternalRay.
- **B2 · Angles-of-a-point (inverse) + biaccessibility** — `[math]` **M**. Co-landing iff itineraries under doubling agree; enumerate periodic angles of the point's period, land each (B1), cluster. Or orbit portraits for periodic points. **Oracle:** rabbit α-point ← {1/7,2/7,4/7}. Sources: Milnor, Jung stripping.
- **B3 · Internal rays inside hyperbolic components** — `[math]` **S–M**. Solve `λ_p(c)=r·e^{2πit}` (Newton-continue from the center λ=0). **Oracle:** cardioid internal angle p/q → root of the p/q satellite bulb (½→−¾). Reuses the multiplier map. Sources: Orsay Notes Ch.14, arXiv 2304.11231.
- **B4 · Spider algorithm (θ → center/Misiurewicz)** — `[math]` **L**. Pullback recurrence `x_i(t+1)=±√(x_{i+1}(t)−x₁(t))`, branch by path-continuation; `c=x₁(∞)`. No starting guess; ~6× slower than ray-following, linear convergence, needs ≥ period bits. **Oracles:** 1/7→rabbit c≈−0.1226+0.7449i; 1/6→c=i. Sources: Hubbard–Schleicher (Cornell PDF), mathr spider-with-a-path.
- **B5 · Yoccoz puzzles + parapuzzle + tableau** — `[math]` **M–L**. Depth-0 = equipotential cut by the q rays landing at α; depth-(d+1) = components of `f⁻¹(depth-d)` via `±√(z−c)`; parapuzzle = same cut in parameter space; tableau grid = critical/semi/off-critical annulus type per depth×orbit-point. Track pieces by itinerary, not geometry. Sources: Milnor arXiv math/9207220, McMullen §8.2, Jung embed.pdf.
- **B6 · Lavaurs laminations / pinched-disk model** — `[math]` **M**. ✅ **SHIPPED Stages 1–2** (#247 dynamical, #248 QML) — but built **measured, not by the Lavaurs pairing** the plan describes (which needs the critical-chord disambiguation, easy to get subtly wrong): enumerate the (pre)periodic angles, land each with the shipped `dynamicalLanding`/`parameterLanding`, cluster the co-landing ones → gap chords, so every leaf is verified by a real ray landing. **Oracle:** basilica leaf ⅓–⅔ + −α {1/6,5/6}; rabbit ideal triangle {1/7,2/7,4/7}; QML minor leaves all shorter-arc ≤ 1/3. Sources: Wikibooks Lavaurs, Thurston, arXiv 2101.08101.
- **B7 · Hubbard trees + kneading/internal-address** — `[math]` **M–L**. Abstract tree = postcritical points joined by regulated arcs, q-star bulb rule with rotation p/q; kneading from the doubling itinerary vs the {θ/2,(θ+1)/2} partition; internal address by Schleicher's algorithm. **Oracle:** rabbit tree = tripod; θ=22/127 → address 1→3→5→7. Sources: Schleicher arXiv math/9411238, Orsay Notes Ch.4, Bruin–Schleicher.
- **B8 · Parameter wakes/limbs overlay** — `[math]` **M**. Region between the two co-landing parameter rays of a component's root (B1). **Oracle:** period-2 wake bounded by {⅓,⅔} at −¾. Sources: Milnor arXiv math/9905169.
- **B9 · Polynomial matings on the sphere** — `[math]` **XL**. ✅ **Engine Stages 1–2 SHIPPED** (#249 pullback core, #250 render) via the **marked-point Thurston pullback** (Jung arXiv:1706.04177 — iterate the *formal*-mating pullback; the postcritical points collide but the rational maps converge to R), NOT Medusa's rectify/prune. `matingEngine.ts` mates any PCF quadratic with the **basilica** → g(z)=(z²−x₁)/(z²−1); verified z²+i ⊔ basilica = exactly (z²+2)/(z²−1), rabbit/corabbit → (z² − e^{±2πi/3})/(z²−1), basilica ⊔ basilica refused (obstructed); rendered on the live sphere in Marty (spherical-derivative) mode. **Stage 3 SHIPPED (#252):** a **conjugation-symmetry gate** (x₁(c̄)=conj(x₁(c))) generalises it to *any hyperbolic p/q-bulb ⊔ basilica*, trustworthily — refuses a wrong-basin capture (the airplane) rather than drawing it (`bulbCenter`/`mateBulbWithBasilica` + a "Render p/q ⊔ basilica" input). **Tail:** general 2nd parent; the full **slow-mating homotopy** (R_t = exp(2^{1−t}), would extend trustworthiness to Misiurewicz/edge cases); then full Medusa (specialist tail). Sources: Milnor mate03, Boyd–Henriksen Medusa (arXiv 1102.5047), Jung (arXiv 1706.04177), Chéritat qmate.
- **B10 · Renormalization / tuning navigator** — `[math]` **L marker / XL straightening**. Tuning `c=c₀∗c_h` via internal/external-angle correspondence; ship the small-M-copy marker + internal-address label first, defer qc straightening. **Oracle:** Feigenbaum c=−1.401155, δ=4.6692; −1∗−1=−1.310702. Sources: McMullen §7.4, Jung embed.pdf.
- **B11 · Near-parabolic / Siegel-boundary engine** — `[math]` **M tractable / XL full**. Draw the golden-mean Siegel boundary from the first F_n (Fibonacci) critical-orbit points — exponentially accurate by self-similarity; full Inou–Shishikura renormalization is research-grade. **Oracle:** θ=(√5−1)/2, approximants 1/1,1/2,2/3,3/5,5/8,… Sources: Buff–Chéritat (Annals 2012), McMullen Siegel self-similarity.
- **B12 · General Thurston realization** — `[math]` **XL, stretch**. Iterate σ_f on Teichmüller space; converges iff no obstruction; needs Levy-cycle detection + boundary-collision guard. Sources: Buff–Epstein–Koch–Pilgrim arXiv 1105.1763, Bartholdi–Nekrashevych.

### C. Rigor & validated numerics

- **C1 · Precision-exhaustion banner** — `[rigor]` **Low–M**. Detect via zoom-vs-mantissa budget (`log10(zoom)` vs dd's ~31 digits), delta underflow count, or reference-escape starvation; badge the affected plot. The single highest-value credibility fix. Sources: Heiland-Allen deep zoom.
- **C2 · "N/A / not-rigorous" gating for general-f metrics** — `[rigor]` **Low**. Per-metric validity predicate + three-state display (**rigorous** / **measured ≈** / **not-applicable —**), decided *before* computing. Capacity undefined for non-poly; dimension "measured (image)"; connectivity provenance via `lastConnectivityRigorous`; |λ| "measured, magnitude only" when symbolic f′ null.
- **C3 · Monte-Carlo area error bars** — `[rigor]` **Low**. `Â=A_box·p̂`, `SE=A_box·√(p̂(1−p̂)/N)`, report `±1.96·SE`. Label the Gronwall value a one-sided **upper bound** `area ≤ π(1−Σ k·b_k²)`. Pixel-count area is *biased* (shrinks with pixel size, not 1/√N). **Oracles:** Munafo 1.506591856±2.54e-8; Förstemann 1.5065918849(28). Sources: MROB, Förstemann, Ewing–Schober.
- **C4 · Box-count dimension SE + scale/bias caveat** — `[rigor]` **Low–M**. Report `D̂ ± SE(slope)` from the log–log fit (note OLS SE is optimistic — quantization violates independence); expose scales used + min/max slope over sub-windows; state finite-resolution bias. Sources: Phys. Rev. E 49:4907, Box-Counting Revisited (PMC).
- **C5 · Reproducibility stamps** — `[rigor]` **Low**. Embed f, dd-center, zoom, iterations, palette, method+assumptions, app+numerics version into exported PNG `tEXt`/`iTXt` (reuses the dd serializer); record MC seeds. Sources: reproducible-computing/metadata literature.
- **C6 · Koebe-¼ rigorous exterior DE bound** — `[rigor]` **M**. `d_lower = ¼·|Z|·log|Z|/|D|`; certify a pixel exterior when its half-diagonal < d_lower. Julia two-sided via Green's function `sinh(G)/(2e^G|G′|) < d < 2 sinh(G)/|G′|`. Certify *exterior* (safe); don't claim exact boundary. Sources: Wikipedia plotting algorithms (Koebe ¼), MROB DE, iq distancefractals.
- **C7 · Certified interior (period + |λ|<1, Krawczyk)** — `[rigor]` **Low honesty / M–H certified**. Honest: report attracting only when `|λ|<1−tol`, mark `|λ|≈1` neutral/undetermined. Certified: interval Krawczyk operator on `fᵖ(z)−z` proves a cycle exists + `|λ|<1`. Sources: certified-roots literature (Krawczyk).
- **C8 · Interval / ball-arithmetic "Rigorous mode"** — `[rigor]` **L–XL**. IEEE-1788 interval or Arb-style midpoint-radius arithmetic for guaranteed membership. **Browser crux:** no hardware directed rounding → ulp-pad in round-to-nearest, a BigFloat/BigInt kernel, or a WASM interval kernel. Scope as opt-in overlay on a coarse grid. **dd is precision, not proof.** Sources: Tucker *Validated Numerics*, Johansson Arb (arXiv 1611.02831), Rump INTLAB.
- **C9 · Rigorous covering + certified dimension/connectivity** — `[rigor]` **XL**. Interval-subdivide the plane into proven exterior/interior/undecided cells (rigorous cover); Hausdorff dimension via bounding the transfer-operator leading eigenvalue (Bowen); interval-certify each critical orbit for a *proof-level* connected/Cantor verdict. Certified-snapshot, not live. Depends on C8.
- **C10 · Capacity / Lyapunov confidence intervals** — `[rigor]` **M**. Capacity: spread of `a_d` across radii; anchor monic → exactly 1. Lyapunov: batch-means SE of `(1/N)Σ log|f′|` (autocorrelation-aware) + non-convergence flag.

### D. Visual, 3D, animation, UX

- **D1 · DE normal / slope lighting (2D)** — `[visual]` **✅ SHIPPED (#159–169)**. `reliefSlopeAnalytic` (shaderBuilder.ts) builds the normal from `u = z/der` (running derivative) scaled by depth; `shadeWithGradient` applies Blinn-Phong (Lambert + specular + hemisphere ambient); UI = `#light` + azimuth/elevation/depth; `dFdx/dFdy` screen-space fallback for non-holomorphic f. **Remaining delta (unbuilt, secondary/communication goal):** interior lighting (drive interior normals from interior-DE for a fully-lit set) + expose ambient/specular/back-light (hardcoded at `shaderBuilder.ts:826-829`). Sources: iq distancefractals, Hvidtfeldt lighting.
- **D2 · Palette studio** — `[visual]` **S–M**. iq cosine palette `color(t)=a+b·cos(2π(c·t+d))` (12 sliders); bake OKLab-interpolated stops to a 256-LUT; ship viridis/magma/cividis/cubehelix presets + Okabe-Ito for discrete overlays (rays/cycles) + Fractint `.MAP` import. Sources: iq palettes, Ottosson OKLab, Green cubehelix, Moreland color-advice.
- **D3 · DE ambient occlusion + soft shadows** — `[visual]` **S–M**. AO: march along the normal, `occ += (i·step − d(p+N·i·step))·falloff^i`. Soft shadow: `res=min(res,k·d/t)` toward the light. Same shader as D1. Sources: iq raymarchingdf.
- **D4 · Multi-layer compositor** — `[visual]` **M**. Render N coloring passes → FBOs; composite back-to-front with Porter-Duff/photo blend modes + opacity + masks. Multiplies the value of all existing modes. Sources: Ultra Fractal layers.
- **D5 · Tiled poster / hi-res export** — `[visual]` **M**. Tile ≤ MAX_TEXTURE_SIZE, offset the plane mapping per tile, `readPixels` → OffscreenCanvas → PNG; share the reference orbit across tiles for exact seams. Gate on real `MAX_TEXTURE_SIZE`. Sources: webgl2fundamentals large-images, Ultra Fractal render-to-disk.
- **D6 · Orbit-trap image/texture mapping** — `[visual]` **M**. Track the closest-approach orbit point to the trap; map its offset to UV; `texture(img,uv)`. Precompute a distance field from a B/W trap image (iq). Reuses existing traps. Sources: iq ftrapsbitmap, Ultra Fractal image traps.
- **D7 · 3D relief height-field ray-march** — `[visual]` **L**. iq terrain-march: step `t`, sample `h=escape/DE/trap(x,z)`, cross when `p.y<h`, linear-refine, shade with D1/D3. Single-precision, WebGL2-feasible. Distinct from Mandelbulb (`DE=0.5·log(r)·r/dr, dr=pow(r,power-1)·power·dr+1`). Sources: iq terrainmarching, Hart sphere-tracing.
- **D8 · Deep-zoom zoom-movie pipeline** — `[visual]` **M–L**. Exponential zoom `Z(t)=Z0·(Z1/Z0)^t`; reuse one reference orbit across a keyframe range; temporal AA / frame-blend; resumable via IndexedDB + WebCodecs. Maps to pending #75. Sources: Fraktaler-3 zoom sequences, fractalshades.
- **D9 · Full-image rank-order coloring** — `[visual]` **M**. CDF over *sorted unique* counts (= histogram with repeats ignored) → more high-count contrast. Refines the existing histogram mode. Sources: HPDZ colorizing.
- **D10 · Shareable gallery + embeddable widget** — `[reach]` **M**. `?embed=1` minimal canvas reading params from the URL (permalinks already serialize dd state); static curated gallery of {thumbnail, permalink}; oEmbed. Biggest audience multiplier. Sources: embeddable-widget best practice, Fractal Lab.
- **D11 · Guided tours / story / bookmarks** — `[reach]` **S–M**. Ordered permalinks + exponential-zoom fly-to (shares D8) + captions. Reuses saved-views. Sources: XaoS tours, Mandelbrot & Co POIs.
- **D12 · Accessibility pass** — `[reach]` **S–M**. Canvas `role="img"` + auto-derived `aria-label` ("Mandelbrot, center …, zoom 1e6, viridis"); full keyboard nav (Tab/arrows/±/Esc), `prefers-reduced-motion`. Sources: MDN img role, WebAIM keyboard.

### E. Internal backlog (from the code audit — smaller, self-contained)

Rational-map **exterior boundary overlay** (∞-basin connectivity); rational **V3 family** window; **transcendental families** (λeᶻ, λsin z) with hairs; **Hénon** real-2D slice; **Newton-on-parameter-space** basins; **interior DE on the Julia plane** (currently param-plane only, `interiorDE.ts:21`); **sphere follow-ups** (overlays-on-sphere, 1/z dual chart, turntable video, serialize sphere view); **overlays on projected views** (`forwardProject` written but parked, `projection.ts:64`); **z_prev/Phoenix** 2nd-order iteration ABI; **side-by-side compare** mode.

---

## §5 — Recommended first three moves + housekeeping

1. **The honesty bundle** (Tier 0, `[rigor]`) — a few days of labels/error-bars; removes the two failure modes that most undermine a *research* aid. Top pick for the research + teaching north-star.
2. **External-ray landing** (Tier 1, `[math]`) — the one foundational primitive; unlocks the largest downstream cluster (puzzles, wakes, Hubbard trees) — serves research *and* teaching.
3. **Internal rays inside hyperbolic components** (Tier 0, `[math]`) — cheap teaching win reusing the multiplier map. *(DE normal-map shading — the original #1 — is already shipped; interior lighting is the only remaining lighting delta, a secondary/communication item.)*

**Pending-task mapping:** #75 → D8 (zoom-movie pipeline); #71 → multi-basin Fatou coloring; #73 → folds into B9 matings (it's a mating, not a preset).

---

## §6 — Citations

### Deep-zoom & rendering
- mathr (Claude Heiland-Allen): [Deep zoom theory & practice](https://mathr.co.uk/blog/2021-05-14_deep_zoom_theory_and_practice.html) · [Deep zoom (again) — BLA + rebasing](https://mathr.co.uk/blog/2022-02-21_deep_zoom_theory_and_practice_again.html) · [Perturbation glitches (2014)](https://mathr.co.uk/blog/2014-03-31_perturbation_glitches.html) · [Kalles Fraktaler manual](https://mathr.co.uk/kf/manual.html) · [At the Helm of the Burning Ship](https://mathr.co.uk/helm/AtTheHelmOfTheBurningShip-Paper.pdf)
- Phil Thompson: [Faster Mandelbrot with BLA](https://philthompson.me/2023/Faster-Mandelbrot-Set-Rendering-with-BLA-Bivariate-Linear-Approximation.html) · [Perturbation Theory](https://philthompson.me/2022/Perturbation-Theory-and-the-Mandelbrot-set.html) · [Series Approximation](https://philthompson.me/2022/Series-Approximation-and-the-Mandelbrot-set.html)
- [fractalshades — arbitrary-precision models](https://gbillotey.github.io/Fractalshades-doc/API/arbitrary_models.html) · K. I. Martin, SuperFractalThing white paper via [Fractal Wiki](https://fractalwiki.org/wiki/SuperFractalThing)
- [Munafo Mu-Ency — Mariani/Silver](http://www.mrob.com/pub/muency/marianisilveralgorithm.html) · [canonizer/mandelbrot-dyn](https://github.com/canonizer/mandelbrot-dyn)
- [Ambrose Cavalier — WebGL deep zoom (bigfloat, 1e-238)](https://ambrosecavalier.com/projects/gpu-deep-zoom/about/) · big-number benchmarks: [measurethat](https://www.measurethat.net/Benchmarks/Show/26506/0/bigint-vs-bignumberjs-vs-bigjs-vs-decimaljs), [gmp-wasm](https://daninet.github.io/gmp-wasm/)
- WebGPU: [gpuweb#2805 (no f64)](https://github.com/gpuweb/gpuweb/issues/2805) · [ACM IMC 2025 WebGL→WebGPU](https://dl.acm.org/doi/10.1145/3730567.3764504) · [Chrome: from WebGL to WebGPU](https://developer.chrome.com/docs/web-platform/webgpu/from-webgl-to-webgpu)
- [Wikibooks — Fractals/perturbation](https://en.wikibooks.org/wiki/Fractals/perturbation)

### Complex-dynamics mathematics
- Milnor: [Periodic Orbits, External Rays and the Mandelbrot Set](https://arxiv.org/abs/math/9905169) · [Local Connectivity of Julia Sets (Yoccoz lectures)](https://arxiv.org/pdf/math/9207220) · [Pasting Together Julia Sets (mating)](https://www.math.stonybrook.edu/~jack/mate03.pdf) · *Dynamics in One Complex Variable*
- Douady–Hubbard: [Orsay Notes](https://pi.math.cornell.edu/~hubbard/OrsayEnglish.pdf) · Douady [Algorithms for Computing Angles](https://public.websites.umich.edu/~kochsc/douady.pdf) · *A proof of Thurston's topological characterization* (Acta 1993)
- Hubbard–Schleicher: [The Spider Algorithm](https://pi.math.cornell.edu/~hubbard/SpidersFinal.pdf) · Hubbard [Yoccoz theorems](https://pi.math.cornell.edu/~hubbard/Yoccoz.pdf) · [mathr — spider with a path](https://mathr.co.uk/blog/2020-02-04_spider_algorithm_with_a_path.html)
- Schleicher: [Internal addresses in the Mandelbrot set](https://arxiv.org/pdf/math/9411238) · [Rational parameter rays](https://arxiv.org/pdf/math/9711213) · Bruin–Schleicher [admissibility of kneading sequences](https://arxiv.org/abs/0801.4662)
- Zakeri: [External Rays and the Real Slice of the Mandelbrot Set](https://www.math.stonybrook.edu/preprints/ims02-02.pdf) · Romera et al. [drawing external rays limitations](https://onlinelibrary.wiley.com/doi/10.1155/2013/105283) · Jung [Core Entropy & Biaccessibility](https://web.ma.utexas.edu/mp_arc/c/14/14-4.pdf)
- Laminations/trees: [Unicritical Laminations](https://arxiv.org/pdf/2101.08101) · [Wikibooks — Lavaurs algorithm](https://en.wikibooks.org/wiki/Fractals/Iterations_in_the_complex_plane/Mandelbrot_set/lavaurs) · [Laminational models](https://arxiv.org/abs/1401.5123) · Bruin–Kaffl–Schleicher [Existence of Quadratic Hubbard Trees](https://www.mat.univie.ac.at/~bruin/papers/bkafsch.pdf)
- Matings: Boyd–Henriksen [Medusa Algorithm](https://backend.orbit.dtu.dk/ws/portalfiles/portal/51543208/1102.5047v1.pdf) · [Thurston Algorithm for quadratic matings](https://arxiv.org/pdf/1706.04177) · Tan Lei, *Matings of quadratic polynomials* (ETDS 1992)
- Renormalization: [McMullen, *Complex Dynamics and Renormalization*](https://people.math.harvard.edu/~ctm/papers/home/text/papers/real/book.pdf) · Jung [Renormalization and embedded Julia sets](https://www.mndynamics.com/papers/embed.pdf) · [From Hyperbolic to Parabolic along Internal Rays](https://arxiv.org/pdf/2304.11231)
- Siegel/near-parabolic: [Buff–Chéritat, Quadratic Julia sets with positive area (Annals 2012)](https://annals.math.princeton.edu/2012/176-2/p01) · [McMullen — self-similarity of Siegel disks](https://people.math.harvard.edu/~ctm/papers/home/text/papers/siegel/siegel.pdf) · [Chéritat's programs](https://www.math.univ-toulouse.fr/~cheritat/)
- Thurston pullback: [Buff–Epstein–Koch–Pilgrim, On Thurston's pullback map](https://arxiv.org/pdf/1105.1763) · Bartholdi–Nekrashevych [twisted rabbit](https://arxiv.org/pdf/math/0510082)
- [Wolf Jung — Mandel software](http://www.mndynamics.com/indexp.html) · rabbit c-value: [arXiv 1305.3542](https://arxiv.org/pdf/1305.3542), [Wikipedia Douady rabbit](https://en.wikipedia.org/wiki/Douady_rabbit)

### Rigor & validated numerics
- [MROB — Area of the Mandelbrot Set](http://www.mrob.com/pub/muency/areaofthemandelbrotset.html) · [Förstemann — MC area estimate](https://www.foerstemann.name/labor/area/Mset_area_MC_2016.pdf) · Ewing–Schober, *The area of the Mandelbrot set* (Numer. Math. 61, 1992) · [New Approximations for the Area](https://arxiv.org/pdf/1410.1212)
- Box-counting: [Box-Counting Dimension Revisited (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4758026/) · [Finite-sample corrections, Phys. Rev. E 49:4907](https://link.aps.org/doi/10.1103/PhysRevE.49.4907)
- Distance-estimate bounds: [Wikipedia — Plotting algorithms (Koebe ¼)](https://en.wikipedia.org/wiki/Plotting_algorithms_for_the_Mandelbrot_set) · [MROB — Distance Estimator](http://www.mrob.com/pub/muency/distanceestimator.html) · [iq — distance to fractals](https://iquilezles.org/articles/distancefractals/)
- Interval/validated: Tucker, *Validated Numerics* (Princeton 2011) · [Johansson — Arb](https://arxiv.org/abs/1611.02831) · [Rump — INTLAB](https://www.tuhh.de/ti3/rump/intlab/) · certified roots via the Krawczyk operator ([1901.10384](https://arxiv.org/pdf/1901.10384), [2402.07053](https://arxiv.org/pdf/2402.07053))
- Rigorous dimension: [Lower bounds on Hausdorff dimension of Julia sets](https://arxiv.org/pdf/2204.07880) · [Feigenbaum Julia set positive measure](https://link.springer.com/article/10.1007/s00222-020-00949-8)
- Reproducibility: [Reproducibility in Scientific Computing (NSF)](https://par.nsf.gov/servlets/purl/10075645) · [Role of Metadata in Reproducible Research](https://arxiv.org/pdf/2006.08589)
- Glitch/precision: mathr deep-zoom (above) · [Fractal Wiki — Perturbation theory](https://fractalwiki.org/wiki/Perturbation_theory) · [FractalShark](https://github.com/mattsaccount364/FractalShark)

### Visual, 3D, animation, UX
- Iñigo Quílez: [distance to fractals](https://iquilezles.org/articles/distancefractals/) · [palettes](https://iquilezles.org/articles/palettes/) · [orbit traps (geometric)](https://iquilezles.org/articles/ftrapsgeometric/) · [orbit traps (bitmap)](https://iquilezles.org/articles/ftrapsbitmap/) · [terrain marching](https://iquilezles.org/articles/terrainmarching/) · [Mandelbulb](https://iquilezles.org/articles/mandelbulb/) · [raymarching distance fields](https://iquilezles.org/articles/raymarchingdf/) · [Lyapunov fractals](https://iquilezles.org/articles/lyapunovfractals/)
- Hvidtfeldt (Syntopia): [DE lighting & coloring](http://blog.hvidtfeldts.net/index.php/2011/08/distance-estimated-3d-fractals-ii-lighting-and-coloring/) · [Mandelbulb DE](http://blog.hvidtfeldts.net/index.php/2011/09/distance-estimated-3d-fractals-v-the-mandelbulb-different-de-approximations/)
- [Hart — Sphere tracing (1996)](http://graphics.stanford.edu/courses/cs348b-18-spring-content/uploads/hart.pdf) · [9bitscience — raymarching distance fields](http://9bitscience.blogspot.com/2013/07/raymarching-distance-fields_14.html) · [da Silva et al. — real-time fractals (arXiv 2102.01747)](https://arxiv.org/abs/2102.01747)
- Coloring: [Wikipedia — Plotting algorithms](https://en.wikipedia.org/wiki/Plotting_algorithms_for_the_Mandelbrot_set) · [HPDZ — Colorizing (rank-order)](http://www.hpdz.net/TechInfo/Colorizing.htm) · [Stripe Average Coloring](https://en.wikibooks.org/wiki/Fractals/Iterations_in_the_complex_plane/stripeAC) · [Härkönen — smooth coloring thesis](https://archive.org/details/j-harkonen-on-smooth-fractal-coloring-techniques-masters-thesis-2007-hi-res) · [Heiland-Allen — practical interior distance](https://mathr.co.uk/blog/2014-11-02_practical_interior_distance_rendering.html)
- Palettes: [Ottosson — OKLab](https://bottosson.github.io/posts/oklab/) · [Green — cubehelix](https://www.mrao.cam.ac.uk/~dag/CUBEHELIX/) · [viridis](https://ggplot2.tidyverse.org/reference/scale_viridis.html) · [Moreland — color advice](https://www.kennethmoreland.com/color-advice/) · [Okabe-Ito](https://conceptviz.app/blog/okabe-ito-palette-hex-codes-complete-reference) · [cividis (PLOS ONE)](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0199239)
- Compositing/export/UX: [Ultra Fractal help](https://www.ultrafractal.com/help/) · [webgl2fundamentals — 32000² images](https://webgl2fundamentals.org/webgl/lessons/webgl-qna-how-to-render-large-scale-images-like-32000x32000.html) · [Fractint](https://en.wikibooks.org/wiki/Fractals/fractint) · [Fractal Lab](https://hirnsohle.de/test/fractalLab/)
- Accessibility: [MDN — img role](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/img_role) · [WebAIM — keyboard](https://webaim.org/techniques/keyboard/)

---

## Appendix — Architecture ceilings (from the code audit, for planning)

- **Deep-zoom precision ceiling ≈ 1e28**, capped by the double-double reference centre (`perturbation.ts`, `dd.ts`). df64 alone walls at ~1e12–1e13; perturbation's dd centre reaches ~1e28. No bignum; no precision-exhaustion warning (→ C1). Precision gate: `desiredPrecision()` at `glPlot.ts:826` (`DF64_THRESHOLD=8000`).
- **Perturbation now covers any additive-c polynomial** `f = P(z) + B·c` (shipped #240–245): the monic z^d+c path (`perturbationPoly.ts` binomial step) and the general-polynomial path (`polyStep` S_j recurrence, `uPolyMode` kernel branch) both deep-zoom on the GPU with BLA acceleration, pixel-identical. Rational/transcendental f still fall back to df64 (deferred — infinite/truncated series).
- **`bla.ts` table is GPU-traversed** (shipped #235–236) and generalised to `A = f′(Z)` for multibrots (#242) + general polynomials (#245).
- **WebGL2-bound throughout** — `GLPlot` *is* the backend (`glPlot.ts:456`); shaders are hand-assembled GLSL 3.00 ES strings. A WebGPU port = rewriting all shader codegen to WGSL + re-deriving the df64 `*uOne` optimization barrier. Parity, not speed.
- **Texture cap = MAX_TEXTURE_SIZE (16384 here)** — reference orbit capped at `min(maxIter, maxTextureSize)` (rebasing covers the overflow); histogram CDF *resampled* to fit (#211).
- **Single-precision-only render modes** (mutually exclusive with deep zoom by construction): Riemann sphere, log-polar/Poincaré projections, the interaction-preview warp/collar. They force single precision because the affine warp loses bits at df64 depth and the perturbation `dc` loses meaning.
