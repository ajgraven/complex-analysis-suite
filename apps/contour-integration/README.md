# contour-integration

A sandbox and worked-example gallery for **contour integration and the residue theorem**, including
the evaluation of real definite integrals in closed form.

The distinguishing capability is not that it computes `∮γ f dz` — several tools do — but that it
reports whether your *argument* is finished: which contour pieces vanish, with what certified bound,
which reproduce the target, which poles are caught and with what winding number, and therefore
whether the whole thing closes.

## Status

**Milestone 0 — scaffold.** Wired into lint, typecheck, test and build; nothing is drawn yet.
Not in the Pages publish list (that happens at M3). See the milestone table in
[`../../docs/contour-integration/PLAN.md`](../../docs/contour-integration/PLAN.md) §7.

## Documentation

| document | what it is for |
|---|---|
| [`PLAN.md`](../../docs/contour-integration/PLAN.md) | scope, the Closing Ledger, the rigor architecture, milestones |
| [`DESIGN.md`](../../docs/contour-integration/DESIGN.md) | module layout, core types, the Ledger algorithm, the Family schema |
| [`GALLERY.md`](../../docs/contour-integration/GALLERY.md) | the 28-integral v1 gallery — the engine's content specification |
| [`research/`](../../docs/contour-integration/research/) | eight research tracks behind the above |

## Layout

Four layers, strictly downward-depending, with the boundary enforced by this package's
`eslint.config.js` rather than by discipline:

```
src/kernel/   pure maths — no DOM, no upward imports. Where the golden corpus points.
src/engine/   problem semantics: contour, branch, residue, ledger, family, derivation.
src/ui/       Stage (WebGL2) and panels.
src/shell/    app wiring, URL state, workers, figure export.
```

## Development

```bash
pnpm --filter contour-integration dev      # http://localhost:5177
pnpm --filter contour-integration test
pnpm --filter contour-integration typecheck
```

The repo-wide gate — run this after your **last** edit, never before it — is `pnpm lint`,
`pnpm typecheck`, `pnpm test`, `pnpm build` from the root.
