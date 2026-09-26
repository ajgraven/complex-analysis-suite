# Polynomial Roots: second review, 2026-09-26

This is the second review of `apps/polynomial-roots`, run on master at `8909565`, right after the first
review's remediation ([PR #350](../2026-09-26-polynomial-roots-review/REPORT.md)). Eight read-only
reviewers covered:

- the root engine and statistics;
- the limit-set engine and handover;
- the deep engine;
- dragons, bounds and places;
- the shell, stage and state;
- docs, wiring and shared packages;
- a real-browser pass of the built app;
- a study of core improvements.

Each reviewer first checked that the first review's fixes held in its area, then looked for what that
review missed. Tags: **V** means verified (reproduced, numbers given); **S** means suspected (read off
the code). The reviewers' own finding IDs are given in brackets, so the evidence can be traced back.
Five findings were re-checked independently while this report was written: the gated places (1), the
custom-id collision (7), the dragon panel's two writers (6), the second double-double module (P2.10)
and ε's centre-only gap (2). Nothing in the repository was changed by the review.

**Headline.** The mathematics that was checked holds up:
- the orbit machinery (power sums match Vieta on ten complex alphabets);
- the walk's tail bound and fold;
- the double-double arithmetic;
- the residual certificate;
- the cited bounds.

Two places fall short of what they claim:
- **the limit-set picture is not the guaranteed superset its legend says it is** (see 2);
- **the real-root count is not exact past the degrees tested** (see 10).

The rest are defects in state that the shell keeps in step by hand, and in a gallery that the first
batch's cost gate quietly broke.

## P1: fix first

