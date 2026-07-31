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
  `_isCapFailure` cap-failure guidance → extend `algebra-labeling.mjs`) — MERGED (#200).** **Carve-out 7 (`_pronyLatex`
  Prony-poly math→LaTeX → NEW `algebra-latex.mjs`) — PR #201 OPEN.**
- **6 merged + carve-out 7 in flight** ("keep carving"). installAlgebra now has 4 pure companion modules
  (`algebra-labeling` = verdict prose + failure guidance; `algebra-format` = value + ratio formatters; `algebra-moment-parse`
  = input parser; `algebra-latex` = math→LaTeX) + the in-file `_verdictBadge` lift; ~58 new characterization tests over logic
  that had ZERO coverage. The #201 fallback continues to carve-out 8 (valStr+substList) on merge.
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
  Roadmap §8: A✓ / B✓ / C✓ / **D (ui.mjs seams✓; installAlgebra decomposition underway — carve-outs 1✓ 2✓ 3✓ 4✓ 5✓ 6✓ 7(open))** / E / F.

## Branches / PR
- Integration `refactor/main` @ **5a52cc9** (this STATE commit advances it). Tree clean.
- **OPEN PR #201** — `refactor/d-alg-carve-7-prony-latex` @ c74c9c1 (off 5a52cc9): carve-out 7. CI running
  (both in_progress at open); subscribed + fallback armed (21:01Z) that merges on green AND continues to carve-out 8.
- Merged stage PRs (23): A1 #178 … D-alg-carve-5 #199, **D-alg-carve-6 #200 (4e34dff)**.

## Validation state (green bar)
- **`refactor/main` @ 5a52cc9 — ALL GREEN:** build/typecheck/lint exit 0; `pnpm test` **2189 passed / 250 files**.
- **PR #201 stage branch @ c74c9c1 — ALL GREEN (firsthand):** build/typecheck/lint exit 0; `pnpm test`
  **2197 passed / 251 files** (+8, +1 file — new headless `algebra-prony-latex.test.ts`). Lands on merge.

## Uncommitted / unverified
- None. Carve-out 7 committed to its stage branch (c74c9c1) + pushed; this STATE commit direct to `refactor/main`.

## Known blockers / risks
- PR #201 open, CI in progress; drive-to-green posture (my PR). No blockers.
- installAlgebra's remaining bulk is DOM-bound (QD-ALG-2) / store-coupled; after the census's ~13-remaining pure candidates
  are worked through, the residue is DOM/store readouts + builders — those need a strategy shift (jsdom-drive), not pure extraction.

## Next concrete steps
1. **Merge #201 on green → continue to carve-out 8** (fallback armed 21:01Z; "keep carving"). Carve-out 8 = `valStr` +
   `substList` (the PROV_UI label/value formatters whose real impls the PROV_UI tests currently MOCK; injected like
   ratioStrRec was) → extend `algebra-format.mjs`. Firsthand-verify the inject sites, net-first, own PR.
2. **Carve-outs 9+** — census ranking: `buildHForm`/`friendlyReim`/`isForkedColumn`/`_relKey`/… (cheap stragglers),
   then `latexOf`(+`reimSafeLatex`) as a pure-if-injected pair (→ the new `algebra-latex.mjs`).
3. Group order: A✓ B✓ C✓ → **D (installAlgebra decomposition underway — 6 merged + #201; census: ~13 pure left)** → E → F.

## Resume commands
```
git fetch && git checkout refactor/main && git pull
pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 2139/244 (2150/245 after #195)
```
