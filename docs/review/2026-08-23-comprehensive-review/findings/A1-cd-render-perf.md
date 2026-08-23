# A1 CD-RENDER — Complex Dynamics render / perf-rewrite findings

Scope: the Complex-Dynamics WebGL render pipeline with heaviest scrutiny on the Aug-22 perf
rewrite (PR #294 = merge `c40352e`; commits `0527fe5` "P1 batch — sqrt-free hot loop +
appearance-slider drafting" and `0453f52` "Fix L — two-pass recolour"). Files read in depth:
`apps/complex-dynamics/src/render/{glPlot.ts,shaderBuilder.ts}`, the render-relevant slices of
`src/main.ts`, `packages/expr/src/glsl.ts`, `packages/gpu/src/glsl/complex{Single,Df64}.glsl.ts`,
`test/{glslCodegen,recolorParity.browser}.test.ts`, and the design note
`docs/perf/cd-render-review.md`. Cross-referenced the prior review's `05-complex-dynamics-dynamics.md`
and `08-render-group.md`.

**Headline: the rewrite is correct and well-built.** The sqrt-free escape peephole is
mathematically sound (`a,k ≥ 0 ⇒ a op k ⟺ a² op k²`, and it correctly declines when the
threshold is not a non-negative compile-time constant); the two-pass recolour reproduces the
fused shader byte-for-byte for every covered mode (verified line-by-line against `colorAt`, not
just the one case the parity test pins); the prior σ 512→4096 GPU-cap finding is fixed and intact;
and every `scheduleRender(false)` caller is genuinely appearance-only (or re-gated by
`canRecolor()`), so no geometry-affecting change slips onto the recolour fast path. **No CRITICAL
or HIGH issue.** The findings are one MEDIUM perf regression, three LOW items, and two NITs.

---

### [MEDIUM] `fieldAt` field pre-pass drops the periodicity bailout that `colorAt` uses — first-recolour field build has no interior early-out (perf regression on interior-heavy / high-iteration views; latent parity edge)
- **Area:** apps/complex-dynamics (render Fix L) · **Location:** `src/render/shaderBuilder.ts:966-985` (`fieldAt`, loop `:971`, NO `periodStep`) vs `colorAt` `:816-833` (`periodInit`/`periodStep` from `:641,:644`); build path `src/render/glPlot.ts:2031-2046` (`ensureField`); iteration ceiling `glPlot.ts:299` (`AUTO_ITER_MAX = 20000`)
- **Type:** perf (+ subtle numerical)
- **Confidence:** high (perf); low (the parity edge actually firing)
- **Fix-safety:** needs-review
- **Evidence:** `colorAt`'s escape loop carries the periodicity bailout for exactly the recolour
  modes — `bool pPeriod = (uMode == 0 || uMode == 1 || uMode == 5 || ... || uMode == 9)` and, per
  interior iteration, `if (dot(pd,pd) < 1e-12*max(1,dot(z,z))) { kmax = uN; break; }` (interior
  points settle onto their attracting cycle and bail out early, typically after tens–hundreds of
  iterations). The new `fieldAt` — which builds the cached escape field the recolour path samples —
  has a *bare* loop with no such early-out: `for (int k = 0; k < uN; k++) { if (escapeFn(z,cc))
  break; z = fFn(z,cc); kmax = k+1; }`. So every interior pixel iterates to the full cap `uN`
  (auto-iterations clamps to 20000).
- **Why it matters:** two facets of one omission.
  1. *Perf.* Before Fix L, an appearance change re-rendered through `colorAt` (with the early-out).
     After Fix L, the **first** appearance change on a content lazily builds the field through
     `fieldAt` (no early-out). For an interior-dominated view at a high cap (e.g. zoomed inside the
     main cardioid / a large Julia interior at auto-iter 20000, ×~13 in df64), that first build
     iterates ~40–200× more per interior pixel than the fused render it replaces — a multi-hundred-ms
     to multi-second stall where there was none, and at the extreme a plausible GPU-watchdog
     context-loss that `colorAt`'s early-out would have avoided. The field is then reused, so a
     *sweep* is still a net win; but a **single** appearance toggle on such a view is now slower than
     before. (Note mode-6's CDF pre-pass already lacks periodicity, so histogram views paid this
     already; Fix L newly extends the cost to smooth/escape/decomposition.)
  2. *Parity.* The "byte-identical to the fused render" guarantee now rests on the periodicity check
     never firing on an orbit that `fieldAt` would find *escaping*: if it ever false-positives
     (orbit returns within 1e-6·|z| of a reference yet later escapes), `colorAt` paints that pixel
     interior/black while the recolour paints it its escaped colour — a visible disagreement. This is
     the same invariant the fused path already assumes, so risk is low, but Fix L makes the two paths'
     agreement *depend* on it rather than share the loop.
- **Recommendation:** mirror `periodInit`/`periodStep` into `fieldAt` so the two loops are identical
  — this restores the interior early-out (removes the perf regression) *and* makes the paths share
  the exact escape logic (closes the parity edge by construction). Then extend the parity test to an
  interior-heavy view to pin it.

### [LOW] Two-pass recolour aborts temporal-AA accumulation — appearance change reverts an accumulated image to a single sample until the next content change
- **Area:** apps/complex-dynamics (render Fix L) · **Location:** `src/render/glPlot.ts:2122-2134` (recolour branch checked BEFORE, and returning ahead of, the accumulate branch `:2139-2147`); `renderRecolor` `:2085-2107` draws one sample and does not `requestFrame`
- **Type:** bug (visual-quality regression, conditional) · **Confidence:** medium · **Fix-safety:** needs-review
- **Evidence:** when temporal AA is on (`_accumulate`, off by default, toggle at `:2599`), idle
  frames jitter-accumulate a running average (`accumulateFrame` `:2195-2227`, `requestFrame` at
  `:2227`). The recolour fast path is deliberately checked first and returns without re-scheduling.
  So an appearance change while accumulation is settled/settling replaces the anti-aliased average
  with a single-sample recolour and does **not** resume accumulation (the design note confirms
  "Accumulation resumes on the next content change").
- **Why it matters:** with temporal AA enabled, touching palette/rotation/outline/etc. makes the
  image visibly *more* aliased and it stays that way until a pan/zoom/param edit. The recolour is a
  correct single-sample image (matches a single-sample fused render), so this is quality, not
  wrong-pixels; and it self-heals on the next content change.
- **Recommendation:** after a recolour, if `_accumulate`, reset `accumCount` and `requestFrame` so
  accumulation restarts from the recoloured base (the field is already cached, so re-accumulation
  re-iterates only the jittered samples — unavoidable for temporal AA). Or document the trade-off in
  `renderRecolor`.

### [LOW] Recolour reuses the stale-coloured pan "collar" — a pan right after an appearance change briefly shows old-palette pixels at the newly-exposed edges
- **Area:** apps/complex-dynamics (render Fix L) · **Location:** `src/render/glPlot.ts:2104-2106` (`renderRecolor` refreshes `captureLastFrame` but by comment intentionally does NOT rebuild the collar)
- **Type:** bug (transient visual seam) · **Confidence:** medium · **Fix-safety:** needs-review
- **Evidence:** `renderRecolor` re-captures the warp source from the recoloured frame but leaves the
  overscan "collar" as the last *content* render built it — reasoning "the view is unchanged, so the
  one the last content render built still fits." Geometrically it fits, but its **colours** are the
  pre-appearance-change palette.
- **Why it matters:** immediately after an appearance change, a pan warps the fresh centre (new
  colours) but fills newly-exposed border strips from the stale-coloured collar until the drag
  settles to a full render — a one-frame colour seam at the edges. Minor and self-correcting.
- **Recommendation:** either invalidate/regenerate the collar on recolour, or accept it and note the
  seam is bounded to the first drafted pan frame. Low priority.

### [LOW] `recolorParity.browser.test.ts` covers only smooth mode / single precision / param plane / no overlays — the byte-identical claim for the other covered cases is unpinned
- **Area:** apps/complex-dynamics · **Location:** `test/recolorParity.browser.test.ts:26-62`
- **Type:** test-gap · **Confidence:** high · **Fix-safety:** needs-review
- **Evidence:** both cases use `dynPresets.mandelbrot` (param plane, `uFractType==1`), default mode
  (smooth = 1), single precision, no outline/equipotential/histogram/decomposition. The recolour
  path also claims byte-identity for **escape (0)**, **histogram (5)**, **binary decomposition (9)**,
  the **outline / equipotential** overlays, **df64** deep zoom, and the **dynamical plane**
  (`fieldAt`'s `cc = z` branch). I verified all of these match `colorAt` by inspection
  (`shaderBuilder.ts:176-195` colourise vs `:883-902` + `:1035-1045` fused — the histogram
  `(kmax+0.5)/(uN+1)` lookup, the `cim(z)<0 ? c*0.6` decomposition, and the `dFdx/dFdy(h)` overlays
  are identical, and the 1:1 NEAREST field texture makes the screen-space derivatives agree), but
  none is pinned by a test.
- **Why it matters:** a future edit to `fieldAt`, the colourise shader, or `colorAt` could desync one
  of the untested modes/precisions and ship a colour shift on appearance changes with green tests.
- **Recommendation:** parametrize the parity test across {escape, histogram, decomposition} × {single,
  df64} × {dyn, param} and one case each with outline and equipotential on. The harness already
  supports it (`canvas.toDataURL()` byte compare).

### [NIT] Periodicity squared-form uses raw `dot()` on a `cvec`, so in the df64 build it sums hi+lo limbs rather than the hi-limb |z|² the new `cabs2` helper provides
- **Area:** apps/complex-dynamics + @cas/gpu · **Location:** `src/render/shaderBuilder.ts:644` (`dot(pd,pd) < 1e-12*max(1,dot(z,z))`); cf. `packages/gpu/src/glsl/complexDf64.glsl.ts:22` (`cabs2` deliberately uses `vec2(a.x,a.z)`), `cvec` = `vec4` in df64 (`complexDf64.glsl.ts:13`) vs `vec2` in single (`complexSingle.glsl.ts:10`)
- **Type:** numerical (harmless) / style · **Confidence:** high · **Fix-safety:** safe-now
- **Evidence:** `pd`/`z` are `cvec`. In single precision `cvec=vec2`, so `dot(pd,pd)` == `cabs2(pd)`
  exactly. In df64 `cvec=vec4=(re.hi,re.lo,im.hi,im.lo)`, so `dot(pd,pd)` computes
  `re.hi²+re.lo²+im.hi²+im.lo²` — it drops the df64 cross-terms `2·re.hi·re.lo + 2·im.hi·im.lo` that
  the true |pd|² carries, whereas the sibling `cabs2` in the *same* commit deliberately takes the
  hi limbs. The discrepancy is ~1e-16 relative, ~10 orders below the 1e-6 detection tolerance, so
  behaviourally a no-op — but it is not literally the "squared magnitude" the inline comment claims,
  and it is inconsistent with `cabs2`.
- **Why it matters:** none numerically; it is a readability/consistency snag — a future reader could
  mistake `dot(z,z)` for a correct df64 |z|² and reuse it somewhere the ~1e-16 error is not
  negligible.
- **Recommendation:** write the check as `cabs2(pd) < 1e-12*max(1.0, cabs2(z))` to reuse the helper
  introduced alongside it (byte-identical in single, and the intended hi-limb form in df64).

### [NIT] Escape-predicate peephole (shared @cas/expr) pushes the compared magnitude toward float32 underflow for a very small constant threshold
- **Area:** packages/expr · **Location:** `packages/expr/src/glsl.ts:107-119` (`emitAbsSquaredCompare`), applied at `:151-152`
- **Type:** numerical (edge) · **Confidence:** medium · **Fix-safety:** needs-review
- **Evidence:** the peephole rewrites `abs(E) op k` → `cabs2(E) op k·k` for any non-negative constant
  `k`, including tiny ones. In single precision a convergence-style test `abs(E) < 1e-9` becomes
  `cabs2(E) < 1e-18`, comparing a squared magnitude near the float32 subnormal floor (~1.2e-38) — so
  the comparand loses relative precision / can underflow where the original linear form (~1e-9) did
  not. Not reachable via any current CD preset (all escape thresholds are ≥2, and the one non-constant
  RHS `abs(...)>abs(c)` correctly declines the peephole), but `@cas/expr` glsl codegen is shared
  (plotter, faber, …) and a user-entered `abs`-vs-tiny-constant condition would hit it.
- **Why it matters:** a theoretical precision cliff for very tight `abs` thresholds; the escape use
  the optimization targets (large thresholds) is unaffected.
- **Recommendation:** optionally bound the peephole to `k` above some floor (e.g. skip when
  `k*k` would be subnormal, or when `k < ~1e-3`), falling back to the `cre1(cabsf(E)) op k` form; or
  document the caveat next to the existing ≤1-ulp note.

---

## Positively verified (checked closely; correct — recorded so they need not be re-derived)

- **P1-c escape peephole is mathematically sound and correctly guarded.** `emitAbsSquaredCompare`
  (`glsl.ts:107`) fires only for `abs(E) op const` with the constant `≥ 0`; `==` is handled before
  it (`:143`), and every ordering (`<`,`>`,`<=`,`>=`,`!=`) preserves under squaring on non-negatives.
  `constReal` (`:178`) returns null for variable/param RHS, so `abs(z*c)>500` folds
  (`cabs2(z*c)>250000`) while `abs(...)>abs(c)` does not (RHS is a call) — both correct. `cabs2`
  returns a real (`float`), matching the `float op float` boolean it lands in. Codegen test updated
  (`glslCodegen.test.ts:63-72`).
- **Fix L recolour is byte-identical to the fused path for ALL covered modes**, not just the tested
  smooth case: escape `palette(kmax/uN)`, histogram `palette(uCdf[(kmax+0.5)/(uN+1)])`, decomposition
  `palette(kmax/uN)`·(0.6 if `cim(z)<0`), smooth `kmax+1−log(log|z|)/LOG_DEGREE`, interior→black, and
  the outline/equipotential overlays all line up character-for-character between
  `fieldAt`+`COLORIZE_FRAGMENT_SHADER` and `colorAt` (+ main's overlay block). The 1:1 NEAREST
  RGBA32F field makes `dFdx/dFdy(h)` in the colourise pass equal the fused per-fragment height
  derivatives.
- **The recolour fast path cannot be taken by a geometry-affecting change.** All ten
  `scheduleRender(false)` callers (`glPlot.ts:2474-2571`) are appearance-only; the two that also set
  non-colour state — `setColoring` (mode/aa) and the mode-dependent `setTrap`/`setLighting` — are
  re-gated by `canRecolor()` (`:1995`), which requires `_aa==1`, a mode in `{0,1,5,9}`, `!_light`,
  `!_sphere`, `_projection==0`, `!usePerturbation()`. Content-changing setters (`set n`, `set zoom`,
  `set res`, `ApplyPreset`, …) call `scheduleRender()` (true), which sets `fieldValid=false` and
  `wantRecolor=false`, so the cached field can never be stale when `wantRecolor` is true.
- **The histogram CDF is self-contained in the recolour path.** `renderRecolor` calls
  `ensureCdf` (`glPlot.ts:2089`), which renders its own mode-6 escape pass into `histoTex` and reads
  it back (`updateCdf:1568-1609`) — it does not depend on the field texture or the on-screen buffer,
  and early-returns when `!cdfDirty` (so a palette rotation in histogram mode does no readPixels).
- **Prior σ GPU-cap finding (05-CD MEDIUM, 512→4096) is fixed and intact.** The σ loops are now
  `for (int n = 1; n <= SIGMA_MAX_ITER; ++n)` with `SIGMA_MAX_ITER = 4096` (`schwarzGL.ts:57,265,310`),
  matching the input clamp. The `schwarzEscape.maxIter*4` at `main.ts:3587` is a CPU-only seed-gate
  (`schwarzEscapeAt`), not fed to the GPU `u_maxIter`, so it does not re-open the cap gap.
- **No new hot-loop allocation.** All new work is shader-side; the recolour path allocates textures
  only lazily on resize (`ensureFieldTarget:2009`) and the only per-build `Uint8Array` is the
  pre-existing CDF readback (gated on `cdfDirty`).

## Coverage

**Examined closely:** the full diffs of `0527fe5` + `0453f52` (+ merge `c40352e`); `glsl.ts`
`emitBool`/`emitAbsSquaredCompare`/`constReal`/`emitPow` (`:100-260`); both `cabs2` stdlib additions;
`shaderBuilder.ts` `fieldAt`, `COLORIZE_FRAGMENT_SHADER`, `colorAt`, the fused main() overlay block,
the periodicity `periodInit`/`periodStep`; `glPlot.ts` `canRecolor`/`ensureField(Target)`/
`drawColorize`/`renderRecolor`/`nudgeAppearanceDraft`/`render()` dispatch/`effectiveMode`/
`targetIterations`/`ensureCdf`/`updateCdf`/all `scheduleRender(false)` setters; the `main.ts`
appearance-draft wiring (`withAppearanceDraft`/`nudgeAppearanceDraft`); both tests; the preset escape
strings; and the σ GPU loop bound for the prior-finding regression check.

**NOT covered (honest gaps):** the perturbation/BLA deep-zoom kernels (`perturbationPoly.ts`, `bla.ts`,
`dd.ts`) beyond confirming `canRecolor` gates recolour off them; the sphere/projection paths beyond the
same gating; the accumulate/collar machinery internals beyond the two interactions flagged; the many σ
and Julia overlay modules (out of the perf-rewrite scope); and I could not execute code (read-only), so
the MEDIUM's stall magnitude and the two conditional LOW visual items are reasoned, not measured — each
carries a concrete confirming test/repro in its Recommendation.
