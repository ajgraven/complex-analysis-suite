# Polynomial Roots — review, 2026-09-26

Six parallel read-only reviews of `apps/polynomial-roots` at `da1afc4` (root engine, limit-set engine,
deep zoom, dragons/bounds/places/stats, shell/stage/codec, documentation), plus a browser pass. The
**mathematics is sound**: the swept density matches brute force bin for bin on nine further alphabets
(also by Egan hue class), and the pruning bound, the theorem's sign, the double-double arithmetic and
both cited root bounds check out. The defects are in **guarding work, keeping state in step, and the
docs**. "Verified" = reproduced; "suspected" = read off the code.

The remediation ran as four batches, one commit set each, with the gate after each. Status is recorded
against every item below; the finding itself lives in the comment beside the code that fixes it.

## A — P0: breaks the picture or the tab

| # | Finding | Evidence | Status |
|---|---|---|---|
| A1 | Resizing the window blanked the root cloud; the stats kept describing it | 286,856 lit px → 0 on a 1280→1100 resize (verified) | fixed — `GlStage.resize` rebuilds textures, keeps buffers |
| A2 | No cost gate by family size; the pool materialised its queue on the main thread | `{−2…2}` at degree 16: 18.6 M chunks, 6.9 s blocked, 1 GB heap; `{−3…3}` link never loads | fixed — `engine/cost.ts` budgets by roots; pool is a cursor |
| A3 | The degree-20 cap guarded the Highest slider only; the note said "2^N polynomials" for every alphabet | `dmax: 22` link swept while saying "press Compute"; trinary 22 read "4.2 million" (really 4.2e10) | fixed — the gate is in `recompute` |
| A4 | An unreadable custom alphabet left the previous sweep running and drawn | stats climbed 6.6 M → 10.4 M under a ⚠ note | fixed |
| A5 | This app's browser suite never ran in CI | root `test:browser` omitted it | fixed |

## B — P1: wrong or misleading output

| # | Finding | Status |
|---|---|---|
| B1 | Dragon inset: "inside" stated limit-set membership from an approximate superset test (208 of 648 Littlewood "inside" points rigorously outside); the drawn cloud and the verdict used different sets for alphabets containing 0; its ε and depth were not the stage's | fixed — the verdict is the stage's own walk (its depth, its ε); "kept" reads `≈ consistent with`, not membership; the all-zero series is named |
| B2 | Deep zoom: "Centre on this root" refined in float64 above 1e-11 (0 roots found at 1e-20 vs 927); auto handed `|z| > 1` views to a walk that refuses them; stale frames drawn at the new view (suspected); an unconverged Newton root was painted | fixed — a repeated root is no longer drawn twice (found by the sweep); re-centring always refines in double-double, seeded at the probed root; `|z| > 1` below a float32 texel stays with the limit walk; stale frames are shifted in dd; a root failing `16·2^−bits` is not drawn |
| B3 | Pool: a chunk error still ended in `onDone`; a dead worker leaked and hung the job | fixed in batch A with the cursor |
| B4 | ~29% of accumulated density never drawn — square textures sampled NEAREST onto a non-square canvas | fixed — the targets take the canvas's shape (`GlStage.resize(w, h)`); a browser test reproduces the dropped rows on the old square target |
| B5 | The degree scrub re-swept everything (the stage was built to recomposite) | fixed — `engine/scrub.ts`: a step sweeps only the new degrees (16→17 1.4 s against 3.8 s fresh; a step down 108 ms), counts identical to a fresh sweep |
| B6 | Real-root count misses multiple real roots (~1% at trinary 11); the test's oracle used the same solver | fixed — the conjugate-pairing rule, checked against an exact BigInt Sturm oracle (`test/support/sturm.ts`), exact on every case |
| B7 | `SAME` tolerance lets negation hold where the unit −1 does not: `1, -1.0000000005` loses 25% of its family | fixed — the unit −1 is added whenever negation holds |
| B8 | PNG caption wrong under the deep engine; `cas:state` carried only the fragment | fixed — `deepCaptionFor`; `cas:state` carries origin + path + fragment |
| B9 | No pinch zoom; the lamp, probe and theorem mode were mouse-only; the theorem place opened empty | fixed — pinch zoom, primary-button pan, `deltaMode`-aware wheel; the lamp pins at the view centre from the keyboard; the theorem place draws without a hover |
| B10 | Limit engine: the fold omits the `|w|²` Jacobian (≈35% over-report outside the disk); `|a| ≳ 1.8e19` draws blank; no context-loss handler | fixed — the fold's `|w|²` Jacobian in both walks; the shader normalises to max|a| = 1; a context-loss handler |
| B11 | Two gallery captions promise what the frame does not show (ω outside "the hexahole at ω"; i off-frame) | fixed — "the holes at i and e^{iπ/4}" reframed to hold both; "a hexahole, near ω"; a test holds every named point in its frame |

