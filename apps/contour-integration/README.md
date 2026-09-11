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

The thirteen are **browsable**, not only testable: a `Sandbox | Gallery` switch opens any record by
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
