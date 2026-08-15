# Argument Principle Tool — Construction & Implementation Plan

> **Status:** **PLANNED — not yet scaffolded.** This is the runbook for the suite's **sixth** app,
> `apps/argument-principle`: an educational visualizer for the argument principle
> (winding number of `f(γ)` about `0` **=** zeros − poles of `f` enclosed by `γ`). The topology decision
> — a **separate app**, not a mode inside the plotter — is recorded in
> [ADR-0019](../DECISIONS.md#adr-0019-argument-principle-as-a-separate-app). Scope is **parity with the
> reference applet** (`andrewgraven.com/mathvisualizations/ArgumentPrinciple/argument_principle.html`),
> plus suite hand-off and honest labeling; a small set of enhancements (traversal animation, phase-tint
> background) are tracked but not parity-blocking.
>
> This document is the _how_. It mirrors the suite's proven runbook style
> ([`../MIGRATION.md`](../MIGRATION.md), [`complex-function-plotter-plan.md`](complex-function-plotter-plan.md)):
> **phase gates that are each shippable, a motivating win early, a ground-truth (GT) validation per phase,
> and test-guarded shared-package changes.** Nothing here re-litigates a locked ADR; where a new decision is
> needed it is flagged as an ADR to write. Suite guardrails: [`../../CLAUDE.md`](../../CLAUDE.md) →
> [`../ARCHITECTURE.md`](../ARCHITECTURE.md) / [`../DECISIONS.md`](../DECISIONS.md) / [`../VISION.md`](../VISION.md).

---

## 0. Why this is the cheap one

The suite's north star (VISION §1) is that **each new tool builds fewer primitives from scratch than the
last**. [VISION §6 and §7](../VISION.md) name the _argument-principle applet_ **explicitly** as a
"fourth-category" tool to fold in _opportunistically, once the packages it would reuse already exist_. They
now all exist — and one of them already contains a working prototype of this tool's numerical core.

Almost everything this tool needs is a call into a shipped package:

- **Parse + evaluate `f(z)` on the CPU** → `@cas/expr`: `parse(src)` → `makeComplexFn(ast)` returns
  `(z, c) => [re, im]`. The grammar already covers `z i pi e sin cos tan exp log sqrt ^ /` **and**
  `conjugate`, hyperbolics, `gamma`, `zeta`.
- **`f'(z)`** for critical points and the `f'/f` integrand → `@cas/expr`'s **symbolic**
  `differentiate(ast, "z")`, with a central-finite-difference fallback for non-holomorphic input
  (`conjugate`, `abs`, …) — the `apps/riemann-map/src/map.ts` pattern.
- **Exact zeros/poles of a rational `f`** → `@cas/expr`'s `fToRational(ast)` gives `{num, den}` coefficient
  arrays; `@cas/core`'s `makeDurandKerner(tupleAlgebra)` roots the numerator (zeros) and denominator (poles).
  Reference pipeline: `apps/complex-dynamics/src/render/critical.ts`.
- **Share-links** → `@cas/interchange` (`encode/decodeViewState`); **reproducible PNG** → `@cas/export`
  (`injectPngText`).

**The prototype already ships.** `apps/complex-function-plotter/src/analysis/singularities.ts` already does
grid candidate search → Newton refine (via the symbolic `f'`) → **winding-number classification** of zeros
and poles — the plotter's "argument principle" analysis instrument (ADR-0010, Phase 2). That makes the
plotter the natural **first consumer** of a winding primitive and this tool the **second** — a textbook
[ADR-0007](../DECISIONS.md#adr-0007-incremental-extraction-driven-by-real-need) extraction, sequenced late
(§4).

The **only genuinely new code** is the pedagogical instrument: the dual `z`/`w` canvas, a
draggable/drawable contour, the winding of the _image_ curve about the origin, and point-in-contour counting
that ties the picture to the theorem.

> **⚠ Verify against the reference.** This plan was built from the **live URL** (the local attachment path
> was a Windows `Downloads\` path, unreachable in the build environment). The page's rendered text confirmed
> the controls, the eight presets, the dual view, the four readouts, and that the mathematics is "the contour
> integral of `f'/f`." Three behaviors could **not** be read from the page's JavaScript and are treated as
> **enhancements** (Phase 3) so parity does not hinge on them — confirm each with Andrew: (1) an **animated
> point** traversing `γ ↔ f(γ)`; (2) the image curve **rainbow-colored by parameter `t`**; (3) **phase-shaded
> (domain-colored) backgrounds** vs plain/grid.

---

## 1. Feature parity catalog

Left column = a feature of the reference applet. **Source:** `pkg` = provided by a shipped `@cas/*` package;
`app` = small new app-local code (the suite's thin-app shape); `new` = the tool's genuinely novel instrument.

| # | Reference feature | How we build it | Source |
|---|---|---|---|
| C1 | Preset `f(z)` dropdown (8: `z²/(z²+1)`, `z³−1`, `sin(z)/z`, `exp(z)−1`, `z+1/z`, `(z−1)²(z+i)`, `tan(z)`, `z(z+1)/(z−1)`) | A `presets.ts` list of `{label, expr}`, mirroring `riemann-map/src/presets.ts` | `app` |
| C2 | Custom expression input (`z, i, pi, sin, cos, tan, exp, log, sqrt, ^`) | `parse(src)` → `makeComplexFn(ast)`; grammar already covers all of these + more | `pkg` `@cas/expr` |
| C3 | Typeset equation preview | KaTeX render + inline parse-error markers | `app` (`katex`) |
| C4 | `f'(z)` | `differentiate(ast, "z")` symbolic; `try/catch` → central finite-difference fallback | `pkg` `@cas/expr` |
| V1 | Dual view: Domain (`z`-plane) + Image (`w = f(z)`-plane) | Two 2D canvases in an `Overlay2D`-style wrapper (the `riemann-map/main.ts` left/right-pane shape) | `app` |
| V2 | Default circular contour radius `r` following the cursor | Sample `γ(t) = center + r·e^{it}`; recompute `f(γ)` on pointer move (rAF-coalesced dirty flags) | `app` |
| V3 | Freehand custom contour (left-drag to draw a closed curve) | Capture the pointer polyline, auto-close; "Clear drawn curve" reverts to the cursor circle | `app` |
| V4 | Right-drag pan · scroll zoom · "Reset views" | `attachPanZoom(canvas, …)` — the `render/nav.ts` pattern already in riemann-map / plotter | `app` |
| M1 | ✕ Zeros of `f` & ✕ Poles of `f` inside `γ` | **Rational:** `fToRational` → `makeDurandKerner` on num/den (**`=` exact**). **Transcendental:** grid + Newton + winding classify (lift `singularities.ts`, **`≈`**) | `pkg` `@cas/core` `@cas/expr` + `new` |
| M2 | ◆ Zeros of `f'` (critical points) | `differentiate` once more, then the same finder on `f'` | `pkg` `@cas/expr` `@cas/core` |
| M3 | Winding number of `f(γ)` about the origin | Accumulate the unwrapped `Δarg` of the sampled image curve, `round(Σ / 2π)` — lift the `winding()` loop, generalized from a circle to **any** contour | `new` |
| M4 | Readouts: Zeros inside · Poles inside · **Zeros − Poles** · Winding number | Count located roots inside `γ` (point-in-region: `\|z−c\| < r` for the circle; ray-cast for the polygon); display all four and **show the equality** | `new` |
| U1 | Radius slider `r` · Resolution slider (`res`, root/pole search) | `r` = default-circle radius; `res` = contour sample count + finder grid density | `app` |
| U2 | Toggle checkboxes: "Domain curve" / "Image curve" | Render-layer flags in the controls factory (dumb view emitting events; `main.ts` owns state) | `app` |
| I1 | Share / permalink | `encodeViewState("ap", state)` ↔ `decodeViewState`; own `#vs=` namespace `"ap"` | `pkg` `@cas/interchange` |
| I2 | _New:_ Import `f(z)` handed off from the plotter or Complex Dynamics | Decode a `#s=` deep link → `mapSpecToExpr` → compile. Mirror `complex-function-plotter/src/interchange/importMap.ts` | `pkg` `@cas/interchange` |
| I3 | _New:_ Reproducible PNG export (recipe embedded) | `injectPngText` splices the permalink into the PNG `tEXt` | `pkg` `@cas/export` |

**Enhancements (Phase 3, not parity-blocking):** E1 animated point traversing `γ ↔ f(γ)` with a live
argument accumulator (play/pause/speed); E2 image curve colored by parameter `t`; E3 a light CPU phase-tint
background (stays pure-2D — a full GPU domain-coloring pipeline is the plotter's job, not this tool's); E4 a
"Send to Argument Principle" producer link from the plotter / CD.

---

## 2. Architecture & reuse

It follows the suite topology ([CLAUDE.md decision #8](../../CLAUDE.md): separate apps + a launcher, no
unified shell) and the dependency rule (apps import packages downward; no app imports another app). It is
**pure-2D** like `apps/riemann-map` — **no `@cas/gpu`**, so it stays out of the WebGL `browser` CI job
entirely.

**Packages consumed:** `@cas/expr`, `@cas/core`, `@cas/interchange`, `@cas/export` (+ `katex`).
**Deliberately not needed:** `@cas/gpu`, `@cas/conformal`, `@cas/schwarz`, `@cas/dynamics` — GPU / conformal /
dynamics work this tool doesn't do. Keeping the dependency set minimal is the point.

### What stays at the app edge (ADR-0006)

Core packages are convention-neutral and hold **no `π` / `2πi` constants**. The winding _number_ is an
integer (convention-free), but the argument-principle _framing_ — the `1/(2πi)` contour-integral
normalization, the enclosure/escape predicate, and any future phase→hue shading — lives in the app, tagged in
the view-state's `conventions` field like every other app. This is the guardrail
([ADR-0006](../DECISIONS.md#adr-0006-convention-neutral-core), [RISKS §2](../RISKS.md)) that prevents a
silent factor-of-`π` error leaking between tools.

### The finder is two-strategy — and both already exist in-repo

**Rational `f` (exact, `=`):** `fToRational(ast)` returns `{num, den}` coefficient arrays (or `null`); root
the **numerator** → zeros, the **denominator** → poles, via `makeDurandKerner(tupleAlgebra)` with a geometric
seed spiral, filtered by residual; count those inside `γ`. `N − P` is exact. _Reference:_
`complex-dynamics/src/render/critical.ts` (`findRationalCriticalPoints`).

**Transcendental `f` (estimate, `≈`):** `fToRational` returns `null` → fall back. Grid-sample `|f|`; minima =
zero candidates, maxima = pole candidates (scale-invariant gating against the field median); Newton-refine via
the symbolic `f'`; classify by local winding (`+k` / `−k`). Only zeros/poles **inside the view** are found.
_Reference:_ `complex-function-plotter/src/analysis/singularities.ts` (`findSingularities`).

One `findSingularities(f, f', view)` facade picks the branch — exactly as the plotter's module already
unifies them. **Note the two complex representations:** `@cas/expr` is a `[re, im]` **tuple**; `@cas/core` is
a `{re, im}` **object** (`Cx`). Bridge with `@cas/core`'s `tupleAlgebra` when feeding the root finder — the
pattern Complex Dynamics and Correspondences already use.

---

## 3. Suite interoperability

The suite's second pillar is hand-off. Both the plotter and Complex Dynamics already **emit** an `f(z)` as an
`@cas/interchange` envelope (`form:"expr"` / `"view"`), and the plotter's `mapSpecToExpr` already turns any
`rational` / `laurent` / `expr` `MapSpec` into an `@cas/expr` source string. So "study this function's zeros
and poles" is a one-import path:

- **Consumer (this tool).** On load, check `window.location.hash` for a `#s=` link → `decodeLink` /
  `importEnvelopeText` → `mapSpecToExpr` → compile and count. Mirror
  `complex-function-plotter/src/interchange/importMap.ts`. (The app-dependency rule forbids importing the
  producer app; the wire types are the shared contract.)
- **Producer (siblings, optional — E4).** A "Send to Argument Principle" link from the plotter / CD, mirroring
  their `exportView.ts` `cdHandoffUrl` pattern. Additive, in each of their codebases.

_Caveat:_ an interchange `expr` map carries the function (and optional viewport) but **not** live
family-parameter values — for a pure `f(z)` winding tool that is exactly right; the tool's own `#vs=` link is
what round-trips its full state.

---

## 4. The extraction opportunity (ADR-0007 second consumer)

The suite extracts a shared package the moment a **second consumer** needs it — never speculatively. The
plotter's `singularities.ts` (winding classifier + grid/Newton finder) is a lone-consumer today; this tool is
the second consumer of exactly that machinery. That is the recorded trigger for extraction — but **timed**,
per the guardrail against over-reach:

1. **Build it in-app first** (Phases 1–3). Lift `winding()` and the finder into the new app (generalizing
   winding from a small circle to an arbitrary contour). Prove the tool works.
2. **Then extract, if it earns it** (Phase 4). Once both apps clearly share the primitive, move it into a
   small package (candidate `@cas/winding`, or fold into an existing package) and refactor the plotter to
   consume it — **tests green before and after** — recorded as **ADR-0020**, the way `@cas/dynamics` and
   `@cas/export` were.

**Convention-safety of the extracted piece:** a shared `windingNumber(samples)` and `findSingularities(f, f',
view)` are convention-neutral (integers and positions, no `2πi`) — safe to share; the argument-principle
interpretation stays in each app. That keeps the extraction on the right side of ADR-0006.

---

## 5. ADRs

- **[ADR-0019](../DECISIONS.md#adr-0019-argument-principle-as-a-separate-app) — Argument Principle as a
  separate app.** _Written._ The direct sequel to ADR-0010 (plotter) and ADR-0013 (Riemann map): a feature
  that would _share_ a host app's engine belongs inside it as a view; one that brings a distinct product
  surface is its own app. The plotter's argument-principle readout is a small analysis instrument beside its
  domain-coloring headline; this is a dedicated _educational dual-view_ product with its own contour
  interaction. Separate app.
- **ADR-0020 — Extract the winding / singularity primitive.** _To write at Phase 4_, only if the
  second-consumer rule confirms it, with the plotter refactored to consume it.
- **Interchange note** — no schema change: this tool consumes the existing `expr` / `view` envelopes. If the
  E4 producer link is added, record it as a minor, additive provenance detail.

---

## 6. Phased build (each phase a shippable gate)

Mirrors the suite's phase-gate discipline: never a broken state; every phase ends green on
`lint → typecheck → test → build`, with a **ground-truth (GT)** validation.

### Phase 0 — Genesis: the empty, tested, deployable shell

Copy [ADR-0013](../DECISIONS.md#adr-0013-the-riemann-map-tool-is-a-new-app-not-a-mode-in-an-existing-one)'s
P0 exactly — scaffold that builds and deploys before it does anything.

- Scaffold `apps/argument-principle` from the `riemann-map` template (Vite/TS, `base:"./"`, node test
  project, per-app eslint, `index.html` SPA shell).
- The single serializable `#vs=` view-state over `@cas/interchange` (namespace `"ap"`, structural guard,
  `conventions` tag).
- A node parity-seed / smoke test (compile a preset, evaluate a point).
- Register everywhere (§7); add a launcher **"Coming soon"** card.
- **Gate / GT:** local `lint · typecheck · test · build` all green; the shell deploys as a blank, valid app.

### Phase 1 — Live winding: the dual view without root-finding yet

The theorem's right-hand side, visualized: the image curve winding about `0`.

- Expression input + KaTeX preview + parse-error markers; the preset dropdown.
- Dual `z`/`w` canvases; pan/zoom/reset per pane.
- Default circular contour `γ` following the cursor; radius slider.
- Sample `f(γ)`; draw the image curve (colored by `t` to show direction); live **winding-number** readout
  (`≈`).
- Share-link round-trips the full view.
- **Gate / GT:** the winding readout matches by-hand values on `z`, `1/z`, `z²` across several contours;
  deploys.

### Phase 2 — The zeros/poles instrument: the theorem made whole

Left-hand side (`N − P`) meets right-hand side (winding); the equality is the product.

- Two-strategy finder: `fToRational` → Durand–Kerner (exact) with grid+Newton+winding fallback
  (transcendental).
- Mark ✕ zeros, ✕ poles, ◆ critical points (`f'` roots) in the `z`-plane.
- Point-in-contour counting → the four readouts: Zeros inside · Poles inside · **Zeros − Poles** · Winding,
  with honest `=` / `≈` labels.
- Freehand custom contour + "Clear drawn curve"; resolution slider; domain/image toggles.
- **Gate / GT:** for all 8 presets, `N − P` equals the winding number; golden-value tests pin both sides;
  deploys.

### Phase 3 — Hand-off, export & pedagogy

Suite interop + the polish that makes it teach.

- Import an `f(z)` from the plotter / CD via `#s=` (`mapSpecToExpr`).
- Reproducible PNG export (`@cas/export`); glossary / help.
- **E1 (enhancement):** an animated point traversing `γ ↔ f(γ)` (play/pause/speed) showing the `z ↔ w`
  correspondence and accumulating the argument live.
- **E3/E4 (optional, need a call):** a light CPU phase-tint background; "Send to Argument Principle" links
  from siblings.
- **Gate / GT:** a cross-app golden pins a plotter/CD → argument-principle hand-off; deploys.

### Phase 4 — Extract (if earned) & publish

- Evaluate the winding/singularity primitive against the second-consumer rule; if earned, extract to a small
  package and refactor the plotter to consume it (tests green before & after) — **ADR-0020**.
- Flip the launcher "Coming soon" card to a link; add the one `cp` line to `deploy-pages.yml`.
- **Gate / GT:** published under `/argument-principle/` in the combined Pages site; north-star confirmed —
  fewer new primitives than any prior tool.

---

## 7. Scaffold & wiring

### Files to create

```
apps/argument-principle/
├─ package.json            # name "argument-principle"; deps @cas/{core,expr,interchange,export} + katex
├─ index.html              # SPA shell, <div id="app">, <script type=module src=/src/main.ts>
├─ vite.config.ts          # base:"./", server.port 5177 (free), test:{ environment:"node" }
├─ tsconfig.json           # extends ../../tsconfig.base.json
├─ eslint.config.js        # copy riemann-map's verbatim
├─ src/
│   ├─ main.ts             # immutable state + dirty-flag rAF loop; owns two Overlay2D canvases
│   ├─ presets.ts          # the 8 reference presets
│   ├─ viewState.ts        # APP_NS="ap"; encode/decodeViewState; structural guard
│   ├─ contour.ts          # NEW: circle + freehand γ, sampling, point-in-contour
│   ├─ winding.ts          # NEW: unwrapped-Δarg winding of a sampled curve
│   ├─ singularities.ts    # NEW: rational(exact)/transcendental(grid) finder facade
│   ├─ ui/controls.ts      # dumb view: emits events, holds no state
│   ├─ render/nav.ts       # attachPanZoom (pattern from riemann-map)
│   └─ interchange/importMap.ts   # Phase 3: #s= f(z) hand-off (mirror plotter)
└─ test/                   # winding.test.ts, singularities.test.ts, viewState.test.ts, smoke.test.ts
```

### Registration edits (five explicit lists — the rest auto-discovers)

1. `vitest.workspace.ts` — add `"./apps/argument-principle/vite.config.ts"`.
2. `scripts/assert-test-census.mjs` — add `{ name: 'argument-principle', match: '/apps/argument-principle/', floor: 1 }`.
3. `eslint.config.js` (root) — add `"argument-principle"` to `APP_NAMES` (the cross-app-import boundary).
4. `apps/launcher/index.html` — add a card ("Coming soon" `<div>` now → `<a href="argument-principle/">` at publish).
5. `.github/workflows/deploy-pages.yml` — at publish, add `cp -r apps/argument-principle/dist _site/argument-principle`.

**Auto-covered (no edit):** `pnpm-workspace.yaml` (`apps/*` glob), root build/lint/typecheck
(`--filter "./apps/*"`), `.dependency-cruiser.cjs` (path-glob rules), and the `browser` CI job (a pure-2D app
has no GLSL, so it is correctly absent from `test:browser`). `scripts/check-built-artifacts.mjs` scans only
worker-bearing apps — a no-worker app needs no change.

---

## 8. Testing & honest labeling

- **Golden-value corpus.** For each preset, pin the located zeros/poles, the four counts, and the winding
  number across a couple of contours — so a change to the finder or the winding accumulator is caught. Runs
  headless under node (no WebGL) in the single Vitest workspace.
- **The equality is a test.** Assert `windingNumber(f(γ)) === zerosInside − polesInside` for every
  preset/contour pair — both the app's thesis and its regression guard.
- **Honest labeling** (a suite guardrail, VISION §4.7): `=` for the exact rational `N − P` (root counting);
  `≈` for the numerically-estimated winding integer and for all transcendental counts (finite-view;
  ill-conditioned near a contour that grazes a singularity). The UI shows the label; the pedagogy is precisely
  that the `≈` winding rounds to the `=` count.

---

## 9. Risks & non-goals

**Risks**

- **Contour grazing a singularity** — a circle through a zero/pole makes the winding integral blow up; detect
  near-singular samples and label the readout unreliable (the prototype already guards this).
- **Transcendental root discovery is incomplete by nature** — `sin`, `tan`, `exp−1` have infinitely many
  zeros/poles; we find only those in view, at the resolution set. Matches the reference's `res` slider,
  labeled `≈`.
- **Non-holomorphic input** (`conjugate(z)`) has no symbolic derivative and no argument principle; detect via
  `differentiate` throwing, then finite-difference or disable the instrument with an honest message.
- **Two complex types** (`[re,im]` vs `{re,im}`) — bridge with `tupleAlgebra` at the Durand–Kerner boundary;
  unit-test the seam.

**Non-goals**

- No GPU / domain-coloring pipeline by default (stays pure-2D; a phase tint is an optional CPU enhancement,
  not a `@cas/gpu` pull).
- No certification — winding counts near ill-conditioned configs are estimates, never proofs (suite policy).
- No new interchange schema — consume existing `expr` / `view` envelopes.
- No merge into the plotter — share via a package (if extracted) or a data contract, never a cross-app import.

---

## 10. Open confirmations

The topology decision is **made** (separate app — ADR-0019). Remaining items to confirm with Andrew, none
parity-blocking:

- **App name / directory:** "Argument Principle" at `apps/argument-principle` (matches the suite's plain
  naming). _Assumed._
- **Extraction timing:** build in-app, extract at Phase 4 on the second-consumer rule (ADR-0007). _Assumed._
- **Reference behaviors (⚠ §0):** does the reference applet animate a traversal point (E1)? color the image
  curve by `t` (E2)? phase-shade backgrounds (E3)? If the animation exists in the reference, promote E1 from a
  Phase-3 enhancement to Phase-1 core.

---

## Build progress (living record)

> Updated as phases land, so a resumed session knows exactly where to pick up. Work lands as small, CI-green
> commits on branch `claude/argument-principle-viz-tool-7yzwc2`. The new app is recorded in
> [ADR-0019](../DECISIONS.md#adr-0019-argument-principle-as-a-separate-app).

| Phase | Status | Commits | Coverage |
| --- | --- | --- | --- |
| Plan + ADR-0019 | ✅ done | `cfcf809` | design doc + separate-app ADR |
| 0 — Genesis (shell, `#vs=`, registration, launcher card) | ✅ done | `38d55db` | scaffold + walking skeleton: dual z/w panes, default contour + its image f(γ), live winding readout; `#vs=` codec (ns `"ap"`); the `winding.ts` + `contour.ts` primitives seeded and unit-tested; 5 test files (29 tests); 4 registration edits + launcher "Coming soon" card. `lint`/`typecheck`/`test`/`build` green. GT: `z³−1` winds 3× over a radius-1.5 γ (pinned in `winding.test.ts`) |
| 1 — Live winding (interactivity) | ✅ done | `39b4ac6` | C3 (KaTeX preview via `@cas/expr/latex`), V2 (cursor-follows γ), V4 (per-pane right/drag-pan + wheel-zoom + Reset/Fit), U1 (radius slider); coord authority in `plane.ts` (pan/zoom invert the draw map exactly), `nav.ts` wiring, coalesced rAF render + debounced `#vs=` persist; +`nav.test.ts` (34 tests total). GT: real-browser boot clean (Chromium) — default winding 3, KaTeX renders, hover moves γ + recomputes; `lint`/`typecheck`/`test`/`build` green |
| 2 — Zeros/poles instrument (the four readouts) | ✅ done | `794859a` `a7e9498` | **2a** `singularities.ts`: rational (exact, `fToRational`→Durand–Kerner, `=`) + transcendental (grid+Newton+winding, `≈`) finder; ✕/◆ markers + order badges; the four readouts (Zeros·Poles·N−P·Winding) counted inside γ with honest `=`/`≈` + agreement status. **2b** freehand contour (left-drag, auto-oriented CCW so winding = N−P), Clear, resolution slider, domain/image toggles. GT (`singularities.test.ts`): `N−P = winding` on all 8 presets **and** for a drawn polygon; +`contour`/`orientCCW` tests (54 total). Real-browser verified (Chromium): default 3/0/3/3 "✓", freehand draw holds the theorem |
| 3 — Hand-off, export & pedagogy | ✅ done | `607f2aa` `c7fa962` + _this commit_ | **3a** I2 — `#s=` import (`interchange/importMap.ts` ported from the plotter) + boot banner; GT `importMap.test.ts`: consumes the real CD Böttcher golden (`(1)*z + (0.5)/z^2`, ψ(2)=2.125) + a `view` round-trip. **3b** E1 — animated γ traversal: a point marks γ↔f(γ) with an arg-vector, and an accumulator sweeps the argument to the winding number (`contourPointAt` + `partialWindingTurns`, unit-tested). **3c** I3 — Save PNG with the `#vs=` permalink embedded as `tEXt` (`@cas/export`) + a help panel. 59 tests. Real-browser verified each (import banner, live traversal, PNG metadata, help open/close). E3 (phase tint) / E4 (producer "send-to") deferred as optional |
| 4 — Extract (if earned) & publish | ◻ next | — | ADR-0020 candidate; launcher flip + deploy `cp` |
