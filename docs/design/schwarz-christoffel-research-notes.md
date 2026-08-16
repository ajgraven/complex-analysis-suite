# Schwarz–Christoffel — research notes (working)

> **Status (2026-08): the engine is built** — roadmap step E landed (see the
> [build plan](schwarz-christoffel-plan.md)'s `v1 COMPLETE` banner), and the method-choice decision is now
> [ADR-0020](../DECISIONS.md#adr-0020-schwarz-christoffel-engine-lightning-seeded-disk-canonical-two-mode).
> The scoping notes below are preserved as the *pre-build* survey record.
>
> Working notes gathered while scoping the Schwarz–Christoffel (SC) engine for
> [`@cas/conformal`](../../packages/conformal) (roadmap step E; the second consumer ADR-0018 pre-committed a
> home for). Source: a four-thread literature + implementation survey and codebase investigation, 2026-08.
> These fed the [build plan](schwarz-christoffel-plan.md).

Convention used throughout: interior angle at vertex `k` is `αₖ·π` with `αₖ ∈ (0,2)`; the SC
exponent is `αₖ − 1`; the **turning exponent** is `βₖ = 1 − αₖ`. Convex corner ⇒ `0<αₖ<1`;
reentrant ⇒ `1<αₖ<2`. For a bounded simple polygon `Σₖ βₖ = 2` (total turning `2π`).

---

## 1. Confirmed scope (from Andrew, this session)

Settled over three question rounds; these are the binding inputs to the plan.

- **v1 domain class:** **bounded simple polygons** (convex **and** reentrant/nonconvex). Exterior,
  unbounded (vertices at ∞), circular-arc (generalized), and crowding-robust (elongated) are **staged
  later**.
- **Why SC at all** (given lightning already maps polygons numerically): **both** the exact SC
  *representation* (prevertices, exact corner exponents, accessory constants) **and** robust maps —
  recommend the balance. Resolved as *lightning-seeded SC* (§3).
- **Deliverable:** a clean **`@cas/conformal` package engine + hand-off**; Riemann-map app UI wiring
  is a **separate later step**.
- **Two accuracy tiers:** a **fast ~6–8-digit** mode (real-time interactivity — must warm-start) and a
  **near-machine-precision** mode, each for its own use case.
- **Serialization:** **package API only** — **no** `@cas/interchange` form this step (strict ADR-0007;
  interchange is the obvious *next* consumer, deferred).
- **Outputs:** **prevertices + accessory constants** *and* **conformal invariants** (modulus, conformal
  center); plus an honest residual/`≈` tag (project guardrail regardless).
- **Canonical domain:** the **unit disk 𝔻** (matches the existing `f: Ω→𝔻` / `g: 𝔻→Ω` API and the
  cleanest golden cases).
- **Precise-mode v1 "done":** **forward only** (𝔻→polygon; inverse is a fast-follow); **≥12-digit**
  forward, **≥10-digit** vs. the closed-form golden corpus; **~8–10:1 aspect ceiling** with honest
  degradation labeling past it (CRDT deferred).

---

## 2. The three method families (and why lightning-seeded SC wins here)

| Axis | **Classical SC** (Driscoll–Trefethen) | **Lightning / rational** (what we own) | **Zipper / geodesic** (Marshall–Rohde) |
|---|---|---|---|
| Solve | **nonlinear** parameter problem for prevertices | one **linear** least-squares (`lstsq`) | composition of `N` explicit elementary maps (no global solve) |
| Domain | polygons only | any Jordan domain (curved + polygonal) | any Jordan (curved, even fractal) from a point cloud |
| Needs angles | **yes** (inputs) | no (angle-agnostic) | no |
| Output | **exact analytic record** {αₖ, prevertices, A, C} | large rational map (100s of poles/coeffs) | numerical composition, no prevertices/angles |
| Accuracy | **~14–15 digits** (parameter problem solved) | ~6–8 digits (can stagnate ~6) | ~10⁻⁶ (geodesic) … 10⁻⁸ (zipper) at N=10⁴ |
| Both directions | forward natural; inverse a separate ODE+Newton | **yes, symmetric & cheap** | **yes, inverse for free** (compose inverses) |
| Crowding | the classic failure mode; **CRDT** defeats it | moderate elongation ok; extreme still plateaus | more tolerant (no global solve), not immune |
| Build burden | high (parameter problem + Gauss–Jacobi + inverse) | **already built** | moderate (branch bookkeeping, Newton inverse) |

**The decisive facts for us** (from the lightning-vs-SC thread):

1. Lightning is the *better numerical mapper* and is **already implemented** in
   [`lightning.ts`](../../packages/conformal/src/lightning.ts) /
   [`forwardMap.ts`](../../packages/conformal/src/forwardMap.ts).
2. The lightning fit **already computes the SC prevertices for free** — `zₖ = f(vertexₖ)/|f(vertexₖ)|`
   on `∂𝔻` is exactly [`forwardMap.ts:59`](../../packages/conformal/src/forwardMap.ts) (`corners.map(v
   => nrm(f.eval(v)))`), used today to seed its corner poles. These converge to the true SC prevertices
   as the fit converges (but are *not* certified against the SC side-length conditions).
3. The corner exponents `βₖ = 1 − αₖ` are **known exactly from geometry** — inputs, never solved for.
4. What SC uniquely adds is therefore **not accuracy but representation**: the compact exact record
   {αₖ (`=`), prevertices, A, C} with exact corner asymptotics `f(z)−wₖ ∝ (z−zₖ)^{αₖ}` baked in, plus
   the meaningful invariants (conformal modulus, center).

⇒ **Method = lightning-seeded SC.** Seed the classical parameter problem with lightning's prevertices;
each Gauss–Newton step *is* a linear least-squares solve (drop in
[`lstsqHouseholder`](../../packages/core/src/lstsq.ts)); the **only genuinely new primitive is
Gauss–Jacobi quadrature**. Zipper is the *curved/fractal* sibling — out of v1 scope, tracked as a
future engine (§5, plan §8).

---

## 3. Classical SC internals (the precise-mode recipe)

**Disk form.** For prevertices `wₖ = e^{iθₖ}` on the unit circle,
```
f'(w) = C · ∏ₖ (1 − w/wₖ)^{αₖ−1},      f(w) = A + C ∫₀ʷ ∏ₖ (1 − t/wₖ)^{αₖ−1} dt.
```
Angles are **automatic**: crossing `wₖ`, `arg f'` jumps by exactly `π·βₖ`, so *any* admissible
prevertex set yields a polygon with the prescribed turning angles. All branch points lie on `∂𝔻`, so
`f'` is analytic inside ⇒ the image **closes automatically** (`∮ f' dw = 0`), which is why the
parameter problem has only `n−3` conditions.

**Parameter problem.** The prevertices are fixed only up to the 3-real-dim disk automorphism group, so
pin 3 and solve **`n−3` real** side-length-ratio equations
`Fₖ = |Sₖ₊₁|/|S₁| − |target sideₖ₊₁|/|target side₁| = 0`, where `Sₖ = ∫_{wₖ}^{wₖ₊₁} f' dt`.

- **Ordering by construction (softmax substitution).** Represent the angular gaps `φₖ = θₖ₊₁ − θₖ > 0`
  as `φₖ = 2π · exp(ỹₖ) / Σⱼ exp(ỹⱼ)`; then the solver ranges over **unconstrained** `ℝ^{n−3}` and can
  never reorder or collide prevertices. (Trefethen 1980's constraint elimination.)
- **Solver.** Trust-region Gauss–Newton / Levenberg–Marquardt; **each linearized step is one
  `lstsqHouseholder` solve**. Seed = **lightning's prevertices** (§2), so the nonlinear solve starts
  local, not global. Typical ~10–40 evals to 8 digits on a benign polygon; warm-started continuation
  (vertex drag) needs 1–2.
- Recover `C` from one solved side vs. its target, `A` by placing one vertex.

**Compound Gauss–Jacobi quadrature (the one new primitive).** The integrand has algebraic branch
points at *every* prevertex. Split each side at its midpoint so each half has a singular endpoint at
only one prevertex; map that endpoint to `t=−1` and integrate with **Gauss–Jacobi** weight
`(1+t)^{−βₖ}` (valid since `βₖ<1`), which is exact for polynomial regular part. Nodes/weights via
**Golub–Welsch** (a small symmetric-tridiagonal eigenproblem, one rule per distinct exponent). If a
*foreign* (non-endpoint) prevertex lies near the path, Gauss loses digits silently — fix by
**subdividing** any interval `e` that is *ill-separated*:
```
d(e) < ℓ(e) / (3√2)   ≈   d(e) < 0.2357·ℓ(e)      [Driscoll–Vavasis 1998, eq. (2)]
```
(`d(e)` = distance to the nearest foreign prevertex) — split into three equal pieces and re-test.
Interior well-separated pieces use plain Gauss–Legendre. `N ≈ D` nodes for `D` digits; convergence is
geometric once the compound rule tames near-singularities.

**Inverse (fast-follow, not v1).** ODE for a global guess `dw/dτ = (z*−z₀)/f'(w)` along the segment
`z₀→z*` (RK4; `f'` is the cheap product form), then 2–4 **Newton** steps `w ← w − (f(w)−z*)/f'(w)`,
guarding `w` inside `𝔻`. The ODE stage is what makes Newton globally reliable.

**Crowding (deferred defeat, v1 detection).** For aspect ratio `L`, adjacent prevertices separate like
`e^{−πL}` and the parameter Jacobian conditions like `e^{πL}` — a property of the *map*, not the
algorithm (lightning inherits it too). At `L≈20:1` you lose ≥14 digits. **CRDT** (cross-ratios of the
Delaunay triangulation; Driscoll–Vavasis 1998) defeats it by working in Möbius-invariant cross-ratio
coordinates and re-embedding per equation — **deferred**. v1 instead **detects** the wall (min
prevertex spacing / Jacobian conditioning) and labels the map's accuracy honestly.

**Variants (all deferred).** Exterior (`t^{−2}` factor, `0↦∞`), unbounded/vertices-at-∞ (`αₖ∈[−2,0]`,
interior-path integration), doubly-connected/annulus (theta-function factors; Hu's DSCPACK).

---

## 4. Reuse surface (codebase) & the one new primitive

Already present and directly reusable:

- [`@cas/core` `lstsqHouseholder`](../../packages/core/src/lstsq.ts) — backward-stable real
  Householder-QR least squares. **This is the inner solver for every Gauss–Newton step.**
- [`@cas/conformal` `arnoldiBasis` / `evalArnoldi` / `evalExpansion`](../../packages/conformal/src/vandermondeArnoldi.ts)
  — the stable polynomial basis (the lightning fit stands on it).
- [`fitConformalMap`](../../packages/conformal/src/lightning.ts) (f: Ω→𝔻) and
  [`fitForwardMap`](../../packages/conformal/src/forwardMap.ts) (g: 𝔻→Ω) — the **fast-mode engine** and
  the **prevertex seed** (line 59). `C = [number, number]` tuples throughout.

**The one genuinely new numerical primitive:** **Gauss–Jacobi quadrature** (Golub–Welsch: build the
Jacobi three-term-recurrence tridiagonal, then a symmetric-tridiagonal eigensolver — implicit-QL with
Wilkinson shift). Exponents `βₖ` vary per polygon, so tables can't be precomputed; the computation is
cheap (small eigenproblem per distinct exponent). **Placement:** it lives **inside `@cas/conformal`**
(SC is its only consumer) — *not* lifted to `@cas/core`, per ADR-0007's second-consumer discipline;
recorded as a future core-extraction candidate the day a second consumer (e.g. a general quadrature
need) appears. (Note the parallel: `lstsq` earned core placement in ADR-0018 only because QD carried a
near-twin; no such twin exists for Gauss–Jacobi.)

No suite conflict on conventions (ADR-0006): SC carries no `π`/`2πi` normalization into a shared
package; the map is app-neutral geometry.

---

## 5. Implementations & licensing (load-bearing for an MIT repo)

The **reference** SC code is permissively licensed, so both ideas *and* code are portable (retain the
upstream notice for any file actually copied). Only three Fortran cores are encumbered.

| Implementation | Lang | License | Use for us |
|---|---|---|---|
| **MATLAB SC Toolbox** (Driscoll, Alg. 756/843) | MATLAB | **BSD-3** | ✅ port ideas/code (attribution); **cross-check oracle** |
| **SchwarzChristoffel.jl** (Eldredge) | Julia | **MIT** | ✅ reference / oracle (exterior-oriented) |
| **ComplexRegions.jl** (Driscoll) | Julia | **MIT** | ✅ the region/curve-algebra design to emulate |
| **ConformalMaps.jl** (Watson, *zipper*) | Julia | **MIT** | ✅ oracle for a *future* zipper engine |
| **cmtoolkit** (Walker, Python) | Python | **BSD** | ✅ design reference |
| **SCPACK** (Trefethen) | Fortran | Netlib, no OSI license | ⚠ reimplement from the 1980 paper |
| **DSCPACK** (Hu, ACM Alg. 785) | Fortran | ACM noncommercial | ❌ reimplement (annulus, deferred) |
| **zipper** (Marshall) | Fortran/C | **unlicensed → all-rights-reserved** | ❌ clean-room from Marshall–Rohde only |
| **JavaScript / TypeScript** | — | — | **none exists** — `@cas/conformal` SC is ~first-of-kind |

Consequence: **no JS/TS incumbent to diff against**, so the golden corpus (§6) must be self-sourced
from **exact closed forms** — which is fine, they're arbitrary-precision and solver-independent.

---

## 6. Ground-truth golden corpus (the validation spine)

All values computed to 40 digits (`mpmath`) and cross-checked against closed forms; safe to pin to
≥10 digits. The **great gift** for a phased build: for regular n-gons and the rectangle/square the
**prevertices are known in closed form**, so the forward SC *integral* can be validated **before** the
parameter solve exists.

**Fundamental constants.**
```
Γ(1/4)          = 3.6256099082219083119
K(1/√2)         = 1.8540746773013719184   ( = Γ(1/4)²/(4√π) = ϖ/√2 ; self-dual complete elliptic K=K′ )
ϖ (lemniscate)  = 2.6220575542921198105   ( = Γ(1/4)²/(2√(2π)) )
```

**Disk → regular n-gon** (prevertices = the nth roots of unity; interior angle `π(n−2)/n`;
`f(z)=C∫₀ᶻ(1−ζⁿ)^{−2/n}dζ`). With `C` set so `f'(0)=1`, the **circumradius** `Rₙ = f(1) =
(1/n)·B(1/n, 1−2/n)` is exact:

| n | Rₙ (f'(0)=1) | closed form |
|---|---|---|
| 3 | `1.7666387502854475038` | `√3·Γ(1/3)³/(6π)` |
| 4 | `1.3110287771460599052` | `Γ(1/4)²/(4√(2π))` |
| 5 | `1.1744501606205810790` | `(1/5)·B(1/5,3/5)` |
| 6 | `1.1129126745223053846` | `(1/6)·B(1/6,2/3)` |

**Disk → square** (Cook's normalization `g: 𝔻 → [−1,1]²`). Exact checkpoints:
`g(0)=0`; corners `g(e^{iπ/4})=1−i`, `g(e^{i3π/4})=1+i`, `g(e^{i5π/4})=−1+i`, `g(e^{i7π/4})=−1−i`;
edge midpoints `g(1)=−i`, `g(i)=1`, `g(−1)=i`, `g(−i)=−1`. **Conformal radius**
`|g'(0)| = 2/K(1/√2) = 8√π/Γ(1/4)² = 1.0787052023767587133` — a superb single-number invariant.
Interior regression points: `g(0.5) = −0.53606639397370575 i`, `g(0.3+0.4i) =
0.43492225110791363 − 0.32382287280799631 i`. *Normalization caveat:* the inverse `f` satisfies
`f(g(w)) = −i·w` (Cook) — pin one normalization so the corpus is unambiguous.

**Disk/half-plane → rectangle** (aspect `ρ = width/height = 2K(m)/K′(m)`, `m=k²`):
`ρ=1` (square) → `m = 0.029437251522859414`; `ρ=2` → `m = 0.5` (exact); `ρ=3` →
`m = 0.86610587273425650`. Inverse is Jacobi `sn(·|m)`; checkpoints `sn(0)=0`, `sn(K)=1`,
`sn(K+iK′)=1/k`.

**Parameter-solve regression (asymmetric — exercises the nonlinear solve):**
- **Asymmetric Schwarz triangle** (angles `πa, πb, π(1−a−b)`): closed-form side ratios in Γ functions.
- **L-shaped domain:** analytical accessory parameters exist (Bezrodnykh–Vlasov, *Comput. Math. & Math.
  Phys.* 62(12), 2022, DOI 10.1134/S0965542522120132); **regenerate to ~30 digits** with the same
  `mpmath` setup and label "computed, reproducible." Papamichael–Stylianopoulos (*Numerical Conformal
  Mapping*, World Scientific 2010) tabulates L-shape / cross / slit **conformal modules** for
  cross-checking the modulus invariant.

Reproducibility kernel (regenerate/extend):
```python
from mpmath import mp, mpf, mpc, sqrt, pi, gamma, ellipk, ellipf, beta, acos, j, findroot
mp.dps = 40
K  = ellipk(mpf(1)/2)                                   # K(1/√2); mpmath uses parameter m=k²
Rn = lambda n: (mpf(1)/n)*beta(mpf(1)/n, 1-mpf(2)/n)    # regular n-gon circumradius, f'(0)=1
m_for = lambda rho: findroot(lambda m: 2*ellipk(m)/ellipk(1-m)-rho, mpf('0.3'))
```

---

## 7. References

- L. N. Trefethen, "Numerical Computation of the Schwarz–Christoffel Transformation," *SIAM J. Sci.
  Stat. Comput.* **1**(1):82–102 (1980), DOI 10.1137/0901004. *(Compound Gauss–Jacobi; interior-path
  integration; constraint-eliminating change of variables; SCPACK.)*
- T. A. Driscoll & L. N. Trefethen, *Schwarz–Christoffel Mapping*, Cambridge Monographs on Applied and
  Computational Mathematics **8**, CUP (2002). *(The definitive treatment.)*
- T. A. Driscoll, "Algorithm 756: A MATLAB Toolbox for Schwarz–Christoffel Mapping," *ACM TOMS*
  **22**(2):168–186 (1996), DOI 10.1145/229473.229475; "Algorithm 843: Improvements…," *ACM TOMS*
  **31**(2):239–251 (2005), DOI 10.1145/1067967.1067971. *(BSD-3 reference implementation; CRDT.)*
- T. A. Driscoll & S. A. Vavasis, "Numerical Conformal Mapping Using Cross-Ratios and Delaunay
  Triangulation," *SIAM J. Sci. Comput.* **19**(6):1783–1803 (1998), DOI 10.1137/S1064827596298580.
  *(CRDT; the `d(e)<ℓ(e)/(3√2)` subdivision; crowding.)*
- A. Gopal & L. N. Trefethen, "Solving Laplace problems with corner singularities via rational
  functions," *SIAM J. Numer. Anal.* **57**(4):2074–2094 (2019); "Representation of conformal maps by
  rational functions," *Numer. Math.* **142**:359–382 (2019). *(The lightning method — our engine; the
  `exp(πL)` crowding law.)*
- L. N. Trefethen, "Numerical conformal mapping with rational functions," *Comput. Methods Funct.
  Theory* **20**:369–387 (2020), DOI 10.1007/s40315-020-00325-w.
- P. D. Brubeck, Y. Nakatsukasa & L. N. Trefethen, "Vandermonde with Arnoldi," *SIAM Review*
  **63**:405–415 (2021), DOI 10.1137/19M130100X.
- D. E. Marshall & S. Rohde, "Convergence of a variant of the zipper algorithm for conformal mapping,"
  *SIAM J. Numer. Anal.* **45**(6):2577–2609 (2007), DOI 10.1137/060659119. *(Zipper/geodesic — future
  curved/fractal engine.)*
- C. Hu, "Algorithm 785: … Schwarz–Christoffel … Doubly Connected Polygonal Regions," *ACM TOMS*
  **24**(3):317–333 (1998). *(DSCPACK; annulus — deferred.)*
- J. D. Cook, "Conformal map between square and disk" / "…rectangle and half-plane" (2022),
  johndcook.com. *(Exact square/rectangle golden values.)*
- MIT/BSD oracles: `github.com/tobydriscoll/sc-toolbox` (BSD-3), `SchwarzChristoffel.jl` &
  `ComplexRegions.jl` & `ConformalMaps.jl` (MIT).
