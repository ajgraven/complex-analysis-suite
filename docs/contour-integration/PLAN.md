# `apps/contour-integration` — preliminary implementation plan

> **Status: PRELIMINARY.** Awaiting review. Nothing here is an ADR yet; §12 lists the decisions
> that need one before Milestone 0 starts.
>
> Grounded in eight research tracks in [`research/`](research/): prior art (01), pedagogy (02),
> method taxonomy (03), numerics (04), symbolic residues (05), branch cuts (06), UX (07), repo
> reuse (08). Read 03 and 08 before implementing; the rest are reference.

---

## 1. What this app is

A **sandbox with a worked-example gallery** for contour integration and the residue theorem,
whose distinguishing capability is that it evaluates real definite integrals in closed form *and
shows why the argument closes*, with every claim honestly labelled.

**The one-sentence product claim.** *Draw a contour; the app tells you not just what the integral
is, but whether your argument is finished.*

**North-star behaviours** (these are the acceptance tests for the whole product):

1. Drag a contour across a pole and watch the value jump by exactly `2πi·Res`.
2. Draw the *wrong* semicircle for `∫cos x/(1+x²)` and watch the arc bound **diverge** — a wrong
   choice fails visibly and names the constraint it violated.
3. Drag a branch cut. Nothing changes — until the cut crosses the contour, at which point the
   answer jumps by the monodromy factor and the app says so.
4. `∫₀^∞ x^{α−1}/(1+x) dx` prints `π/sin(πα)` labelled `=`, with the keyhole's four pieces, the
   `(1 − e^{2πiα})` factor, and a **certified numeric bound** on each vanishing arc.
5. Point the contour through a pole and the app prints **no number at all**.

Behaviour 5 is not a detail. The nearest existing tool (Samuel J. Li's *Complex Function Plotter*,
the only web app shipping arbitrary contour integrals) prints `6.71197 + 0.46361i` — confidently
wrong to six figures, uncaveated — for a circle through the pole of `1/z` (research 01 §1,
verified hands-on). Refusal is a *feature we can demonstrate and nobody else has.*

### 1.1 The gap this fills

From research 01 (39 sources, several tools driven hands-on):

| Capability | Best existing | Gap |
|---|---|---|
| Arbitrary contour integral, numerically | Li's plotter | contour is **one-shot**, dies after the drag; no deformation |
| Winding number / residue decomposition | — | nothing shows `2πi Σ n(γ,aₖ)Res` decomposed |
| Real integral **by residues**, derived | Wolfram\|Alpha computes residues but not contour integrals, and offers **no** step-by-step; SymPy's `integrate()` deliberately does not apply the residue theorem | **completely unoccupied** |
| Movable branch cuts | `TradeIdeasPhilip/riemann-surfaces` relocates cuts to preserve continuation | not tied to integration |
| Honest refusal | — | nothing refuses |

Benchmarks to measure against: **Li's plotter** (feature parity + the four gaps),
**integral-calculator.com** (derivation display), **`riemann-surfaces`** (branch handling).

### 1.2 What it is not

