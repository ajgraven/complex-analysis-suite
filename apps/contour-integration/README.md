# contour-integration

A sandbox and worked-example gallery for **contour integration and the residue theorem**, including
the evaluation of real definite integrals in closed form.

The distinguishing capability is not that it computes `∮γ f dz` — several tools do — but that it
reports whether your *argument* is finished: which contour pieces vanish, with what certified bound,
which reproduce the target, which poles are caught and with what winding number, and therefore
whether the whole thing closes.

## Status

**Through Milestone 5 and published, with M6 begun. THE GALLERY IS COMPLETE — all 28 records load,
and every one of them is executed against the engine in the test suite.** M5.0 (tier D's quadrature cross-check),
M5.1 (the sandbox declares a branch factor), M5.2 (one predicate for L3 and L6, and the corrected
L6), M5.3 (tier E's E1 and E2), M5.4 (tier F's F1, on the wedge), M5.5 (tier G's machinery — the
square, the summation kernels and the corrected bound), M5.6 (tier G's solve, and G2), M5.7 (the
COLLISION — G1 and G3) and M5.8 (the cross-family invariants, ADR-0042's `knownValue`, and the last
two records E3 and F2) are all done. See the milestone table in
[`../../docs/contour-integration/PLAN.md`](../../docs/contour-integration/PLAN.md) §7.

- `∮ f dz` comes from `2πi Σ n(γ,aₖ)·Res(f,aₖ)` — a *formula*, not a quadrature — with exactly
  decided winding numbers and exact residues over ℚ(i) or one quadratic extension of it, so
  `1/(1+z⁴)` reads `π√2/2`. Numerical quadrature is demoted to an independent **cross-check**.
- Arc bounds are certified in exact ℚ with **no floating point in the chain**, including certified
  rational brackets on π. `deg Q ≥ deg P + 2` is *derived* from the exponent, never asserted.
- The **Closing Ledger** (COVER / KILL / CATCH / LEGALITY) answers "does this argument close?", and
  a wrong contour fails diagnostically.
- The **Family loader** and its four invariants run the gallery records as data. **All 28 load and
  are executed against the engine in the test suite** — every entry in every tier. The thirteen of
  tiers A–C are:
  A1–A7 (circle and semicircle, through the `z = e^{iθ}` substitution and the Cauchy integral
  formula), B1–B3 (Jordan, through the exponential basis `Σ cₖ e^{βₖ}`), and C1–C3 (the indentation
  and L4's `iα·Res`; removability detected, with L5's non-vanishing arc; and a real pole and a
  complex pole in one ledger). Each solves to a symbolic closed form — `π/2`, `π√2/2`, `π/e`,
  `π − π/e`, `2π/n!` — because the solve runs in units of π and never evaluates it. Tier D's seven
  (branch cuts) landed in M4 and carry their forms rather than reducing them. Tiers E–G landed in
  M5, on the kernel families that tier needs — the quasi-periodic strip (E1, E2), the wedge (F1, F2),
  the `πcot`/`πcsc` summation kernel (G1–G3), and the two Cauchy-theorem records whose singular set
  is EMPTY (E3, F2), where the answer comes from one value the argument imports rather than derives.

**M4.1 (branch cuts) has landed**, engine and editor:

- A **cut is a choice**, not a property of `f`. `src/kernel/branch/` holds the model (exact `Frac`
  exponents, because admissibility asks whether `Σ αₖ` is an *integer*), research 06 §2.1's
  admissibility check, a continuous-argument lift, and the piece-versus-cut classifier.
- **LEGALITY steps 2–3**: the cut system must be admissible, and any piece meeting a cut must declare
  which side it runs on. A crossing with no `side` tag refuses and names the repair; a *grazing*
  contact refuses too, because it has no side for a tag to pin. Neither row is emitted at all for a
  rational integrand. (From **M5.0** the tag is also *honoured* — see below — so it decides a number
  rather than only passing a check.)
- The sandbox's **Branch cuts** card declares points and cuts. Points and cuts are draggable by
  pointer and keyboard, and the dogbone gesture — one bounded arc ⟷ two rays to ∞ — is the round trip
  research 06 calls the most valuable interaction in the app. Whether a given join is *legal* is the
  rule's call, not the button's.
- **LEGALITY also asks the topological question** one piece of geometry cannot: the winding number of
  the whole contour about each branch point must be zero, or it is not a loop in ℂ∖Γ at all. That is
  what makes a keyhole legal (`+1 − 1 = 0`) and a bare circle about a branch point not, and it is
  decided by the same exact-sign predicates the poles use.

**M4.2 (tier D begins) has landed** — north-star behaviour 4:

- `∫₀^∞ x^(α−1)/(1+x) dx` prints **`π/sin(πα)` labelled `=`**, and
  `∫₀^∞ x^(a−1)/(1+xⁿ) dx` prints **`(π/n)/sin(πa/n)`**. D1 and D3 are the fourteenth and fifteenth
  loaded records.
- The exponential basis carries π as an **indeterminate**: `β = ℚ(i)(√d) ⊕ ℚ(i)·π`, so `e^{2πiα}` and
  `e^{iπ(α−1)}` are compared by exponent rather than by tolerance. One **sine recogniser** factors
  `a − b·e^{β}` with `|a| = |b|`; everything outside that shape refuses by name.
- Every residue is evaluated in the **declared `argRange`**, with the argument guessed numerically
  and then verified in exact arithmetic — the same guess-then-verify discipline the pole-finder uses.
  A point 0.003 off a quarter turn is refused, not rounded onto one.
- D3's residue sum is computed **without naming a root**: at `n = 5` and `n = 7` no root of `1 + zⁿ`
  fits one quadratic extension, and the sum needs none.
- **Three refusals are structural**, not detected: the wrong `argRange` moves the cut under the
  contour; integer `α` makes the coefficient exactly zero; and a cancellation may simplify a
  derivation but never rescue one — so at integer `a`, where D3's closed form is still correct *by
  continuity*, the app refuses the keyhole route rather than printing a right number from a collapsed
  argument. `Golden.refuses` is how a fixture says that about itself.

**M4.3 has landed with it** — D4, and the first record that is not solved by dividing:

- `∫₀^∞ log x/(1+x²)² dx` prints **`−π/4`**, and the SAME contour returns `∫₀^∞ dx/(1+x²)² = π/4`
  for free. One complex identity in three unknowns: read as one equation its rank is 1 and two of
  the three integrals are invisible; split into real and imaginary parts — legitimate only because
  the unknowns are real, which the record must declare — its rank is 2.
- **Pass 5 is a linear system over ℚ(i)(π)**, not a division. π is transcendental, so ℚ(i)[π] is a
  polynomial ring and elimination in its fraction field is exact: the rank stays DECIDED, which is
  the whole reason `linear.ts` exists. `∫R log²x` is reported as invisible — `?`, not a refusal and
  not a number.
- `Res(R·log^m z, z₀)` comes from the Laurent principal part of `R` convolved with the expansion of
  `log^m` about the pole, so a double pole mixes both halves: `Res(log²z/(1+z²)², i) = −π/4 + iπ²/16`,
  as the record states. Checked against an independent quadrature to 1e−12.
- **The coefficient row is derived from the declared crossing increment** and compared with what the
  record wrote: `−(log x + 2πi)² = −log²x − 4πi log x + 4π²`. Three of D4's traps stop being
  detectors and become arithmetic, and the same derivation at one log lower is the
  `plain-log-loses-the-log-integral` trap — its row is `[−2πi, 0]`, and that zero IS the log
  integral going invisible.

**M4.4 adds D5, the first record that does not close alone:**

- `∫₀^∞ (log x)²/(1+x²) dx = π³/8` — but its `log³` keyhole gives two real equations in three
  unknowns. It determines `∫R log x` outright and `∫R log²x` only **modulo `∫R dx`**, which this
  contour cannot supply. Remove the record's `prerequisites` and the app says so, naming `T0` from
  the kernel rather than from a hand-written message.
- **The dependency is executable.** `from: "family:log-squared-keyhole"` means the engine runs D4 at
  **the same binding** and reads `∫R dx` out of it. Borrowing at D4's own fixture instead would
  return `π/4` where `π/2` is needed, and answer a different question with confidence.
- **The borrowed verdict meets into what depends on it, and nothing else.** Dependence is decided in
  ℚ(i)(π): `∫R log x` comes off the real part of the identity, where the borrowed term's coefficient
  is zero, and stays exact on its own contour; `∫R log²x` comes off the imaginary part and carries
  the input's certificate. A record expecting `≈` keeps `≈` however exact its source turned out to be.
- The second fixture exists because of a trap. D5's own record says the `1/i` sign error is invisible
  at `R = 1/(1+x²)`, where the bonus is `0` either way; at `p = 2` the bonus is `−π/4` — **D4's own
  primary answer at the same `p`**, reached by a different contour, so the two records cross-check
  each other on a number neither takes from the other.

**M4.5 completes the output basis, and lands D2:**

- `∫₀^∞ √x/(x²+6x+8) dx = π(1 − 1/√2)` — the first record whose poles are **off the unit circle**.
  `(−2)^{1/2} = e^{(1/2)(ln 2 + iπ)}`: the argument is decided in the declared determination as it
  always was, and the modulus arrives as a symbolic `ln 2` in the same exponent. Dropping it — what a
  basis carrying only the argument does — returns `π/2`, which is plausible and wrong.
- **The logarithms are carried over PRIMES.** `ln 4 = 2ln 2`, so a representation keyed by the
  rational it came from would hold their difference as a two-term sum that is not obviously zero, and
  the sine recogniser would be comparing forms rather than numbers. Unique factorisation keeps
  equality a decision; trial division **refuses** rather than returning an uncertified atom.
- **And folds back out.** `e^{ln 2}` is the number 2 and `e^{(ln 2)/2}` is `√2`, so D2's answer reads
  `π − π√2/2`. A weight with denominator 3 or 4 — `10^{1/3}`, `40^{3/4}` — is carried instead and
  printed as a power, which is the whole thesis: the FORM is exact and only the decimal is `≈`.
- D2's crossing phase is **real**: `e^{2πi(s−1)} = −1` at `s = 3/2`, so the two edges ADD and the
  sine is `sin(π/2) = 1`. A real-valued phase looks like no phase, which is exactly when a reader
  concludes the edges must cancel.

**M4.6 is the dogbone's:**

- `Res(f,∞)` is exact over ℚ(i) by one polynomial division, and `Σ_finite Res + Res(f,∞) = 0` checks it
  against a computation sharing none of its arithmetic. **One number decides two rows**: the order at
  infinity `p = Σαⱼ − (deg D − deg N)` says both whether the outer circle vanishes (L2 wants `p < −1`)
  and whether the residue there is zero (`p ≤ −2`). The implication runs one way — `1/z` is regular at
  infinity with `Res = −1` — so the certificate says which direction it establishes.
- **The contour with the cut inside it does not satisfy the residue theorem.** A dogbone winds zero
  times about every pole and its integral is not zero; the hypothesis that fails is holomorphy, because
  the CUT is inside. What holds is `∮γ = 2πi[Σ (n(γ,aₖ) − σ)·Res(f,aₖ) − σ·Res(f,∞)]` with `σ` the
  winding about the branch points — and that is the *ordinary* residue theorem applied to `γ − σ·C_R`,
  which winds zero times about the cut. `σ = 0` gives the plain theorem back term for term.
- **The outer circle is not drawn, and its absence is the claim.** Drawing `C_R` would be two disjoint
  loops called one path, and would make every winding number `1` — the fact the dogbone exists to deny.
  `∮_{C_R,ccw} = −2πi·Res(f,∞)` is the definition of the residue at infinity, so the circle appears as
  that row instead, exactly and not as an estimate.
- **What the fixtures cannot test is said out loud.** `Σ Res + Res(f,∞) = 0` for every rational `f`, so
  no rational fixture can falsify the SIGN of `σ` — it kills the whole `σ`-dependent term. The pole
  weights and the residue at infinity are each falsified against the quadrature; the sign waits for D6,
  and the certificate says so rather than leaving a reader to find out.
- The sandbox gains the **keyhole** and the **dogbone**, each offering the cut system its shape
  presupposes — declared objects in the Branch cuts card, draggable and removable, never overwriting a
  cut already placed. Which theorem applies is then decided by the geometry: drag a keyhole until it
  swallows its branch point and the identity changes with it.

**M4.6c lands D6 — `∫₋₁¹ dx/((x²+a²)√(1−x²)) = π/(a√(1+a²))`, the nineteenth record:**

- **The individual arguments need not be rational multiples of π. The weighted SUM is.** At the pole
  `ia` the two are `π − arctan a` and `arctan a`, and nothing in this basis holds either; their
  half-sum is `π/2` for every `a`, and that is the whole reason the dogbone has a closed form. So the
  question is asked once about the PRODUCT: raising it to its exponents' common denominator clears
  every fractional power, and the phase is then an exact quotient in ℚ(i)(√d) rather than a
  measurement. The engine then checks itself against a direct evaluation of the declared branch,
  sharing only the window — a disagreement refuses.
- **The branch takes OPPOSITE signs at the conjugate poles.** `W(x + i0) = +√(1−x²)` forces
  `W(+ia) = +√(1+a²)` and `W(−ia) = −√(1+a²)`. Using `+` at both — the natural symmetry reflex —
  makes the residues cancel and returns exactly **0** instead of `π/(a√(1+a²))`, and nothing about the
  result looks wrong. The record's constant `i` is load-bearing for the same reason: drop it and every
  residue rotates, the answer turns imaginary, and only that shows.
- **The cap bound is taken about the cap's OWN branch point**, by exact synthetic division — the first
  bound in `kernel/bounds/` that is not about the origin. `|∫| = O(η^{1+α})` vanishes iff `α > −1`,
  which is the integrability of the endpoint singularity, spent there. `η² < |b − bⱼ|²` is checked
  exactly, because a cap reaching the far end of the cut has no bound of this form at all.
- **`Res(f,∞) = 0` is certified, not assumed**: `f = O(|z|⁻³)`, the same number that would discharge an
  outer circle. And the two edges **ADD** — `W` changes sign across the cut and the traversal is
  reversed, two minus signs making one — so `∮ = 2T` where a reader expecting cancellation gets zero.

**M4.6d lands D7 — `∫₀^b x^μ(b−x)^{1−μ}/(c−x) dx`, the twentieth record, and completes M4.6:**

- **`Res(f,∞)` is not a correction here, it is most of the identity.** `f → e^{iπμ} ≠ 0` at infinity, so
  `2πi·Res(f,∞)` has magnitude 26.7 in an answer of magnitude 1.216. Drop it and the answer is **still
  perfectly real** — so the usual "it came out complex, I made a mistake" check does not fire — and it
  is wrong by a factor of 14.5 and by a sign. The test computes that wrong number rather than asserting
  the trap in prose.
- **The residue at infinity comes from the binomial series, with its constant DERIVED.** For `|z|` past
  every branch point, `Φ(z) = Λ·z^{Σα}·∏(1 − bⱼ/z)^{αⱼ}` with `Λ = c·e^{iπ[Σαⱼθⱼ − d·Σα]}`, where `θⱼ`
  is the window-`j` argument along a reference direction `d`. Every `θⱼ` is an exact rational because
  the direction is, so `Λ` is a root of unity decided rather than fitted; the direction is SEARCHED,
  because a cut may run the obvious way. **`Σ αⱼ ∈ ℤ` is required and refused by name**: otherwise the
  monodromy round a large circle is not 1, `f` is not single-valued there, and there is no residue at
  infinity — not a hard one, none.
- **Two windows, and one factor written backwards.** `z^μ` is read in `[0,2π)` and `(b−z)^ν` in the
  principal window — and it is `(b − z)`, not `(z − b)`: the same number and not the same power,
  because the argument read in the window is the argument of whichever difference the record wrote. At
  `z = c > b` that is `arg = −π` and not `+π`, which rotates the residue by `e^{iπ/2}` and leaves the
  answer real and plausible.
- **A quarter power is the exact FORM.** The answer prints `(−π·2^(1/4)·5^(3/4) + 17π/4)/sin(3π/4)` —
  the record's `(π/(2√2))(17 − 40^{3/4})`, with `250^{1/4}` factored over primes because that is what
  keeps equality a decision. Two folds had to become partial for it to appear at all: `e^{−iπ + log}`
  now yields its `−1` while carrying the logarithm, and a logarithm folds **prime by prime**, so one
  quarter weight no longer disqualifies the whole one beside it.
- The dogbone hugs `[0, b]` with `b` a PARAMETER, so its upper edge runs to `b − η` — affine in two of
  them. A `Scalar`'s `add` may now be another `Scalar`, which keeps the picture live under a drag where
  a derived value would go stale.

**M4.7a–b bring the branch-cut layer to the GPU, with a gate that can tell the two apart:**

- **The app has a `test:browser`.** Its real GLSL is compiled and linked for the first time — the
  sandbox's presets and all twenty records' contour integrands, 28 programs the node gate structurally
  could not build — and the branch-cut layer is executed in real WebGL2 against its TS twin.
- **The correction is a DIFFERENCE of two crossing counts, so the shadow cancels.** `f_Γ = f_ref ·
  exp(2πi·[m_Γ − m_ref])` with `m = −Σ σⱼ·Jⱼ` over jump-weighted signed crossings of `[z₀, z]`: the
  declared arcs enter one array at `+J` and the reference rays enter the same array at `−α`, which is
  why it is one loop and one uniform block. Γ equal to the reference gives exactly zero, term by term.
- **What the reference IS cannot be inferred from the branch points.** `csqrt(1 − z·z)` is principal in
  its *argument*, so its cut is where `1 − z² ∈ ℝ₋` — two rays pointing OUTWARD, not two pointing left
  — while `(z−1)^{−1/2}(z+1)^{−1/2}` has the other reference for the same function. Assuming C99's
  principal cut per branch point drew D6 wrong. The reference is now declared, read off each factor's
  `argRange`, and a point with nothing declared gets no reference ray rather than an invented one.
- **An integer correction is no discontinuity — which is admissibility, seen.** D6's bounded cut
  `[−1,1]` and its `[0,2π)` window rays are the same determination, and what *proves* it is that the
  correction comes out an integer everywhere: `α₁ + α₂ ∈ ℤ`, arriving as a property of the picture.
- **`argCut` adds whole turns rather than taking a modulus**, so at `θ₀ = −π` it returns `atan2`
  bit-for-bit instead of one ulp away, and gives the half-open convention on `ℝ₋` for free.
- **The parity gate's floor is `sin`/`cos`, not float32.** GLSL ES 3.0 §4.5.1 is ULP counts throughout
  except there, where the requirement is an *absolute* error below `2^-11` — 4.9e-4, four orders looser
  than float32's eps, and SwiftShader spends 39% of it while `atan` delivers 8.5e-7. The first draft
  asserted 3e-5 and went red on a correct shader; the bound is now derived from the spec rather than
  fitted, and still three orders below a wrong branch (`2|sin πα|` = 1.4 at `α = ±1/2`).
- **A mutation sweep kills 17 of 17.** Two of the first fifteen survived, and both were comments in the
  shader that nothing checked: the turn count replaced by a modulus (~1e-7, under every tolerance), and
  `<` loosened to `<=` so a grazing touch counts as a crossing (no point of a generic grid lies exactly
  on a cut). Both are asserted directly now — exact equality with `atan()` in float32, and hand-picked
  samples lying exactly on a cut, a vertex and a branch point.

**M4.7c puts the DECLARED determination on the stage:**

- **The phase portrait is built from the record's own factorisation, not corrected into it.** Each
  factor `(sⱼ(z − bⱼ))^{αⱼ}` is evaluated in the argument window the record declares, on the CPU and
  in GLSL, so the picture and the ledger are on the same sheet. D7's seam on `(b, ∞)` — where the
  composite is continuous and the compiled evaluator drew a jump anyway — is gone.
- **Constructing beats correcting, and D6 says why.** Multiplying the compiled value by
  `exp(2πi·m(z))` needs the reference to be a system of rays from the branch points, and
  `csqrt(1 − z·z)` is one principal square root of a quadratic whose cut is where `1 − z² ∈ ℝ₋`. In
  general the principal cut of a composite is a curve; a ray-based correction is right about D6 by
  luck. The declared product has no reference to get wrong.
- **The shader is generated per record**, so the record's declaration lives in the program text. A
  uniform array would make the orientation runtime data, and `(b − z)^ν` is the same number as
  `−(z − b)^ν` and not the same power — D7's trap, one wrong uniform away.
- **Modulus contours, and the right sentence beside them.** `|f|` cannot see the determination for a
  power product, so its level curves cross the seam — the clearest evidence that the seam is a choice
  (research 06 §5.1's device #2). Over a `log^m` that is FALSE: the monodromy is additive, the two
  determinations differ in modulus by 18.7× for D4 and 80.7× for D5, and the contours break at the
  cut. The card says which case is on screen; the suite asserts both.
- **The cut carries its jump weight** — `J = 3/4` on D7's dogbone, `J = ∞` on a log's keyhole, since
  infinite-order monodromy has no finite jump and a number there would be the app's first dishonest
  label.

**M4.7d completes M4 with north-star #3 — drag a branch cut:**

- **Nothing changes, and the app says so.** `∮` comes from `2πi Σ n·Res` with residues read in the
  declared window, so it does not depend on the cut's geometry: with the cuts clear of the contour,
  the value is EXACTLY invariant under any deformation of them, and that is a ledger row rather than
  a number a reader has to watch not move. The reason is the correction's own definition, so the
  invariance is a consequence of how the picture is computed. It is also what makes the jump
  meaningful — a value that drifted under a drag would make a jump one more wobble.
- **The crossing names its factor, in BOTH forms.** Research 06 §3.2 requires the app to refuse a
  crossing or change sheet "with the multiplicative factor shown"; it refused from M4.1 and said
  nothing, which teaches that a cut is a wall rather than a choice with a price. Now the refusal and
  the Branch-cuts card both carry `e^{2πi(α−1)} = e^{2πiα}` — the literal exponent the integrand
  gives and the textbook's reduced one, with the reason they agree — because a reader who only meets
  the reduced form carries it to an `x^s` integrand where the `−1` is not there to cancel.
- **The factor folds only when it can.** `e^{2πiJ}` is built in the app's output basis, so it becomes
  `1`, `i`, `−1` or `−i` exactly when `4J ∈ ℤ` and is carried as an exponential otherwise — `e^{2πi/3}`
  wants a cube root of unity neither ℚ(i) nor one quadratic extension has. An integral jump weight is
  no crossing at all and reports nothing, rather than announcing a factor of 1.
- **Shadow cuts** (research 06 §2.3): the cuts become the rays pointing away from the base point and
  swing like shadows as you drag the lamp. Always admissible — every ray reaches infinity — which is
  exactly why it cannot express the dogbone, so the declared arcs are kept underneath and the toggle
  gives them back. A branch point sitting on the lamp casts no shadow and is refused by name.
- In the sandbox the cut is your declaration and the colouring is the principal branch of what you
  typed; the app says they need not coincide, because the determination a written expression is in
  cannot be inferred from it. Under a record they do coincide, which is what M4.7c built.

**M5.0 honours the `side` tag, and tier D gains the second opinion it never had:**

- **A signed zero, not an offset contour.** Research 06 §3.3 says to offset the *branch* rather than
  the contour, and objects to an `ε`-offset path twice over: it injects an `O(ε)` error, and near a
  branch point the integrand varies on scale `ε` so the quadrature cost explodes. Both objections are
  about a geometric `ε ~ 1e-6`. This is neither — the displacement is `1e-30` and lives inside the
  evaluator, so the contour's nodes and its `dz` are untouched and exact. Every lip in the corpus
  runs from `η ≈ 0.1` outward, so it moves `arg` by `~1e-29` (enough for `atan2` to return `θ₀ + 0⁺`
  rather than a coin toss) and `|·|` by `O(1e-60)`, below float64's resolution. The value is the
  limiting boundary value *to full precision*, which is exactly what §3.3 asks for.
- **Seven records, seven agreeing quadratures**, where before there were none: sampling `z^α` needs a
  determination and a compiled evaluator silently takes the principal one, so a keyhole's two lips
  returned the same value, cancelled, and a "second opinion" answered a different question with
  confidence — worse than none, and honestly skipped. Each lip is now evaluated at the limit from its
  own declared side, so the corroboration is of the same integral.
- **The claim is a ratio, not a magnitude.** Tier D's gap is `1e-3…1e0`, four orders looser than
  tiers A–C's `1e-14`, because a lip carries an endpoint singularity that Gauss–Legendre converges
  slowly against. What makes it evidence is that it stays within a small multiple of the quadrature's
  *own* error estimate — ~1.5× on every record — since a systematic error in either route would show
  as a gap the estimator cannot explain. A flat tolerance loose enough to pass would assert nothing.
- **Mis-declaring a side reaches the VERDICT**, and that is a test rather than a remark. "Seven
  records agree" would also pass against an evaluator that ignored the tag and happened to be right,
  so the suite runs each record a second time with both lips forced `"above"` — the old cancellation
  — and requires the honest declaration to be more than 10× closer to the exact value *and* the
  mangled one to drop from `=` to **`⚠`** with no corroboration offered. The contradiction goes into
  the verdict because the exact route and the quadrature cannot both be right and the app must not
  pick a favourite.
- **The picture is in the determination the number is in.** The accumulation panel is a head-to-tail
  sum of `f(zₖ)·Δzₖ`, so without the sides a keyhole's two lips draw as retracing each other — a
  trail visibly closing to nothing beside a result card saying the integral is `π√2`. `Analysis`
  hands back the `sides` it integrated with, so both come from one array rather than two paths that
  can drift; measured, the trail tracks the integral 4.7×–441× better with them than without.
- **One skip survives, narrower and better.** A side pins no limit where the cut runs *vertically*
  through the piece: "above" then displaces **along** it, `arg` does not move, and `atan2` picks a
  limit by coin toss. No record is in that shape, but the question is asked per record rather than
  assumed, and one that were would be refused **by name**.
- The golden corpus's fork on "does this record have a branch factor" is **gone**, which is the real
  payoff: every one of the twenty is now checked against floating panels that share no machinery with
  the exact route, so an uncorroborated record cannot hide behind a special case. The **sandbox** is
  deliberately not covered — it can declare cuts but not a branch *factor*, so its quadrature stays
  in the principal determination whatever its lips say; that is M5.1.

**M5.1 gives the sandbox a branch FACTOR — and D1's trap becomes something you can reach by hand:**

- **The gap was bigger than it read.** `findPoles` on `z^0.3/(1+z)` reports `rational: false` and
  ZERO poles, so there was no exact value at all and the ledger failed at KILL. The sandbox did not
  compute a *wrong* answer for a multivalued integrand — it computed none, which is why "dragging a
  cut changes the answer" had nothing to be true of.
- **Declaring is an explicit act with a stated cost.** The keyhole and dogbone templates already
  seed a cut system, so inferring a factorisation from "there are branch points" would silently
  reinterpret whatever was typed the moment a template was picked. Once declared, the integrand box
  holds only `R(z)` and the assembled form is shown beside it.
- **The split is checked, not believed.** The app cannot verify intent; it can verify that
  `declared · R(z)` is the expression the box held a moment earlier — and *where* that comparison is
  legitimate is computed rather than assumed. `@cas/expr` compiles in its principal branch, a
  keyhole window is `[0, 2π)`, and the two disagree on the whole lower half plane where the split is
  *correct* and the numbers differ anyway. So the product is evaluated a second time in the
  principal window, and only where those agree is anything claimed. An unverifiable split is
  REFUSED rather than failed, and the three ways of being unverifiable read differently — including
  the likeliest, an unbound parameter, since `@cas/expr` evaluates one to **zero** rather than
  refusing and the integrand is then silently the zero function.
- **The determination is a dropdown, and moving it is D1's `wrong-branch` trap.** `∮ = 2π` at
  `arg ∈ [0, 2π)`; switch to `[−π, π)` and the cut swings onto ℝ₋ under the outer circle, LEGALITY
  refuses by name, and no `∮` is printed. Dragging the cut *clear* of the contour changes the value
  not at all — bit for bit — because `∮` reads the window and `powerAtPole` takes no geometry.
- **The sheet spinner** (research 06 §5.3, deferred in M4.7d for want of a factor to multiply) needed
  no new machinery: a sheet is a whole-turn offset of the declared window. The residues then pick up
  `e^{2πisα}` exactly, a **log shifts additively instead** — for free, with no branch anywhere in the
  code — and the cut does not move. At α = −1/2, sheet 1 turns `2π` into `−2π` and the badge names
  the factor. `BranchChoice.sheet`, carried and unread since M4.1, is read at last.
- The sandbox's colouring is now built from the declared factorisation, so its seam and its cut stop
  being different objects, and the pole card says it lists the poles of `R(z)` — a branch point
  carries no residue of its own.

**M5.2 gives L3 and L6 one predicate, and corrects L6 (finding D-1):**

- **The two are the same inequality.** `sin ψ ≥ 2ψ/π` (Jordan) and `cos φ ≥ 1 − 2φ/π` (the wedge
  lemma) are one statement under `φ = π/2 − ψ` — measured on 5001 points, the slacks agree to
  2.2e-16. Two of the eight catalogued lemmas now discharge through one predicate, which the
  derivation panel shows without a special case.
- **What that predicate decides is the SIDE CONDITION, not the inequality.** The inequality is a
  theorem about the concavity of `sin`; no arithmetic here could establish it. Whether the range
  asked about lies inside `[0, π/2]` is decidable in exact ℚ — and that is exactly the half research
  03 got wrong, which is why sharing it is worth more than sharing a sentence.
- **D-1, and it is the two faces parting company.** The research stated L6 for `e^{−zⁿ}` on
  `θ ∈ [0, π/n]` while justifying it with an inequality valid on `[0, π/2]`. Past `nθ = π/2` the
  `cos` face changes SIGN and `e^{−Rⁿcos nθ}` grows — at `θ = π/n` it is `e^{+Rⁿ}` — while the `sin`
  face merely folds by `sin ψ = sin(π − ψ)` and costs a factor of two. The stated majorant diverges:
  **2.7e15** at `n = 2, R = 6`, **1.1e93** at `n = 3`, float64 overflow at `n = 4`, all three
  recomputed in the suite. In the app they are two rows on one wedge: at `π/2`, `e^{iz²}` is killed
  and `e^{−z²}` is refused.
- **The bound is reachable, not a module nothing calls.** `|∫| ≤ |λ|·k·π/(n·c·R^{n−1})` for
  `λ·e^{w zⁿ}`, exact in ℚ with π entering only through the certified upper bracket, routed from the
  ledger's KILL pass — where such an arc previously reached **no lemma at all** (Jordan's reader
  wants a linear exponent, and the exact rational reader refuses a `call`). The wedge template is
  M5.4; until then the routing is exercised through hand-built sectors.
- **Jordan is this bound at `n = 1`:** `π/(n·c·R^{n−1})` is `π/|a|` there, and the two agree in ℚ.
  They stay separate functions — Jordan carries a rational cofactor's `max|g|` and the wedge carries
  none — because merging them would make one function's asymptotics come from two unrelated places.
- The arc-extent reader gains the wedge angles `π/n` and `π/(2n)` up to `n = 6`, which it could not
  previously measure, and refuses a degenerate extent: an ML bound of `0·π·R·max|f|` is a `≤ 0` on
  an arc whose integral is small and non-zero.

**M5.3 opens tier E: E1 and E2 load and solve, and the sign of λ decides everything.**

- **The plan said "mostly wiring"; measuring first said otherwise.** `findPoles` gave
  `e^{0.3z}/(1+e^z)` `rational: false` and **zero poles** — the same report it gave `1/cosh z`
  (infinitely many) and `e^{−z²}` (genuinely none). So **entirety became a DECISION** first
  (`kernel/entire.ts`): a sufficient condition, shaped so a refusal cannot be read as a claim —
  `sin(z)/z` is entire and refuses — with each refusal naming which of three walls it hit.
- **`w = e^z` makes both integrands rational, and their poles LATTICES.** `e^z = ρ` has solutions
  every `2πi`, so the record declares which band its argument is about; a list of infinitely many is
  not a list. One stated restriction (each root of `D` is a root of unity) keeps it exact with **no
  new number field** — `log ρ = 2πi·q` and the residue lands in M4.2's basis.
- **E1's window `0 < a < 1` is DERIVED.** The app's first vanishing SEGMENT (a rectangle's verticals
  reached no lemma at all before this) gives `κ = Re(a) + deg N − deg D` on the right and
  `−Re(a) − ord₀N + ord₀D` on the left. Their signs are `a < 1` and `a > 0` — the record's "one
  condition, two jobs", out of the geometry. E2's "no condition at all" is the same expression at
  `Re(iξ) = 0`.
- **A strip has TWO denominator shapes.** `1 − λ` factors as a sine when λ is on the unit circle
  (`π/sin(3π/10)` — which is D1's text, since `x = log t` carries one onto the other) and as a
  **hyperbolic cosine** when λ is a negative real (`π/cosh(π)` = `π sech(πξ/2)`). E2 exists to teach
  the second. A cosh cannot degenerate, which is that record's "unconditionally well-posed" claim as
  a property of the factoring rather than a range check.
- **A right value under a wrong form, found and fixed.** `solveTarget` rebuilt the solved form field
  by field and carried only `sine`, so E2's value divided by the cosh while its text printed a bare
  `π` — for numbers that were 0.271, 1.252 and 0.590. Nothing about that looks wrong.
- **The declared strip is checked against the contour that was drawn:** the lattice points one period
  either side are asked for their winding numbers, and enclosing one — or passing through one —
  refuses. E1's `wrong-strip-height` trap at run time. The check was inert when first written.
- **E3 is deferred with F2**, not dropped: both need ADR-0042's `knownValue`, and doing them together
  implements the import set once against two consumers rather than once against one.

**M5.4 opens tier F: F1, the wedge, and three rows that were saying something false.**

- **The wedge is the strip's ROTATIONAL twin.** `f(ωz) = μ f(z)` makes the return ray reproduce the
  outgoing one by `−ω·μ` where E1's top side returned `−λ`. The template takes `n`, never an angle:
  at any other angle the return ray is not a rotation of the outgoing one and there is no factor at
  all, so F1's first trap is unrepresentable rather than checked.
- **The affine `Scalar` did not cover the gallery, and said it did.** The return ray's endpoint is
  `R·cos(2π/n)` — a product of two parameters. `derived` is evaluated BEFORE the limit parameters
  exist, deliberately; computed afterwards it would freeze at instantiation and leave the ray behind
  while the arc followed a drag, silently opening a contour the ledger had just certified closed. So
  a coefficient may name a parameter, and the form stays affine in every LIVE one — which was always
  the real claim.
- **A residue theorem where no individual residue exists.** `1/(1+zⁿ)` has exact poles at `n = 2, 3,
  4` and none at `n = 5, 7`. D3 answered this for a keyhole, which encircles every root once; a wedge
  encircles ONE, so the structural sum became `Σ n(γ,zₖ)·Res` with the all-roots case a wrapper. An
  undecided weight refuses rather than contributing zero. It is a FALLBACK on purpose: the per-pole
  route returns `2π/(3√3)` where this one returns `π/(3·sin(π/3))` — the same number carrying a
  transcendental it does not need.
- **Three false rows, two older than the slice.** `2π/5` was not in the angle whitelist, so KILL
  reported that no lemma applied *to the integrand* for the one shape it discharges at `n = 4`; a cap
  (denominator ≤ 12) replaces the list with the same guarantee and the row now says which of the two
  failed. And CATCH asked "was every pole pinned?" where the claim is about the SUM — so D3 at
  `(a,n) = (2.3, 5)` printed `(π/5)/sin(23π/50)` beside "the total is an estimate" from M4.2e until
  now.
- **A fold may COMBINE a radical, never INTRODUCE one.** At `n = 3` the sine recogniser leaves
  `(1/6 + i√3/6)·e^{−iπ/3}`, which is exactly `1/3` — and the old fold could not take it, so the
  flagship fixture printed a decimal. Folding every representable root of unity fixes that and breaks
  D7, whose residue-at-infinity row became `17√2/8 − 17i√2/8` where `17/4·e^{−iπ/4}` shows the
  magnitude of 4.25 the row exists to state. The rule fixes both, and subsumes the collision worry.
- **F1's job is cross-provenance.** `2π/(3√3)` is also D3 at `(a,n) = (1,3)` — a keyhole with a cut,
  a monodromy and a phase, against a wedge with none of the three. D3 refuses there and names this
  record as the repair.

**M5.5 builds tier G's machinery, and executes the second finding against the research.**

- **The square `Γ_N` has NO target piece.** `∮ → 0` is the result rather than the bookkeeping, and the
  sum sits inside the residue list as the kernel's own poles at the integers. Its tests pin the
  mechanism: `∮ = 2πi(2·S_N − π²/3)`, so inverting it recovers the partial sum from the engine's own
  quadrature, and the residual is then the tail, bracketed in `(1/(N+1), 1/N)`.
- **The alternation belongs to the KERNEL.** `π cot(πz)` has residue exactly 1 at every integer and
  `π csc(πz)` exactly `(−1)ⁿ`, so `Σ(−1)ⁿ/n²` will cost nothing once `Σ 1/n²` exists. The leading `π`
  is COUNTED, not pattern-matched — `cot(πz)` has residue `1/π` and is a different sum — and a numeric
  coefficient goes to the cofactor. A COLLISION is named, not summed: G1's `1/z²` merges with the
  kernel at the origin, and the merged residue lands in ℚ(i)(π).
- **A hole in LEGALITY closes.** `findPoles` reports zero poles for a `cot` integrand, so a square at
  an INTEGER half-width ran its sides through `z = ±N` while the ledger said every singularity was
  clear of the contour. The band is read off the geometry, so a contour that moves gets a new window.
- **The bound is `8π·coth(π/2)·(N+½)·max|f|`,** exact in ℚ, with `coth(π/2)` bracketed from a
  certified lower bound on `e^π` and both truncations erring upward. It refuses a half-width that is
  not `N + ½` by name, which ENFORCES what `through: "halfIntegers"` declares — from the geometry,
  not from the field, and stronger for it, since a dragged contour is caught too. The schema field
  is still unread.
- **D-2, executed.** Research 03 §8 drops the `π` from `π cot(πz)` and its bound is then not one:
  3.392 against a measured 3.567 at `N = 3`. **And a correction to that correction** — the gallery
  says "30–40 % at every N"; measured it is 4.9% at `N = 3` and 27.8% at `N = 25`, growing, because
  the ratio between the bounds is exactly `π·(N/(N+½))^k`. 30% is the asymptote, not the typical case.

**M5.6a–b build tier G's solve: the unknown INSIDE the residue sum.**

- **`cot` and `csc` are Möbius functions of one exponential.** With `q = e^{2πiz₀}`,
  `cot(πz₀) = i(q+1)/(q−1)` and `csc(πz₀) = 2i·e^{iπz₀}/(q−1)`, so `Res(K·f, z₀)` at a pole of the
  cofactor is an exact QUOTIENT of basis elements and nothing new is needed to hold it. `coth` is the
  *name* of that quotient at `z₀ = ia` — a property of the point, not of the arithmetic — so naming
  belongs where the answer is formatted. The `2πi` of the residue theorem CANCELS here, because
  `∮ → 0` takes the whole left-hand side with it; the kernel's own π is the one that survives.
- **The generalisation the plan asks for cannot be built, and never needs to be.** Its coefficient
  `1 + Σⱼcⱼ − 2πi·w` adds a DIMENSIONLESS number (a keyhole's is `1 − e^{2πiα}`, over `ℚ(i)(√d)`) to
  one carrying π, and neither the exponential basis nor ℚ(i)(π) holds both. `a = 0` is not an accident
  of tier G but its DEFINITION — SG-1 *is* "there is no target piece" — so the two halves are never
  both present, and the honest build is a third route with the mixed case refused BY NAME. What is
  left is one line: `0 = 2πi[w·T + π·ρ]`, hence **`T/π = −ρ/w`**.
- **The weight is DERIVED, then checked.** `Σ_{n∈ℤ}` forces 1 and `Σ_{n≥1}` forces 2, read off the
  target's own range; halving additionally needs the cofactor EVEN (`N(−z)D(z) = N(z)D(−z)` as
  polynomials over ℚ(i)) and its `n = 0` term to vanish — otherwise `Σ_ℤ = f(0) + 2Σ_{n≥1}` and the
  weight silently absorbs `f(0)`. Three decisions, which is research 03 §8's commonest error made
  arithmetic rather than merely recorded.
- **G1 is a different RING, not a harder case.** Excluding `n = 0` makes its residue a known term —
  algebraic at a regular integer (the kernel's π spent on its own residue `π·(1/π) = 1`), or, where
  the cofactor also has a pole there, merged and in ℚ(i)(π). G1's cofactor `1/z²` has no other pole,
  so `ρ = 0` and its whole identity lives in ℚ(i)(π). Refused here by name, with its reason.
- **The no-op is proven, not inferred.** 23 records × 79 fixtures dumped before and after — the
  loader's violations, the system's rank and pivots, every ledger row with its status, claim, evidence
  and repair, every piece limit, `piUnits`, the quadrature, and every certificate — 1253 lines,
  byte-identical. (The first attempt was INVALID: the harness was fixed between the two runs, so the
  diff measured the instrument.)
- **A right answer is not evidence that the ledger is honest.** The sweep's one survivor that mattered
  dropped the kernel from `analyse`: every test stayed green while the ledger went back to calling a
  contour clear of the integers it runs through — the hole M5.5b closed — because the sum route reads
  only LEGALITY and the piece limits and still returns the right number. Now asserted directly.

**M5.6c lands G2, and tier G has begun.** `Σ_{n∈ℤ} 1/(n²+a²) = (π/a)coth(πa)` is the
twenty-fourth loaded record and the first whose unknown is not on the contour at all.

- **The name is decided by an EXPONENT, not by a pattern.** A two-pole conjugate cofactor's residues
  cross-multiply into `2c·sinh(δ)` over `−4sinh²(γ/2)`, and `δ` is `γ` or `γ/2` — the two cases being
  the two KERNELS. The recogniser never sees which kernel it came from. `γ = 2πa`, so the halving
  prints the answer in the parameter the record declared: `(4π/3)·coth(3π/4)`.
- **A hyperbolic form MULTIPLIES where a sine divides**, so it takes its own slot on `SineForm` and
  `denominatorOf` becomes the one reader the formatter, the number and the argument accessor all go
  through — the E2 lesson (a right value under a wrong form) made structural rather than avoided.
- **`∮` at finite N is `2πi[S_N − T]`, and the quadrature is asked about it.** Printed exactly as
  `2πi(56621264/14798925 − (4π/3)·coth(3π/4))`, agreeing to 5.8e-15 with a route that shares nothing
  with it. Tier G gets the corroboration every other tier has.
- **SG-1 inverts TWO invariants, and both would have dropped the record.** `rank(M) = m` fails
  because `M` is identically zero for such a contour by construction — full rank would mean the
  record ALSO carries its target on the contour. And radius-independence is false here for the reason
  it is true elsewhere: this kernel has a pole at every integer, so more radius adds more POLES, and
  `∮`'s dependence on N is the argument's content. Asserting equality would demand that a partial sum
  not converge.
- **Three rows were saying something false.** CATCH claimed "no individual residue is expressible" —
  the cyclotomic route's sentence, where here every residue is written down. The enclosed count was
  short by exactly the poles that carry the answer, because `findPoles` refuses the whole product and
  not just the `cot` — so a square dragged onto `±ia` had every singularity "clear of the contour" as
  surely as one dragged onto an integer did before M5.5b. And the shell printed "the target is Re of
  ∮ f dz" about a record whose target is a TERM of the residue sum and whose `∮` tends to zero.
- **The browser pass found the browser suite red**, on a `toHaveLength(20)` wrong since M5.3d — the
  node gate deliberately does not launch a browser, so nothing could see it. Derived from `FAMILIES`
  now.

**M5.7 completes tier G with the COLLISION — G1 and G3.** `Σ_{n≥1} 1/n² = π²/6` and
`Σ_{n≥1} (−1)ⁿ/n² = −π²/12`, the twenty-fifth and twenty-sixth records.

- **The hypothesis FAILS and the argument is still rigorous.** `f = 1/z²` has its pole where the
  kernel has one, so *"f has no pole at an integer"* is false — and refusing would stop a correct
  argument while warning would flag a certainty. It is SUFFICIENT for the clean form of the theorem
  and not NECESSARY for the contour argument: the product is meromorphic at 0 with a pole of order
  **1 + 2 = 3**, orders ADD, and the residue theorem applies to it.
- **`escalate` is an OBLIGATION, not a licence** — which is what makes it more than the permissive
  third outcome. An escalating record must DECLARE the merged order and residue, and both are
  falsified against the Laurent route: declaring order 2 is refused with "the orders ADD to 3", and
  declaring `+π²/3` with the value the route gives — a sign error that returns `−π²/6` for ζ(2),
  negative and otherwise plausible. Declare nothing, and the loader drops the record.
- **The Laurent route is cheap because the kernel's expansion is EVEN.** Reading the `u^{−1}`
  coefficient of the product picks out `Res = c₀ + Σ t_k π^{2k} c_{−2k}` — only `f`'s constant term
  and its even negative coefficients, finitely many. Bernoulli numbers from `Σ C(m+1,j) B_j = 0` in
  exact ℚ; no table to mistype.
- **A collision is a different RING, not a harder case.** The value lands in ℚ(i)(π) where G2's
  `coth` is a quotient of exponentials, and `Σ f(n)` is rational, so the whole identity reuses
  `exactInPi` — the log families' seat. With a cofactor pole away from the integers as well, the two
  halves are incomparable and refused by name on both sides.
- **The two records differ by ONE number.** Identical cofactor, contour and weight: `π cot` gives
  `−π²/3` at the collision and `π csc` gives `+π²/6`. The alternation is the KERNEL's, which is why
  `(−1)ⁿ` never appears in a cofactor.
- **SG-5 was already done.** The plan's "widest blast radius in M5" — `kind: "sum"`, an integer index,
  a `summand` — landed with D1's arc, and its readers with G2. Measured rather than assumed.

**M5.8 completes M5, and with it the gallery: 28 of 28 records loaded and executed.**

- **The cross-family invariants of `tier-efg.md` §10.3 are RUN** rather than reasoned — and three of
  them turn out to be one identity. `(π/a)coth(πa) − 1/a² = Σ_{k≥1} (−1)^k t_k π^{2k} a^{2k−2}` with
  `t_k` the summation kernel's own Laurent coefficients, so the `a → 0` confluence is a series rather
  than an evaluation at a small `a`: its `a⁰` term is exactly `−Res₀`, which is G1's answer, and its
  `a²` term is ζ(4)'s. The 2×2 square of {cot, csc} × {collision, none} is one fact about one series,
  with no limit taken numerically. F1's invariant is worth more than a re-run because the two routes
  print DIFFERENT closed forms for the same number — `(π/3)/sin(2π/3)` closing downward against
  `(π/3)/sin(π/3)` closing up, supplementary angles with equal sines, which a shared formatter could
  not have produced.
- **ADR-0042's `knownValue` lands: an import is `=` on its form, with the import in its provenance.**
  E3's top side is `√π` and F2's return ray carries `Γ(1+1/n)`. Neither is a residue, neither
  vanishes, and neither is proved by the argument the app is checking — so under the v1 schema both
  were `free`, which Pass 3 prices by quadrature at `≈`: **a perfectly exact argument capped by its
  most certain step**. A bare `=` would be worse, laundering an import as a derivation. The row now
  carries `=` with the record's own `method` after "imported, not derived here", and the quadrature
  becomes what it should always have been here — an independent CHECK.
- **There is ONE import, and both records name the same function.** E3's record says `√π` IS
  `Γ(1/2)`, so the closed set is the Gamma function at a rational argument rather than a table of
  constants — which is what lets one independent check cover both: `∫₀^∞e^{−tⁿ}dt = Γ(1+1/n)` is F2's
  own declared method, and `Γ(1/2) = 2Γ(3/2) = 2∫₀^∞e^{−t²}dt` carries it onto E3.
- **An imported value has no inverse, and that is the arithmetic of "imported".** Pass 5's fourth
  route works in the rank-1 module `A·(exponential basis)`: addition and scaling by something the
  argument derived stay inside it, multiplying two atoms and dividing by one do not. It REQUIRES
  `∮ = 0`, since `2πi Σ Res` carries π and an import does not and `0` is the one value both rings
  share — not a restriction but the empty singular set, which is these two records' whole content.
- **E3 — `∫ℝ e^{−x²}cos(bx)dx = √π e^{−b²/4}`, the twenty-seventh record.** Its verticals needed the
  third integrand shape to have a vanishing SEGMENT, and the first certified bound in the app whose
  `max|f|` is ATTAINED rather than majorised: `Re Q(c+iy)` is an exact quadratic in `y`, so the
  maximum on the segment is a decision over three candidates. The vertex is a real candidate, not a
  defensive one — `e^{z²}` on `Re z = 0` over `y ∈ [−1,1]` has `|∫| = 1.494` while an endpoint-only
  maximum certifies `0.736`, which is a FALSE bound rather than a loose one. LEGALITY also gained a
  row for the empty singular set: with nothing to measure it had said nothing at all, so "there are
  none" and "none were looked for" looked the same on the ledger, for the one record whose point is
  the former.
- **F2 — Fresnel by the `π/(2n)` wedge, the twenty-eighth, and it needed no new engine.** M5.2 built
  `linearMinorant.ts` as the single predicate L3 and L6 share, two slices before its consumer
  existed. Measuring the discharged bound gave the slice its sharpest fact: the arc integral is
  asymptotically `1/(n R^{n−1})` while the certified bound is `π/(2n R^{n−1})`, so **the bound is
  loose by exactly π/2 — and that factor IS the minorant's own slack at the origin**, where the true
  `sin(nθ) ≈ nθ` against a claimed `≥ 2nθ/π`.
- **The conditional convergence, made arithmetic.** `∫₀^∞|cos(x²)|dx = ∞`, and one integration by
  parts says what that looks like: the partial integral's error is `(sin R², −cos R²)/(2R)` — envelope
  `1/(2R)`, phase `R²`, so the distance shrinks while the DIRECTION keeps turning and no component
  settles (measured `|error|·2R` = 0.9976 → 1.0000 over R = 4…20). The ANSWER is bit-identical across
  every radius, because it comes from the import and a vanishing arc. And `ray0 − T` is exactly
  `−arc`, so the arc bound IS a bound on the truncation error — which is what makes a conditionally
  convergent integral computable at all. The accumulator panel draws the **Cornu spiral**.
- **F2 determines BOTH real integrals from one complex identity** (`ray0 = C + iS`, coefficient row
  `[1, i]`, realified into two real equations), so `∫cos = ∫sin` is something the app COMPARES rather
  than asserts — and §10.3's `cos-equals-sin-only-at-n-2` gets the `differ` half it could not have
  until this record existed.

**The partial-sum panel is drawn at a size you can read.** A follow-on, and the defect was not the
one it looked like:

- **The frame was symmetric about the origin.** It fitted `[−max, max]` on both axes with `0` pinned
  to the canvas centre, which is tight only for a walk reaching equally far in all four directions —
  and almost none does. D1's keyhole runs `0 → 4.39 − 3.19i` and never leaves one quadrant, so it
  used half the frame's width and 36% of its height *before* the panel's shape cost it anything.
  Fitting the data's real bounding box (with the origin always in it, since both axes are drawn
  through it and `Σ Δz` closing back to it is the point of the contrast) and centring **the box**
  rather than the origin recovers that, and puts the picture in the middle so the space left over
  reads as framing.
- **The scale is still one number for both axes, and must stay so.** The angle between consecutive
  terms is content — a quarter-turn between two of them means `f` rotated by a quarter-turn — so
  stretching an axis to fill the panel would draw angles the integrand does not have. The real trail
  and the contrast trail share one frame for the same reason.
- **Measured, on the corpus:** every one of the twenty records now fills at least 95% of whichever
  dimension binds (it was at best 5% of the panel's area, usually under 2%); the trail's area grows
  2.3× to 10.6× linearly. The strip also went 12rem → 16rem and the side panel 15rem → 19rem, which
  is what lets a roughly square walk use more than the panel's height — and stops the readout
  (`4.38688763 − 3.18726043i`, 24 characters of tabular monospace) wrapping onto two lines.
- **It found a bug older than itself.** `removable-one-minus-cos` integrates `(1 − cos z)/z²` along
  `[−4, 4]`, and the accumulator samples midpoints — so an even step count puts one sample *exactly*
  on `z = 0`, where the compiled expression evaluates `0/0`. Every partial sum after it is `NaN`, the
  readout prints `NaN + NaNi`, and the old fit's `Math.max(max, NaN)` made the whole panel blank,
  losing the 119 good steps too. The quadrature is unaffected and correct (Gauss–Legendre's nodes sit
  at irrational positions inside each panel and never land there; it returns 6.7e-12). Fitting from
  the finite points draws the prefix that exists, but the app still has nothing honest to *say* about
  the term it could not evaluate — `integrateContour` refuses a contour through a singularity and
  names it, and this deserves the same. Recorded in `engine/contour/accumulate.ts` and left as its
  own slice rather than smuggled into a layout fix.
- `src/ui/` had **no tests of any kind** before this. It has two suites now: the fit's arithmetic in
  node, and — because `drawAccumulator` needs a real `CanvasRenderingContext2D` and this app is not a
  jsdom project — the ink it actually lays down, measured in Chromium on the M4.7a harness. The first
  draft of that one was **vacuous**: `drawAccumulator` opens with `clearRect`, so the canvas is
  transparent and `getImageData` returns the axes' 16%-alpha stroke as bright un-premultiplied RGB.
  A filter reading only RGB measured the axes, which span the whole canvas, and passed with the trail
  blanked entirely. The alpha channel is the discriminator.

All twenty-eight are **browsable**, not only testable: a `Sandbox | Gallery` switch opens any record by
tier and fixture, showing its target, the contour integrand it is actually integrated against (which
is not the posed one), the closed form the engine derives, and whether that agrees with the golden
value. A fixture that selects an alternative *derivation* rather than binding parameters is offered
as not executable instead of offered and then failing.

Each one also comes with its **derivation**: the argument in order — LEGALITY, CATCH, KILL, COVER,
SOLVE, VERDICT — with every line badged from its own certificate and carrying the method that
established it and its ✓/✗ audit trail. It is a view over evidence the engine already produced, not a
second narration of it. An argument that does not close opens the panel by itself, shows the failed
step inline, and offers the repair: closing `∫cos x/(1+x²)` downward shows the bound diverging, names
KILL, and says to close through the other half-plane.

Every badge in the app is computed from a verdict. There are no literal labels left: the one that had
to be hand-written was a symptom of `applyResidueTheorem` folding the *agreeing* quadrature's `≤`
into the same verdict as the exact residue sum, which capped an exact `∮` at `≤`. Corroboration is
now reported beside a value rather than inside its label; a disagreement still refuses it.

**The contour is an object you can grab.** A drag means a radius handle, the contour itself, or the
view, decided in that order; translation keeps a template a template (its radius stays bound to `R`,
so `R → ∞` still animates on a contour you have dragged across the plane), and a radius handle edits
the parameter the template already binds its arcs to — the indented semicircle's two handles are
`R → ∞` and `ρ → 0`, the two limits its argument is about. Everything works from the keyboard: Enter
walks what the arrows move, shift with an arrow still pans. Drag `1/z`'s circle across the origin and
`∮` goes from `2πi` to `0`, exactly; park it on the pole and there is no number at all.

A gesture runs the quadrature under a work ceiling and says so (`resolution capped`); the full pass on
release reconciles against it and logs a disagreement past the estimator's own bound. `∮` is the same
either way — it comes from `2πi Σ n·Res`, not from the quadrature.

Still to come: the pen tool (free-hand path editing — adding and removing points, and drawing a
contour from nothing) and the teaching layer, both now **M7**. M4 is complete: the GPU cut picture,
the declared determination on the stage, and drag-a-cut with its monodromy readout all landed in M4.7.
**M5 is complete too, and with it the gallery**: the quasi-periodic strip (E1, E2), the wedge (F1,
F2), the summation kernel and the unknown inside `S` (G1–G3), and the two records whose singular set
is empty (E3, F2).

**M6 (presentation and publish) has begun.** **M6.1** gives the shell a state object —
`src/shell/state.ts` holds `ShellState` and `resolveState`, the app's three compute branches as one
pure function of it, and `mountApp` returns `currentState()` / `applyState(s)` over the closure's
locals. The refactor is proven a no-op by dumping the whole visible rail before and after across 28
records × every fixture and 7 expressions × 10 templates — byte-identical over 710 lines. It also
brings `test/shell.test.ts`, the first test that reaches `src/shell/app.ts` at all: `mountApp` runs
under jsdom, because its WebGL2 stage is built inside a `try` and everything else is ordinary DOM.

**M6.2** adds the `#vs=` permalink (`src/shell/viewState.ts`, on `@cas/interchange`). Two things make
it more than a convenience here. The contour is **never serialised as geometry**: a gallery link
carries `{record, fixture}` because the record derives its contour, and a sandbox link carries the
RECIPE — `{template, params, shift}` — verified on encode by rebuilding it and comparing, so a link
that would open a different shape is refused rather than minted. That is measured, not stylistic:
serialising the piece list puts the worst case at 2,838 B of URL, over research 07 §6's warning, and
the recipe lands it at 1,078 B. And the round trip is checked **by verdict** — 28 records × every
fixture, encode → decode → re-run → the identical closed form and the identical ledger rows — because
field equality would pass a codec that dropped `branch.window`, which is M5.1's bug. A link that
cannot be honoured **refuses by name** and says so in its own box, rather than opening something
plausible.

**M6.3** makes the figure carry its own recipe. **Save figure** and **Copy figure** composite the
stage — the phase portrait with the contour over it — above the accumulator's partial-sum trail, and
stamp the PNG's `tEXt` metadata with `Software`, the permalink (`cas:state`) and **the verdict**. The
verdict is both stamped and *drawn on the plate*, because a picture of a contour over a phase
portrait looks identical whether the argument closes or not, and nobody reads PNG metadata. The
caption goes through the same `integralRefusal` gate the result card does, so it cannot print a
number the app itself withholds.

One measurement changed that slice: `GLStage` created its context without `preserveDrawingBuffer`,
so the GL layer read back **one distinct colour** where the ink layer read 44 — every figure would
have been missing its whole backdrop. The flag fixes it and costs 0.6 % of a frame during a
continuous pan (20.00 → 20.12 ms, best of three, under software rendering).

Two findings came with it. The window picker was **silently dropping the declared factor** — it took
`buildDeclaration`'s whole cut system, whose point is `"b"` where the reader's is `"b1"` — and the app
then integrated the cofactor as the whole integrand under an `R(z) =` label. And the milestone's own
gate, *"`applyState(currentState())` is a fixed point"*, turns out to be **too weak to be worth
passing**: a round trip that is consistently lossy is still a fixed point, so 11 of 20 mutants
survived it. The test now restores a state the app is **not** in and requires it to land on the state
that was applied — 20/20.

## Documentation

| document | what it is for |
|---|---|
| [`PLAN.md`](../../docs/contour-integration/PLAN.md) | scope, the Closing Ledger, the rigor architecture, milestones |
| [`DESIGN.md`](../../docs/contour-integration/DESIGN.md) | module layout, core types, the Ledger algorithm, the Family schema |
| [`GALLERY.md`](../../docs/contour-integration/GALLERY.md) | the 28-integral v1 gallery — the engine's content specification |
| [`research/`](../../docs/contour-integration/research/) | eight research tracks behind the above |

## Layout

Four layers, strictly downward-depending, with the boundary enforced by this package's
`eslint.config.js` rather than by discipline:

```
src/kernel/   pure maths — no DOM, no upward imports. Where the golden corpus points.
              `branch/` is the cut system: model, admissibility, argument lift, crossings.
              `exponent.ts` / `sineForm.ts` / `cyclotomic.ts` are tier D's output basis.
src/engine/   problem semantics: contour, substitution, residue theorem, ledger.
src/families/ the gallery records as data: schema, loader + invariants, Pass-5 solve.
src/ui/       Stage (WebGL2) and panels.
src/shell/    app wiring, URL state, workers, figure export.
```

`src/families/` is where the 28 gallery entries become executable. A record is **dropped, not
thrown on**, when it fails an invariant — it must not take the app down, and must not present itself
as a worked example it cannot support.

## Development

```bash
pnpm --filter contour-integration dev      # http://localhost:5177
pnpm --filter contour-integration test
pnpm --filter contour-integration typecheck
```

The repo-wide gate — run this after your **last** edit, never before it — is `pnpm lint`,
`pnpm typecheck`, `pnpm test`, `pnpm build` from the root.
