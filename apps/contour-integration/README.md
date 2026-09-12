# contour-integration

A sandbox and worked-example gallery for **contour integration and the residue theorem**, including
the evaluation of real definite integrals in closed form.

The distinguishing capability is not that it computes `∮γ f dz` — several tools do — but that it
reports whether your *argument* is finished: which contour pieces vanish, with what certified bound,
which reproduce the target, which poles are caught and with what winding number, and therefore
whether the whole thing closes.

## Status

**Through Milestone 3, and published.** See the milestone table in
[`../../docs/contour-integration/PLAN.md`](../../docs/contour-integration/PLAN.md) §7.

- `∮ f dz` comes from `2πi Σ n(γ,aₖ)·Res(f,aₖ)` — a *formula*, not a quadrature — with exactly
  decided winding numbers and exact residues over ℚ(i) or one quadratic extension of it, so
  `1/(1+z⁴)` reads `π√2/2`. Numerical quadrature is demoted to an independent **cross-check**.
- Arc bounds are certified in exact ℚ with **no floating point in the chain**, including certified
  rational brackets on π. `deg Q ≥ deg P + 2` is *derived* from the exponent, never asserted.
- The **Closing Ledger** (COVER / KILL / CATCH / LEGALITY) answers "does this argument close?", and
  a wrong contour fails diagnostically.
- The **Family loader** and its four invariants run the gallery records as data. Thirteen of the 28
  load and are executed against the engine in the test suite — **every entry in tiers A, B and C**:
  A1–A7 (circle and semicircle, through the `z = e^{iθ}` substitution and the Cauchy integral
  formula), B1–B3 (Jordan, through the exponential basis `Σ cₖ e^{βₖ}`), and C1–C3 (the indentation
  and L4's `iα·Res`; removability detected, with L5's non-vanishing arc; and a real pole and a
  complex pole in one ledger). Each solves to a symbolic closed form — `π/2`, `π√2/2`, `π/e`,
  `π − π/e`, `2π/n!` — because the solve runs in units of π and never evaluates it. Tiers D–G need
  branch cuts and the kernel families of M4/M5.

**M4.1 (branch cuts) has landed**, engine and editor:

- A **cut is a choice**, not a property of `f`. `src/kernel/branch/` holds the model (exact `Frac`
  exponents, because admissibility asks whether `Σ αₖ` is an *integer*), research 06 §2.1's
  admissibility check, a continuous-argument lift, and the piece-versus-cut classifier.
- **LEGALITY steps 2–3**: the cut system must be admissible, and any piece meeting a cut must declare
  which side it runs on. A crossing with no `side` tag refuses and names the repair; a *grazing*
  contact refuses too, because it has no side for a tag to pin. Neither row is emitted at all for a
  rational integrand.
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

The seventeen are **browsable**, not only testable: a `Sandbox | Gallery` switch opens any record by
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
contour from nothing), branch cuts (M4), the rest of the gallery (M5), the teaching layer (M6).

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
