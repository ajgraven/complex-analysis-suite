# M4 — branch cuts

> **Status: the decisions are taken** — ADR-0041 in [`DECISIONS.md`](../DECISIONS.md).
> This is the staging plan beneath them. Read [`PLAN.md`](PLAN.md) §4.3 (the branch model) and §7
> (the milestone table) first; the 28 gallery records in [`gallery/`](gallery/) are the
> specification, and tier D is [`gallery/tier-cd.md`](gallery/tier-cd.md) from `## D1` onward.

M4 delivers **tier D — D1…D7** and two of the five north-star behaviours:

- **#4** — `∫₀^∞ x^{α−1}/(1+x) dx` prints `π/sin(πα)` labelled `=`, with the keyhole's four pieces,
  the `(1 − e^{2πiα})` factor, and a certified numeric bound on each vanishing arc.
- **#3** — drag a branch cut. Nothing changes, until the cut crosses the contour, at which point the
  answer jumps by the monodromy factor and the app says so.

---

## 1. The three decisions

### 1.1 The output basis is CARRIED, not reduced

The basis tier D needs is

```
(π^k / sin(π r)) · Σⱼ cⱼ · ∏ₘ aⱼₘ^{qⱼₘ}        cⱼ ∈ ℚ(i)(√d),  aⱼₘ ∈ ℚ₊,  qⱼₘ, r ∈ ℚ
```

**carried symbolically and never evaluated** — the FORM is `=`, the decimal stays `≈`. That is not a
new idea: it is exactly what tier B already does with `e^{β}` ([`GALLERY.md`](GALLERY.md) §5.0a,
"the exponential factor does not need to be evaluated to be exact, only carried").

**Why reducing is not an option.** The natural alternative is to evaluate everything into an
algebraic number field. The fixtures say what that field would have to be:

| record | flagship fixture value | degree over ℚ |
|---|---|---|
| D1 | `π/sin(3π/10)` | 2 — `√5` |
| D2 | `π(1 − 1/√2)` | 2 |
| **D3** | `(π/4)/sin(3π/8)` | **4** — the nested `√(2+√2)` |
| **D3** | `(π/7)/sin(3π/7)` | **3** |
| **D3** | `(π/5)/sin(23π/50)` | **20** |
| D4 | `−π/4` | 1 |
| D5 | `π³/8` | 1 |
| D6 | `π/(2√5)` | 2 |
| **D7** | `(π/(2√2))·(17 − 40^{3/4})` | **4** |
| **D7** | `… − 10^{1/3}·6^{2/3}` | **3** |

`SqrtExt` is **one** quadratic extension. Reducing would mean a general algebraic number field —
degree 20 for one D3 fixture alone — to express answers the records themselves write as
`"(pi/5)/sin(2.3*pi/5)"`. Carrying costs one widening and one recogniser; reducing costs a number
field and throws away the form the reader wanted.

**The mechanism is the existing exponential basis, with the exponent widened.** `a^q = e^{q·ln a}`
and `e^{iπr}` are both `e^{β}`, so `kernel/expSum.ts` already has the shape. Its exponent is
`SqrtExt` today; it must admit

```
β = (element of ℚ(i)(√d))  +  (ℚ(i))·π  +  Σ (ℚ)·ln(aⱼ),   aⱼ ∈ ℚ₊
```

with `ln(aⱼ)` a **symbol**, never a number. A pole at `z₀ = r e^{iθ}` contributes
`z₀^{α−1} = e^{(α−1)(ln r + iθ)}` evaluated **in the declared `argRange`**, which is the whole
content of D1's `residue-with-the-wrong-argument` trap.

**One recogniser, declared and bounded.** A two-term denominator `a − b·e^{β}` with `|a| = |b|`
factors as `e^{β/2}(e^{−β/2} − e^{β/2})` and collapses to a sine. That is precisely how D1's
`2πi·e^{iπ(α−1)}/(1 − e^{2πiα})` becomes `π/sin(πα)`, and D3's and D7's `1 − e^{2πiμ}` are the same
shape. **Anything outside the basis above is refused**, which is [`PLAN.md`](PLAN.md) §9's own R3
mitigation ("declare the output basis and refuse outside it").

### 1.2 Pass 5 moves to ℚ(i)(π)

D4's lower edge reproduces an **affine combination of three targets**,
`−(1, 4πi, −4π²)·(T2, T1, T0)`; D5's is `−(1, 6πi, −12π², −8π³i)` over four. The entries are
polynomials in π with Gaussian-rational coefficients. `families/system.ts`'s `exactConstant` already
refuses these rather than rounding, and its own docstring parks the decision here:

> *"Tier D will need either a symbolic matrix entry or a documented rational rescaling of the
> unknowns; the decision is deferred to M4, where a record that needs it actually exists."*

**The rescaling does not generalise, so the symbolic entry wins.** Substituting `Tₖ = π^{eₖ}·tₖ`
would clear π if the unknowns were homogeneous in it. They are not: for `R = 1/(1+x²)`,
`T0 = π/2` and `T2 = π³/8` — degrees 1 and 3 — while for `R = 1/(1+x²)²`, `T0 = π/4` **and**
`T1 = −π/4` are both degree 1, which D4's row `−(1, 4πi, −4π²)` cannot be homogeneous in. No single
exponent assignment works across the two records; the rescaling is a coincidence of one family, not
a method.

π is transcendental, so ℚ(i)[π] is a polynomial ring and its fraction field admits exact
elimination. **`families/linear.ts` is generalised over a small `Field` interface**
(`add/sub/mul/inv/isZero/equals`) rather than rewritten — instantiated at `Frac` for the existing
loader invariant 4, and at ℚ(i)(π) for Pass 5. Rank stays **decided**, which is that file's entire
reason for existing, and the payoff its header already promises arrives:

| classical symptom | what `M` does |
|---|---|
| keyhole with `arg ∈ (−π,π]` — "the edges cancel and the integral collapses to 0" | `M = [0]`, rank 0 |
| `∫₀^∞ x^{a−1}/(1+xⁿ)` at integer `a` | `M = [0]`, rank 0 |
| the plain-`log` keyhole "losing" `∫R log x` | a zero **column** |
| D5's `∫R log²` underdetermined alone | rank 2 of 3 → needs a prerequisite |

Four hand-written detectors become one rank-and-kernel report.

### 1.3 The branch model, and four schema changes

[`PLAN.md`](PLAN.md) §4.3 fixes the class — `f = R(z)·∏(z−b_k)^{α_k}·log(z−b_ℓ)^m` — and research 06
§2.1 gives the admissibility check a program can run in microseconds:

> **(a)** every branch point with `α_k ∉ ℤ` lies on Γ; **(b)** every component of Γ that does not
> touch ∞ has `Σ α_k ∈ ℤ`; **(c)** any component containing a `log` branch point must touch ∞.

One rule explains the whole gallery: why the keyhole's cut *must* reach ∞ and may be any arc doing
so, why the dogbone's `[a,b]` works **and so does the pair of rays to ∞** — research 06 calls
dragging between those two "the single most valuable interaction in the app" — and why a log cut can
never be bounded.

The implemented `Family["branch"]` needs four changes, each one a record's own ⚠ GAP:

1. **`crossingPhase` must become a tagged union.** D4/D5's is **additive** — `log z ↦ log z + 2πi` —
   while D1/D2/D3/D7's is multiplicative. It is typed `string` today, which cannot distinguish them,
   and D4 carries an explicit `log-phase-is-additive` trap for exactly this confusion.
2. **`argRange` belongs to the branch FACTOR, not the cut** (GAP G4). D7 has two branch points with
   different exponents **and two different conventions**: `[0,2π)` for `z^μ`, `(−π,π]` for `(b−z)^ν`.
3. **Seats for `admissibility` and `effectiveCut`** — the latter because the union of sub-expression
   cuts is *not* the discontinuity set of the composite (research 06 §2.2, Maple's `BranchCuts`
   lesson). Rendering the union is dishonest and the record currently cannot say so.
4. `contour.residueAtInfinity` and `prerequisites` **already exist in the schema** and have no
   consumer. They need engines, not fields.

---

## 2. The cross-check has to change, or tier D's corroboration is vacuous

D1's inner circle vanishes like `ε^α` and its own record records that it is still **1.1×10⁻²** at
`ε = 10⁻⁹`. So at finite `ε` the contour value is *supposed* to differ from `2πi Σ n·Res`, by an
amount the arcs' own certified bounds control. Comparing against the quadrature's error estimate
would declare agreement meaninglessly.

**For a family with limit parameters the cross-check tolerance must come from the arc bounds**, which
the engine already computes exactly in ℚ. That is cheaper than adding exp-sinh quadrature and
strictly more honest, and M3.5b's `crossCheck` certificate is the place to say how strong the
corroboration actually is. Adding a double-exponential rule for open endpoints stays available as a
later option; it is not on M4's path.

---

## 3. Staging

Ordered by **which machinery each record needs**, not by record number — which is why D1 and D3 land
before D2.

| slice | delivers | size |
|---|---|---|
| **M4.1** ✅ | `BranchChoice`, the admissibility validator, CPU continuous-argument lift, `side` tags, LEGALITY steps 2–3, and the sandbox's cut editor | M |
| **M4.2** ✅ | the four `Family["branch"]` schema changes of §1.3 · keyhole template · the power-residue reader · `iπ·ℚ` exponents · the sine recogniser · **the cyclotomic sum and the geometric cancellation** → **D1, D3** | **L** |
| **M4.3** ✅ | `linear.ts` over a `Field` · ℚ(i)(π) · the rank/kernel report · the additive `crossingPhase` · **the log-residue engine and the log arc bound** → **D4** | M–L |
| **M4.4** ✅ | `prerequisites` chaining, a borrowed verdict *meeting* into the final one → **D5** | S |
| **M4.5** ✅ | `ln(ℚ₊)` exponents and radical factors → **D2**; D7's algebraic half is ready and waits on M4.6's contour | S–M |
| **M4.6** ✅ | dogbone template · `Res(f,∞)` as a first-class row → **D6, D7** | M |
| **M4.7** | the GPU picture: `cutCorrection`, `cargCut`/`clogCut`/`cpowCut` twins, `DUAL_BACKEND_CORPUS`, monodromy readout, sheet badge, shadow-cut mode, **drag-a-cut** | M–L |

### Gates

- **M4.1** ✅ — drag a cut and watch the admissibility verdict change; a piece crossing a cut without a
  `side` tag refuses and names the repair ("tag this segment `above` or `below`, or move the cut").
  Both halves verified in a browser: the "Branch cuts" card's verdict changes live as the dogbone is
  joined and split, and the ledger's own LEGALITY rows change with it.
- **M4.2** ✅ — **north-star #4, verbatim.** D1's `arg ∈ (−π,π]` trap is reported as the earliest of
  its three refusals that this engine can see: the cut swings onto ℝ₋ and both untagged circles cross
  it (LEGALITY step 2). D3 lands with it, including the two integer-`a` fixtures that must refuse.
- **M4.3** ✅ — D4 determines two of its three targets (`∫R log x = −π/4` and, free, `∫R = π/4`) and
  reports the third as invisible; and the plain-`log` variant says *"this contour does not determine
  T1 — this contour carries no information about T1"* as a computed consequence of a zero column,
  not as a hand-written detector.
- **M4.4** ✅ — D5 refuses to close **alone** (`this contour does not determine T2 — … no information
  about 3/(4π²)·T0 + T2`, which names `T0` as a computed consequence of the kernel) and closes when
  D4 supplies it, at the SAME binding. The borrowed verdict meets into `T2`, which depends on it, and
  **not** into `T1`, which does not — dependence decided in the field, not assumed from the fact that
  a prerequisite exists. A record expecting `≈` keeps `≈` however exact its source turned out to be.
