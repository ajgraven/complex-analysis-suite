# `apps/contour-integration` — design specification

> Companion to [`PLAN.md`](PLAN.md). The plan says *what and why*; this says *how*, at the level of
> module boundaries, type signatures and algorithms. Still preliminary — but specific enough that
> disagreement is possible, which is the point.
>
> The 28 gallery entries as Family records live in [`GALLERY.md`](GALLERY.md).

---

## 1. Module layout

Four layers, strictly downward-depending (§4 of the plan). Layers `kernel/` and `engine/` are pure
TypeScript with **no DOM access whatsoever** — that is what makes the golden corpus possible, and it
should be enforced by an ESLint `no-restricted-globals` rule on those directories, not by discipline.

```
apps/contour-integration/src/
  kernel/                         pure maths; no app types, no DOM
    complex.ts                    Cx aliases over @cas/expr complexJs + @cas/core
    compile.ts                    ExprNode → compiled evaluator (see §7)
    series/                       float Laurent ops: mul, inv, pow, shift, compose   [M2]
    exactSeries.ts                truncated series over ℚ(i)                         [M2]
    poles.ts                      findPolesOf: seed → deflate → polish → cluster
    aaa.ts                        AAA rational approximation                    [worker only]
    winding.ts                    exact-sign crossing predicates
    quadrature/
      trapezoid.ts  clenshawCurtis.ts  gaussKronrod.ts  tanhSinh.ts
      nodeController.ts           the 4.4-points-inside-d rule
      poleSubtract.ts             AAA-driven principal-part subtraction
    bounds/
      ratBound.ts                 rational upper/lower bounds on √c  (§6.1)
      mlRational.ts               the exact-ℚ ML bound — the flagship  (§6.2)
      jordan.ts  smallArc.ts  wedge.ts
    exact/                        thin extensions over @cas/exact
      invMod.ts  yun.ts  subresultant.ts  rothsteinTrager.ts  lrt.ts
      halfPlane.ts                Schur–Cohn / Sturm / Routh–Hurwitz counting
      closedForm.ts               ℚ(i)(√d), denesting, cyclotomic recogniser, RootSum IR
  engine/                         problem semantics; no DOM
    contour/   model.ts  evaluate.ts  templates.ts  edit.ts  hit.ts
    branch/    model.ts  validate.ts  jump.ts  lift.ts  shadow.ts  twins.ts
    residue/   detect.ts  exact.ts  numeric.ts
    ledger/    model.ts  evaluate.ts          ← §4, the algorithm
    family/    schema.ts  load.ts  match.ts  check.ts
    derivation/ build.ts  latex.ts
  ui/
    stage/     gl.ts  camera.ts  overlays.ts  polya.ts
    panels/    gallery/ function/ contour/ cuts/ ledger/ derivation/ result/ figure/
    accumulator/
  shell/       state.ts  url.ts  worker.ts  figure.ts  keys.ts
  worker/      entry.ts             AAA, certification, heavy exact solves
packages/rigor/                    new shared package — §5
```

**Directory-level dependency rule**, to be added alongside the repo's existing cross-app rule:
`kernel/` may import only `@cas/*`; `engine/` may import `kernel/` and `@cas/*`; `ui/` and `shell/`
may import anything below them; nothing imports upward. This is the app-internal echo of
ARCHITECTURE.md §4 and is worth wiring on day one, when it costs nothing.

> **As built (M8 step 2.5).** The four layers and the dependency rule are exactly as specified and
> are enforced by the app's `eslint.config.js`. The FILE TREE above is the design-time sketch and
> is not what to read for the current layout — that is
> [`../../apps/contour-integration/README.md`](../../apps/contour-integration/README.md) § Layout.
> Three differences are worth naming because they are decisions rather than drift. **There is no
> `worker/` and no `aaa.ts`** — see §7 below. **`ui/panels/gallery/ function/ contour/ cuts/
> ledger/ derivation/ result/ figure/` is the pre-M8 rail** and does not exist: the cards live in
> `shell/cards/` under ADR-0043's two-rail split, and the gallery is a front door rather than a
> panel. And `shell/url.ts` is `shell/viewState.ts`, `shell/keys.ts` folded into the stage
> controller and the bar. `kernel/exact/` stayed largely in `@cas/exact` (ADR-0007), and the
> per-tier modules the milestones added — `branch/`, `bounds/`, `exponent.ts`, `sineForm.ts`,
> `cothForm.ts`, `summationKernel.ts` — were not foreseeable from here.

---

## 2. Core types

### 2.1 Scalars bound to parameters

The thing that makes "templates on a free substrate" work is that geometry holds **parameter
expressions**, not numbers. A template is then just a `Contour` whose geometry references `params`,
and it stays fully editable after loading.

```ts
/** A geometric quantity: a literal, or an expression over the param scope. */
export type Scalar = number | { expr: ExprNode };

export interface Param {
  name: string;                      // "R", "eps", "a", "alpha"
  value: number;
  range: [number, number];
  scale: "linear" | "log";           // log when the limit is ±∞ or 0
  role: "geometry" | "integrand";
  /** the limit this parameter is heading to in the argument being made, if any */
  limit?: { to: "inf" | "0+" | number };
}
```

`limit` is what lets the app animate `R → ∞` and `ε → 0⁺`, *and* what lets the Ledger state an
asymptotic conclusion rather than a single numeric bound. A parameter with no `limit` is just a
knob.

### 2.2 Contour

