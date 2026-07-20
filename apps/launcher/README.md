# Launcher

The suite's **unified menu**: a small static landing page that lists the tools and links to
each. This is the "menu to select between apps" half of the topology decision — the suite is
**separate apps that hand off to each other**, fronted by this launcher, _not_ a single-page
shell that owns every tool's state
([ARCHITECTURE §11](../../docs/ARCHITECTURE.md#11-the-launcher-unified-menu-without-a-unified-shell)).

Sits at the suite's **top-level GitHub Pages URL** with each published app under a subpath beneath
it. `.github/workflows/deploy-pages.yml` publishes on every push to `master`, assembling one
combined site — apps build independently but publish *together*, as a single artifact. See
[ARCHITECTURE §8](../../docs/ARCHITECTURE.md#8-build--deployment-model).

## Running

```bash
pnpm --filter launcher dev      # Vite dev server
pnpm --filter launcher build    # static build into dist/
```

## What it is

A single `index.html` (dark theme, responsive card grid, `base: "./"`) with **no source
modules and no tests** — all content is inline. It renders one card per app:

- **Complex Dynamics** → `complex-dynamics/`
- **Quadrature Domains** → `quadrature-domains/`
- **Correspondences** — a non-linking "Coming soon" card. The app is built by the deploy
  workflow for CI parity but is **not copied into the published site**, so it deliberately has
  no href. Publishing it means adding one `cp` to the assemble step and turning the card into
  an `<a>`.

Its only dependency is Vite (dev). It began as the Phase-0 stub and grows a card as each app
lands; the planned next step is a shared **navigation header** promoted into a `@cas/ui`
package (so each app can jump to its siblings, and offer "send this to <app>" hand-offs via
the [`@cas/interchange`](../../packages/interchange) deep-link codec) — deferred until that
package is warranted.

> The inter-app links resolve against the deployed Pages layout — apps sit at subpaths *beneath*
> the launcher's own root, not as siblings of it, which is why the hrefs carry no `../`. When
> running a single app's dev server in isolation they won't resolve — launch each app with
> its own `pnpm --filter <app> dev` during development.