- **M4.5** ✅ — D2's two poles sit at `−2` and `−4`, OFF the unit circle: `(−2)^{1/2}` reads as
  `e^{(ln 2)/2 + iπ/2}` with the argument decided in the declared determination and the modulus a
  symbolic `ln 2`, and folds back to `i√2` because the weight is a half. `π − π√2/2`, which is the
  record's `π(1 − 1/√2)`. Dropping the modulus — what a basis carrying only the argument does —
  returns `π/2`: plausible, and the one a reader would not question.
- **M4.6** — D7's outer circle contributes `2πi·(17/4)·e^{3πi/4}`, magnitude 26.7 in an answer of
  magnitude 1.216. The residue at infinity is not an edge case, and D6 passing only because
  `Res(f,∞) = 0` is the coincidence that would hide the bug.
- **M4.7** — **north-star #3**; CPU/GPU parity green in a browser suite.

### Two prerequisites

- ~~**The app has no `test:browser`**~~ ✅ **M4.7a.** It has one now, at the head of the slice as
  planned: `vitest.browser.config.ts` mirroring the other three, wired into the root chain and the CI
  `browser` job, with a shader compile/link sweep over the sandbox's presets and all twenty records'
  contour integrands — 28 programs the node gate structurally could not build. One line the other
  three configs do not have: `CAS_CHROMIUM_EXECUTABLE`, because Playwright pins an exact Chromium and
  `pnpm` skips its postinstall, so a container with a Chromium from a different Playwright version
  cannot launch the provider at all and the parity gate becomes a suite only CI can run.
- **Shadow-cut mode is free** — cuts as the shadow of each branch point away from a base point need
  no cut data structure at all (research 06 §2.3). Worth taking early as the cheap intuition-builder,
  with explicit cuts for the dogbone.

---

## 4. Risks

**R1 stands throughout, and is the reason for the continuation probe.** Never trust a derived jump
weight: verify each arc numerically before use and **refuse to render an unverified cut system**. A
sign error here is invisible — D1's `residue-with-the-wrong-argument` trap says it outright, *"changes
the answer by `exp(2πi(α−1))` and NOTHING warns you"*.

**M4.2 is the schedule risk.** It carries the exponent widening, the recogniser, the keyhole template
*and* the power-residue reader. If it overruns, the cut that preserves a shippable gate is to land
**D1 alone** — one branch point, modulus 1, one simple pole — and hold D3's parameterised root sum
for M4.5, where the radical machinery lands anyway.

**Deliberately out of M4:** algebraic functions `wⁿ = R(z)` (PLAN §9 R4 — a different machine, v2);
principal-part subtraction for near-pole quadrature (PLAN §4.4, M2 work that M3.5c's findings
re-raised); the `rigorOfBound` / `rigorOfLimit` split of DESIGN §4 Pass 3; and the `@cas/interchange`
hand-off for a branch system, which stays gated on a receiving tool (ADR-0007).

---

## 5. What M4.1 actually landed, and what it taught

Four kernel modules (`src/kernel/branch/`), a pure editor (`src/engine/branchEdit.ts`), the two
LEGALITY rows, and a sandbox card. Four things are worth recording because they changed a decision
rather than merely executing one.

### The sandbox DECLARES branch points; it does not detect them

Reading `z^(1/3)` out of a typed expression is M4.2's work. Doing it *shallowly* in M4.1 would have
been worse than not doing it at all: an incomplete detector reports "no branch points" for an
integrand that has them, and LEGALITY then passes a contour that crosses an undeclared cut **in
silence** — a guardrail violation dressed as a feature. A declared cut system claims nothing about
`f`; it says "these are the cuts I have drawn", and the ledger judges exactly that. The editor
survives M4.2 unchanged, because research 06's thesis is that *where the cuts run is the user's
choice* — so placing and dragging one is the teaching surface whatever supplies the points.

### The four `Family["branch"]` schema changes move to M4.2

[ADR-0041](../DECISIONS.md) Action Item 5 tagged them M4.1, qualified "before D1 loads". D1 loads in
M4.2, and §1.3's own item 4 is the reason to wait: `contour.residueAtInfinity` and `prerequisites`
are already in the schema **with no consumer**, and are the wrong shape for it. Adding three more
fields with no reader would repeat that, and a schema validated against a record is a schema that is
right. They are M4.2's first step, not M4.1's last.

### Two engine bugs the tests found, both about aliasing

- **The continuous-argument lift.** Checking `|Δθ| ≤ π/4` on a candidate interval cannot detect the
  failure the rule exists to prevent: a path turning by exactly 2π has `v₁ = v₀`, the principal value
  is 0, and a whole revolution is dropped in silence — a 16-turn circle against a 16-sample first
  pass reported no turning at all. Testing the two PARTS of the interval fixes that case and moves
  the resonance to 32; bisecting again moves it to 64. Every dyadic subdivision has a frequency that
  defeats it. The split is therefore at `φ = (√5 − 1)/2`, which removes the whole family: `k·φ·Δt` is
  never an integer. The certificate stays `≤` regardless — a black-box path can defeat any fixed
  sampling, and that is what the label is for.
- **The crossing classifier.** A closed arc's *seam* is not an endpoint. Reading it as one refused
  the app's own opening state — a circle about the origin with `θ₀ = 0`, and a cut running out along
  the positive axis, which puts the crossing exactly on the seam. An OPEN arc's end is real and stays
  degenerate.

### `legalityRefusal` — a latent hole the cut rows made reachable