| # | Finding | Evidence | Fix · cost |
|---|---|---|---|
| 1 | **Five gallery places open wrong.** `hexaholes-region` is *refused* by the cost gate (trinary 8–16, 1.67e8 roots) and `bandt` waits for Compute (1.61e7); both open on a black stage. `four-fifths` and `four-fifths-i` hand over to the limit engine with 51–56% of the frame in the unwalked band. `feather-08-02` shows 7% lit specks, and `half-e-i-fifth` is 0.48% lit. The batch-A gate was never checked against the places, and `places.test` sweeps only to degree 12 and checks the engine in one direction. | V (independently re-checked) [dragon D1–D3; browser F4–F6] | Re-frame or re-degree each place. Add one test: every place and story frame is `live`, lands on the engine its caption describes, is ≥ 80% walked and is not empty. **S** |
| 2 | **The limit set is not a guaranteed superset.** Foster's ε uses the texel's half-side where the corner is √2 of that, takes `(1−|z|)²` at the centre, and uses the first-order fold radius. Roots near a texel corner are missed: 192 of 18,464 samples at h = 3e-2, and 8 on `{1, ½+½i, −1}` at h = 3e-5. The repo's own inclusion test fails at a 160² grid. Separately, the **float32 shader disagrees with the float64 walk once zoomed**, in both directions: 0.6% of texels change class at the dragon at 8e-5, where `FLOAT32_TEXEL_ULPS` still says the GPU is fine. The dragon verdict and the legend's wording inherit both. | V [limit L1, L2, L6] | Use the covering radius `ρ√2`, the gap at `|w|+ρ√2` and the exact fold radius, in both walks and in `limitPixelRadius`. Give the GPU `ε = max(ρ, c·DEPTH·2⁻²⁴)·max|a|/gap²`. Add inclusion tests at several grid sizes and alphabets, and deep-view parity as one-way inclusion. **S** |
| 3 | **Deep frames are stamped with the newest request's centre and alphabet.** `createComputeClient` swaps its single callback on each request, so walk A is delivered to request B's closure. While a walk runs (up to 27 s) the dots, the probe, the re-centre seed and the theorem's α are all off by the pan. After an alphabet change, an old frame is read through the new alphabet: `coefficientString` throws inside `syncProbe`, the pending request is never posted, and "walking…" stays on. | V (fake-worker harness) [shell S1; deep D1] | Echo `{cx, cy, alphabetId}` in the frame, take the centre from the frame, drop frames for another alphabet. In `@cas/ui`, bind each callback to its request id and post the pending request in a `finally`. **S** |
| 4 | **A "live" sweep freezes the tab for minutes.** Each chunk marks its whole degree layer unpainted, and `paint` re-splats every buffer of it. That is O(chunks²): 4.1× the draws at trinary 13. Every chunk frame also reads the composite back and rebuilds the histogram on the main thread (84% of the profile). Measured: trinary 13 takes 55–135 s with 12.4 s long tasks; Littlewood 19→20 takes 57 s. A changed frame costs 35–109 ms of read-back plus tone. | V [browser F7; shell S7, S15] | Splat only the new buffer while the view is unchanged. Throttle read-back and tone to about 4 Hz during a sweep, subsample the histogram, reuse the buffers. **M** |
| 5 | **The Compute gate throws the picture away.** The gate prices the whole range *before* `planScrub`, then `forget()`s every layer. One step into the confirm band, or even a step down within it, blanks the stage. Compute then re-solves every degree it held, and the panel reads "still computing" while nothing runs. | V [root R5; shell S2, S6; browser F8–F10] | Plan first. Gate the TIME on the missing degrees and the MEMORY on what will be held. Keep the held layers drawn while waiting. Replace the `complete` flag with a sweep status (running / done / awaiting Compute / refused). Label the note's "roots solved" against the panel's "roots drawn". **S** |
| 6 | **The dragon cannot be pinned.** Batch B's keyboard pin is unreachable: `syncDragon` (main.ts:1049) re-hides the panel that `syncDragonControls` (:1146) just showed, so it is hidden and out of the tab order at the default view. A mouse cannot pin either: `pointerleave` clears the hover lamp before the click lands. While hovering, the inset sits 1,429 px down a 7,075 px rail. | V (independently re-checked) [shell S3; dragon D4; browser F2, F3] | One writer for `hidden`. Pin on stage click. Keep the last hover lamp until something replaces it. Put the inset beside the stage. **S / M** |
| 7 | **Custom alphabets collide in every cache.** `specId` strips whitespace, which separates values, so `"1 +2i, 3"` (three values) and `"1+2i, 3"` (two values) share one id. The scrub keeps the old family's layers under the new label. The composite key, inset key, deep reset and shader-program cache are keyed the same way. | V (independently re-checked) [root R1] | Build the id from the compiled, ordered values. **S** |
| 8 | **The handover sends views where they cannot be drawn.** With the band off, a view centred at 0.8 < r < 1 goes to the root engine at every zoom, even at 1e-20 where float32 cannot place a point, and the reason says "the root engine covers it". With the band on, auto hands deep views that it refuses ("reaches the unit circle"), or walks that exhaust with 0 roots. An exhausted walk that found nothing is then reported as "no polynomial has a root in this view". | V [limit L3, L4; deep D2, D6] | Apply the band override only above the float32 floor. Pick limit when `1 − |z| − r ≤ 0`. Branch every sentence on `exhausted`. Estimate deep cost first (see P2.4). **S** |
| 9 | **The Michelen–Yakir captions misstate the theorem.** Theorem 1 magnifies about the *prefix's* root αₙ by αₙ^−(n+1), with hypotheses (α in a compact subset of 𝔻, κ-good). The captions say "magnified about α", which is off by a translation of the dragon's own size; the code itself does the right thing. Theorem mode also calls itself "an illustration of Theorem 1" for every alphabet, but the theorem is proved for Littlewood only. | V against arXiv 2606.25440 [dragon D5, D6] | Restate the three `fact` fields. Outside {±1}, say "the same heuristic". **S** |
| 10 | **The real-root count is not exact.** Batch B's pairing rule covers real alphabets only. Complex alphabets still use a raw `|im| < 1e-9`: fourth roots of unity at degree 3 give 80 against Sturm's 96. At degree 11 a triple root at −1 splits to a ratio of 64.4 against `PAIRING_FACTOR = 64` (Littlewood 2 of 4,096 wrong, trinary 402,392 against 402,396). The Sturm test stops at degree 8/6 and compares totals, not polynomials. The docs say "exact". | V (exact BigInt oracle) [root R2, R3; docs D2] | Factor about 1e6 (genuine pairs measure 1e15+), or a real-centroid cluster rule for all alphabets. Compare polynomial by polynomial, add degree 11, soften "exact" until then. Longer term see Improvement 5. **S** |
| 11 | **The bound overlay can survive being switched off.** In SwiftShader the dashed Φ circles stayed after unchecking, and carried into later places: \|z\| = ½ and 2 drawn over a 5e-4 hexahole window. `clearRect` is called on the right canvas. No root cause was found; it may be SwiftShader-specific. | S (seen in the browser, not isolated) [browser F1] | Check on a real GPU. Hide the overlay (or reset its size) when no bound is drawn. **S** |

## P2: structural, honesty and performance

