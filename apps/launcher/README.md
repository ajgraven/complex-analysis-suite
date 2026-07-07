# Launcher

The suite's **unified menu**: a small static landing page that lists the tools and links to
each. This is the "menu to select between apps" half of the topology decision — the suite is
**separate apps that hand off to each other**, fronted by this launcher, _not_ a single-page
shell that owns every tool's state
([ARCHITECTURE §11](../../docs/ARCHITECTURE.md#11-the-launcher-unified-menu-without-a-unified-shell)).

Deployed at the suite's **top-level GitHub Pages URL**; each app keeps its own independent
deploy underneath.

## Running

```bash
pnpm --filter launcher dev      # Vite dev server
pnpm --filter launcher build    # static build into dist/
```

## What it is

A single `index.html` (dark theme, responsive card grid, `base: "./"`) with **no source
modules and no tests** — all content is inline. It renders one card per app:

- **Complex Dynamics** → `../complex-dynamics/`
- **Quadrature Domains** → `../quadrature-domains/`
- **Correspondences** → `../correspondences/`

Its only dependency is Vite (dev). It began as the Phase-0 stub and grows a card as each app
lands; the planned next step is a shared **navigation header** promoted into a `@cas/ui`
package (so each app can jump to its siblings, and offer "send this to <app>" hand-offs via
the [`@cas/interchange`](../../packages/interchange) deep-link codec) — deferred until that
package is warranted.

> The inter-app links resolve against the deployed Pages layout (sibling `apps/*` dirs). When
> running a single app's dev server in isolation they won't resolve — launch each app with
> its own `pnpm --filter <app> dev` during development.
