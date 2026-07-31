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
- **Phase D — Execute. Group A (A1/A2/A3) + B1 MERGED. Stage B2: IMPLEMENTED, GREEN, PR #182 OPEN (awaiting review).**
- **B2 — sharded `solvers.test.js`** (the 1,915-line monolithic `run()`) into 4 contiguous parallel `vitest/node`
  specs `solvers-{1..4}.test.js` at block boundaries 816/935/1233 (isolating the atomic ~38s §PB block in shard 2).
- **Risk was med-high (per B1) → LOW:** a verified statement-map showed clean seams (one trivial cross-block const,
  no shared mutable state, side-effect `ok()` reporting) ⇒ contiguous slices are byte-identical to the original body.
- **MEASURED WIN:** `pnpm test` 156.6s → **109.0s (−30%)**; QD node long-pole **77s → 37s**. §PB [826-935] is one
  atomic ~38s block that caps it below the plan's ~25–30s target (disclosed; sub-split is a possible follow-up).
- Cadence: auto-merge on green. `APPROVED: PLAN.md v1`. Decisions D-1..D-4 recorded. Deferred/open: QD-ALG-7 (→ D), QD-SOLV-6.
- Roadmap (PLAN §8): A✓ / B(B1✓, **B2 in review**, B3, B4=net) / C / D / E / F. ASSESSMENT §1–4; 36 findings in ISSUES.

## Branches / PR
- Integration `refactor/main` @ aadedaf (B2-in-flight STATE checkpoint on top of d74fd2e). This STATE commit advances it.
- **PR #182 OPEN** (awaiting review): `refactor/B2-shard-solvers` (ac5f894 impl + 313a18d docs) → `refactor/main`.
  **Do NOT merge my own PR; do NOT start B3/B4 until #182 merges.**
- Merged stage PRs: A1 #178 (b331ae2), A3 #179 (e657769), A2 #180 (3a5d18f), B1 #181 (08b0fab).

## Validation state (green bar)
- **B2 branch @ 313a18d — ALL GREEN:** build / typecheck / lint → exit 0; `pnpm test` → exit 0 (**236 files / 2059 tests**, 109s).
- **Parity (3 proofs):** (a) reconstruction concat(4 shard bodies) == HEAD original body, byte-identical (100718 chars);
  (b) oracle `node app/node-test.js` = **2332/0** (was 2329/0; +3 runner lines; content assertions unchanged at 2302);
  (c) per-shard contributions 187/10/71/183 = **451** == pre-split S.
- `refactor/main` @ d74fd2e (pre-B2) was green: 233 files / 2056 tests; oracle 2329/0.
- browser (not in core bar): `pnpm test:browser` NOT run — B2 is test-infra only (no GPU/shader).

## Uncommitted / unverified
- None. B2 fully committed (ac5f894 impl, 313a18d docs) + pushed; PR #182 open. This STATE commit is direct to refactor/main.

## Known blockers / risks
- **Blocked on human review/merge of PR #182** (never self-merge). CI health unknown (July note: possibly-exhausted GH
  Actions budget) — treat the LOCAL green bar as source of truth; report CI per PR without blocking on it.

## Next concrete steps
1. **AWAIT PR #182 review.** If changes requested: address on `refactor/B2-shard-solvers`, re-run green bar, push. If a
   §PB sub-split is requested for more speed: that is a content edit (higher risk) — treat as its own scoped change.
2. **On #182 merge:** `git checkout refactor/main && git pull`; re-confirm green; then the next Group-B stage —
   **B3** (QD `.mjs` coverage visibility, optional/small) or straight to **B4** (fake-Worker + jsdom char-net for
   `ui.mjs`/`ui-solve.mjs` — the safety net that GATES all of Group C/D). B4 is the load-bearing one.
3. Then C (dup collapse) → D (god-module decomp) → E (state+folderize) → F (dependency-cruiser).

## Resume commands
```
git fetch && git checkout refactor/main && git pull    # after #182 merges; else `git checkout refactor/B2-shard-solvers`
pnpm install --frozen-lockfile
pnpm build && pnpm typecheck && pnpm lint && pnpm test  # expect 236 files / 2059 tests on/after B2
node apps/quadrature-domains/app/node-test.js           # oracle: 2332/0 on/after B2 (was 2329/0)
```
