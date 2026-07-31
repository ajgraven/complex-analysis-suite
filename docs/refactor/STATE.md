# STATE — refactor engagement

> Living control file. Always current; keep under 100 lines. Committed directly to `refactor/main`
> at every checkpoint (it describes not-yet-merged work, so it must not sit behind an unmerged PR).
> Git and the working tree are authoritative for *what is true*; this file is authoritative only for
> *where we are*. On disagreement, trust git and correct this file.

## Objective
Multi-session architectural refactor of `complex-analysis-suite` — prioritizing maintainability/
extensibility, conceptual clarity, reliability/testability, and architectural coherence.
Behavior-preserving by default; no behavioral change without an explicit approval token.

## Phase / stage
- **Phase D — Execute. Groups A + B + C COMPLETE. Group D in progress.**
- **ui.mjs pure-seam extraction COMPLETE** — D-ui-seam (#193) + D-ui-seam-2 (#194) both MERGED (netted
  `ui-domain-mode.mjs` + `ui-geometry.mjs`; ui.mjs's first executable coverage, 25 tests).
- **installAlgebra decomposition UNDERWAY** (QD-ALG-1; user chose "Carve-outs" + "keep carving") — attack the
  ~4.2k-line god-function by its PURE sub-computations, net-first, one PR each. **Carve-out 1 (classifyVerdict +
  posDimDesc → `algebra-labeling.mjs`) — MERGED (#195).** **Carve-out 2 (`_verdictBadge`, IIFE lift) — MERGED (#196).**
  **Carve-out 3 (`exactValueStr` + `fmtRat` → NEW `algebra-format.mjs`) — MERGED (#197).** **Carve-out 4 (`fmtRatio` +
  `ratioStrRec` ratio-prefix formatters → extend `algebra-format.mjs`) — MERGED (#198).** **Carve-out 5 (`_parseMomentToken`
  + `_parseMomentNum` moment parser → NEW `algebra-moment-parse.mjs`) — MERGED (#199).** **Carve-out 6 (`withGuidance` +
  `_isCapFailure` cap-failure guidance → extend `algebra-labeling.mjs`) — IN PROGRESS (extraction).**
- **Shape chosen by deps each time:** a NEW MODULE when the dep is cleanly importable (1: posDimDesc; 3: QDEquations.ratApprox
  via side-effect import; 4: the co-located `exactValueStr`; 5: ZERO external deps — a pure leaf); an IN-FILE IIFE lift when
  a dep is woven through installAlgebra (2: latexPlain ~50×).
- **Census correction (a read-only scan of installAlgebra):** the pure fruit is NOT exhausted — ~16 cleanly-pure + ~4
  cheap pure-if-injected helpers remain. Ranked next after the moment parser: `withGuidance`+`_isCapFailure` (honest-labeling
  guidance, ~19 call sites), `_pronyLatex` (math→LaTeX), `valStr`+`substList` (formatters the PROV_UI tests currently MOCK),
  then `buildHForm`/`friendlyReim`/`isForkedColumn`/`_relKey`/… , and `latexOf`(+`reimSafeLatex`) as a pure-if-injected pair.
- **QD-ALG-6 DECLINED** (carve-out 3): tolerance literals scattered at unrelated sites; not a pure computation. `poleCentroid`
  inline copy = a DEDUP of the tested `QD.poleCentroid`, not an extraction (noted by the census).
- Cadence: merge on green (user delegates). `APPROVED: PLAN.md v1`.
  Roadmap §8: A✓ / B✓ / C✓ / **D (ui.mjs seams✓; installAlgebra decomposition underway — carve-outs 1✓ 2✓ 3✓ 4✓ 5✓ 6(wip))** / E / F.

## Branches / PR
- Integration `refactor/main` @ **23f6d54** (#199 merge; this STATE commit advances it). Tree clean. **No open PR.**
- Merged stage PRs (22): A1 #178 … D-alg-carve-4 #198, **D-alg-carve-5 #199 (23f6d54)**.

## Validation state (green bar)
- **`refactor/main` @ 23f6d54 — GREEN on the merged stage branch (2183/249); post-#199-merge re-confirm RUNNING.**
  Merge of a docs-only STATE commit (ef37548) + the already-green carve-out (58de4dd) — disjoint; re-confirming to stay honest.

## Uncommitted / unverified
- None on `refactor/main` (this STATE commit direct). Carve-out 6 extraction about to start on its own branch.

## Known blockers / risks
- No open PR. No blockers.
- installAlgebra's remaining bulk is DOM-bound (QD-ALG-2) / store-coupled; after the census's ~15-remaining pure candidates
  are worked through, the residue is DOM/store readouts + builders — those need a strategy shift (jsdom-drive), not pure extraction.

## Next concrete steps
1. **Carve-out 6** (chosen, census #2): `withGuidance` + its `_isCapFailure` predicate — appends a CAS-export hint to
   cap/too-large failures (~19 call sites) → extend `algebra-labeling.mjs`. Pure, zero external deps → headless net. `capFailVerdict`
   (DOM/store-coupled) stays but calls the imported `_isCapFailure`. Net-first, own PR, merge on green.
2. **Carve-outs 7+** — census ranking: `_pronyLatex` (math→LaTeX), `valStr`+`substList` (PROV_UI tests mock the real impls),
   `buildHForm`/`friendlyReim`/`isForkedColumn`/`_relKey`/… , then `latexOf`(+`reimSafeLatex`) pure-if-injected.
3. Group order: A✓ B✓ C✓ → **D (installAlgebra decomposition underway — 5 done, 6 wip; census: ~15 pure left)** → E → F.

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2139/244 (2150/245 after #195)
```
