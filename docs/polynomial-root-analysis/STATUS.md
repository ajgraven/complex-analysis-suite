# Polynomial Root Analysis — status: read first, update last

Plan: [`PLAN.md`](PLAN.md) · Spec: [`DESIGN.md`](DESIGN.md) · Record: [ADR-0047](../DECISIONS.md#adr-0047) ·
Evidence: [`research/`](research/) · Branch of record for the planning round: `claude/polynomial-galois-suite-7iqcb2`.

**Rule (inherited from M8):** do the step named under _Current_, update this file, commit, push. Never
end a session with unpushed work. A step that cannot be done as written is recorded under _Findings_,
not silently changed.

## Current

**PRA-0 — scaffold and spine**, gated on the owner's three decisions in PLAN §12 (accept ADR-0047;
confirm PRA-5 as the publish gate; confirm the two `@cas/ui` lifts at PRA-1). Once accepted, flip
ADR-0047's status line to _Accepted_, then follow PLAN §11 (the suggested first commit) and §6.1 (the
wiring list, re-verified against the tree first — research 04 is a snapshot).

## Done

- 2026-09-22 — two rounds of owner questions (answers recorded verbatim below), five research tracks,
  PLAN + DESIGN written, ADR-0047 drafted as _Proposed_ (as ADR-0046 until the collision below), the idea entered in
  `docs/design/future-app-ideas.md` as ▶ 8. No code touched.

## Findings (things learned while executing; each names its step)

- _(planning)_ Quadrature Domains' `app/sym/sym-core.mjs` holds a complete Berlekamp–Zassenhaus
  factoriser, `𝔽ₚ` layer, Sturm isolation and Schur–Cohn counts, unreachable from TypeScript
  (research 05 §1). PLAN §6 ports rather than shims; QD keeps its copy under ADR-0008's exception.
- _(planning)_ The plotter's `src/riemann/` already holds a monodromy tracker, permutation-group code
  and lasso generators (research 05 §9). PLAN §7 PRA-3 extracts them as `@cas/monodromy`.
- _(planning, 2026-09-23)_ **PR #348 landed in parallel** — `apps/polynomial-roots` (ADR-0046, the
  Baez–Christensen–Derbyshire root-cloud renderer), taking ADR-0046, port 5184, the _Polynomial Roots_
  name, and bringing `APP_NAMES` current. Reconciled by merging master: this record is **ADR-0047**,
  the port **5185**, the ensemble overlay dropped (PLAN §1.2), `CET_C6` from `@cas/gpu`, and
  Polynomial Roots' app-local Aberth solver noted as a possible second-consumer extraction at PRA-1.
  Research 04's rows on `APP_NAMES`, the port list and `cetC6.ts` are stale by that PR and say so.
- _(planning)_ Two dev-server ports collide today (5176 plotter/riemann-map, 5177
  argument-principle/contour-integration; research 04 §1). Not this app's to fix.

## Open questions for the owner

1. Accept ADR-0047 as written, or mark up its decisions.
2. Confirm PRA-5 as the publish gate.
3. Confirm the `@cas/ui` lifts of Contour Integration's keyed DOM builder and the plotter's
   `animate.ts` at PRA-1.

## Decisions taken during execution (the owner's answers, verbatim)

**Round 1 (before research).** 1 audience: "Default is perfect" (a strong undergraduate, a
researcher-usable sandbox). 2 "Sandbox for now, expository argument later." 3 coefficient field:
"Whatever's the largest set of polynomials you expect to be able to consistently compute Galois groups
for systematically. Or, failing that, preset families." 4 degree cap / tiers: "Sounds good for now."
5 real/rational modes: deferred to after research. 6 "Two panes, with a toggle which overlays them on
the same pane (perhaps using domain coloring for the polynomial plot, in addition to labeled roots)."
7 overlays: "Default is good, plus anything else you come across." 8 algebraic and monodromy groups:
"Both." 9 commutators: Arnold's loops, "That's exactly what I meant." 10 Galois correspondence: "I'd
like this as well." 11 proof line: Arnold, "Exactly." 12 contrast with solvable degrees: "Yes,
exactly." 13 hand-offs: "No handoffs for now." 14 references: defaults. 15 scale: "whatever scale is
appropriate for the ultimate size of the app."

**Round 2 (after research).** 1 tiers: default (Sₙ/Aₙ any degree `=`, `=` to degree 7, `≈` 8–15,
8–11 deferred). 2 ring modes ℂ/ℝ/ℚ: "Agree." 3 certified monodromy from the start: "Go with your
recommendation." 4 both loop mechanisms: "Agree." 5 families first-class: default. 6 correspondence
lattice: default (full for degree ≤ 5, derived series always). 7 formulas typed + gallery, Dummit
deferred: default. 8 tables: "Fetching is fine." 9 `@cas/exact` widened + one new package: "This
sounds good." 10 overlay order: "Looks good." 11 degree cap 24: "Sounds good." 12 name: **"Polynomial
Root Analysis"**. 13 ladder without narrative for now: "Yes, but narrative text is essential for the
final product (so should be in the longer term roadmap)." Surfaced ideas: "I like all of these ideas
which surfaced. Please add them to the longer-term roadmap." (PRA-9/PRA-10.)