```ts
export type Point =
  | { kind: "cart"; x: Scalar; y: Scalar }
  | { kind: "polar"; r: Scalar; theta: Scalar };

export type Geom =
  | { kind: "segment"; from: Point; to: Point }
  | { kind: "arc"; center: Point; radius: Scalar; theta0: Scalar; theta1: Scalar };
//    orientation of an arc is the sign of (theta1 − theta0); no separate flag.

export type PieceRole = "target" | "vanish" | "reproduces" | "residue" | "free";

export interface Piece {
  id: string;
  name: string;                      // user-editable: "the R→∞ semicircle"
  geom: Geom;
  role: PieceRole;
  lemma?: LemmaId;                   // "L1".."L8"; required when role === "vanish"
  factor?: ExprNode;                 // required when role === "reproduces", e.g. −exp(2πis)
  side?: "above" | "below";          // pins the argument limit at a cut — never an ε-offset
  colour: 0 | 1 | 2 | 3 | 4 | 5;
}

export interface Contour {
  pieces: Piece[];                   // ordered; traversal order defines orientation
  params: Record<string, Param>;
  closed: boolean;                   // computed, then asserted: last endpoint ≡ first
}
```

Three deliberate omissions. There is **no** sampled-point representation in the model — sampling is
a function of `(Contour, params, N)` computed on demand, never stored, never serialised (research 07:
serialising sampled points bloats the link, binds it to a resolution, and breaks on schema bump).
There is **no** separate orientation flag — traversal order and arc angle sign carry it, so the two
cannot disagree. And `closed` is derived and then checked, so a contour cannot claim closure it
doesn't have.

### 2.3 Problem and branch

`BranchChoice` is specified in PLAN.md §4.3 and research 06 §8; it is an **input to the answer**,
not a rendering option.

```ts
export interface Problem {
  integrand: ExprNode;
  branch: BranchChoice;
  target?: RealIntegral;             // present in definite-integral mode
}

export interface RealIntegral {
  variable: "x" | "theta";
  lower: ExprNode; upper: ExprNode;  // may be ±∞
  integrand: ExprNode;
  /** how the real integral becomes a piece of the contour integral */
  substitution?: { to: "z"; map: ExprNode; inverse: ExprNode };  // e.g. z = e^{iθ}
  principalValue?: boolean;          // p.v. is a DISTINCT result type, never a flag on a value
}
```

---

## 3. `@cas/rigor` — the verdict algebra

A new package (PLAN.md §6.1, decided). Small, pure, no dependencies. Its entire job is to make it
**impossible to write `=` by hand**.

```ts
export type Level = "=" | "≤" | "≥" | "≈" | "?" | "⚠";

export interface Certificate {
  level: Level;
  /** what is asserted, in one line, renderable */
  claim: string;
  /** how it was established — "interval Schur–Cohn", "exact ℚ coefficient bound", "trapezoid N=4096" */
  method: string;
  /** a scope the claim is restricted to. If present it MUST travel with the verdict. */
  restriction?: string;              // e.g. "over poles with Im z > 0"
  /** ✓/✗ audit trail of the sub-steps */
  provenance: { ok: boolean; text: string }[];
}

export interface Verdict {
  level: Level;
  certificates: Certificate[];
  /** union of every certificate's restriction, deduped. Renderers MUST show these. */
  restrictions: string[];
}

/** The only function in the codebase that may produce a Verdict. */
export function assembleVerdict(cs: Certificate[]): Verdict;
export function meet(a: Level, b: Level): Level;
```

**The lattice.** `⚠` is absorbing — one refused step refuses the whole claim, regardless of how well
the others went. Otherwise the meet is the weaker of the two along
`=` ▷ `≤`/`≥` ▷ `≈` ▷ `?`. Two special cases are worth writing down because they are where
plausible-looking bugs live:

- `meet("≤", "≥") = "≈"` **with both certificates retained** — an upper and a lower bound on the
  same quantity is an *enclosure*, which is a legitimate and displayable thing, but it is not `=`.
- `meet("=", "?") = "?"`, not `"="`. An unknown sub-step is not a passing sub-step. This is the
  rule that most often gets violated by accident.

**The restriction rule**, from QD's `sliceCaveat`/`scopeCaveat` lesson: a restricted claim that
loses its restriction becomes a *false* claim, not merely a vague one. `Verdict.restrictions` is
therefore aggregated by `assembleVerdict` and the result renderer must display it at the point of
display — not in a tooltip, not in a disclosure.