1. **The pool respawns endlessly.** A worker that fails to load spawns 204 replacements in 50 ticks; `messageerror` is not handled. Cap respawns per job and treat a death before the first reply as fatal. V [R4] · S
2. **GPU memory the budget does not count.** The per-degree `RG32F` textures reach 557 MB for degrees 1–21 at the 2048×1620 cap, and Egan hue buffers add 4|G| B per point. Egan mode at the hard budget is about 1.4 GB, the likely context-loss trigger, while the note quotes 12 B per point. Budget both, or splat straight into the composite and drop the per-degree textures (saves about 0.5 GB). V [R7, S8] · M
3. **Context loss is not handled end to end.** The message is cleared by the next keypress, nothing handles the restore, and a reload repeats the crashing hash. The limit engine has no frame-cost guard: `range 9` forced to limit puts 47% of texels over the node budget. Use a sticky fatal state, a restore path, a safe reload state and frame-budgeted strips. V [S4, L5] · M
4. **The deep engine is slow and silently incomplete off-centre.** Outside |z| ≈ 1/√|A| a walk takes 13–27 s, cannot be cancelled (nothing calls `cancel()`) and ends partial. A failed Newton drops that polynomial's remaining roots uncounted: 4.9% missed at one forced view, and a pinned test count includes a miss. Retry the solve and count failures, predict the cost and say so, and make the walk resumable (Improvement 3). V [D3, D4, D5] · M
5. **Depth auto-follow is pinned by any permalink or place** whose depth differs from 28, and it only ever raises the depth. Store `depthAuto`, omit the depth from links, and let auto-follow lower it too. V/S [L7, S10] · S
6. **Structure.** `main()` is one ~1,580-line closure with about 35 mutable locals, more than ten hand-kept caches, and nine code paths that each pick their own `sync*` calls; findings 5, 6, S12 and S16 are all this shape. No test reaches it, so batch B's keyboard pin regressed silently. A cheap seam is a pure `transition(before, after, held, loaded, confirmed)` (**S**); the real fix is a `derive(state) → sync(view)` split with memoised panels (**M–L**). V [S13, S14]
7. **The handover and the history jar.** One wheel notch turns an 88%-lit dragon into 43 dots at the limit→deep handover, with no sentence on the stage. Places and sliders use `replaceState` only, so Back leaves the app, and an empty hash keeps the old state. V [F12, F13, S22] · S–M
8. **Accessibility.** The limit engine re-announces its in-set share (7 announcements in 10 wheel steps). One pan gives a 34-digit centre in the `aria-label` and a 166-character hash. No slider shows its value. Round the centre to the digits the view justifies, debounce the announcement, add readouts. V [S9, S11, F14] · S
9. **Phone.** Tapping a place leaves the stage 2,744 px up the page, and `touch-action: none` on a 506 px stage makes the page hard to scroll. V [F11] · S–M
10. **Duplication, against ADR-0007.**
    - `deep/dd.ts` is **not** the suite's first float64 double-double: Complex Dynamics' `render/dd.ts` came first and has five importers. The second consumer already exists, and batch D's docs, the sibling plan's research and CLAUDE.md say the opposite.
    - The viridis stops live in five files.
    - `pngExport.ts`'s plate helper is copied from 2D Hydrodynamics.
    - Fix the docs (**S**), then extract one dd module with BigInt decimal I/O into `@cas/core` (**M**). V [docs D1, D6]

## P3: docs and nits

These are verified unless marked; most are one-liners.

- **Wrong figures:**
  - "`{−2…2}` at degree 16 is 3.05e11 polynomials" is 6.10e11 (3.05e11 is up to sign), in `cost.ts`, the plan, ADR AI-9 and CLAUDE.md.
  - The fp16 fallback saturates at 2048 counts, not 65504.
  - The ci.yml job line numbers quoted in CLAUDE.md and ARCHITECTURE moved to 135 and 191.
  - ci.yml says "845 nodes across 20 pages".