The result card gated its `∮` on the QUADRATURE's refusal, never on the ledger. Every LEGALITY
failure until now was one the integral had already refused, so the two agreed by accident; a contour
crossing a cut without declaring its side is the first that does not, and the app printed `∮ = 2πi`
under a `⚠` LEGALITY row. `engine/ledger.ts` now exports the gate — *nothing may report a value while
a LEGALITY row refuses* — and it reads the failing ROW rather than `failedAt`, so a row that one day
fails softly still withholds the value.

---

## 6. What M4.2 landed, and what it taught

Six commits: the widened basis, the sine recogniser, the schema plus the coefficient walk, the
crossing correction, the power-residue reader, D1, and D3. Five things changed a decision.

### The keyhole was illegal, and M4.1's cut rules were wrong

Tier D's flagship contour refused to load. Two of its four pieces LIE IN the cut — that is what the
`side` tag is for — and the other two meet it only at their own ENDS, where they hand over to the
lips. M4.1 called both a grazing contact. The fix replaced its seam rule with a better one: **the
winding number of the whole contour about each branch point must be zero**, which is what is
actually wrong with a bare circle and is decided exactly. See the M4.2c-2 commit.

### A fold that helps the answer can destroy the derivation

`e^{irπ}` with `2r ∈ ℤ` is a sign, and folding it into its coefficient is what makes D1 print
`π/sin(3π/10)` instead of `−π·e^(−iπ)/sin(3π/10)`. Doing it during CONSTRUCTION instead collapses
α = 3/4's coefficient `1 − e^{3iπ/2}` to `1 + i`, after which no sine factors out at all. So the fold
runs on the way out, and `targetCoefficient` deliberately does not run it.

### The form of an answer depends on how an exponent was written

D1's lower edge declares its factor as `−e^{2πi(α−1)}` — convention F, the full multiplier including
the reversal — whose π part at α = 3/10 is `−7/5`. Factoring that gives `sin(7π/10)`; the record
states `sin(3π/10)`. Supplementary, hence equal, and only one is recognisable as `π/sin(πα)`.
Reducing the phase into one period before factoring canonicalises it, and the two `(−1)^k` factors
the reduction introduces cancel exactly.

### A cancellation may simplify a derivation, never rescue one

D3's geometric sum cancels the keyhole's own `(1 − e^{2πia})`. At integer `a` that factor is
identically zero, so `N/D` is `0/0` — and the identity happily reports the limit, which is the
*correct* `(π/7)/sin(3π/7)`. The degeneracy is therefore decided on the ORIGINAL denominator, before
anything cancels. `Golden.refuses` is the schema consequence: invariant 4's rank rule inverts for a
fixture that documents a collapse, rather than being lifted.

### Nothing may report a value while LEGALITY refuses — in every path

The result card's gate (`legalityRefusal`, extended M3) had a twin hole in `solveFamily`. Pass 5
reads the residue sum and the piece limits and knows nothing about whether the contour was legal;
under the principal determination it produced a confident COMPLEX number for a real integral.

### Deferred, and why

