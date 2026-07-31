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
  `_isCapFailure` cap-failure guidance → extend `algebra-labeling.mjs`) — PR #200 OPEN.**
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
  Roadmap §8: A✓ / B✓ / C✓ / **D (ui.mjs seams✓; installAlgebra decomposition underway — carve-outs 1✓ 2✓ 3✓ 4✓ 5✓ 6(open))** / E / F.

## Branches / PR
- Integration `refactor/main` @ **7ce22cc** (this STATE commit advances it). Tree clean.
- **OPEN PR #200** — `refactor/d-alg-carve-6-cap-guidance` @ 54d6a46 (off 7ce22cc): carve-out 6. CI running
  (browser in_progress / build queued at open); subscribed + 12-min merge-on-green fallback armed (20:26Z).
- Merged stage PRs (22): A1 #178 … D-alg-carve-4 #198, **D-alg-carve-5 #199 (23f6d54)**.

## Validation state (green bar)
- **`refactor/main` @ 7ce22cc — ALL GREEN (post-#199-merge re-confirmed firsthand):** build/typecheck/lint exit 0;
  `pnpm test` **2183 passed / 249 files**.
- **PR #200 stage branch @ 54d6a46 — ALL GREEN (firsthand):** build/typecheck/lint exit 0; `pnpm test`
  **2189 passed / 250 files** (+6, +1 file — new headless `algebra-cap-guidance.test.ts`). Lands on merge.

## Uncommitted / unverified
- None. Carve-out 6 committed to its stage branch (54d6a46) + pushed; this STATE commit direct to `refactor/main`.

## Known blockers / risks
- PR #200 open, CI in progress; drive-to-green posture (my PR). No blockers.
- installAlgebra's remaining bulk is DOM-bound (QD-ALG-2) / store-coupled; after the census's ~15-remaining pure candidates
  are worked through, the residue is DOM/store readouts + builders — those need a strategy shift (jsdom-drive), not pure extraction.

## Next concrete steps
1. **Merge #200 on green** (fallback armed 20:26Z). On merge → advance `refactor/main`, re-confirm green, refresh STATE.
   Milestone: **6 carve-outs done** — a natural point to report back rather than auto-grind carve-out 7.
2. **Carve-outs 7+** — census ranking: `_pronyLatex` (math→LaTeX), `valStr`+`substList` (PROV_UI tests mock the real impls),
   `buildHForm`/`friendlyReim`/`isForkedColumn`/`_relKey`/… , then `latexOf`(+`reimSafeLatex`) pure-if-injected.
3. Group order: A✓ B✓ C✓ → **D (installAlgebra decomposition underway — 6 carve-outs; census: ~14 pure left)** → E → F.

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2139/244 (2150/245 after #195)
```