- **Stale plan and ADR text:**
  - Plan §3 and parts of §5 were not corrected: "roots not retained", "first-hit depth", "df64 below 1e-13", "~200 points ~1e-6", "> 99.5%", `|Im| < 1e-9`.
  - ADR-0046 contradicts decision 1's amendment ("roots recomputed", "retaining declined").
  - ADR-0046 says "first worker pool" (QD's came first).
  - AI-9 cites "decision 2's ceiling", but decision 2 has no ceiling.
- **Stale references elsewhere:**
  - `@cas/export`'s README omits Polynomial Roots and says "three" `cas:state` writers.
  - `glStage.ts` says `R16F`, and says saturation is "reported" when it is not measured.
  - The a11y roster's "named place" entry no longer matches any place.
- **Wiring:**
  - `eslint.config.js`'s worker glob misses `deep/reference.worker.ts`.
  - `@cas/core` is imported only by a test but listed as a dependency.
- **Place captions:**
  - "the holes at i and e^{iπ/4}": to degree 16, i is the tenth-nearest hole and e^{iπ/3} is already in frame.
  - Two captions call a numerical root "exact".
  - "The attractor" names two different sets in two captions.
  - O–P's Re z < 3/2 is Brillhart–Filaseta–Odlyzko's.
  - Egan's point has no citable source.
- **Parsing:**
  - The absolute `SAME = 1e-9` merges `1e-12` into 0.
  - `1e-3i` is refused while `1e-3` is accepted.
  - `0x10` parses as 16.
- **Small UI copy:**
  - "3-th roots of unity".
  - Lower-case fragments after a full stop.
  - "Residual 0.00e+0" reads as exact.
  - The PNG caption clips.
  - A favicon 404.
  - `h: -5` and `cx: "1e300"` open instead of being refused.
- **Test gaps:**
  - The LRU test would pass a FIFO cache.
  - The residual-certificate test is vacuous (its view has no failures).
  - Nothing tests `requestDeep`, the stale-frame flow or `uShift`.

## Improvements to the core, ranked by value for cost

These are measured where marked, and each reuses what exists.

1. **Tighter pruning in the limit walk.** Bound the tail by the support function of `z^{k+1}·D_z` instead of the disc `max|a|·|z|^{k+1}/(1−|z|)`, and visit children smallest `|s|` first; a centred tail bound helps asymmetric alphabets. Measured nodes per texel: hexaholes 171 → 50, Bandt 606 → 30, Littlewood 38 → 11; `{1,2,3}` 128× fewer. It also removes the undecided texels in the band. It stays a superset, so still `≈`. **S–M**
2. **Incremental splat, and a GPU or subsampled histogram.** This fixes P1-4, frees about 0.5 GB when the degrees are splatted straight into the composite, and unifies the density and Egan paths. **M**
3. **A deep walk that is fast, cancellable and honest.** Carry `s′` down the path for an O(1) admission test before `solve` (7.2× measured, identical root sets). Make the walk resumable and time-budgeted, and use iterative deepening so a partial walk can say "complete to degree d*". Walk with a margin so small pans reuse the frame. **S + M**
4. **Mid-zoom "every root to degree D in this view"** via the existing float64 reference walk (Foster's `polysInBound`). At the zoom story's last frame: degree 24 in 0.57 s, degree 27 in 4.8 s, against 18.6 s for exhaustive Littlewood 1–20. This restores the literature's "degree 20 → 27 filling in" beat, which the limit engine replaced. The handover would be decided by estimated node count. **M**
5. **Certified statistics.** Put a Smith disc on every Aberth root. Over 60k Littlewood polynomials of degree 12–20 all discs were disjoint, at 33–44% extra solve time. The real-root count then becomes `=`, with `test/support/sturm.ts` as fallback, and "within ρ of a true root" becomes a `≤`. It is the demand-driven second consumer for ADR-0047's planned `@cas/exact` Smith discs. **M**
6. **Probe hand-offs**: "Plot ↗" to the Function Plotter and "Count ↗" to Argument Principle. Both receivers already accept a bare `rational` map, and the integer coefficients travel exactly; Argument Principle's winding count cross-checks the probe. **S**
7. **A dragon you can use.** Pin it by clicking the stage, put the inset beside the stage, and add a zoom-linked `P′(α)⁻¹D_α` overlay on the stage itself. Draw the proper attractor when 0 ∈ A. Add places for Baez's second dragon and Michelen–Yakir's Fig. 3 roots. **M**
8. **More symmetry.** Add rotation `z ↦ u·z` for every unit, plus twisted conjugation `c·conj(P)`: |G| goes from 8 to 48 for the 12th roots of unity, so 6× fewer solves. **M**
9. **Degree 24, and previews beyond the budget.** Stream chunks into a fixed world-space histogram and discard the vertex buffers. Degree 24 is refused by memory (2.3 GB), not compute (about 50 s on 7 workers, estimated). Add sampled layers with binomial error bars (`≈ sampled at rate r ± se`). **M**
10. **Larger extensions:**
    - Random ensembles (Kac, Kostlan, Weyl) with the exact expected density overlaid. Covered by neither app. The solver fails on them today (Kostlan degree 400: 0 of 10 converge), so this needs Newton-polygon seeding. **L**
    - GPU root finding by transform feedback (solving is 98% of sweep time). **L**
    - A rigorous `≤` "proven empty" exterior mask. **M–L**
    - Deep zoom outside the disk via reversed polynomials, and a two-ended Egan hue. **M**
    - Bohemian eigenvalues, and a live coefficient parameter. **S–M**

**Do first.**
- P1-1, 2, 5, 6 and 7 are a day of S fixes that make the gallery, the dragon, the scrub and the limit set's claim true.
- Then P1-3 and 4, with Improvement 2.
- Then Improvements 1 and 3, the largest performance wins for their size.
- Then Improvement 5, which turns the statistics from `≈` into `=`/`≤`.
