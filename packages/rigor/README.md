# @cas/rigor

The verdict algebra behind the suite's honest-labelling guardrail.

`CLAUDE.md` calls honest labelling non-negotiable — *"`=` exact, `≤` rigorous bound, `≈` estimate"* —
and until this package the suite had **no shared code for it**. The vocabulary and the assembly
logic lived only inside the Quadrature app's `.mjs`, and every new app reimplemented them. See
[ADR-0040](../../docs/DECISIONS.md).

## The goal, stated plainly

**Make `=` impossible to write by hand.**

- A `Certificate` can only come from `exact` / `bound` / `estimate` / `unknown` / `refuse`.
- A `Verdict` can only come from `assembleVerdict`.
- A verdict's level is the **meet** over its evidence, so it is computed from what was actually
  established rather than chosen by whoever wrote the call site.

Both types are branded, so the rule is a compiler error rather than a comment.

## The vocabulary

| level | meaning |
|---|---|
| `=` | exact — the value is the value |
| `≤` / `≥` | a rigorous one-sided bound: proved, not sampled |
| `≈` | an estimate. Includes the decimal rendering of an exact result |
| `?` | unknown — nothing was established. Not the same as `≈` |
| `⚠` | refused: a hypothesis failed, so **no value may be reported** |

## The two rules worth knowing

```ts
meet("≤", "≥") === "≈"   // an enclosure is not a one-sided bound, and is certainly not exact
meet("=", "?") === "?"   // an unknown sub-step is not a passing sub-step
```

`⚠` absorbs everything, and `assembleVerdict([])` is `"?"` — a claim supported by no evidence is
unknown, not exact. Seeding a fold with the identity `"="` is precisely how an unevidenced `=` gets
printed, which is why `meetAll` special-cases the empty list rather than relying on a seed.

## Restrictions

A certificate may carry a `restriction` — *"over poles with Im z > 0"*, *"for |a| < 1"*.
`assembleVerdict` aggregates these onto the verdict, and **renderers must show them where the value
is shown**, not behind a disclosure. A restricted claim that loses its restriction is not a vaguer
claim; it is a false one.

## Usage

```ts
import { assembleVerdict, bound, exact, mayReportValue } from "@cas/rigor";

const v = assembleVerdict([
  exact("Res(f, i) = −i/2", "P/Q′ in ℚ(i)[z]/⟨Q⟩"),
  exact("n(γ, i) = 1", "exact-sign crossing"),
  bound("≤", "|∫_arc| ≤ 3.2e−4 at R = 50", "exact ℚ coefficient bound"),
]);

v.level;                 // "≤"  — the arc bound is the weakest link
mayReportValue(v);       // true — nothing was refused
```

## Scope

Convention-neutral (ADR-0006): nothing here knows what is being measured. No dependencies.
