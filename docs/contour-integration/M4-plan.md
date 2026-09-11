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
| **M4.3** | `linear.ts` over a `Field` · ℚ(i)(π) · the rank/kernel report · the additive `crossingPhase` → **D4** | M–L |
| **M4.4** | `prerequisites` chaining, a borrowed verdict *meeting* into the final one → **D5** | S |
| **M4.5** | `ln(ℚ₊)` exponents and radical factors → **D2, D7's algebraic half** | S–M |
| **M4.6** | dogbone template · `Res(f,∞)` as a first-class row → **D6, D7** | M |
| **M4.7** | the GPU picture: `cutCorrection`, `cargCut`/`clogCut`/`cpowCut` twins, `DUAL_BACKEND_CORPUS`, monodromy readout, sheet badge, shadow-cut mode, **drag-a-cut** | M–L |

### Gates

- **M4.1** ✅ — drag a cut and watch the admissibility verdict change; a piece crossing a cut without a
  `side` tag refuses and names the repair ("tag this segment `above` or `below`, or move the cut").
  Both halves verified in a browser: the "Branch cuts" card's verdict changes live as the dogbone is
  joined and split, and the ledger's own LEGALITY rows change with it.
- **M4.2** ✅ — **north-star #4, verbatim.** D1's `arg ∈ (−π,π]` trap is reported as the earliest of
  its three refusals that this engine can see: the cut swings onto ℝ₋ and both untagged circles cross
  it (LEGALITY step 2). D3 lands with it, including the two integer-`a` fixtures that must refuse.
- **M4.3** — D4's three targets solve, and the wrong `argRange` reports *"this contour carries no
  information about `∫₀^∞ R(x) log x dx`"* as a computed rank statement rather than a hand-written
  detector.
- **M4.4** — D5 refuses to close **alone**, names `T0` as the missing input, and closes when D4
  supplies it — with the borrowed value's rigor meeting into the result, never silently upgrading it.
- **M4.6** — D7's outer circle contributes `2πi·(17/4)·e^{3πi/4}`, magnitude 26.7 in an answer of
  magnitude 1.216. The residue at infinity is not an edge case, and D6 passing only because
  `Res(f,∞) = 0` is the coincidence that would hide the bug.
- **M4.7** — **north-star #3**; CPU/GPU parity green in a browser suite.

### Two prerequisites

- **The app has no `test:browser`** and is not in the root hardcoded chain. M4.7's parity gate needs
  one; it belongs at the head of that slice, not bolted on at the end.
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

## 4. What M4.1 actually landed, and what it taught

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

## 5. What M4.2 landed, and what it taught

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
  them by name today: a coefficient outside ℚ(i) with more than one unknown says so.