- **The wedge cross-check** (D3's `wedge-disagreement` trap — "it is a free test and it should be
  wired as one"). The `2π/n` wedge is gallery F1's own contour, so wiring the invariant means having
  F1; it belongs with the wedge family, not here.
- **D2** needs the `ln(ℚ₊)` half of the exponent (poles at `−1` and `−2`, so `ln|z₀| ≠ 0`) — M4.5,
  per ADR-0041 Action Item 1.
- **D4/D5** need Pass 5 over ℚ(i)(π) and `linear.ts` over a `Field` — M4.3. `buildSystem` refuses
  them by name today: a coefficient outside ℚ(i) with more than one unknown says so. *(Both have
  since landed — D4 in M4.3, D5 in M4.4.)*

---

## 7. What M4.3 landed, and what it taught

**D4 is the first record in the corpus that is not solved by dividing.** Its contour gives ONE
complex identity in three unknowns, and everything else follows from that.

### Neither coefficient ring contains the other, so the record chooses

`e^{2πiα}` is not a rational function of π; `π²` is not an algebraic multiple of an exponential. So
there is no single seat for a coefficient, and "try one and catch the failure" would make the choice
an accident of which walker was tried first. The family's **crossing phase** decides it — a
MULTIPLICATIVE phase (`z^α ↦ e^{2πiα}z^α`) puts the row in the exponential basis, an ADDITIVE one
(`log z ↦ log z + 2πi`) puts it in ℚ(i)(π) — and `buildSystem` routes on that declaration. This is
what §1.3's tagged `CrossingPhase` was for, one level further than it was written to reach.

### The coefficient row is DERIVED from the increment, not taken on trust

`−(log x + Δ)^k` expanded gives `[−C(k,k)Δ^k, …, −C(k,1)Δ, 0]`, so for `k = 2, Δ = 2πi` the row must
be `[4π², −4πi, 0]`. `buildSystem` computes that and compares it with what the record declared.
Three of D4's six traps stop being detectors and become arithmetic: `four-pi-squared-dropped`,
`wrong-sign-of-the-shift`, and a lost binomial coefficient. The vanishing last entry is the
`plain-log-loses-the-log-integral` trap in the same breath — at `k = 1` the row is `[−Δ, 0]`, and
that zero IS the log integral going invisible.

### Rank deficiency is not all-or-nothing

D4's realified system has rank 2 in three unknowns and is CORRECT: `∫R log²x` has an identically zero
column. A report that offered a solution only at full rank would have refused to state the very
answer the contour was built for, so `SolveReport` gained `determined` — the unknowns a system pins
down outright, each with the functional extracting it. Invariant 4 moved onto it and is now a
per-unknown check in both directions: a `primary` or `bonus` target the contour does not pin is a
broken record, and so is a `cancels` target that it does.

### A log is weaker than every power, and that shows exactly once

The two circles of D4's keyhole are killed by the decay of `R` alone — the log moves no exponent.
What it takes away is the boundary case: at exponent 0 a rational arc bound is `O(1)`, merely failing
to discharge, while the same arc with `m ≥ 1` DIVERGES. `logArc.ts` reports that difference rather
than inheriting the rational reading.

### A check nobody can break is a check nobody is running

The break pass found one guard whose deletion no test noticed: the numeric cross-check inside each of
the three coefficient walks. A correct walker never disagrees with the evaluator, so no ordinary
input can tell a wired check from a deleted one. The seam that can is that the walk and the evaluator
read the bindings SEPARATELY — a binding whose getter answers differently the second time makes them
see different parameters. Deliberately exotic, and better than a check that could be deleted silently
inside a walker whose whole job is to be exact.

### The residues are checked by a second computation, in the tests and not in production

`logResidue.ts` is verified against an independent trapezoid quadrature of `(1/2πi)∮ R log^m dz`,
which shares no arithmetic with it and agrees to 1e−12 relative. That check is NOT in production,
because a safe radius is a property of the whole pole configuration and not of the pole being asked
about: a default small enough to be safe everywhere does not exist, and one that silently enclosed a
second pole would turn a correct answer into a refusal.

### Transcription note: a symbol the schema cannot bind

D4's gallery record varies `R` across fixtures (`1/(1+x²)²`, `1/(1+x²)`). A `symbol` is documentation
in this schema — nothing binds a function into an integrand — so the one degree of freedom those
fixtures actually use is transcribed as an integer parameter `p`, the power of `1 + x²`. Its third
golden (`T0 = π/4`, "the free bonus from the same contour") is not a fixture at all: it is the other
unknown of the same solve, and `solveFamily`'s `targets` reports it.

---

## 8. What M4.4 landed, and what it taught

**D5 is the first record that does not close alone**, and gallery gap G8 — "no `prerequisites`" —
closes with it.

### The dependency is executable, and resolved at the caller's binding

`from: "family:log-squared-keyhole with the same R"` is not a citation. The engine finds that record,
solves it **at D5's bindings** — `p = 1` here borrows `p = 1` there, not D4's own flagship `p = 2` —
and reads the named unknown out of the result. Borrowing at the source's fixture instead would return
`π/4` where `π/2` is needed and answer a different question with confidence; the break pass confirms
a test fails when it does.

### The borrowed verdict meets into what depends on it, and nothing else

An unknown is `weights·r`, so it depends on a borrowed `tⱼ` exactly when `Σ_row weights[row]·M[row][j]`
is non-zero — a decision in ℚ(i)(π), not an assumption from the presence of a prerequisite. D5 makes
the difference visible: `T1` comes off the REAL part of the identity, where `T0`'s coefficient is
zero, and stays `=` on its own contour; `T2` comes off the imaginary part, where `T0` sits, and
carries `T0`'s certificate. A blanket meet would have downgraded the bonus for nothing.

The record's declared `rigor` meets with the borrowed one rather than overriding it, in **both**
directions: a record that built its argument on `≈` keeps `≈` even though D4 supplies `=`, and one
that hoped for `=` and got `≈` keeps `≈`. Neither direction upgrades.

### Invariant 4 judges a borrowing record on the system without the borrowed column

Dropping a column is structural — it needs the unknown's index and not its value — so the loader
still checks D5 without evaluating a single residue. Two directions, as everywhere else here: a
record whose contour cannot determine what it claims is broken, and so is one that borrows a value
its own contour supplies. The second is not hypothetical: `T1` IS determined by D5's contour, and
declaring it an input would document a dependency that is not there.

### The transcription answered the record's own coverage complaint

D5's `sign-of-T1-from-the-1-over-i` trap says the `1/i` sign is invisible at `R = 1/(1+x²)`, where
`Σ₃` is purely real and `T1 = 0` either way, and asks for "a second R with a NON-ZERO bonus term".
The gallery's choice, `1/(x²+4)`, has poles off the unit circle and needs `ln 2` — M4.5. Carrying `R`
as the integer parameter `p` supplies one inside this basis instead: at `p = 2` the bonus is
`T1 = −π/4`, **which is D4's own primary answer at the same `p`**, reached by a different contour. The
two records now cross-check each other on a number neither takes from the other.

---

## 9. What M4.5 landed, and what it taught

ADR-0041's Action Item 1 is complete: the exponent now carries `Σ(ℚ)·ln(pⱼ)` beside its algebraic and
π components, and D2 is the record that needed it.

### The atoms are primes, and that is the whole design

`ln 4 = 2 ln 2`. A representation keyed by the rational it came from would hold `ln 4 − 2·ln 2` as a
two-term sum that is not obviously zero, and the sine recogniser — which decides whether two exponents
differ by a sign — would be comparing FORMS rather than numbers. Factoring into primes makes the
representation canonical by unique factorisation, so `equals` and `isZero` stay decisions. It is the
same reason π is a component rather than a number, one summand along, and it costs a trial division
that **refuses** rather than returning an uncertified atom: an unfactored cofactor would break
canonicity silently, and `ln(p·q)` would stop equalling `ln p + ln q`.

### The verification changed shape, not strictness

`argumentOfPole` used to verify a candidate root of unity by EQUALITY with the pole, which can only
ever succeed on the unit circle. It now divides — `z₀·conj(ζ)` must be a positive real — and reads the
modulus off the quotient. Same guess-then-verify discipline, one bound fewer, and the bound that
remains is narrower and still named: `ln r` must be a rational combination of logarithms of
rationals, so `ℚ₊` and `q√d` are in and `1 + √2` is out.

### The fold back out is the other half of the same slice

`e^{ln 2}` is the number 2, and printing it as an exponential is the disservice `asAlgebraicFactor`
already prevented for `e^{iπ}`. A weight with denominator 1 folds to a rational, denominator 2 to a
square root — which is why D2's answer reads `π − π√2/2` — and denominators 3 and 4 are CARRIED, which
is ADR-0041's thesis rather than a shortfall. What is carried now prints as a power, `2^(1/3)·5^(1/3)`,
not as `e^(…)`.

### A widening can create a silent wrong answer somewhere else

`kernel/logResidue.ts` asked `argumentOfPole` for an argument and built `log z₀ = iπr` from it. The
moment a pole off the unit circle stopped being refused, that code would have **dropped `ln r`** and
returned a confident wrong residue — a log family's residues are polynomials in π, and ℚ(i)(π) has no
seat for a logarithm. It now refuses by name. The existing tests caught it, which is the argument for
writing the refusals as tests in the first place: three of them asserted a refusal that M4.5 was
removing, and one of the three was removing it in the wrong place.

### A record's default contour must enclose its own poles

`instantiate.ts`'s default radius is 4, a display choice that knows nothing about where a record's
poles are — and D2's sits exactly ON it, where the winding number is undecided and the record opens
refusing. `limitParams[].start` is the record's own answer. The corpus's R-independence test now takes
its two radii from that too, since the property it checks ("independent once every selected pole is
enclosed") is false when one radius excludes a pole.

---

## 10. What M4.6a–b landed, and what it taught

`kernel/atInfinity.ts`, `engine/exteriorTheorem.ts`, the dogbone template, and the sandbox's first way
into either tier-D shape. Five things are worth recording because they changed a decision.

### The identity generalises, and generalising it is what made it testable

The plan's form is the one D6's trap states — `∮_{D,cw} f = 2πi[Σ Res outside + Res(f,∞)]` — with the
dogbone's `n = 0` baked in. The implemented form is

    ∮γ f dz = 2πi [ Σₖ (n(γ,aₖ) − σ)·Res(f,aₖ) − σ·Res(f,∞) ],   σ = n(γ, branch point)

because `Z = γ − σ·C_R` winds `σ − σ = 0` about the cut whatever `σ` is, and the ORDINARY residue
theorem applies to `Z` — no new theorem is used anywhere in the file, a different cycle is chosen. That
is not generality for its own sake. Under the special form a rational fixture can falsify exactly one
choice (that `Res(f,∞)` is present at all); under the general one it falsifies three, because `σ = 0`
must reproduce `applyResidueTheorem` **term for term** on a keyhole, and a contour that encloses both
the cut and a pole gives a non-zero answer the quadrature checks. Weighting by `n` instead of `n − σ`
was invisible before and is caught now.

### What a rational integrand cannot test, said out loud

`Σ_all Res + Res(f,∞) = 0` for every rational `f`, so the whole `σ`-dependent term vanishes identically
and the answer is `2πi Σ nₖ·Res` **whatever `σ` is**. The sign of `σ` is therefore not falsifiable by
anything in this slice; what pins it is D6, whose contour is clockwise and whose answer is
`π/(a√(1+a²))`. The response was to say so — in the module header, in a certificate step the user can
read, and in a test that asserts the certificate says it — and to derive `σ` ONCE so the arithmetic and
the sentence cannot drift apart. A break pass that reports "caught" for a mutation the fixtures cannot
actually see would be worse than no break pass.

### The dogbone has no outer circle, and that absence is the claim

D6 and D7 both list `C_R` as a fifth piece, because the classical derivation writes the composite cycle
and reads `∮γ = 2πi Σ Res` off it. Drawing it would be drawing two disjoint loops and calling them one
path — and it would make every winding number `1`, which is precisely the fact D6 exists to deny. So
`C_R` is not a piece: `∮_{C_R,ccw} = −2πi·Res(f,∞)` is the *definition* of the residue at infinity, and
the circle appears as that row. Nothing is lost (D7's `|∮_outer| = 26.7` is still on screen) and the
winding numbers stay honest. The records' own ⚠ GAP G5 is this, from the other side.

### The lips lie in the cut, so the end caps are full turns

A dogbone drawn as the boundary of an η-neighbourhood has semicircular caps and edges at `±iη` — and
then the target piece is not `∫₋₁¹ f(x) dx`. Keeping the edges ON the cut, as `model.ts` requires and as
the keyhole already does, forces each cap to run from the upper lip round to the lower one: local angle
`π → −π` at the right branch point, `2π → 0` at the left. Same POINT, different LIP, a turn of `−2π`
each — which is what makes the path exactly closed, makes the crossing classification `endpoint` rather
than an untagged crossing, and makes `n(D, ±1) = −1` while `n(D, pole) = 0`.

### The browser found three bugs the unit tests could not, and all three were old

The dogbone was the first contour of its shape the app had ever drawn, and it walked straight into
three rules that had been *true by accident*:

- **LEGALITY read the branch points ONE AT A TIME.** "A loop with non-zero winding about a branch
  point is not a loop in ℂ∖Γ" is right for a keyhole and wrong for a dogbone, which winds `−1` about
  both ends of `√(1−z²)`'s cut and closes on one sheet anyway because `Σ n·α = 1 ∈ ℤ`. The rule is on
  the TOTAL monodromy `exp(2πi Σⱼ n(γ,bⱼ)·αⱼ)`, which is the same arithmetic as admissibility
  (research 06 §2.1(b)) read along a contour instead of along a component of the cut forest — and a
  decision for the same reason, since `αⱼ` are exact `Frac`s. A `log` point is the case no
  cancellation reaches, and an undecided winding now refuses instead of being skipped.
- **Cut classification depended on the cut's DISCRETISATION.** `joinToOneCut` puts a draggable control
  vertex at the midpoint of a bounded cut; for the dogbone's straight cut that vertex lands on the
  interior of both lips, where the "a bend resting on the piece's interior has no side" test read it
  as a bend and refused. It is not a bend, it is a handle. Interior vertices the cut runs straight
  through are now dropped before classifying, so the same geometric cut classifies the same way
  whatever vertices it happens to carry.
- **Every certified arc bound assumed the arc was centred at the ORIGIN.** `kernel/bounds/` reasons
  from `Σ|aₖ|R^k` over `|dₙ|Rⁿ − Σ|dₖ|R^k`, the reverse triangle inequality on `|z| = R` about `0`,
  and `arcRadius` never looked at the centre — every `vanish` arc in the app happened to be centred
  there. The dogbone's caps sit at its branch points. That is a `≤` computed from the wrong geometry,
  which is the one thing this app may not print, so an off-centre arc now gets no bound of this shape
  and says so. **The bound it needs is M4.6c's**, because D6's caps need the same thing with a branch
  factor on them (`|f| ~ C·η^{−1/2}` near `z = 1`, length `πη`, so `|∫| = O(η^{1/2})`) — one shifted
  expansion serves both, and building only the rational half now would be building it twice.

### The theorem is chosen by the geometry, and an undecided winding is not a "no"

`analyse` routes to the exterior identity when the contour winds about a branch point, so dragging a
keyhole until it swallows its branch point changes which theorem applies to it. An UNDECIDED winding
counts as "the cut may be inside": the alternative is handing the picture to the ordinary residue
theorem, which would confidently return `2πi Σ n·Res` for a contour it cannot describe. It routes here
and is refused by name instead. `ResidueTheoremResult` gained an `identity` field for the same reason —
the derivation panel used to open its SOLVE stage with a hard-coded `∮ = 2πi Σ n·Res`, which above a
dogbone's answer states the very equation D6 exists to show is inapplicable.

---

## 11. What M4.6c landed, and what it taught

`multiPowerAtPole`, `dogboneArcBound`, `multiFactorOf`, and **D6** — the nineteenth record and the
first whose contour encloses nothing. Four things changed a decision.

### The question is asked once about the PRODUCT, not once per factor

`argumentOfPole` refuses an argument that is not a rational multiple of π with denominator 1, 2, 3, 4
or 6 — and at D6's pole `ia` the two arguments are `π − arctan a` and `arctan a`, so it would refuse
both and the record would never run. Their half-sum is `π/2` for every `a`. So the weighted sum is what
gets asked and what gets verified, by clearing denominators:

    ∏ⱼ (z₀ − bⱼ)^{Nαⱼ}  =  ∏ⱼ (|z₀ − bⱼ|²)^{nαⱼ} · e^{iπNr},   n = lcm(den αⱼ),  N = 2n

Every power on both sides is an INTEGER power, so both products are exact elements of ℚ(i)(√d) and
`e^{iπNr}` is their exact quotient rather than a measurement. The float only chooses which lift of it
the declared determination means, and consecutive lifts are `2/N` apart in `r` — a gap the certificate
reports, because a guess-then-verify is only as good as the separation it had to choose across.

### A check nobody can trigger is worth replacing, not keeping

The first version checked that the guessed `r` sat within `1e-9` of the declared determination's own
`Σ αⱼθⱼ`. It cannot fail: `k` always rounds to the nearest allowed lift, so the gap is at most half a
step by construction, and the break pass said so — the mutation that disabled it broke nothing. The
replacement is a genuine second route: `c·∏|z₀−bⱼ|^{αⱼ}·e^{iπΣαⱼθⱼ}` in plain floating point, which
shares only `argInWindow` with the exact one. A wrong log weight, a dropped constant, a mis-lifted
phase or a fold that left the extension all show up there as a disagreement, and a disagreement is a
refusal. It is defence-in-depth for the fixtures the suite does not enumerate, and the break pass says
that too: disabling it alone changes nothing, disabling it and then breaking the log weight hides five
failures.

### The first bound that is not about the origin

Every bound in `kernel/bounds/` reasons from `Σ|aₖ|R^k` over `|dₙ|Rⁿ − Σ|dₖ|R^k` — the reverse triangle
inequality on `|z| = R` about `0`. A dogbone's end caps sit on its branch points, so `dogboneArcBound`
shifts the cofactor to the cap's centre first (`QiPoly.shift`, the same exact synthetic division the
residues use) and then states the bound this file already had, read about `w = z − b`. The other branch
points move the VALUE and not the exponent, because each is a positive distance away — which is checked
exactly, `η² < |b − bⱼ|²` over ℚ, since a cap reaching the far end of the cut has no bound of this form
at all.

**D6 cannot catch a missing shift**, and that is worth recording. Its poles are at `±i`, where reading
`|R|` about the origin happens to be conservative: the bound comes out ~2× too large, still true, still
`≤`. The test that makes the shift load-bearing is a VARIANT with a pole at `1 ± i/10`, just outside the
cap, where the unshifted reading says `|D| ≥ 0.9` (true about the origin, meaningless on the cap, where
`|D|` falls to 0.0075) and produces a bound of ~1.1 for an integral of ~10². Not a loose bound: an
invalid one, wearing a `≤`. A fixture that happens to be conservative is exactly how such a bug
survives, so the corpus needed a fixture chosen to break it rather than one chosen to pass.

### The constant in front of the product is not decoration

`W := −i·exp(½(Log(z−1) + Log(z+1)))`, and the `−i` is what makes `W(x + i0) = +√(1−x²)` on the upper
lip rather than `+i√(1−x²)`. Drop it and every residue rotates by the same factor: the answer stays
finite, stays plausible, and is wrong by `i` — the only symptom is a number that should have been real.
So `BranchSpec` gained a `constant`, and the break pass confirms it: removing it fails nine tests.
Alongside it, `multiFactorOf` refuses two different determinations in one product (D7 declares exactly
that, and reading both in the first window would rotate half the residues in silence), a `log` sharing
a bounded cut, a one-point product, and a cut naming a branch point the factor list does not.

### Three more things the browser said, and the unit tests could not

- **The result card hard-coded its own copy of the identity.** M4.6b moved the DERIVATION panel's
  copy onto `ResidueTheoremResult.identity`; the card above it had a second one, and above D6's answer
  it printed `2πi Σ n·Res` — the equation this record exists to show is inapplicable. Both now read the
  same field.
- **A skipped quadrature was printed as `0 + 0i`.** `integrateContour` fills the piece list with zeros
  when it declines to sample a multivalued integrand, which is a fine placeholder and a lie on screen:
  D6's upper edge is worth 2.22, and a zero beside it is exactly the number a reader would go looking
  for the bug in. It now says "not sampled".
- **The Poles card did not say whose residues it was showing.** A branch record's pole report describes
  the RATIONAL COFACTOR, and for D6 `Σ Res(R) = 0` — printed unqualified beside an answer of `π√2`, it
  reads as a contradiction. The card now names `R` and says that `Res(f, z₀)` is this times the branch
  factor's value there.

---

## 12. What M4.6d landed, and what it taught

`branchResidueAtInfinity`, per-factor determinations, a `Scalar` affine in two parameters, two folds
made partial — and **D7**, the twentieth record. M4.6's gate, verbatim, is met: its outer circle
contributes `2πi·(17/4)·e^{3πi/4}`, magnitude 26.7 in an answer of 1.216.

### The constant in front of the binomial series is DERIVED, not fitted

`Res(f,∞) = −[z⁻¹]f`, and with a branch factor the expansion is `Φ(z) = Λ·z^{Σα}·∏(1 − bⱼ/z)^{αⱼ}`. The
series is ordinary and exact over ℚ; the whole difficulty is `Λ`, and the temptation is to measure it at
a large point. It does not have to be. Along a reference direction `d`, the window-`j` argument of
`sⱼ·z` tends to a rational multiple of π — because the direction is one — so

    Λ = c·exp(iπ[Σ αⱼθⱼ − d·Σα]),   θⱼ = lift(d + [sⱼ < 0], window j)

is a root of unity with every ingredient exact. The direction is SEARCHED rather than fixed at `+i∞`,
because a cut may run that way; any one clear of every window's lower edge serves, and that the answer
cannot depend on which is `Σα ∈ ℤ` once more.

### `Σ αⱼ ∈ ℤ` is not bookkeeping at infinity either

The monodromy round a large circle is `e^{2πiΣα}`. Unless it is 1, `f` is not single-valued near
infinity, `C_R` is not a loop in its domain, and there is no residue there — not a hard one, **none**.
So the refusal is by name rather than a fallback, and it is the same condition that makes the bounded
cut admissible. D7's own hypothesis calls it `infinity-not-a-branch-point`; the engine now computes it.

### Two windows, and one factor written backwards

M4.6c read one window for the whole product, which D6 could live with and D7 could not: `z^μ` is
`[0,2π)` and `(b−z)^ν` is principal. And `(b − z)` is not `(z − b)` — the same NUMBER and not the same
POWER, because the argument read in the window is the argument of whichever difference the record wrote.
At `z = c > b` the difference is a negative real sitting exactly on the principal window's own edge:
`−π` is in `[−π, π)` and `+π` is not, they differ by a full turn, and using the wrong one rotates the
residue by `e^{iπ/2}` while leaving the final answer real and entirely plausible. `BranchFactor` gained
an `orientation`, and the break pass confirms both halves — ignoring the orientation fails nine tests,
reading every factor in the first window fails eight.

### An all-or-nothing fold cost D7 its closed form

Its answer carries `e^{−iπ + (ln 2)/4 + (3 ln 5)/4}`. The `−iπ` is the number `−1`; the logarithm is
`250^{1/4}`, which this basis CARRIES (ADR-0041's thesis — a quarter power is the exact form, not a
shortfall). Folding them together or not at all left the `−1` stuck to the logarithm, the exponent not
REAL, and `Re` therefore not distributing over the sum — so the record solved to the right decimal with
no closed form at all, **for want of extracting a minus sign**. `Exponent.splitAlgebraicFactor` returns
what folds and what is left. The same shape one level down: `LogPart.splitAlgebraic` folds prime by
prime, so D7's `10^{1/4}·6^{3/4} = 2·3^{3/4}·5^{1/4}` no longer prints its whole `2` as `2¹` because a
quarter weight stood beside it.

### A contour whose cut has PARAMETERS for ends

`Scalar` was affine in one parameter and a constant, and D7's upper edge runs to `b − η` with both of
them parameters. `add` may now be another `Scalar` — one nesting, which keeps the type an affine form
rather than an expression language. `derived` already exists for computed values and would have worked
at instantiate time, but it is computed ONCE: scrubbing `η` would leave the picture a hair open and the
ledger refusing a contour that had been closed a moment earlier.

### A golden this session invented, and the engine caught

The fourth fixture's `numeric` was written from the closed form by hand and was wrong in the third
decimal; the engine disagreed, an independent tanh-sinh quadrature agreed with the ENGINE, and the
record was corrected. Worth recording because it is the corpus working in the direction it is usually
assumed not to: the 28 records are the specification, and a transcription of one is still a
transcription.

### The browser found D7's own trap, looking back at the reader

The domain-colouring backdrop is drawn by the compiled evaluator, which uses the PRINCIPAL branch of
every sub-expression — so behind D7's dogbone it shows a seam on `(b, ∞)`, where `z^μ` and `(b−z)^ν`
each jump and their product does NOT. That is `rendering-the-union-of-sub-cuts` verbatim, research 06
§2.2's Maple lesson, drawn by the app about its own record. It has been true since D1 (a keyhole's
`[0,2π)` is not the principal window either) and it is M4.7's to fix, since rendering a declared
determination is exactly what the GPU slice is for. What changed now is that the app says so: a record
with a branch carries a line stating that the colouring is the principal branch and the ledger is not.
The distinction matters — every number on the right comes from exact residues in the DECLARED
determination, which is also why the quadrature is skipped — and an app that draws one branch while
computing in another must not leave the reader to notice.