**Batch B sweep: 31 mutants, 29 killed by the node gate, 1 by the browser suite only (the shader's
fold Jacobian — 1,552 texels disagree), 1 recorded equivalent** (`isRealRoot` skipping its own index:
the root's own conjugate is `2|y|` away and `|y| ≤ 64·2|y|` always holds). Six survived the first
pass. The one worth carrying is that **the re-centring test passed without the seed because its
"second roots" were the SAME root drawn three or four times**. A polish after deflation can land on a
root already found, and the deep walk pushed it again: 998 rows at a forced-deep half-height of 0.12,
with 16 polynomials repeated, down to 972 after the fix. With the repeats removed, the test was rebuilt
on a view with 81 genuine two-root polynomials, where 81 of 162 probes land wrong without the seed.

## C — efficiency (measured)

| # | Finding | Status |
|---|---|---|
| C1 | Aberth `hypot` in the inner loop | fixed — moduli hoisted once per solve: 232,938 solves 9.8–10.1 s → 3.4–3.9 s, roots bit-identical (hashed) |
| C2 | Chunk imbalance (75% of degree 16 on one worker) | fixed — `chunkSize`: every degree cut into ≥ 4 chunks a worker, floor 512, cap 16,384 |
| C3 | Per-image stats loop (~20% of a sweep) | fixed in batch B — realness and the circle decided once per representative |
| C4 | Full-composite read-back on nearly every change | fixed — the composite is keyed by everything it is drawn from; a tone-only change re-tones the last read-back (10 gamma steps: 0 `readPixels`) |
| C5 | Limit walk re-run on tone-only changes and hovers | fixed — same key; 10 gamma steps draw only the present pass, 20 hovers draw nothing |
| C6 | Dragon inset and theorem overlay recomputed per pan / pointer move | fixed — the inset is keyed by its inputs and redraws only when they change |
| C7 | Unbounded `LimitPass` program cache | fixed — LRU of 8, evictions `deleteProgram`'d (browser test) |
| C8 | Deep second-order admission test | fixed — 1e-30: 2.25 → 1.23 s; 1e-12: 180 → 126 ms; root sets identical |
| C9 | Live-region chatter, paragraph-long place names, probe focus loss | fixed — the summary is announced once settled and the progress line is visual; places are named by their title and described by the rest; the probe card rebuilds only when it changes and keeps focus. The audit also found `role-img-alt` on the deep page's empty inset (a batch-B regression), fixed |

**Batch C sweep: 10 mutants, 9 killed, 1 recorded equivalent in outcome** (dropping the first-order
admission — both admissions are necessary conditions). Three survived the first pass and each bought a
test. The Aberth bound's leading term and its Horner start: the self-reported backward error is now
recomputed exactly, since a solve stops on a sweep in which nothing moved. The pool's chunk size: it is
now tested from the pool's own dispatch, which catches a pool that cuts by one worker rather than its
own count.

## D — documentation

All fixed in batch D: the plan's header and §4/§5/§5.6/§7 corrected in place and dated, and a roadmap
entry for this review; the memory budget (`R32F`/4 MB written, `RG32F` shipped) in the plan, ADR-0046 and
`glStage.ts`; ADR-0046 amended (decision 1, the consequences, AI-2's "seven apps" → two, a new AI-9);
`CLAUDE.md` (seven browser configs, eight `@cas/export` apps, thirteen tool apps, the PR-1 paragraph's
`@cas/flow`, the place count, the jsdom count, the test counts, and a paragraph for this review);
`@cas/gpu`'s description and README (the histogram module, the consumers, the tests); the root README
(thirteen apps, the README list, the test count); a new `apps/polynomial-roots/README.md`; the launcher
README (every card, ADR-0044) and its meta descriptions (Contour Integration was missing); the sibling
Polynomial Root Analysis plan and research notes (ensembles are covered by NEITHER app, the wrong paths,
`deep/dd.ts` as a reuse candidate, `createComputeClient`'s second consumer); `future-app-ideas.md`;
ARCHITECTURE §3 and §8; the stale comments in `aberth.ts`, `walkGlsl.ts`, `places.ts`, `glStage.ts`,
`scripts/a11y-audit.mjs` and `scripts/check-built-artifacts.mjs`; and the a11y baseline re-recorded (it
held four of the app's nine pages; the five added are all clean, and nothing else moved).

## Extensions (not scheduled)

A progressive, cancellable, re-projecting deep walk with the `|z| > 1` fold via reversed polynomials ·
two-ended Egan hue (outside the disk by the reversed prefix) · exact real-root counts by Sturm for integer
alphabets · best-first child order and a centred tail bound in the limit walk (hexahole 158 → 75 nodes a
texel) · random-polynomial ensembles, which neither this app nor the proposed one covers.
