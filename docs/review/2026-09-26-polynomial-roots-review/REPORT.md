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
| B1 | Dragon inset: "inside" stated limit-set membership from an approximate superset test (208 of 648 Littlewood "inside" points rigorously outside); the drawn cloud and the verdict used different sets for alphabets containing 0; its ε and depth were not the stage's | batch B |
| B2 | Deep zoom: "Centre on this root" refined in float64 above 1e-11 (0 roots found at 1e-20 vs 927); auto handed `|z| > 1` views to a walk that refuses them; stale frames drawn at the new view (suspected); an unconverged Newton root was painted | batch B |
| B3 | Pool: a chunk error still ended in `onDone`; a dead worker leaked and hung the job | fixed in batch A with the cursor |
| B4 | ~29% of accumulated density never drawn — square textures sampled NEAREST onto a non-square canvas | batch B |
| B5 | The degree scrub re-swept everything (the stage was built to recomposite) | batch B |
| B6 | Real-root count misses multiple real roots (~1% at trinary 11); the test's oracle used the same solver | batch B |
| B7 | `SAME` tolerance lets negation hold where the unit −1 does not: `1, -1.0000000005` loses 25% of its family | batch B |
| B8 | PNG caption wrong under the deep engine; `cas:state` carried only the fragment | batch B |
| B9 | No pinch zoom; the lamp, probe and theorem mode were mouse-only; the theorem place opened empty | batch B |
| B10 | Limit engine: the fold omits the `|w|²` Jacobian (≈35% over-report outside the disk); `|a| ≳ 1.8e19` draws blank; no context-loss handler | batch B |
| B11 | Two gallery captions promise what the frame does not show (ω outside "the hexahole at ω"; i off-frame) | batch B |

## C — efficiency (measured)

Aberth `hypot` hoist (3.1–3.4×, bit-identical) · chunk imbalance (75% of degree 16 on one worker) ·
per-image stats loop (~20% of a sweep) · full-composite read-back on nearly every change · limit walk
re-run on tone-only changes · dragon inset and theorem overlay recomputed per pan / per mouse move
(61–94 ms, up to 857 ms) · unbounded `LimitPass` program cache · deep second-order admission test
(3.2 → 1.0 s, 11.3 → 3.7 s, identical root set) · live-region chatter, paragraph-long button names,
probe focus loss.

## D — documentation

Plan header and §4/§5/§5.6/§7; the memory budget (R32F/4 MB written, RG32F up to 2048² shipped);
ADR-0046; `CLAUDE.md` counts (browser configs, `@cas/export` consumers, tool apps); `@cas/gpu`'s
description and README; the root README's app count; no app README; the launcher README; the sibling
Polynomial Root Analysis plan's claims about this app; stale code comments.

## Extensions (not scheduled)

A progressive, cancellable, re-projecting deep walk with the `|z| > 1` fold via reversed polynomials ·
two-ended Egan hue (outside the disk by the reversed prefix) · exact real-root counts by Sturm for integer
alphabets · best-first child order and a centred tail bound in the limit walk (hexahole 158 → 75 nodes a
texel) · random-polynomial ensembles, which neither this app nor the proposed one covers.
