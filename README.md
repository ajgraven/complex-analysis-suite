# Complex Dynamics Visualization Tool

An interactive, GPU-accelerated visualizer for the complex dynamics of a
parametrized family of functions `f(z, c)`. It renders two linked plots side by
side:

- **Parameter space** — the set of parameter values `c` (e.g. the Mandelbrot
  set for `f(z, c) = z² + c`), coloured by escape time.
- **Dynamical plane** — the orbit/escape-time picture (a Julia-style set) for
  the currently selected `c`.

A draggable white point in the parameter space sets `c`; the dynamical plane
updates in real time as you drag it. A draggable point in the dynamical plane
sets the orbit start `z₀`, whose first several iterates are drawn as a polyline.

Built on [CindyJS / CindyGL](https://cindyjs.org).

## Running

```bash
npm install
npm run dev        # start the Vite dev server (http://localhost:5173)
```

Other scripts:

| Script            | Purpose                       |
| ----------------- | ----------------------------- |
| `npm run build`   | Production build into `dist/` |
| `npm run preview` | Serve the production build    |
| `npm test`        | Run the Vitest unit suite     |
| `npm run lint`    | ESLint over `src/` and config |
| `npm run format`  | Format with Prettier          |

CindyJS/CindyGL are vendored under `public/vendor/cindyjs/` and loaded as global
`<script>` tags, so the app runs standalone with no external asset dependency.

## How it works

Each pixel is coloured by **escape time**: the number of iterations of
`f(z, c)` needed before `escape(z, c)` first returns true (capped at `n`).
Pixels that never escape are coloured black. The colouring function maps escape
time to an RGB ramp.

- The **parameter-space** iterator runs `z₀ = c, z ↦ f(z, c)` for each candidate
  `c` (it iterates from the critical/initial point with the pixel as `c`).
- The **dynamical-plane** iterator runs `z₀ = pixel, z ↦ f(z, c)` for the fixed
  selected `c`.

The heavy per-pixel iteration runs on the GPU via CindyGL's `colorplot`.

## Presets

Presets live in [`src/presets.ts`](src/presets.ts) as two dictionaries
(`paramPresets`, `dynPresets`) sharing the same keys. Each entry is a `Preset`:

| Field    | Meaning                                                  |
| -------- | -------------------------------------------------------- |
| `f`      | Iteration function `f(z, c)` (CindyScript expression)    |
| `c`      | Parameter value, a complex literal like `-.7-.4*i`       |
| `n`      | Maximum iterations per pixel                             |
| `nplot`  | Number of orbit iterates to draw                         |
| `escape` | Escape predicate `escape(z, c)` (CindyScript expression) |
| `zoom`   | Default zoom level                                       |
| `center` | Plot centre `[x, y]`                                     |
| `z0`     | Orbit start point (dynamical-plane presets only)         |

Included presets: Mandelbrot set, tricorn, burning ship, butterfly,
exponential map, teardrop Schwarz, exp Schwarz.

### Supported CindyScript objects

- **Constants:** `e`, `pi`, `i`.
- **Operations:** `z*w`, `z^w`, `z+w`, `z-w`, `z/w`, `|z|`, `sqrt`, `exp`,
  `log`, `sin`, `cos`, `tan`, `arcsin`, `arccos`, `arctan`, `arctan2(x,y)`,
  `lambertw`, `re`, `im`, `conjugate`, `arg`, `mod(x,y)`, `round`, `floor`,
  `ceil`.
- **Misc:** `random(x)`, `randomint(n)`, `randombool()`.

`lambertw` is a custom complex implementation; see
[`src/cindyscript/mathlib.ts`](src/cindyscript/mathlib.ts).

## Controls

- Move the plot window with the **arrow keys** or by click-dragging the
  background.
- Zoom with the **+/- keys**.
- Drag the **white point** in either plot to change its value.
- Press **Enter** (or the **apply changes** button) to apply edits to the
  input fields.

## Architecture

```
index.html                  Vite entry; markup only (no inline styles/handlers)
public/vendor/cindyjs/      Vendored, version-pinned CindyJS + CindyGL + CSS
src/
  main.ts                   Entry: builds both plots, wires controls, exposes
                            the runtime-global surface CindyScript needs
  fractalPlot.ts            FractalPlot class (owns one CindyJS instance)
  presets.ts                Preset type + the two preset dictionaries
  complex.ts                Complex-number parse / format
  transforms.ts             Canvas <-> plot coordinate transforms (JS side)
  arrays.ts                 2-vector helpers
  cindyscript/
    init.ts                 Builds the CindyScript init program
    handlers.ts             Builds the move/keydown/drag event scripts
    mathlib.ts              Shared CindyScript definitions (lambertw, ...)
  ui/
    controls.ts             Typed read/write over the control inputs
    dom.ts                  Small typed DOM helpers
  types/cindyjs.d.ts        Ambient types for the CindyJS API used here
  styles/main.css           Stylesheet (CSS grid, responsive)
test/                       Vitest unit tests (pure modules)
```

**The CindyScript global boundary.** CindyJS evaluates `javascript("…")`
callbacks in the global (`window`) scope at runtime. `main.ts` therefore exposes
exactly the symbols those callbacks reference (`dynamicalPlot`, `parameterPlot`,
`scaleArray`, `formatComplex`, and the `set*Input` helpers) on `window`. This is
the one intentional global surface; everything else is module-scoped.

**Coordinate transforms exist twice** — once in JavaScript
([`src/transforms.ts`](src/transforms.ts)) and once in CindyScript
([`src/cindyscript/init.ts`](src/cindyscript/init.ts)). They must agree; the
inverse property of the JS pair is covered by `test/transforms.test.ts`.

## Deployment

```bash
npm run build      # outputs static files to dist/
npm run preview    # sanity-check the build locally
```

The Vite config sets `base: "./"`, so all asset URLs in the build are
**relative** — `dist/` works whether it's served from a domain root or a
sub-path (e.g. a GitHub Pages project site at `/ComplexDynamicsJS/`). The
vendored CindyJS assets and favicon are copied into `dist/` automatically.

To publish on **GitHub Pages**, serve the contents of `dist/` (for example via a
`gh-pages` branch or a Pages GitHub Action that runs `npm ci && npm run build`
and uploads `dist/`). No extra path configuration is needed because the base is
already relative.

## Troubleshooting

| Symptom                                 | Likely cause / fix                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Both canvases are blank                 | WebGL unavailable or disabled in the browser. CindyGL requires WebGL; check the console for context-creation errors.                       |
| `404` for `/vendor/cindyjs/*.js`        | Run via `npm run dev` / `npm run preview` (assets are served from `public/`). Opening `index.html` directly off the filesystem won't work. |
| Dragging the `c` point does nothing     | A CindyScript callback references a symbol that isn't on `window` — see the `window` boundary note in [CONTRIBUTING](CONTRIBUTING.md).     |
| `npm run dev` fails: port 5173 in use   | The port is pinned (`strictPort`). Stop the other process or change `server.port` in `vite.config.ts`.                                     |
| A preset renders but the orbit is wrong | The escape predicate diverges from `f`; check the preset's `escape` expression in `src/presets.ts`.                                        |

## Known limitations

- **Export resolution:** saved images use the canvas resolution (500×500), not
  the value in the resolution field. The resolution field controls the GPU
  render-image quality, not the exported PNG size. (CindyGL's `exportPNG` simply
  serializes the canvas via `toDataURL()`.)
- **Deep zoom accuracy:** GPU single-precision limits accuracy past a certain
  zoom depth.
- **`npm audit`:** the only reported advisories are in dev-only tooling
  (esbuild/Vite dev server). `npm audit --omit=dev` reports zero — nothing ships
  to production.

## CindyJS version

CindyJS and CindyGL are vendored (pinned) under `public/vendor/cindyjs/` from
the build distributed with the author's site (April 2025). Replace those three
files to upgrade.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add a preset, extend the
CindyScript, add a control, and the pre-PR checklist — plus the one runtime
gotcha (the CindyScript `window` boundary).

## License

MIT — see [LICENSE](LICENSE). Bundled CindyJS/CindyGL are Apache-2.0.