**Test obligation.** Every consumer has a test asserting the *label* as well as the value, and each
such test must be shown to fail against a deliberately broken implementation (the "break the guard,
watch it stay green" method from code-review #4, Batch F).

---

## 4. The Ledger algorithm

This is the app's thesis in executable form. Input: a `Problem`, a `Contour`, and the detected
singular set. Output: a `LedgerResult` that either **closes** — yielding a value with a verdict — or
names the constraint that failed and how to repair it.

```ts
export type ConstraintId = "COVER" | "KILL" | "CATCH" | "LEGALITY";

export interface LedgerRow {
  constraint: ConstraintId;
  pieceId?: string;
  status: "satisfied" | "failed" | "unknown";
  claim: string;
  evidence: Certificate;
  repair?: { text: string; apply?: (c: Contour) => Contour };
}

export interface LedgerResult {
  rows: LedgerRow[];
  closes: boolean;
  value?: { exact?: ExprNode; numeric: Cx };
  verdict: Verdict;
}
```

### Pass 1 — LEGALITY (and the right to print anything at all)

Run **first**, because everything downstream is meaningless if it fails.

1. For each piece, compute its minimum distance to each pole, branch point and cut. If a pole lies
   *on* a piece, or within `r_min`, emit a `⚠` row and **return immediately with no value.** This is
   north-star behaviour 5, and it is a hard return, not a warning flag on a computed number.
2. For each piece, test intersection with each `CutArc`. A crossing is legal only when the piece
   carries a `side` tag pinning which limit is meant; otherwise `⚠` with the repair *"tag this
   segment `above` or `below`, or move the cut."*
3. Validate the cut system itself (research 06 §2.1: every non-∞-touching component of the cut
   forest has `Σαₖ ∈ ℤ`). An invalid cut system refuses to render, let alone integrate.
4. Determine closure. If any piece has role `vanish`, `reproduces` or `residue`, the contour must be
   closed; if it isn't, `⚠` with the repair *"close the path"*.
5. Record orientation (the signed area of the traversal, or the winding number about an interior
   point) so that every sign downstream has a single source.

### Pass 2 — CATCH (the singular set and the residue sum)

For each detected singularity `aₖ`:

1. `n(γ, aₖ)` by exact-sign crossing predicates → `=` (for arcs, see PLAN.md §4.4's open point).
2. `Res(f, aₖ)`: the exact path when the integrand is rational over ℚ(i) — `P·(Q')⁻¹ mod Q` for
   simple poles, Taylor-shift + series inverse + one convolution for order `m` — otherwise the
   numeric FFT-on-a-small-circle path, labelled `≈`.
3. Emit one row per pole carrying order, residue, winding number and their certificates.

Then `S := 2πi Σₖ n(γ,aₖ)·Res(f,aₖ)`, with `S`'s certificate the meet over the rows.

**Winding number and enclosed-pole count are reported as separate rows** (research 02, P0 #7) —
never one number implying the other, which is exactly the conflation the dogbone and Pochhammer
contours exist to break.

### Pass 3 — KILL (per-piece disposal)

For each piece, by role:

| role | what is computed | certificate |
|---|---|---|
| `vanish` | discharge the named lemma(s): an explicit bound `B(p)` in the limit parameter `p`, **plus** the asymptotic verdict `B → 0` / `B → c ≠ 0` / `B` diverges | **two certificates, see below** |
| `reproduces` | the coefficient row `cᵢ` and constant `bᵢ` symbolically, **verified numerically** before use | `=` if symbolic and verified, else `≈` |
| `residue` | the residue at infinity, when the family uses one — **not** covered by pass 2, which sums finite poles only | `=` when exact |
| `target` | nothing — it is an unknown | `?` |
| `free` | quadrature, or an imported exact constant declared by the family | `≈`, or `=` for a declared constant |

**A `vanish` piece yields two distinct certificates, and conflating them is a bug.** The finite-`p`
statement `|∫| ≤ B(p)` is a `≤`. The statement actually substituted into pass 5 is
`lim_{p→limit} ∫ = 0`, which — once the limit of the bound is established symbolically — is an `=`.
Under `rigor.policy: "min"` the difference decides every label in the gallery: carrying only the
`≤` would cap every result at `≤`, contradicting the worked ledger in PLAN.md §2, which correctly
prints `[≤]` on the KILL row and `[=]` on the conclusion. So the schema carries
`rigorOfBound` and `rigorOfLimit` separately, and pass 5 consumes only the latter.

**A piece may need more than one lemma.** The arcs in B1 and B3 are discharged by L2 *and* L3; B2's
arc is discharged by L3 alone, and that redundancy is exactly what distinguishes the entries —
B2 is the case where Jordan is strictly necessary. `vanishingLemmas` is therefore keyed by
`(piece, lemma)`, not by piece, and a piece is disposed if **any** of its lemmas discharges.

The `vanish` row is the app's best moment. For rational `f` on a circular arc, the bound is the
exact-ℚ computation of PLAN.md §3.2, and the row reads:

> **KILL** · *the R→∞ semicircle* · `|∫| ≤ 3.2×10⁻⁴` at `R = 50`, and `→ 0` as `R → ∞` because
> `deg Q − deg P = 3 ≥ 2`, an `O(R⁻²)` bound. **`≤`**

and when the user picks the wrong half-plane, the same code path produces

> **KILL** · *the R→∞ semicircle* · `|∫| ≤ 1.9×10²¹` at `R = 50`, and the bound **diverges** as
> `R → ∞`: `|e^{iaz}|` is bounded only where `a·Im z ≥ 0`. **`⚠` — this argument does not close.**

That is a single code path producing both the success and the diagnostic. No special-case "wrong
contour" detector exists or should exist.

### Pass 4 — COVER

Confirm the target real integral appears as the `target` pieces, under the declared substitution if
any (`z = e^{iθ}` for the unit-circle family; `u = xⁿ` for the wedge). In sandbox mode there is no
target, COVER is vacuous, and the ledger simply reports the closed-contour value — which is a
legitimate and common use.

### Pass 5 — SOLVE (a real linear system, not a division)

> **Revised.** The first draft of this design solved a scalar equation, `T = (S − ΣV − ΣF)/(1 + Σc)`.
> Writing the 28 gallery entries against it broke it three separate ways, found independently:
> the log-keyhole family reproduces an *affine combination of several* targets rather than a
> multiple of one (D4/D5); tier G has **no `target` piece at all** — its unknown sits inside `S` —
> so the scalar form degenerates to `T = 0/1 = 0`; and one complex equation is really *two real*
> equations, which is precisely how D4 and D5 both fall out of a single contour. The corrected
> formulation below subsumes all three, and is simpler, not more complicated.

**Unknowns.** A family declares a vector of real unknowns `t ∈ ℝᵐ` — usually `m = 1`, but the log
family has `m = 3` (`∫R`, `∫R log`, `∫R log²`) and tier G's single unknown is a *sum*, not an
integral. Real integrals are real, so the unknowns are real and the system is solved over `ℝ`.

**One equation per contour identity, split into two real rows.** Each piece contributes a row
`∫_piece = aᵢ·t + bᵢ` with `aᵢ ∈ ℝᵐ` known (from its role) and `bᵢ ∈ ℂ` known:

| role | `aᵢ` | `bᵢ` |
|---|---|---|
| `target` | the real-linear functional relating this piece to the unknowns — including complexification, so `∫sin x/x = Im ∫e^{iz}/z` is just a row that loads the imaginary part | `0` |
| `reproduces` | the coefficient row (an **affine combination**, e.g. the log keyhole's lower edge returns `∫R log + 2πi∫R`) | any bonus constant |
| `vanish` | `0` | `0`, or a known limit such as `iα·Res` from L4 |
| `free` | `0` | quadrature, or a declared exact constant |
| `residue` (at ∞) | `0` | `−2πi·Res(f,∞)` |

Summing and equating to the finite-pole residue sum `S` gives one complex equation `a·t = S − b`,
which is **two real equations** (real and imaginary parts). Stack these over every identity the
family declares — several contours, several parameter instances, plus any `prerequisites` supplying
already-known values — into

```
M t = r          M ∈ ℝ^{k×m},  r ∈ ℝ^k
```

and solve in least-squares-with-rank form. **Report `rank(M)` and a basis for `ker(M)`.**

**This is where four classical traps become one computation.** Each is a rank condition, and the app
reports *which* unknowns are undetermined rather than printing a plausible wrong number:

| classical symptom | what `M` does |
|---|---|
| keyhole with `arg ∈ (−π,π]` — "the two edges cancel and the integral collapses to 0" | `M = [0]`, rank 0 |
| `∫₀^∞ x^{a−1}/(1+xⁿ)` at integer `a` | `M = [0]`, rank 0 |
| the plain-`log` keyhole "losing" the log integral | a zero **column**: that unknown is unconstrained |
| D5's `∫R log²` underdetermined on its own | rank 2 of 3 — needs a `prerequisite` |

So instead of four hand-written detectors, one kernel report: *"this contour carries no information
about `∫₀^∞ R(x) log x dx`."* The trap records keep their **explanatory messages**, attached to the
rank-deficient row — the mathematics still needs saying, it just no longer needs detecting.

**Conditioning.** A nearly-rank-deficient `M` is an ill-conditioned solve, which earns `≈` with a
stated condition number, never a confident digit string. Exact rational `M` (the common case) is
solved exactly and the question does not arise.

> **AS BUILT: one equation, FOUR routes — and the split is about the RING, not the algebra.** The
> statement above is right and stayed right; what the corpus forced is that `M` and `r` do not all
> live in one coefficient field, and **no two of these rings contain each other**. So the solve is
> routed on the record's own declaration rather than discovered by trying one and catching a failure:
>
> | route | ring | records | what forces it |
> |---|---|---|---|
> | `solveTarget` | units of π over the exponential basis `Σ cₖe^{βₖ}` | tiers A–C, D1–D3, D6, D7, E1, E2, F1 | a MULTIPLICATIVE crossing phase: `e^{2πiα}` is not a rational function of π |
> | `solvePiTargets` | ℚ(i)(π), π an indeterminate | D4, D5 | an ADDITIVE crossing phase: `(log x + 2πi)²` carries a genuine `π²` |
> | `solveResidueTerm` | either, selected per record | G1–G3 | the unknown is inside `S`, so there is no `target` piece and no left-hand side (SG-1) |
> | `solveImported` | the rank-1 module `A·(exponential basis)` | E3, F2 | the answer rests on a constant the argument does not derive, and `A` has no inverse (ADR-0042) |
>
> The fourth is the sharpest statement of the pattern: it REQUIRES `∮ = 0`, because `2πi Σ Res`
> carries π and `√π` does not, and `0` is the one value both rings share. That is not a limitation
> working around a missing feature — it is the empty singular set, which is what those two records
> are about.

### Pass 6 — VERDICT

`assembleVerdict` over every row's certificate. `closes = rows.every(r => r.status === "satisfied")`.
The UI states the conclusion in words — **"this argument closes"** / **"this argument does not
close: the arc bound diverges"** — because a number alone cannot distinguish the two, and that
distinction is the product.

---

## 5. The Family record — v2 format

> **v2.** Research 03 §15 sketched this and §5 of this document locked a v1. Writing all 28 gallery
> entries against that v1 produced **19 distinct schema gaps**, found independently by three authors
> working on disjoint tiers. Most were symptoms of the scalar-solve problem fixed in §4; the rest are
> folded in below. The gaps are listed with their originating entries in
> [`GALLERY.md`](GALLERY.md) so the reasoning survives.

A Family is **data**, and every field is either executable or renderable — nothing is
prose-for-humans-only except `traps[].message` and `*.note`.

```ts
export interface Family {
  id: string;                        // "mellin-keyhole"
  title: string;
  taxonomySection: string;           // "5.1" — back-reference into research/03
  tier: "A" | "B" | "C" | "D" | "E" | "F" | "G";

  /** The unknowns. Usually one; the log family has three; tier G's is a sum, not an integral. */
  targets: {
    id: string;
    kind: "integral" | "sum";
    variable: "x" | "theta" | "n";
    lower: string; upper: string;    // "0" | "inf" | "-inf" | "2*pi"
    summand?: string;                // when kind === "sum"
    integrand?: string;              // when kind === "integral"
    /** absolute | conditional | principalValue — a DISTINCT result type, not a flag on a value */
    convergence: "absolute" | "conditional" | "principalValue";
    symbols: Record<string, SymbolSpec>;
    /** how this real quantity becomes a contour piece */
    substitution?: { map: string; inverse: string; jacobian: string };  // z = e^{iθ}, u = xⁿ …
  }[];

  /**
   * The contour integrand, when it differs from the target's — i.e. complexification.
   *
   * **PRE-Jacobian.** When a `substitution` is also declared, the Jacobian is applied ON TOP of this
   * expression. A4 pins it: `g(e^{iθ}) e^{−inθ}` complexifies to `g(z) z^{−n}`, and the record's
   * contour integrand is `g(z)/(i z^{n+1})` — that times `dθ = dz/(iz)`. An auxiliary written with
   * the Jacobian already folded in would double it by a factor of `iz`, silently.
   */
  auxiliary?: {
    integrand: string;               // "exp(i*z)/z" for ∫ sin x / x
    /** the real-linear functional recovering the target: "Re" | "Im" | an expression */
    relation: "Re" | "Im" | string;
    note: string;
  };

  /** Values this family may assume as known, each with its own provenance and rigor. */
  prerequisites?: { targetId: string; from: string; value: string; rigor: Level }[];
  /** Exact constants imported rather than derived — √π for E3/F2 — so they are not capped at ≈. */
  constants?: { name: string; value: string; source: string; rigor: Level }[];

  parameters: { name: string; domain: "real" | "complex" | "integer";
                constraints: string[] }[];

  /** Scope the whole family's claim is restricted to; travels into Verdict.restrictions. */
  restrictions?: string[];           // "sgn(a) = +1"; "|a| < 1 branch of the pole selection"

  hypotheses: {
    id: string; statement: string; check: string;
    /** escalate: the hypothesis fails but a named alternative argument applies (see collisions) */
    onFail: "refuse" | "warn" | "escalate";
    escalateTo?: string;
  }[];

  /** Kernel-pole / f-pole coincidence: G1's order-3 merged pole is rigorous, not an edge case. */
  collisions?: { at: string; mergedOrder: number; residue: string; note: string }[];

  /** Plural: D6/D7 have two branch points, D7 with two different arg conventions. */
  branch?: {
    function: string;
    branchPoints: { at: string; order: { kind: "power"; alpha: string } | { kind: "log"; power: 1 | 2 } }[];
    cuts: { from: string; to: string; argRange: [string, string] }[];
    crossingPhase: string;
    /** research 06 §2.1 — every non-∞-touching component has Σα ∈ ℤ */
    admissibilityCheck: string;
  };

  contour: {
    template: TemplateId;            // circle | semicircle | indentedSemicircle | keyhole |
                                     // dogbone | rectangle | wedge | square
    limitParams: { name: string; to: "inf" | "0+"; through?: "halfIntegers" }[];
    pieces: FamilyPiece[];       // defined below — §5.1
    orientation: "ccw" | "cw" | { expr: string };   // B1 needs sgn(a)
    /** per-pole, not a prose blurb: the winding number the family asserts for each */
    windings: { pole: string; n: string }[];
    /** the residue at infinity, when the family uses one. Pass 2 sums FINITE poles only. */
    residueAtInfinity?: { used: boolean; value?: string; certifiedZeroBy?: string };
  };

  /** Keyed by (piece, lemma): a piece may have several, and any one of them may discharge it. */
  vanishingLemmas: {
    piece: string; lemma: LemmaId;
    sideCondition: string;
    discharge: string;
    /** the finite-p bound |∫| ≤ B(p) */
    rigorOfBound: Level;
    /** the limit statement actually substituted in pass 5 — this is what the verdict consumes */
    rigorOfLimit: Level;
    rigorIfNumericOnly: Level;
  }[];

  residueSelection: {
    rule: "all" | "inside" | "upperHalfPlane" | "lowerHalfPlane" | "notOn";
    set?: string;
    /** tier G: the unknown is a TERM of the residue sum, solved by its OWN route — not moved to
     *  the unknown side of M t = r, which would need a coefficient in no ring here (M5.6b) */
    targetTerms?: { targetId: string; terms: string; weight: 1 | 2 }[];
  };

  /** Which rung of PLAN.md §3.3's ladder this family's half-plane sum reaches. */
  halfPlaneLadder?: "homogeneousSplit" | "radicalsDeg4" | "cyclotomic" | "enclosure" | "rootSum";

  closedForm: { expr: string; simplified?: string };
  rigor: { policy: "min"; inputs: string[] };
  traps: { id: string; detect: string; message: string }[];

  golden: { params: Record<string, string | number | boolean>;  // booleans are VARIANT FLAGS —
            //   `halfRange`, `closeDown`: they select an alternative derivation of the same
            //   family, not a parameter binding. Widened after A5/A6/A7 each used one.
            value: string; numeric: number | [number, number];
            verifiedTo: number;
            /** how it was verified — two independent methods required for the primary fixture */
            method: string }[];
}
```

### 5.0 Which string fields are machine-readable, and in what language

*Added with the loader, which had to decide this to check anything.* Three different languages live
in this schema, and conflating them is how a field ends up looking executable while being prose.

| field | language | checked by the loader |
|---|---|---|
| `windings[].pole`, `windings[].n` | `@cas/expr` | **yes** — must parse |
| `targets[].integrand`, `auxiliary.integrand`, `substitution.*` | `@cas/expr` | yes, on use |
| `hypotheses[].check`, `traps[].detect`, `vanishingLemmas[].discharge` | the predicate DSL (below) | namespace / back-reference only |
| `parameters[].constraints`, `restrictions` | the predicate DSL | not yet |
| `closedForm.expr`, `closedForm.simplified` | **display notation** | no |
| `traps[].message`, `*.note`, `*.statement`, `golden[].method` | prose | no |

**The predicate DSL is not `@cas/expr`,** and cannot be: `@cas/expr`'s comparisons are `>`, `<` and
`==` only, so `n >= 0` and `abs(a) != 1` do not parse, and `algebraic:squarefreeMultiplicityAt(Q, i)
== 3` is not an expression at all. It has two forms:

```
<namespace>:<predicate>          namespace ∈ { algebraic, numeric, structural, symbolic }
hypotheses.<id> == true|false    a back-reference: "fire when that hypothesis failed"
```

The back-reference form was found in the records rather than designed — A1's `pole-on-circle` and
A2's `modulus-one-refusal` both use it, and it is the right way to say "this trap is the human
explanation of that hypothesis's refusal". The loader checks the referenced hypothesis exists.

**`closedForm` is display notation, not an expression.** The corpus writes
`2*pi*i*Sum(Res(f, z_k), im(z_k) > 0)` and `2*pi*sign(a)/sqrt(a^2 - b^2)`; neither `Sum`, `Res` nor
`sign` exists in `@cas/expr`. The value a family actually establishes comes from the engine, not
from parsing this field.

**`restrictions` scopes a claim NARROWER than the parameter domain** — a branch selection, not an
explanation. A family whose closed form holds on its whole legal domain has none; the gap between
that domain and what a *textbook* form needs is a `trap`.

---

### 5.1 `FamilyPiece`

*Added after the schema above was written against the gallery: §5 declared `pieces: FamilyPiece[]`
and never defined the type. §2.2's runtime `Piece` is close but carries no coefficient information,
and **Pass 5 cannot build `M` without it** — a role alone says a piece is a `target`, not WHICH
unknown it is the target of, nor with what real-linear functional.*

```ts
export interface FamilyPiece {
  id: string;
  name: string;
  geom: Geom;                        // §2.2's runtime geometry, not a string — see the note below
  role: PieceRole;
  lemma?: LemmaId;                   // required when role === "vanish"; invariant 1 checks it
  /** Pass 5's `aᵢ`, one entry per unknown this piece touches. */
  coefficients?: { targetId: string; coefficient: string }[];
  /** Pass 5's `bᵢ` — the bonus constant a `reproduces` piece carries alongside its multiple. */
  bonus?: string;
  side?: "above" | "below";
  colour: 0 | 1 | 2 | 3 | 4 | 5;
}
```

`coefficients` is **required** for `reproduces` (a bonus row is meaningless without one) and may be
omitted on a `target` piece only when the family has exactly one unknown, where `1` is unambiguous.

**Geometry is the runtime type, not a string.** The gallery's JSONC writes `"x": "-R"`; the loaded
record reuses §2.2's affine `Scalar`, so the value a record declares is the value `resolve()`
consumes — no parser, no glue, and no second representation to drift out of step.

**`M` is not always rational.** Every coefficient in tiers A and B is `1` or `0`, but the log
keyhole's lower edge reproduces `∫R log + 2πi∫R`, so its row carries a `2π`. The loader **refuses**
such a coefficient rather than rounding it, because rank is the load-bearing report of Pass 5 and a
rounded `2π` would make rank a matter of tuning. Tier D needs either a symbolic matrix entry or a
documented rational rescaling of the unknowns; the choice is deferred to M4, where a record that
needs it exists.

---

**Loader invariants, enforced at startup and in a test:**

1. Every `role: "vanish"` piece appears in `vanishingLemmas` at least once; every `role: "reproduces"`
   piece has a coefficient row.
2. Every family has ≥1 `trap`. A family with no way to go wrong has not been thought about hard enough.
3. Every family has ≥2 `golden` entries, and **at least one fixture in which every bonus constant
   `bᵢ` is non-zero.** This rule was bought with a real bug: a sign error (`1/i = −i` dropped) in a
   log-family solve was invisible on the flagship fixture `R = 1/(1+x²)`, where the bonus term
   happens to vanish, and every numeric check passed. It surfaced only on `R = 1/(x²+4)`.
4. `rank(M) = m` for the family's own goldens — a family that cannot determine its own targets is
   either missing a `prerequisite` or mis-specified.

---

## 6. Kernel algorithms worth pinning now

### 6.1 Rational bounds on a square root

The one primitive that makes exact-ℚ certification work (PLAN.md §3.2). For `c ∈ ℚ, c ≥ 0`:

```
u₀ := (c + 1)/2                    ≥ √c   by AM–GM
u_{n+1} := (u_n + c/u_n)/2         ≥ √c,  and decreasing
ℓ_n := c / u_n                     ≤ √c
```

Every term is rational; three or four Newton steps give a bound tight enough for display. `sqrtUp(c,
steps)` and `sqrtDown(c, steps)` are the whole API, and the test is `ℓ² ≤ c ≤ u²` exactly in ℚ —
which is a complete correctness proof, checkable by the test suite rather than by a reader.

### 6.2 The ML bound for `f = P/Q` on `|z| = R`

```
num(R) := Σ_{k≤p} sqrtUp(|a_k|²)·R^k                     computed by interval Horner, rounded up
den(R) := sqrtDown(|b_q|²)·R^q − Σ_{k<q} sqrtUp(|b_k|²)·R^k        rounded down
require den(R) > 0                                        ⇐ R > 1 + max_{k<q}|b_k/b_q|  (Cauchy)
M(R) := num(R)/den(R)  ≥  max_{|z|=R}|f|
|∫_arc f dz| ≤ θ·R·M(R)
```

`den(R) > 0` does double duty: it certifies the bound *and* certifies that every pole lies strictly
inside `|z| = R`, which pass 2 needs anyway. The asymptotic statement comes from the degrees, not
from sampling: `M(R) ~ (|a_p|/|b_q|)R^{p−q}`, so the arc bound is `O(R^{p−q+1})` and vanishes iff
`q ≥ p + 2`. Compute powers by Horner, never by `Math.pow`.

### 6.3 Pole finding

`makeDurandKerner` is an iteration, not a root-finder. The app-local wrapper owns everything else:

```ts
findPolesOf(num: QiPoly | Cx[], den: QiPoly | Cx[]): Pole[]
// 1. cancel gcd(num, den) exactly when both are over ℚ(i)  → removable singularities named as such
// 2. squarefree-decompose den (Yun) → multiplicity structure known EXACTLY, not clustered
// 3. seed Durand–Kerner on each squarefree factor (Aberth-style initial circle)
// 4. Newton-polish each root
// 5. Smith inclusion disks → certified radii → the `≤` on each pole location
```

Note step 2: doing squarefree decomposition **first** means pole order is known exactly and we never
have to infer multiplicity from a cluster of nearly-coincident floating roots — which is the failure
mode `COINCIDENT_EPS2` honestly refuses to paper over in `@cas/core`. For non-rational integrands
the numeric path (AAA + clustering) applies and is labelled `≈`.

### 6.4 Certified rational enclosures of π

Raised while writing the tier-A/B records: *every* value in those tiers contains a `π`, so no
rendered decimal can carry a rigorous label without a certified enclosure of `π`. Two parts to the
answer.

First, policy already covers most of it: **the decimal rendering of an exact result is labelled `≈`
by design** (research 05's rigor policy). `π/√2` is `=`; `2.2214414…` is `≈`. So the common case
needs nothing.

Second, the cases that *do* need it — displaying a certified enclosure, and comparing an exact
result against a quadrature bound at the `≤` level — are cheap. A Machin-like formula with an
alternating-series remainder is rigorous in pure ℚ with no transcendental calls:

```
π/4 = 4·arctan(1/5) − arctan(1/239),    arctan(x) = Σ_{k≥0} (−1)^k x^{2k+1}/(2k+1)
```

Each series is alternating with strictly decreasing terms for `|x| < 1`, so truncating after `K`
terms bounds the error by the first omitted term — exactly, in ℚ. `piLo(K) ≤ π ≤ piHi(K)`, with the
test being `piLo < piHi` and a spot-check against a known high-precision digit string. The same
alternating-remainder trick covers `e`, and `√2` is already `sqrtUp`/`sqrtDown` from §6.1.

### 6.5 One predicate for L3 and L6

Jordan's inequality `sin ψ ≥ 2ψ/π` on `[0, π/2]` and the wedge lemma's `cos φ ≥ 1 − 2φ/π` on the
same interval are **the same inequality** under `φ = π/2 − ψ`. L3 and L6 should therefore share a
single dischargeable predicate rather than duplicating the argument, and the derivation panel should
say so — it is one of the few places where two apparently different contour tricks are visibly the
same trick. (Noticed while re-deriving the wedge lemma, which turned out to be stated incorrectly in
research 03 §0.3 and is now corrected there.)

### 6.6 The compiled evaluator

The single most consequential performance decision (research 04 §8). Two candidates to benchmark in
M0 before committing:

- **`new Function` body.** Emit `(re, im, out) => { … }` from the AST with SSA temporaries in local
  `let`s. Fastest in a warm JIT; costs a CSP consideration and defeats source-mapped debugging.
- **Flat register VM** over `Float64Array` SoA `re[]`/`im[]`. Marginally slower, but debuggable,
  CSP-clean, and trivially batchable over all quadrature nodes at once — which matters more than
  scalar speed once we are evaluating `10⁴` points per frame.

Both must beat the naive tree-walk allocating a `{re,im}` per node by the expected 10–50×, and the
benchmark is the deliverable, not the opinion.

---

## 7. Worker protocol

Everything expensive is asynchronous and its result is **provisional until it lands** — displayed
with the previous model's label, never with a borrowed one.

```ts
type JobKind = "aaa" | "certify" | "exactResidues" | "familySolve" | "sweep";
runJob(kind, payload, onProgress): Promise<Result>
```

Lifted wholesale from QD's pattern (research 08 §6.2): clone-safe IO, `(++steps & 63)` progress
throttling, terminate-on-supersede, permanent fallback to the sync path on an idle error, and the
`_xxxPlan` / `_xxxFinish` split so that the worker calls the *same* pure function the sync path
calls — which is what makes the results byte-identical and the differential tests meaningful.
AAA is debounced to ~10 Hz during drag and fired eagerly on `pointerup`; the main thread uses the
last good model for pole subtraction in the meantime.

**Differential tests must be outcome-pinned.** A bare worker-path-vs-sync-path comparison is
tautological when both call the same function; the test must pin the *outcome* against an
independently-computed fixture.

> **As built (M8 step 2.5): NONE OF THIS EXISTS, and it is not an oversight.** Measured — the word
> `Worker` does not appear anywhere in `src/`, and there is no `runJob`, no `JobKind` and no AAA.
> Every compute in the app is synchronous on the main thread, and it is fast enough because the
> two things this section was written to offload never arrived: **AAA rational approximation** was
> for pole-subtracted quadrature, and quadrature was demoted to a cross-check at M3 (the value
> comes from `2πi Σ n·Res`, a formula), so nothing needs a rational model of `f`; and the heavy
> exact solves are the ledger's, which run in milliseconds over ℚ(i) because the corpus's
> polynomials are small. What DOES cost visible time is a parameter drag, and that is answered by
> a **draft evaluation budget** keyed on `Session.scrubbing` and `Session.gesture` rather than by
> moving the work — a cheaper computation, not the same one somewhere else.
>
> The section stays because its two rules are still the ones a worker would have to follow if one
> is ever added — provisional results never borrow the previous model's label, and a differential
> test must pin the outcome — and because "there is no worker" is worth saying where a reader
> would otherwise go looking for one.

---

## 8. State, URL and undo

One store, one direction. `state.problem`, `state.contour`, `state.branch`, `state.view`,
`state.figure`, `state.ui`. Derived values (`ledger`, `poles`, `derivation`) are computed, never
stored — with memoisation keyed on the inputs that actually affect them, which is the only way the
"one hover, three highlights" rule stays cheap.

**URL.** `encodeViewState("ci", diffFromDefaults(state))` via `@cas/interchange` — reused as-is, no
package change. Serialise the **piece list**, never sampled points. Branch choice serialises as a
diff against a named convention, so the common case is `{c:"2pi"}`. Coordinates quantised to ~6
significant figures. QD's hygiene applies: rAF-coalesced `history.replaceState`, re-validate every
key on restore, and remember that navigating to a new `#vs=` is a **hashchange, not a reload**.

**Undo** is object-level over geometry and problem edits: one drag = one entry, committed on
`pointerup`, not per frame. The store keeps a bounded stack of inverse operations produced by
`contour/edit.ts`'s pure editing functions — which is why those functions are pure.

> **As built (M8 step 2.5).** The direction and the derived-values rule are as specified; the
> shapes are not, and four of the differences were measured rather than chosen.
>
> **The store is TWO objects, and the split is what the app is about.** `ShellState`
> (`shell/state.ts`) is *the argument* — mode, expression, declaration, branch, contour, record and
> fixture, bindings, geometry, view, contrast, scrub, stage mode — and `Session` (`shell/session.ts`)
> is *where the reader's hands are* — the gesture, a half-drawn pen path, what the arrow keys hold,
> hover, the rails' collapse, which disclosures are open, the undo and redo stacks, a transient
> notice. A permalink carries the first and none of the second, which is the rule that decides every
> new field: a restored state must not arrive claiming a link was copied or holding a modal open
> over what the reader came to see. Derived values (`resolution`, `poles`, the ledger, the
> derivation) are computed by one pure `resolveState` and never stored.
>
> **The URL is `encodeViewState("ci", …)` as specified, and the contour is NOT a piece list.**
> The piece list is already sample-free — `engine/contour/model.ts` has no sampled-point
> representation at all — but it is still the expensive form: measured at M7.2, a twelve-corner
> hand-drawn path costs **2,028** base64 characters as a piece list against **292** as the path's
> vertices with a per-piece kind tag, because ids, names, colours and every shared endpoint are
> derived. So the contour is carried as the RECIPE that produced it (`{template, params, shift}`),
> as the pen's vertices, or — in gallery mode — as **nothing at all**, because the record rebuilds
> it from `(record, fixture, bindings, geometry)` on every run. The recipe is rebuilt and compared
> against the live contour before a link is minted, and refuses rather than opening a different
> shape. Re-measured on the M8 shell **in a browser, against the built `dist`** (step 2.6): the
> cold start's link is **123** characters of fragment, the sandbox's **99**, and the longest of the
> front door's eight classics **139** (F2, the Fresnel wedge). Measuring `encodeShell` on a
> synthetic default state instead gives 84, and the difference is the **camera** — the app fits the
> contour on arrival, so the `view` a reader is actually looking at is never the default one. The
> app writes no fragment at all until the reader acts, so a cold start's address bar is bare and
> the Copy link button mints the link itself.
>
> **Two of this section's own rules were measured and NOT taken.** Quantising coordinates to ~6
> significant figures is worth **4.0 %** of the payload, because the bulk is structural (piece ids,
> roles, the `params` record) rather than decimal — so floats are carried whole and the saving was
> taken on the contour instead. And the branch choice is not diffed against a named convention: it
> is **omitted entirely** unless the state has branch points or is in shadow mode, and written in
> full when it is not, because a partial branch is the one thing a link must never restore (M5.1's
> shadowed-`branch` bug restored the same picture computing a different integral).
>
> **`history.replaceState` is coalesced on a 250 ms timer, not on rAF.** Keyboard pan/zoom and
> wheel zoom run outside any gesture and a wheel has no end event, so per-event writing is unsafe:
> `replaceState` is rate-limited by the browser and would silently stop. Every caller says only
> "this changed" and `syncHash` decides when to write.
>
> **Undo holds whole `ShellState`s, not inverse operations.** A `ShellState` is plain data and
> every commit already replaces it wholesale, so an entry is the object that was current a moment
> ago and restoring it is a commit; a diff would have to know which fields exist, which is the one
> thing about this state that keeps changing. `shell/undo.ts` is the question *was that an edit?* —
> a change key groups a drag's dozens of commits into one entry, a camera-only change is never an
> entry, and a commit that changed nothing is not one either. The stacks are session-local and an
> arriving link clears both.

---

## 9. Test corpus format

```
test/
  golden/
    gallery.json          the 28 entries: params, exact value, numeric, verifiedTo
    invariants.json       the cross-family identities (§10 below)
    refusals.json         inputs that must produce NO value, with the expected reason
  ledger/                 per-pass unit tests
  parity/                 CPU ↔ GLSL twins, feeding DUAL_BACKEND_CORPUS
```

Four test classes, all of which must be shown to fail against broken code:

1. **Value** — exact closed form vs. the fixture, and exact vs. numeric quadrature within the
   estimator's own bound.
2. **Label** — the verdict level, independently of the value. A numeric-only discharge must cap the
   result at `≈`.
3. **Refusal** — the app emits *no value*: pole on the contour, `deg Q = deg P + 1`, double pole on
   the axis, `|a| = 1`, `argRange = (−π,π]` on a keyhole.
4. **Invariant** — the free cross-family identities, which catch errors no single-family test can:
   §5.1 ≡ §6 under `x = log t`; §5.1 ≡ §7 under `u = xⁿ`; §2's degree condition ≡ `Res(f,∞) = 0`;
   and closing up vs. closing down must agree.

---

## 10. Deliberately unspecified

Listed so that their absence reads as a decision rather than an oversight.

- **The visual design of the Stage** beyond the colour rules in PLAN.md §5.3 — this wants sketching,
  not specifying, and the piece-list widget in particular has no prior art to copy.
- **The exact-sign winding predicate for circular arcs** (PLAN.md §4.4). Segments are settled;
  arcs need either exact circle–line crossing in ℚ or a certified polygonisation, and the choice
  should be made against a real implementation in M1, not on paper.
- **The `RootSum` LaTeX rendering.** The requirement is fixed — it must display its half-plane
  predicate rather than hide it — but the typography is a design question.
- **Whether `@cas/core/series` gets unified.** Build app-local in M2; revisit with both consumers'
  tests in hand, as the file's own header instructs.
- **The teaching layer's progress model.** Designed to be persistable (PLAN.md §12, round 4), but
  the schema waits until the faded drill exists and its stages have stopped moving.