Not a CAS, not a course, not a proof assistant. It does not attempt general symbolic integration
(ADR-0007 discipline: the gallery's 28 integrals define the engine surface, not the reverse).
It declares its **output basis** and refuses outside it — FriCAS's honesty model, not Mathematica's.

---

## 2. The intellectual core: the Closing Ledger

Research tracks 02 and 03 converged independently on the same structure, and it is the thing that
makes this app more than a plotter.

**Track 03's structural fact.** Every one of the twelve families in the taxonomy is
*(a closed-contour identity) × (one lemma that makes an auxiliary piece vanish)*. Every contour
piece has exactly one of four **roles**:

| role | meaning | contributes |
|---|---|---|
| `target` | this piece *is* the integral you want (possibly after substitution) | the unknown |
| `vanish` | this piece → 0 in the limit | 0, **once its lemma is discharged** |
| `reproduces` | this piece returns `c ×` the target | `c ×` the unknown |
| `residue` | this piece encircles poles | `2πi Σ n·Res` |

Solve for the unknown. §1 of the taxonomy has only `target`; §5.1 (keyhole) and §6 (strip) differ
*solely* in whether the second edge's factor is `−e^{2πis}` or `−λ`; §7 (wedge) is the same with
`−ωμ`. **One mechanism, twelve families.**

**Track 02's pedagogical finding.** There is no published decision tree for choosing a contour, and
no education research on contour choice at all — only taxonomy-by-integrand-shape, which is exactly
what leaves students helpless on an unseen integral. The proposed answer is to teach contour choice
as **constraint satisfaction**, with four constraints:

- **COVER** — the target appears as a labelled piece.
- **KILL** — every other piece vanishes, is computable, or reproduces the target times a constant.
- **CATCH** — the enclosed singular set is finite, identified, residues computable.
- **LEGALITY** — no piece crosses a branch cut; orientation declared.

And one generalisation that covers essentially every standard example:

> *Pick a contour such that the pieces you cannot compute either **vanish** or **give you back what
> you want times a constant**.*

That is short, true, and — critically — **checkable**, hence implementable.

**The synthesis.** The four constraints and the four roles are the same object. The Closing Ledger
is the app's primary UI surface *and* its primary data structure:

```
COVER      ✓  piece "real axis"        role=target
KILL       ✓  piece "arc C_R"          role=vanish   |∫| ≤ 3.2e−4 at R=50, O(R⁻²) → 0   [≤]
           ✓  piece "indent at 0"      role=vanish   → iπ·Res = iπ                      [=]
CATCH      ✓  1 pole enclosed: z=i, order 1, Res = −i/2, n(γ,i)=+1                      [=]
LEGALITY   ✓  no cuts crossed; orientation ccw
────────────────────────────────────────────────────────────────────────────────────────
THIS ARGUMENT CLOSES.        ∫ = π/2                                                     [=]
```

When a constraint fails, the ledger says *which* and suggests the repair ("add an ε-indent at
z = 0"). A wrong contour produces a ledger with a failing row, not a wrong number.

---

## 3. Rigor architecture — how `=` is earned

CLAUDE.md's honest-labelling guardrail is the app's hardest constraint and its best feature.
**The label is computed as a meet over per-step certificates, never asserted.** No code path may
write `=` directly; only `assembleVerdict(certificates)` may produce one. (Pattern lifted from QD's
`prove-plan.mjs` `assembleVerdict` / `classifyRigor` / `rigorProvenance` — as architecture, not code.)

### 3.1 The five-level vocabulary

`=` exact · `≤` / `≥` rigorous one-sided bound · `≈` estimate · `⚠` refused/ill-posed · `?` unknown.

### 3.2 Numeric tiers

| tier | machinery | earns | when |
|---|---|---|---|
| 0 | float64 | `≈` | per frame, always |
| 1 | **exact ℚ / ℚ(i) via `@cas/exact`** | `=` and `≤` | rational integrands — the flagship |
| 2 | ~~float interval arithmetic (EFT directed rounding)~~ | — | **cut** (round 3): soundness rests on `Math.exp` having no ulp bound |
| 3 | Arb/FLINT WASM, lazily loaded behind "Prove it" | `≤` any `f` | deferred; the documented escape hatch for non-rational `f` |

**Refinement of research 04 — DECIDED (round 3).** Track 04 proposes a float interval
package for certified ML bounds and honestly flags that JS has no directed rounding — sound
`+ − × ÷ √` is emulable via error-free transformations, but `Math.exp/log/sin/cos/pow` carry **no
ulp bound in ECMA-262**, so every npm interval library's transcendental is a heuristic wearing a
proof's clothes.

We can sidestep this entirely for the flagship case. The ML bound for `f = P/Q` on `|z| = R` is

```
|P(z)| ≤ Σ|aₖ|Rᵏ                          |Q(z)| ≥ |b_q|R^q − Σ_{k<q}|bₖ|Rᵏ =: q_min(R) > 0
M(R) := (Σ|aₖ|Rᵏ) / q_min(R)              |∫_arc f dz| ≤ θ·R·M(R)
```

— pure `+ × ÷` on non-negative reals, plus `|aₖ| = √(re²+im²)`. With `R ∈ ℚ` and Gaussian-rational
coefficients, every quantity is rational except those square roots, and a **rational upper bound on
√c is one line**: `u₀ = (c+1)/2 ≥ √c`, then `u_{n+1} = (u_n + c/u_n)/2` decreases monotonically to
`√c` from above, all in ℚ; `c/u` is the matching lower bound. So:

> **Tier 1 does the certified ML bound in exact BigInt rational arithmetic via `@cas/exact`'s
> `Frac`.** No rounding argument, no EFT layer, no directed-rounding folklore — and it reuses the
> repo's existing and most-tested numeric substrate. Float intervals (tier 2) are then needed only
> for non-rational `f`, which is where they were always going to be weakest anyway.

This also *derives* the degree condition rather than asserting it: `M(R) ~ (|a_p|/|b_q|)R^{p−q}`,
so the arc bound `θ(|a_p|/|b_q|)R^{p−q+1} → 0` **iff `q ≥ p + 2`**. The app can print:
*"|∫_arc| ≤ 3.2×10⁻⁴ at R = 50, and → 0 as R → ∞ because deg Q − deg P = 3 ≥ 2, an O(R⁻²) bound."*

Jordan's lemma adds the `R`-independent constant `|∫| ≤ (π/a)·max|g|`, whose entire content is
`∫₀^π e^{−κsinθ}dθ ≤ π/κ` — also certifiable in tier 1 once `max|g|` is bounded as above.

### 3.3 Where `=` is genuinely unreachable, and what we print instead

Research 05's central structural finding: everything about residues is exactly computable **without
factoring `Q`** — total residue sum by Newton's identities (`O(n²)`), each residue as one element
`P·(Q')⁻¹ mod Q` of `ℚ(i)[z]/⟨Q⟩`, and Rothstein–Trager's `R(t) = Res_z(Q, P − tQ')` giving every
symmetric function of the residues. **The one hard thing is the half-plane restriction**
`Σ_{Im α > 0} Res`: that subset is not Galois-stable, so no `ℚ(i)`-rational closed form exists in
general. *Counting* upper-half-plane roots is exact and cheap (Möbius `w = (z−i)/(z+i)` +
Schur–Cohn, cross-checked by Routh–Hurwitz); *selecting* them is not.

The honest ladder, in order of attempt:

1. **Half-plane-homogeneous factor split** — if every `ℚ(i)`-irreducible factor of `Q` has all its
   roots on one side, the sum is rational → `=`.
2. **Degree ≤ 4** — radical split → `=`. (This is the path for `∫dx/(1+x⁴) = π/√2`.)
3. **Cyclotomic / `zⁿ − c` recogniser** — template library → `=`. (`∫₀^∞dx/(1+xⁿ) = (π/n)/sin(π/n)`.)
4. **Certified interval enclosure** of the sum → `≤`, with the enclosure shown.
5. **`RootSum` output** that *prints the half-plane predicate explicitly* rather than hiding it.

Rule: the engine **refuses rather than guesses** at every step, and a decimal rendering of an
exact result is itself labelled `≈`.

---

## 4. System architecture

Four layers, strictly downward-depending. Layers 1–2 are pure TypeScript with **no DOM**, fully
unit-testable, and are where the golden corpus lives.

```
┌─ 4. shell/          app wiring, URL state, workers, figure export
├─ 3. ui/             Stage (WebGL2), rails, piece list, ledger, derivation, accumulator
├─ 2. engine/         families, ledger evaluation, verdict assembly, derivation generation
│                     contour/  branch/  residue/  quadrature/  certify/
└─ 1. kernel/         pure math: complex, series, exact ℚ(i), interval, AAA, winding
      ↑ imports ↓
      @cas/core   @cas/exact   @cas/expr   @cas/gpu   @cas/interchange
```

### 4.1 Core data model

```ts
// The integrand, as posed
interface Problem {
  integrand: ExprNode;              // @cas/expr AST
  variable: "z";
  branch: BranchChoice;             // §4.3 — first-class INPUT, not a rendering detail
  target?: RealIntegral;            // present when a definite integral is being evaluated
}

// The contour: a free substrate, templates are parameterised instances of it
interface Contour {
  pieces: Piece[];                  // ordered; orientation implied by order
  params: Record<string, Param>;    // named, draggable, with limit targets: R→∞, ε→0⁺
  closed: boolean;
}
interface Piece {
  id: string;
  name: string;                     // user-editable: "the R→∞ semicircle"
  geom: Segment | Arc;              // endpoints/centre may be param expressions, not just numbers
  role: "target" | "vanish" | "reproduces" | "residue" | "free";
  lemma?: LemmaId;                  // L1..L8 when role=vanish
  factor?: ExprNode;                // when role=reproduces, e.g. −exp(2πis)
  side?: "above" | "below";         // pins the argument limit at a cut (§4.3) — NOT an ε-offset
  colour: 0..5;                     // the categorical ramp; ties arc ↔ term ↔ accumulator segment
}
```

`Piece.geom` holding **parameter expressions** rather than numbers is what makes "templates on a
free substrate" work: a template is a `Contour` whose geometry references `params`, and it stays
fully editable. Dragging the `R` handle and scrubbing `R` in the derivation prose are the same
store field (interaction rule 4).

### 4.2 The Family — executable, not prose

Research 03 §15 specifies this in full. Abbreviated:

```jsonc
{ "id": "mellin-keyhole",
  "target":   { "integrand": "x^(s-1)*R(x)", "lower": "0", "upper": "inf" },
  "hypotheses": [ { "check": "algebraic:noRealNonnegativeRoot(denom(R))", "onFail": "refuse" },
                  { "check": "algebraic:strip(s, ord0(R), decayExponent(R))", "onFail": "refuse" } ],
  "branch":   { "cut": { "ray": "[0,inf)", "argRange": [0, 2*pi] },
                "crossingPhase": "exp(2*pi*i*s)" },
  "contour":  { "template": "keyhole", "limitParams": [{"name":"R","to":"inf"},
                                                       {"name":"eps","to":"0+"}],
                "pieces": [ … role/lemma/factor per §4.1 … ] },
  "vanishingLemmas": [ { "lemma":"L2", "piece":"outer",
                         "discharge":"symbolic:degreeBound(s,R)",
                         "rigorIfDischarged":"=", "rigorIfNumericOnly":"≈" } ],
  "closedForm": { "expr": "(2*pi*i/(1-exp(2*pi*i*s))) * Sum(Res(...))" },
  "rigor":    { "policy": "min", "inputs": ["hypotheses.*","vanishingLemmas.*","residues.*"] },
  "traps":    [ { "id":"wrong-branch", "detect":"branch.argRange != (0,2pi)",
                  "message":"With arg ∈ (−π,π] the two edges cancel and the integral collapses to 0." } ],
  "golden":   [ { "params":{"R":"1/(1+x)","s":0.3}, "value":"pi/sin(pi*s)",
                  "numeric":3.8832220774509327, "verifiedTo":1e-14 } ] }
```

Three fields carry the design: **`hypotheses[].check`** are executable predicates with `refuse` as a
first-class outcome; **`vanishingLemmas[].discharge`** is the honest-labelling hinge (symbolic → `=`,
numeric-only → `≈`, one-sided → `≤`); **`rigor.policy: "min"`** makes the label a computed meet.

The eight vanishing lemmas (research 03 §0.3) are the engine's real hypothesis surface:
L1 ML · L2 large-arc decay · L3 Jordan · L4 small-arc/fractional residue · L5 large-arc residue ·
L6 wedge/Gaussian · L7 periodic-side cancellation (not a vanishing lemma — it *reproduces*) ·
L8 Sokhotski–Plemelj.

### 4.3 Branch model

Research 06's scoping decision, adopted: **v1 handles exactly the class**

```
f(z) = R(z) · Π (z − b_k)^{α_k} · log(z − b_ℓ)^m
```

This covers **every** gallery item (keyhole, Mellin, log, log², dogbone, fractional powers) and its
branch structure is closed-form — no root tracking, no Puiseux, no monodromy computation.
Algebraic functions `wⁿ = R(z)` are a different machine and are explicitly v2.

```ts
interface BranchChoice {
  convention: "principal" | "zeroToTwoPi" | "custom";
  branchPoints: BranchPoint[];      // z, order {power α | log}, or at ∞
  cuts: CutArc[];                   // {from, to, via[], jump:{value, verified}}
  basePoint: Complex; baseLift: number[]; sheet: number;
  shadowMode?: boolean;             // cuts derived from basePoint, free (research 06 §2.3)
}
```

**Admissibility criterion (research 06 §2.1) — the rule that makes movable cuts tractable.** A cut
system is valid iff every non-∞-touching component of the cut forest has `Σαₖ ∈ ℤ`. One microsecond
validator that simultaneously explains why the keyhole cut must reach ∞, why the dogbone's `[a,b]`
works, why the two-rays alternative is equally valid (so the user can drag between them), and why
`log` can never have a bounded cut.

**Two deliberately separate evaluators:**

- **CPU = the answer.** Continuous-argument accumulation along the contour,
  `θₖ += atan2((z_{n+1}−bₖ)/(z_n−bₖ))`, with `|Δθₖ| ≤ π/4` step control. Exact, allocation-free,
  auto-refines near branch points.
- **GPU = the picture.** Per-pixel crossing-count correction to the principal branch, plus a
  rotatable-ray `cargCut(z,θ₀)` primitive with a **textually identical JS twin** (the `@cas/expr` ↔
  GLSL parity guarantee rests on textual identity — every new helper needs a `DUAL_BACKEND_CORPUS`
  entry or it silently desyncs).

**Don't ε-offset the contour; offset the branch.** Tag each segment `side: "above" | "below"` to pin
the argument limit. Exact rather than `O(ε)`, and it is C99's signed zero lifted from a float bit to
a serialisable field — which matters because **signed zero does not survive the GPU**.

**How branch choice affects the answer.** For a closed contour in `ℂ∖Γ`, cut *geometry* is invisible
— only the integer `sheet` stamp matters. The instant a dragged cut crosses the contour, the answer
jumps by the monodromy factor. *A cut is a free choice right up until you fix a contour.* That
sentence is the pedagogical core of the whole branch story, and it is an interaction, not a caption.

### 4.4 Numeric stack

**AAA is the hub** (Nakatsukasa–Sète–Trefethen 2018). It consumes exactly the samples the renderer
already produces and returns poles, residues *and* zeros in one shot; it then supplies (a) pole
locations, (b) residues, (c) the pole-subtraction preconditioner that keeps quadrature fast when the
contour is dragged near a singularity, (d) the analyticity radius driving the a-priori error bound.
`O(Mm³)` ⇒ **worker, ~10 Hz debounced, not per frame.** Froissart doublets filtered at
`|Res| < 10⁻¹³` plus a re-SVD.

| job | algorithm | label |
|---|---|---|
| closed analytic contour | periodic trapezoid — `\|I_N − I\| ≤ 4πM/(e^{aN}−1)` | `≈`, `≤` if strip certified |
| open arc | Clenshaw–Curtis (FFT weights, nested) | `≈` |
| non-analytic | Gauss–Kronrod (7,15), `\|G₇−K₁₅\|` estimator | `≈` |
| endpoint singularity `x^{α−1}` | tanh–sinh, `α = π/2` | `≈` |
| contour near a pole | **subtract the principal part** via AAA, then trapezoid | `=` for the subtracted part |
| Laurent coefficients | **one FFT** on `\|z−z₀\| = r` gives `c_{−N/2}…c_{N/2−1}` at once | `≈` |
| winding number | **exact-sign crossing count**, not argument accumulation | `=` |
| arc ML bound (rational `f`) | exact ℚ coefficient bound (§3.2) | `≤` |

**The live `N` controller.** Error `≈ e^{−2πd/h_s}` where `d` = distance to the nearest pole and
`h_s` = arclength spacing ⇒ **~4.4 quadrature points inside the pole distance** buys `10⁻¹²`. When
the contour gets close, *don't refine* — subtract the principal part; the closed-form part is exact
and the remainder is analytic again.

**Winding number caveat.** Exact-sign crossing predicates give `=` unconditionally for
*segments*. For *arcs*, exact circle–line crossing tests in ℚ are required for the same guarantee;
otherwise polygonise with a certified error and label `≤`. Decide in M1.

### 4.5 Performance budget

16.7 ms frame; target ≤ 4 ms for maths. GPU domain colouring is **not** the bottleneck
(≈3.3×10⁸ flops/frame at 1080p for degree 10 — a rounding error for any GPU of the last decade).
The single most consequential implementation choice: **compile the `@cas/expr` AST to a JS
`Function` body or a flat register VM over `Float64Array` SoA `re[]`/`im[]`** — a naive tree-walk
allocating `{re,im}` per node is 10–50× slower *and* generates GC jank. Keep per-panel partial sums
in a segment tree so a one-control-point drag costs `O(log N)`, not `O(N)`, and the total does not
drift over thousands of frames; re-run the full quadrature on `pointerup` and reconcile —
disagreement beyond the estimator's bound is a bug signal worth logging.

---

## 5. UI specification

Full-bleed **Stage**, two collapsible rails, one bottom strip. Rails named by **job, not technique**
— the correction QD's own sidebar review had to make.

| region | panel | contents |
|---|---|---|
| centre | **Stage** | WebGL2 domain-coloured plane; contour with SDF halo + arrowheads; poles with order; branch cuts; moving integration marker; hover `z =`, `f(z) =` |
| left ① | **Gallery** | presets grouped by **the real integral they evaluate**; card = thumbnail + the integral in KaTeX + one line on what it demonstrates. **The front door.** |
| left ② | **Function** | integrand; auto-detected poles/branch points with order and residue; rows hover-linked to the plane |
| left ③ | **Contour** | **the piece list** — one row per semantic piece: icon, editable name, bound scrubbers, its own partial ∫, rigour badge, colour chip |
| left ④ | **Cuts** | branch-cut objects; warning row when the contour crosses one |
| bottom | **Accumulator** | value trace (Re/Im vs arclength) **and the Argand trail** of the partial sum walking in ℂ; doubles as the scrubber; segments tinted by piece colour |
| right ① | **Ledger** | COVER / KILL / CATCH / LEGALITY, per-arc, with badges and the closing verdict |
| right ② | **Derivation** | folded step list, one step at a time by default, terms tinted to their piece |
| right ③ | **Result** | headline value + badge + the residue ledger `2πi Σ n(γ,aₖ)Res` decomposed per pole |
| right ④ | **Figure & share** | permalink, PNG/SVG, element toggles — mirroring QD's shipped card |

### 5.1 The ten interaction rules

1. **Example-first, sandbox last.** Cold start opens a *solved* preset. Most readers never interact;
   the untouched view must carry the message.
2. **Every contour piece is a first-class object** with name, handle, term and badge. No anonymous
   polylines.
3. **One hover, three highlights** — arc ↔ derivation term ↔ accumulator segment, bidirectionally.
4. **The slider and the handle are one number.** `R`, `ε`, poles, cut endpoints: draggable on the
   plane *and* scrubbable inline in the prose ("let R → ∞"), one store field.
5. **Snap with intent, never silently.** Name the constraint that fired; a modifier suppresses it.
6. **Pen-tool grammar everyone knows.** Click = corner, drag = arc, click-start = close,
   Backspace = drop last, Esc = abort, Ctrl = constrain.
7. **Time is scrubbed, never inflicted.** Every animation has a draggable timeline and a static
   trace beside it; honour `prefers-reduced-motion` by starting paused.
8. **The badge attaches to the number, not the page.** Numeric quadrature never prints `=`.
9. **Degenerate states are named and refused, not computed** — with a suggested repair.
10. **Undo is object-level and covers geometry.** One drag = one undo entry; URL updates on settle.

### 5.2 P0 pedagogical constraints (research 02 — violating these teaches the wrong thing)

The headline finding: **there is no shared intuition for `∮f dz`, not even among experts.** Hanke
(2024, ZDM) interviewed three research mathematicians and reconstructed nine interpretations under
eight frames, with **not one interpretation recurring across experts**. One tried the area picture,
drew it, and abandoned it ("the values are complex"); two said no area interpretation exists.
The app is supplying a missing referent, not decorating a well-understood one.

1. **Never render `∮f dz` as an area.** It is the one picture experts tried and rejected.
2. **Accumulation is a head-to-tail vector sum of `f(zₖ)·Δzₖ` in its own plane** — with the three
   documented wrong sums (`Σz`, `Σf(z)`, `ΣΔz`) toggleable as contrasts. `ΣΔz` visibly closing to
   **0** is a free and striking demonstration.
3. **Show the amplitwist per step** (`Δz` rotated by `arg f`, scaled by `|f|`). Conner et al. found
   *zero of ten* students mentioned rotation when explaining complex multiplication.
4. **Two linked planes, never a 3-D surface** for the integral itself.
5. **Chop–multiply–add primary; parameterisation derived and opt-in.**
6. **Winding number and enclosed-pole count are separate, separately labelled readouts.**
7. **Orientation always visible**, with sign consequences shown live.
8. **Don't let the domain colouring dominate** — it is a picture of `f`, not of the integral, and a
   beautiful background is a textbook seductive detail.

Unguided sandboxes fail (Kirschner/Sweller/Clark) and animation per se doesn't help (Tversky);
the mitigations that *are* supported — PhET-style implicit scaffolding, faded worked examples with
self-explanation prompts, prediction-before-manipulation, contrasting triads — are in M6.

### 5.3 Colour and type

**CET-C6** cyclic phase map by default (Kovesi); **CET-CBC1/CBC2** colour-blind-safe;
CET-C5 greyscale for print. **Never HSV** — unequal lightness manufactures false features.
`log₂|f|` banding as bounded ±12 % L\* modulation so it never out-contrasts the contour. Contour
stroke + SDF halo in the same fragment pass, halo strength driven by local background contrast,
background **desaturated** (chroma ×0.35) inside the halo radius rather than painted over. Direction
by arrowheads, never dashes alone — dashes are already spent in the suite's vocabulary on "not
certified". A 6-entry categorical ramp, one colour per piece, reused in the derivation and the
accumulator; colour is never the only channel. KaTeX (Computer Modern) for display maths,
**tabular figures on every live number**. Split KaTeX rendering into structure-once / digits-per-frame;
never re-run KaTeX per frame; never render maths into the WebGL canvas.

**Accessibility caveat worth knowing now:** KaTeX's MathML is not currently reliable with NVDA/JAWS
(maintainers' own thread, no active work). Plan pairs `htmlAndMathml` output with
`render-a11y-string` aria-labels and a prose-derivation toggle.

---

## 6. Reuse strategy (ADR-0007 discipline)

The suite's north star is *each new tool builds fewer primitives from scratch than the last.*
Research 08 audited every package and app. Compressed verdict:

**REUSE AS-IS** — `@cas/expr` `differentiate`/`newtonIteration`, `complexJs`, `fToRational`,
`toLatex`; `@cas/core` `Complex`/`ComplexAlgebra`; **all** of `@cas/exact` (`Frac`, `Gauss`,
`QiPoly` incl. `gcd`/`squarefreePart`/`divmod`/`derivative`, `BiPoly`, `resultant`, `render*`);
`@cas/gpu` `createProgram` + complex GLSL stdlibs + colormaps + df64; `encodeViewState("ci", …)`.

**EXTEND — shared, additive, low risk** — `@cas/expr`: complex literals and implicit multiplication
(**it currently cannot parse `2i` or `2z`** — both throw `ExprError`; probed, not assumed), a `t`
scope variable, and new functions via five coordinated tables + a GLSL body. Purely additive: no
existing program changes meaning. `@cas/exact`: grow univariate ℚ(i) factorisation, extended Euclid
`invMod`, Yun squarefree, and an exact Laurent-series layer as *new files*.

**EXTEND — shared, medium, needs care** — `@cas/exact/resultant.ts` currently returns only the
Bareiss determinant (the resultant *value*); Lazard–Rioboo–Trager needs the **whole subresultant
chain**. This is the single most important extension in the exact stack. And
`@cas/core/series` ships **only** `zeros`/`unit`/`mul` — `inverse`, `pow`, `compose` exist *twice*
app-side (CD `uniformize.ts`, QD `taylor.mjs`) with **deliberately different algorithms**, and the
file header says unifying them would shift one app's rounding and names a third consumer as the
trigger. **We are that third consumer** — but build app-local first and propose the migration with
both apps' tests green before and after (CLAUDE.md: a module never moves without its tests green
either side).

**BUILD NEW (app-local)** — all numeric quadrature (the repo has only solver-entangled ad-hoc
trapezoid sweeps); winding number; the pole-finder wrapper (`makeDurandKerner` is an *iteration*,
not a root-finder: seeding, deflation, multiplicity clustering and polish are ours); the camera
(port CD's 39-line `transforms.ts`; CD and correspondences use *different* view conventions, so
this is the second consumer of neither); the path editor; the derivation display (copy
`prove-plan.mjs`'s architecture — stages-as-data, pure exported stage functions, injected IO,
discriminated-union result, exportable proof blob — as architecture, not its 91 KB of QD `.mjs`);
figure export; worker offload.

**PORT FROM QD `sym-core.mjs`, as the ADR-0007 second consumer** — `schurCohn` /
`schurCohnInterval` / `unitCircleRootCount` (the "no poles on |z| = 1" hypothesis *is* Schur–Cohn),
and `sturmHabicht` / `realRootIsolate`. Port `.mjs` → TS into `@cas/exact` with QD's existing tests
as the golden corpus. Research 05 and 08 agree that this app wants `sym-core`'s **univariate**
layer, not its Gröbner/multivariate layer — so this is **not** grounds to extract `sym-core` whole
(ADR-0008 stands); the right move is growing `@cas/exact`.

### 6.1 Two extraction questions this app forces

> ⚠ **Both were answered against a stale checkout.** Item 1's argument survives — the honest-labelling
> guardrail really does have no shared code, and that was re-verified against real master — but its
> "every new app has reimplemented it" refers to a larger set of apps than the draft knew about, and
> the ADR is filed as **ADR-0040**, not 0009. Item 2 is simply wrong; see below.

1. **Honest labelling has zero shared code.** `rigorMeta`'s `=/≤/≥/≈/⚠/?` vocabulary lives at
   `apps/quadrature-domains/app/algebra/algebra-canvas.mjs:907`, `classifyRigor` at
   `algebra-ui.mjs:461`, `assembleVerdict` at `prove-plan.mjs:336` — 6,000 lines of QD `.mjs`. Every
   new app has re-implemented it from scratch, and we will too unless we act. **DECIDED (round 3):**
   write a small, clean `@cas/rigor` (verdict levels, the meet, provenance audit trail, the
   "a restricted count must carry its restriction" rule) as *new TS* in M0, consume it here, and
   file a follow-on ADR to migrate QD later on its own schedule. This is
   extraction-by-reimplementation, which ADR-0007 doesn't literally cover — so it needs its own ADR
   recording the departure and the reasoning (a guardrail CLAUDE.md calls non-negotiable having zero
   shared code is itself the justification). QD is **not** touched by this work.
2. ~~**`@cas/ui` is documented as planned-but-never-built**~~ — **wrong, and corrected after the
   fact.** `@cas/ui` was extracted ahead of adoption as the shared *browser shell* (canvas a11y, a
   fatal-error boundary, an off-thread compute client, a nav header) under ADR-0032, long before this
   plan was written; the plan was drafted against a checkout 581 commits stale (see the banner on
   [`research/08`](research/08-repo-reuse-survey.md)). **Open item:** adopt `@cas/ui`'s shell in this
   app rather than proposing a seed — the nav header in particular, so it sits in the suite the way
   its siblings do.

### 6.3 The overlap nobody saw: `apps/argument-principle`

Recorded after the rebase onto real master. That app already ships a draggable contour, a winding
number and a contour-integral quadrature of `f′/f`. Its `winding.ts` computes the winding by
**accumulating argument along a sampled polyline** and labels the result `≈`, with a header naming
itself as the [ADR-0007](../DECISIONS.md) second-consumer extraction candidate once a co-consumer
appears.

This app is that co-consumer, and it arrives with a *stronger* implementation: `kernel/winding.ts`
decides the winding number by **exact-sign crossing predicates** over a polygonisation certified
below the clearance to the query point, so it is honestly `=` rather than `≈`, and it refuses rather
than guessing when the point is not clear of the contour.

**Open item, not yet done:** promote the exact winding into a shared package and migrate
`apps/argument-principle` onto it, with its tests green either side. That is a real upgrade for that
app — an argument-principle demo whose winding number is exact is a better demo — and it is the
extraction its own source asked for.

### 6.2 New-app checklist (research 08 §7 — verified against the actual files)

(1) `package.json` with `dev/build/preview/test/test:watch/lint/typecheck` + `workspace:*` deps ·
(2) `tsconfig.json` copied from correspondences · (3) `eslint.config.js` copied from correspondences ·
(4) `vite.config.ts` with `base: "./"` and a free `strictPort` (CD 5173, corr 5175, QD 5199 are
taken) · (5) **add the config to `vitest.workspace.ts`** — a new app is invisible to `pnpm test`
until then · (6) add `"contour-integration"` to root `eslint.config.js`'s `APP_NAMES` · (7) add the
`src` glob to root `vitest.config.ts` coverage `include` · (8) launcher card — **there is no
registry**, it is hand-written HTML · (9) the `cp -r` line in `deploy-pages.yml`'s *Assemble _site*
step, **which is the entire publish mechanism** and exactly why correspondences is "built but not
published" · (10) append any browser suite to the root `test:browser` script, which is hardcoded.

---

## 7. Milestones and gates

Each gate is a shippable point (CLAUDE.md: working software at every step). Sizing is
**rough order of magnitude**, to be re-estimated at each gate.

### M0 — Scaffold and spine · *S–M*
App skeleton per §6.2 (launcher card as "Coming soon"; **not** in the deploy `cp` list yet).
**New package `@cas/rigor`** (§6.1) with its ADR: the five-level vocabulary, `assembleVerdict` as
the sole producer of `=`, provenance audit trail, and the restriction-carrying rule. Small, pure,
fully tested, no consumer but this app yet — QD untouched.
Camera ported from CD. WebGL2 domain colouring via `@cas/gpu` + `@cas/expr` `compileF`, CET-C6
palette. `@cas/expr` complex-literal/implicit-multiplication extension with parser tests pinned.
Compiled-evaluator spike (`Function` body vs register VM) benchmarked before committing.
**Gate:** type a rational function, see its phase portrait and its poles. Lint + typecheck + test green.

### M1 — The contour object and the accumulator · *M*
Path model (segments + arcs + parameter bindings); pen-tool editor; the piece list. Periodic
trapezoid + Clenshaw–Curtis per piece with the `4.4 points inside the pole distance` node
controller and a live error estimator. Accumulator panel: head-to-tail `Σ f(zₖ)Δzₖ` in its own
plane, plus the three wrong-sum contrasts. Exact-sign winding number (resolve the arc question).
Near-pole and on-pole **refusal**.
**Gate:** `∮dz/z = 2πi` on a drawn circle to ≤1e-14; contour through the pole prints **no number**;
dragging the circle across the pole makes the value jump by exactly `2πi·Res`.

### M2 — Residues, exactly · *M–L*
`@cas/exact` extensions: `invMod`, Yun squarefree, exact truncated series (`mul`/`inverse`/`shift`),
order-`m` residue via Taylor shift → series inverse → one convolution (which yields the whole
principal part free). `fToRational` Gaussian variant that **rejects what it cannot represent
exactly** rather than rounding. AAA in a worker. Residue ledger UI. Closed-form printing:
`ℚ(i)(√d)`, depth-2 denesting, cyclotomic recogniser.
**Gate:** exact residue sum agrees with numeric `∮` to the estimator's bound across the corpus;
`Res` of an order-5 pole exact; `π√2/2` prints as `π√2/2`, not `2.2214`.

### M3 — The Closing Ledger and the definite-integral machine · *L*
Tier-1 exact-ℚ certified ML bounds (§3.2) + Jordan's constant. The Family schema, loader and
validator. The Ledger UI. Derivation generation from family + ledger. Templates: circle,
semicircle, indented semicircle. Half-plane residue selection with the §3.3 ladder, including
`RootSum` output with a visible predicate. Schur–Cohn + Sturm ported from QD into `@cas/exact`.
**Pólya work/flux toggle** (round 3): draw the conjugate field `f̄` on the Stage and read `∮f dz`
as (work along) + i(flux across); Cauchy's theorem appears as source-free and irrotational. It
belongs here rather than in M1 because it explains *why* the vanishing arcs vanish, which is the
Ledger's subject.
**Gate:** gallery tiers A + B + C (13 integrals) each produce a closed form labelled `=` with every
arc certified; **the LHP semicircle for `∫cos x/(1+x²)` shows its bound diverging** and names the
failing constraint; p.v. is a distinct result type from a convergent integral.

> **✅ GATE MET.** All thirteen load and are executed against the engine in the suite, each solving to
> a symbolic closed form asserted by name (`familyGolden.test.ts`); the diverging LHP bound and its
> KILL row are pinned in `ledger.test.ts`; and p.v. is carried by the target's three-state
> `convergence` plus `auxiliary.principalValue` (C3's gap G6). B3 is the one entry whose *decimal*
> stays `≈`, which is its own record's position — its exponents are complex, so `Re` does not
> distribute and `e^{β}` carries cos and sin of an irrational.
>
> **M3.5a closed the first of M3's open items:** the Family records are wired into the shell. A
> `Sandbox | Gallery` source switch opens any of the thirteen by tier and fixture, and both modes run
> through one driver (`src/engine/analyse.ts`, reached for a record by `src/families/runFamily.ts`),
> which the golden corpus also calls — so the numbers on screen are the numbers the suite pins, along
> the same path, rather than a second implementation agreeing by inspection.
>
> **M3.5b closed the second:** the generated derivation panel. It is a *view* over evidence that
> already existed — the ledger's rows each carry a `Certificate` with a `method` and a ✓/✗ provenance
> trail that no surface had ever shown — so the panel renders the argument rather than re-narrating
> it, and `engine/derivation.ts` mints nothing but `unknown` (the one level that cannot manufacture a
> claim).
>
> Two labels were wrong underneath it, and are fixed. `applyResidueTheorem` folded the AGREEING
> quadrature's `≤` into the same verdict as the exact residue sum, so `meet` capped an exact `∮` at
> `≤` — `meet` is for a claim that *depends* on two sub-claims, and `∮` does not depend on the
> quadrature. Corroboration is now reported beside the value (`crossCheck`) instead of inside its
> label, while a *disagreement* still refuses it. That had left the shell hand-writing `badge("=")`
> to show the truth, which is precisely what [ADR-0040](../DECISIONS.md) exists to prevent; every
> badge in the app now comes from a verdict.
>
> **M3.5c made the contour an object you can grab.** North-star behaviour 1 — drag a contour across a
> pole and watch the value jump by exactly `2πi·Res` — was previously reachable only through a
> parameter slider, because every pointer drag panned the view. A drag now means one of three things,
> decided in that order: a **radius handle**, the **contour itself**, or the view. Translation stays
> inside `model.ts`'s affine `Scalar` subset — a literal coordinate moves by rewriting the number and a
> param-bound one absorbs the offset into its own `add` — so a dragged template is **still a template**,
> with its radius still bound to `R` and `R → ∞` still animating. A radius handle edits the parameter
> the template already binds its arcs to, which makes the indented semicircle's two handles `R → ∞` and
> `ρ → 0`: the two limits its argument is about, and the same edit as their sliders. Everything works
> from the keyboard (Enter walks what the arrows move; shift-arrow still pans), and PLAN §4.5's
> drag-coarse/reconcile-on-release is in: a gesture runs the quadrature under a work ceiling, is
> honestly `capped`, and the full pass on release logs any disagreement past the estimator's own bound.
> `∮` itself is unaffected either way, since it comes from a formula over exact residues.
>
> Two limits worth stating rather than papering over. **Body translation is sandbox-only** — under a
> gallery record the contour is the record's, and moving it would leave a worked example whose pieces
> no longer match its own argument (the radius handles still work, because those are the record's own
> declared limits). And **the refusal is for a pole ON the contour**: at a clearance of 1e-6 the app
> still reports `2πi` — correctly, because `2πi Σ n·Res` is as exact there as anywhere — while the
> quadrature cross-check degrades to an error estimate of order 1e+2. PLAN §4.4's answer to that is to
> subtract the principal part rather than to refuse a value the engine knows exactly, and that is M2
> work that has not been done. So a fast pointer drag will usually step over the refusal band, while a
> keyboard step can land in it; `test/edit.test.ts` pins both readings.
>
> **Still open from M3's scope**: the Pólya work/flux toggle, and the **pen tool** — free-hand path
> editing, which is adding and removing points, moving individual endpoints, and drawing a contour from
> nothing. That needs its own semantics for closure (moving one endpoint of a template's diameter opens
> the contour, and the ledger then correctly refuses the residue theorem), which is why it is not a
> corner of this slice. The `rigorOfBound` / `rigorOfLimit` split of DESIGN §4 Pass 3 is still unmade in
> the engine — a vanishing arc's one certificate is its finite-`R` bound, so the argument-wide meet reads
> `≤` wherever a bound appears. The derivation panel handles that honestly rather than hiding it: the
> conclusion is badged from its own evidence, and the argument-wide line says outright that it is "the
> weakest step in the argument, not the label of the answer". Running status lives in
> [`GALLERY.md`](GALLERY.md) §5.

### M4 — Branch cuts · *L*
`BranchChoice` model, admissibility validator, jump weights **verified by numeric continuation
probe before use**. CPU lift along path with `|Δθ| ≤ π/4` control; GPU `cutCorrection` +
`cargCut`/`clogCut`/`cpowCut` twins with `DUAL_BACKEND_CORPUS` entries. Templates: keyhole, dogbone.
`side` tags. Monodromy readout, sheet badge, shadow-cut mode.
**Gate:** D1–D7 (7 integrals) exact; dragging a cut across the contour changes the answer *and says
so*; the `arg ∈ (−π,π]` trap is detected and explained; CPU/GPU parity green in the browser suite.

> **M4.0 is done: the two engine decisions are taken** (ADR-0041), and the staging plan beneath them
> is [`M4-plan.md`](M4-plan.md) — **read it before starting M4**.
>
> **Tier D's output basis is CARRIED, not reduced.** `(π^k / sin(π r))·Σⱼ cⱼ ∏ₘ aⱼₘ^{qⱼₘ}` is
> reported as a *form* labelled `=`, with the decimal `≈`, exactly as tier B carries `e^{β}`. The
> fixtures are what decided it: reducing would need a general algebraic number field — `sin(3π/8)` is
> the nested `√(2+√2)`, `sin(3π/7)` is degree 3, D3's `sin(23π/50)` is **degree 20**, and D7 needs
> `40^{3/4}` and `10^{1/3}·6^{2/3}` — to express answers the records themselves write as
> `"pi/sin(pi*alpha)"`. Mechanically it is `expSum.ts`'s exponent widened to admit `(ℚ(i))·π` and
> `Σ(ℚ)·ln(ℚ₊)`, plus **one** recogniser for the two-term denominator that becomes a sine.
>
> **Pass 5 moves to ℚ(i)(π), with π an indeterminate**, because D4's row `−(1, 4πi, −4π²)` and D5's
> `−(1, 6πi, −12π², −8π³i)` do not fit in ℚ. `linear.ts` is generalised over a `Field` rather than
> rewritten, so rank stays *decided*. The cheaper alternative `system.ts`'s docstring names —
> rescaling the unknowns by powers of π — does not generalise: the unknowns are not homogeneous in π
> (`T0 = π/2` and `T2 = π³/8` for one R; `T0 = π/4` and `T1 = −π/4` both degree 1 for another).
>
> The staging is reordered by **which machinery each record needs**, so D1 and D3 land before D2, and
> D5 waits on the prerequisite chaining rather than on more algebra.
>
> **✅ GATE MET, with one clause delivered differently and said so.** Per-slice detail is in
> [`M4-plan.md`](M4-plan.md) §§5–15.
>
> - **D1–D7 exact** ✓ — all seven solve to symbolic closed forms, each asserted by name in its own
>   test (`test/d1.test.ts` … `d7.test.ts`), every declared fixture run, and the forms CARRIED rather
>   than reduced per ADR-0041. Closed forms are tabulated in [`GALLERY.md`](GALLERY.md) §5.
> - **The `arg ∈ (−π,π]` trap is detected and explained** ✓ — M4.2, north-star #4 verbatim: D1's
>   wrong `argRange` swings the cut onto ℝ₋ and LEGALITY catches both untagged circles, which is the
>   earliest of that record's three declared refusals the engine can see.
> - **CPU/GPU parity green in the browser suite** ✓ — the app gained a `test:browser` (M4.7a) and it
>   runs 75 assertions in real WebGL2 across three files, with mutation sweeps at 17/17 and 14/14.
>   *Deviation:* the twins are NOT in `DUAL_BACKEND_CORPUS`. There is one consumer, and adding them
>   to `@cas/gpu`'s corpus would drag a JS twin into `@cas/expr` for the same single caller
>   (ADR-0007); the app's own suite is also stronger here, since it compares the shader against the
>   twin the LEDGER uses rather than against a package's own reference. M4-plan §13's last note.
> - **Jump weights** are verified against the continuous-argument lift (`kernel/branch/lift.ts`) in
>   the suite rather than probed numerically at runtime. `liftArgument` is the mechanism the ANSWER
>   depends on, so agreement with it is the statement that the picture and the ledger are in the same
>   branch — and a runtime probe would re-derive an exact rational decision from a measurement, which
>   inverts this app's whole posture.
> - **"Dragging a cut across the contour CHANGES THE ANSWER and says so"** — half delivered, and the
>   missing half is one named cause rather than an omission. It **says so**: a crossing refuses and
>   NAMES its factor in both of research 06 §3.4's forms (M4-plan §15), which is §3.2's own contract
>   ("either refuse the crossing or change sheet and say so, with the multiplicative factor shown").
>   And the complementary fact is now certified: while the cuts stay clear of the contour `∮` is
>   *exactly* invariant under any deformation of them, which is what makes a jump meaningful at all.
>   What does not happen is the answer CHANGING, and the reason is that **the sandbox cannot declare a
>   branch factor.** Its editor declares branch points, exponents and cuts — so the cut system reaches
>   LEGALITY and the picture, but no sandbox value depends on it, because `analyse` takes the rational
>   route and there is no `z^α` whose determination a residue could be read in. Under a gallery record
>   the dependence is real (moving the cut moves `argRange`, which is D1's entire trap), but a
>   record's cuts are the record's and editing them would be editing a worked example.
>
>   **This is the same root cause as the one deferral M4.7d records** — research 06 §5.3's sheet
>   spinner has nothing to multiply for exactly the same reason. Letting the sandbox declare
>   `c·∏(z−bⱼ)^{αⱼ}·R(z)` rather than typing one expression closes both at once, and it is a real
>   extension of what the sandbox is, so it is an M5 slice rather than a corner of M4.
> - Two further limits tier D left were named in [`GALLERY.md`](GALLERY.md) §5.2 and are **closed in
>   M5.0**: `side` was declared and validated but never honoured (research 06 §3.3's
>   branch-offsetting evaluator specified and unbuilt), and consequently the quadrature cross-check
>   was skipped for all seven records. It is honoured now — as a `1e-30` displacement inside the
>   evaluator, a signed zero rather than an offset contour — and **all seven records report an
>   agreeing quadrature**, each within ~1.5× the quadrature's own error estimate. §5.2.1 records what
>   closing them cost, including the one skip that survives (a cut running *vertically* through a
>   piece pins no limit, and is refused by name rather than answered).

### M5 — The rest of the taxonomy · *M*
Rectangle/strip with quasi-period `λ` (E1–E3), wedge with the L6 bound (F1–F2), series summation via
`πcot`/`πcsc` including the kernel/`f` pole-collision case (G1–G3).
**Gate:** all 28 gallery integrals; the cross-family invariants (§8) green.

> **M5.0 is done: the one engine decision is taken** ([ADR-0042](../DECISIONS.md) — an exactly-known
> IMPORTED value is `=` on its form, with the import in its provenance), and the staging plan beneath
> it is [`M5-plan.md`](M5-plan.md) — **read it before starting M5.**
>
> **The eight records are not the work.** [`gallery/tier-efg.md`](gallery/tier-efg.md) §10 already did
> the analysis: **six schema gaps** (§10.2) and **four errors in research 03's lemma statements**
> (§10.1). Two of those errors are guardrail-critical — **L6's arc range is wrong as written** (the
> stated majorant diverges, measured `2.7×10¹⁵` at `n = 2, R = 6`) and **the square-contour bound
> drops a `π` and is therefore not an upper bound** (it fails at every `N` tested, by 30–40%, which is
> §9 R2's certification theatre exactly). One is the ADR above. And one is a unification: `cos φ ≥
> 1 − 2φ/π` (L6) and `sin ψ ≥ 2ψ/π` (Jordan) are **the same inequality**, so one predicate should
> discharge both.
>
> **M5 absorbed the two edges M4 left, by decision, and BOTH are now done.** `side` was declared and
> never honoured, so tier D's quadrature cross-check was skipped and tier D was the one tier without
> independent numeric corroboration ([`GALLERY.md`](GALLERY.md) §5.2) — **M5.0 honours it, and all
> seven tier-D records now agree with an independent quadrature** (§5.2.1). And the sandbox could not
> declare a branch FACTOR, the single root cause of this section's half-met gate clause *and* of
> research 06 §5.3's deferred sheet spinner — **M5.1 (a–d) closes both**. The sandbox reaches an exact
> `∮` by hand (its declaration reproduces D1's own closed form), the split it claims is CHECKED
> against the expression that was typed, and the sheet spinner reads `BranchChoice.sheet` at last.
>
> The gate clause itself needed correcting rather than meeting: *"dragging a cut across the contour
> changes the answer"* cannot happen, because `∮` reads the declared WINDOW and `powerAtPole` takes no
> geometry. Dragging a cut clear of the contour leaves the value bit-identical; dragging it across
> WITHHOLDS the value and names the crossing; changing the DETERMINATION jumps it by exactly
> `e^{−2πiJ}`. All three are asserted, and the correction is recorded in
> [`M5-plan.md`](M5-plan.md) §M5.1 with the measurement behind it.
>
> **Expect honest `≈` outcomes.** §10.3: "no entry's **exact** path was exercised — every number above
> is float64", so tier E–G's `=` labels are claims about what the engine *will* discharge, not
> results.

### M6 — Presentation, teaching layer, publish · *M*
Figure & share export (QD's `_pal` indirection, `renderToCanvas`, sync `ClipboardItem`);
`#vs=` codec with diff-from-defaults and full re-validation on restore; a11y pass; launcher card
live; the `deploy-pages.yml` line. **The teaching layer, scoped (round 3): contrasting triads and
fading only.** Triads are gallery *organisation*, not lessons — `∫1/(1+x²)`, `∫cos x/(1+x²)`,
`∫sin x/x` side by side: near-identical integrands, three different ledger outcomes (plain ML;
Jordan; indentation + p.v.). The faded contour-choice drill runs in four stages — contour given +
ledger filled → you fill the ledger → you pick from a menu → you draw freely — with fading tied to
progress (expertise reversal). **No prose lessons, no prediction or self-explanation prompts**;
everything else stays PhET-style implicit scaffolding in affordances, defaults and constraints.
**Gate:** published, permalinks round-trip, keyboard and screen-reader pass.

### Deferred (explicitly out of v1)
Argument principle / Rouché mode (research 03 §10) · Bromwich and inverse Mellin (§12) · algebraic
functions `wⁿ = R(z)` · Arb/FLINT WASM tier 3, behind a "Prove it" button for non-rational `f` ·
cross-app `@cas/interchange` hand-off (needs a new payload kind + `VERSION` bump — defer until a
real hand-off exists) · prediction and self-explanation prompts · 3-D Riemann-sheet view ·
df64 deep zoom · migrating QD onto `@cas/rigor`.

---

## 8. Testing strategy

**The golden corpus is the spec.** All 28 gallery integrals were independently re-derived and
numerically verified to ≥1e-8 (most ~1e-14) during research 03; those values ship as fixtures.

1. **Exact-vs-numeric differential.** Every gallery entry: exact residue sum vs. high-accuracy
   quadrature, agreement required to the estimator's own bound. This is both a test and the app's
   most convincing demo.
2. **Cross-family invariants — free tests from the taxonomy's structure.** §5.1 ≡ §6 under
   `x = log t` (keyhole edges ↔ strip sides; `e^{2πis}` ↔ `λ`); §5.1 ≡ §7 under `u = xⁿ`;
   §2's degree condition ≡ `Res(f,∞) = 0`; closing up vs. closing down must agree.
3. **Refusal tests.** Every `traps[]` entry gets a test asserting the app **emits no value**:
   pole on the contour, `deg Q = deg P + 1`, double pole on the axis, `|a| = 1`, wrong `argRange`
   (which makes the keyhole collapse to 0 — plausible and wrong).
4. **CPU/GPU parity.** Every branch helper needs a JS reference, a GLSL twin, and a
   `DUAL_BACKEND_CORPUS` entry. Browser tolerance `2e-6`, relaxed to `5e-3` for transcendentals
   under SwiftShader (which does transcendentals at ~1e-3).
5. **Verdict tests.** Assert the *label*, not just the value: a numeric-only discharge must cap the
   result at `≈`; no code path may hand-assert `=`.
6. **Method: break the guard, watch it stay green.** From code-review #4 Batch F — a test that
   doesn't fail against the broken code isn't guarding anything. Apply to every refusal and verdict
   test. And **re-run the full gate after the last edit**, never before it.
7. **Worker differential tests must be outcome-pinned** — a bare path-vs-path compare is
   tautological (QD's Q2 lesson).

---

## 9. Risk register

| # | risk | severity | mitigation |
|---|---|---|---|
| R1 | **Silent wrong answers from branch sign/orientation errors** — plausible-looking, invisible | high | never trust a derived jump weight: verify each arc with a numeric continuation probe and **refuse to render an unverified cut system** |
| R2 | **Certification theatre** — shipping a `=` badge backed by a heuristic | high | tier-1 exact ℚ bounds (§3.2) sidestep the JS transcendental problem entirely; tier 2/3 clearly labelled; `assembleVerdict` is the only producer of `=` |
| R3 | **Scope creep into a CAS** | high | the 28-integral gallery defines the engine surface; declare the output basis and refuse outside it |
| R4 | **Scope creep into algebraic functions** (`wⁿ = R(z)`) | med | the §4.3 closed class covers the entire gallery; hold the line, v2 |
| R5 | **`@cas/expr` / `@cas/core` extensions regress CD or QD** | med | additive-only grammar and exports; `@cas/core/series` built app-local first and migrated only with both apps' tests green either side |
| R6 | Naive AST tree-walk evaluator ⇒ GC jank | med | compile to `Function`/register VM; benchmark in M0 before committing |
| R7 | Near-branch-point cancellation and unbounded angular rate | med | `|Δθ| ≤ π/4` step rule + a hard `r_min` guard that **reports** rather than silently clamps |
| R8 | Half-plane sum has no rational closed form ⇒ `=` unreachable | med | the §3.3 ladder, ending in an honest `RootSum` with a visible predicate |
| R9 | Domain colouring dominates and becomes a seductive detail | low | bounded lightness modulation; the accumulator, not the background, is the hero |
| R10 | Reusing the wrong precedent — `orbitTree.ts`'s `label` is an `atan2` sort order the file itself flags as provisional near cusps | low | borrow its *discipline* (algebraic deflation, cold seeds, honest labelling), not its labelling scheme |

---

## 10. Sizing

Rough, and to be re-estimated at each gate. M0 *S* · M1 *M* · M2 *M–L* · M3 *L* · M4 *L* · M5 *M* ·
M6 *M*. The two genuinely research-shaped milestones are **M3** (the certified ledger — the
app's thesis) and **M4** (branch cuts). M1 is the one that must feel perfect; if the contour
doesn't feel like an object you can grab, nothing downstream matters.

## 11. Suggested first commit

Everything in M0 except the domain colouring, as one reviewable commit: the scaffold, the ten
checklist items, a failing-then-green parser test for `2i`/`2z`, and the evaluator benchmark.
That commit proves the app is wired into lint, typecheck, test and build before any maths lands.

## 12. Decisions taken, and what remains

### Round 1 — scope
Sandbox + worked-example gallery (not guided lessons) · exact rational residue core + curated
transcendental families · **branch cuts first-class from day one** · visuals = draggable contour
with live accumulation, over GPU domain colouring with pole/residue overlay · contour model =
templates on a free segment/arc substrate · **certified bounds where feasible** · standalone in v1 ·
fresh TS + Vite app borrowing patterns from each sibling.

### Round 3 — architecture
- **`@cas/rigor` as a new shared package, built in M0**, with an ADR recording the departure from
  ADR-0007's move-don't-rewrite default. QD is not touched; its migration is a later ADR.
- **Certification in exact BigInt ℚ via `@cas/exact`.** The float interval tier is **cut**;
  lazily-loaded Arb/FLINT WASM behind a "Prove it" button is the documented escape hatch for
  non-rational `f`, deferred past v1.
- **Teaching layer = contrasting triads + faded drill only**, as gallery organisation rather than
  lessons. No prose lessons, no prediction or self-explanation prompts.
- **Pólya work/flux as a named Stage toggle in M3**, adjacent to the Ledger.

### Resolved by recommendation (raise it if you disagree)
- **`sym-core` port scope** — take the *univariate* layer only (`schurCohn`, `schurCohnInterval`,
  `unitCircleRootCount`, `sturmHabicht`, `realRootIsolate`) into `@cas/exact`, port `.mjs` → TS with
  QD's existing tests as the golden corpus. Leave the Gröbner/FGLM/multivariate layer where it is:
  research 05 and 08 agree independently that a residue engine never reaches for it, so ADR-0008
  stands. `factor`/`qiFactor` is the one large optional port — gate it behind a demonstrated need,
  since Rothstein–Trager and LRT require no factorisation at all.
- **Gallery depth** — the 28-integral list (research 03 §13) is the right v1 target. It is
  explicitly ordered so each tier adds exactly one engine capability, and it needs only six contour
  templates, one fractional-power branch, one log branch, and the `πcot`/`πcsc` kernel pair.
  Everything past it is parameterisation, not new machinery.

### Round 4 — reach and release
- **Reach: personal / portfolio now, with a planned extension to a serious teaching resource.**
  M6 is therefore *proportionate* rather than exhaustive — but the teaching-resource path must not
  be architecturally foreclosed. Concretely: semantic DOM and aria labels as we go rather than as a
  retrofit, permalinks stable from M3, the faded drill's progress state designed to be persistable
  even if it isn't persisted, and no copy written as if the reader already knows the user.
- **Publish at M3**, into the `deploy-pages.yml` `cp` list. The first public version is contours,
  exact residues, winding numbers, the Ledger and tiers A–C in certified closed form — already
  past every benchmark in §1.1 — and it will visibly lack keyhole integrals until M4. The launcher
  card should say what is and isn't there rather than implying completeness.
- **Next: deepen the plan, no code yet.** See [`DESIGN.md`](DESIGN.md) (module layout, core types,
  the Ledger algorithm, the `@cas/rigor` API, the locked Family record format) and
  [`GALLERY.md`](GALLERY.md) (the 28 entries as Family records).
