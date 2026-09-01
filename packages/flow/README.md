# @cas/flow

The **conformal-transplant flow kernel** — the shared engine behind the three apps that split out of
the original `2d-electrostatics` (ADR-0036): **2D Electrostatics** (the sandbox + airfoil + polygon
transplant), **Hele-Shaw Flow** (the twist + droplet evolvers), and **Potential Theory** (the conductor
view). All three carry flow *past or inside* a shape by carrying flow past or inside the unit disk
through a conformal map, so the "transplant" machinery is one thing they must share — not copy.

Extracted whole from the pre-split app on the ADR-0007 second-consumer rule (the split *is* the second
consumer). Convention-neutral (ADR-0006): no π / 2πi normalization lives here.

## What's in it

| Module               | Role |
| -------------------- | ---- |
| `transplant.ts`      | The closed-form **reference flows**. Past the unit disk: `refPotential` / `refVelocity` (uniform stream at angle α + circulation Γ) and `invertToExterior` (the exact Γ = 0 root, Newton-polished for Γ ≠ 0). Inside it: `inletPorts` + `sourceSinkNet` (a boundary source→sink pair, whose streamlines are circle arcs — the wall stays a streamline). `flowNet` builds the ζ-plane level curves; `pushforward` maps a curve forward through any Ψ; `unitCircle` is the reference body. |
| `polygonMap.ts`      | The **@cas/conformal glue**. `fitPolygonFlow` fits the EXTERIOR Schwarz–Christoffel map Ψ: 𝔻\* → ext(K) of a bounded polygon and sums its Laurent-at-∞ series into a forward evaluator; `fitPolygonInterior` fits the INTERIOR map f: 𝔻 → K (precise, falling back to the lightning fit). `fitHonestyTier` maps a fit's `converged`/`degraded`/`residual` to `exact` (`=`) / `approx` (`≈`) / `unreliable` (`⚠`). |
| `transplantPresets.ts` | The counter-clockwise bounded-polygon presets `K` (triangle … L-shape) the transplant pages offer. |
| `net2d.ts`           | A small 2D-canvas line-art drawer (`Net2D` + `boundsOf`) for the transplant panes: world→pixel with y up, breaking a polyline at any non-finite / blown-up vertex. DOM-only; the base tsconfig's DOM lib covers it. |

## Consuming it

Source-exports (`"exports": { ".": "./src/index.ts" }`) — no build step; the suite's Vite/Vitest
bundlers resolve `src/*.ts` directly, like `@cas/conformal` and `@cas/ui`.

```ts
import { flowNet, pushforward, fitPolygonFlow, POLYGON_PRESETS, Net2D, type Pt } from "@cas/flow";
```

Depends on `@cas/conformal` (the SC engines) only.
