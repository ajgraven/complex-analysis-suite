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

Built on a hand-written **WebGL2** engine with no rendering dependencies: a small
compiler turns the editable `f(z, c)` / `escape(z, c)` expressions into GLSL
fragment shaders, with an emulated double-float (df64) path for deep zoom.

## Running

```bash
npm install
npm run dev        # start the Vite dev server (http://localhost:5173)
```

Other scripts:

| Script              | Purpose                        |
| ------------------- | ------------------------------ |
| `npm run build`     | Production build into `dist/`  |
| `npm run preview`   | Serve the production build     |
| `npm test`          | Run the Vitest unit suite      |
| `npm run lint`      | ESLint over `src/` and config  |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm run format`    | Format with Prettier           |

The app has no runtime dependencies — everything is bundled by Vite. CI (GitHub
Actions, [`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs lint,
typecheck, tests, and build on every push and pull request.

## How it works

Each pixel is coloured by **escape time**: the number of iterations of
`f(z, c)` needed before `escape(z, c)` first returns true (capped at `n`).
Pixels that never escape are coloured black. The colouring function maps escape
time to an RGB ramp.

- The **parameter-space** iterator runs `z₀ = c, z ↦ f(z, c)` for each candidate
  `c` (it iterates from the critical/initial point with the pixel as `c`).
- The **dynamical-plane** iterator runs `z₀ = pixel, z ↦ f(z, c)` for the fixed
  selected `c`.

The heavy per-pixel iteration runs on the GPU in a WebGL2 fragment shader,
generated per expression by the compiler in [`src/expr/`](src/expr/). The orbit
polyline is computed on the CPU by the same expression evaluator and drawn on a
2D overlay canvas stacked over the WebGL one.

Rendering is HiDPI-aware (the drawing buffer scales with `devicePixelRatio`,
capped at 2× to bound cost) and progressive: heavy or deep-zoom views draw a
quick coarse pass first and then refine to full resolution, so interaction stays
responsive.

## Presets

Presets live in [`src/presets.ts`](src/presets.ts) as two dictionaries
(`paramPresets`, `dynPresets`) sharing the same keys. Each entry is a `Preset`:

| Field    | Meaning                                             |
| -------- | --------------------------------------------------- |
| `f`      | Iteration function `f(z, c)` (an expression string) |
| `c`      | Parameter value, a complex literal like `-.7-.4*i`  |
| `n`      | Maximum iterations per pixel                        |
| `nplot`  | Number of orbit iterates to draw                    |
| `escape` | Escape predicate `escape(z, c)` (expression string) |
| `zoom`   | Default zoom level                                  |
| `center` | Plot centre `[x, y]`                                |
| `z0`     | Orbit start point (dynamical-plane presets only)    |

Included presets (grouped in the picker): Mandelbrot and cubic (`z³+c`);
the abs-variants tricorn, burning ship, butterfly, and celtic; the rational/logistic
magnet and lambda; the transcendental exponential map, teardrop Schwarz, and exp
Schwarz; and a biomorph.

### Supported expression objects

The `f` / `escape` expression language (a CindyScript-compatible subset) supports:

- **Constants:** `e`, `pi`, `i`.
- **Operators:** `+ - * / ^` (complex powers, principal branch), comparisons
  `> < ==`, and `if(cond, a, b)`, `not(...)`, `true`/`false`.
- **Functions:** `sqrt`, `exp`, `log`, `sin`, `cos`, `tan`, `arcsin`, `arccos`,
  `arctan`, `arctan2(x,y)`, `lambertw`, `re`, `im`, `conjugate`, `abs`, `arg`,
  `mod(x,y)`, `round`, `floor`, `ceil`.
- **Statements:** `;`-separated, with local assignment (e.g. `u=…; …; result`).
  The `escape` predicate may call `f(z, c)`.
- **Variables:** `z` and `c`, plus a live parameter **`a`** — when `f` (or `escape`) uses
  `a` as a free variable, a slider appears under the formula to sweep it in real time
  (e.g. `a*z*(1-z)`). A local assignment to `a` shadows the parameter as usual.

`lambertw` is a custom complex implementation (a seeded approximation refined by
Halley steps); the principal `log`/`sqrt`/`pow` branches match the original
CindyScript. The compiler emits both GLSL (for rendering) and a JS evaluator (for
the orbit and tests) from one AST — see [`src/expr/`](src/expr/).

## Controls

- Move the plot window with the **arrow keys** or by click-dragging the
  background.
- Zoom with the **+/- keys** or the **mouse wheel** (zooms toward the cursor).
- Drag the **white point** in either plot to change its value (the cursor shows
  a grab affordance over it); the complex coordinate under the cursor is shown
  beneath each plot.
- Press **Enter** (or **apply changes**) to apply edits to the input fields;
  **reset** reverts every option (including colouring) to the selected preset.
- Choose a colour scheme with the **coloring** control — see
  [Colouring](#colouring).
- The entered **f(z, c)** is typeset live (KaTeX) beneath the formula input, and the
  **tour** button runs a short guided walkthrough of the interface.
- The **Theme** button cycles auto / dark / light (auto follows your OS colour scheme);
  the choice is remembered across visits.
- When `f` uses the free variable **`a`**, an `a` slider appears under the formula — drag
  it to sweep a live parameter and watch the fractal change.
- **Auto iterations** raises the iteration cap automatically as you zoom in, so deep
  views keep their detail; and the renderer recovers automatically if the WebGL
  context is lost.

## Saving images

Each plot has **Save** (download a PNG) and **Copy** (copy a PNG to the
clipboard) buttons in the Downloads panel, with two adjacent controls:

- **Size** — the output resolution in pixels (e.g. `2000`, `4000`, `8000`). The
  plot is re-rendered off-screen at this size and downloaded as a PNG at full
  detail; the on-screen plots are untouched. Sizes beyond the GPU's maximum
  texture size are disabled automatically. The `screen (500)` option matches the
  on-screen canvas.
- **overlays** — when ticked, the exported image includes the orbit polyline,
  white point, and coordinate label (sized to the chosen resolution); when
  unticked, you get a clean fractal-only image.
- **scale bar** — when ticked, the exported image gets a scale bar (bottom-left)
  labelled with its width in plot coordinates, so a shared image carries its zoom
  scale. Independent of **overlays**, so you can add it to a clean image.

The renderer draws into an off-screen RGBA8 framebuffer in horizontal strips
([`GLPlot.renderToImageData`](src/render/glPlot.ts)) — full detail at the requested
size (no render-image cap), shown behind a progress bar with a **Cancel** button so
large exports stay responsive. The scaled overlay is composited on top, then
downloaded ([`PlotView.exportPng`](src/render/plotView.ts)) or copied to the
clipboard ([`PlotView.copyPng`](src/render/plotView.ts)).

## Animation

The Downloads panel records short **WebM** clips (`MediaRecorder` over the canvas'
`captureStream`, no dependency — the GL canvases use `preserveDrawingBuffer` so the
capture isn't black):

- **Record Julia morph** sweeps the parameter `c` around a small circle about the
  current point, morphing the dynamical plane.
- **Record zoom-in** zooms into the parameter plane (log-interpolated) from the current
  view — navigate onto some structure first.

Frames are forced to full resolution during capture. Keep the tab focused while
recording (the loop is paced by `requestAnimationFrame`). See
[`src/ui/recorder.ts`](src/ui/recorder.ts).

## Colouring

Several shared controls drive how the plots are coloured (defaults reproduce the
classic look; all are shader uniforms, so switching never recompiles):

- **Coloring (mode)** — how each pixel is coloured:
  - _Escape time_ — discrete escape-time bands (the classic look).
  - _Escape time (smooth)_ — continuous escape time (no banding); applies to
    magnitude-divergence escapes (`abs(z) > R`), otherwise falls back to discrete.
  - _Escape time (histogram)_ — histogram-equalised escape time, so colours cover
    roughly equal area regardless of the iteration cap.
  - _Distance (edges)_ — a screen-space distance estimate that highlights the
    boundary and filaments.
  - _Orbit trap_ — colours by how close the orbit passes to the axes.
  - _Stripe average_ — average of `½ + ½·sin(s·arg z)` over the orbit (smoothed),
    the classic radial "stripe" filaments; works for any `f`.
  - _Triangle average_ — triangle-inequality average (exact for `z² + c`,
    approximate for other `f`), giving flame-like filaments.
  - _Binary decomposition_ — escape-time bands split by the escape half-plane.
  - _Period (interior)_ — colours non-escaping points by their attracting-cycle
    period, revealing the hyperbolic components (cardioid, bulbs).
  - _Domain colouring_ — hue = arg, brightness = magnitude of one application of
    `f(z, c)` (most meaningful on the dynamical plane; ignores the palette).
- **Palette** — Classic, Viridis (colourblind-safe), Magma, Grayscale, or a
  **Custom gradient** — an editable colour-stop ramp (drag/add/remove stops on the
  preview bar, randomise, import/export JSON). Applies to the scalar modes.
- **Rotation** — rotates the palette through the colours (colour cycling); applies
  to every palette.
- **Anti-aliasing** — Off / 2× / 3× supersampling, on full-resolution renders only
  (disabled during interaction for responsiveness).
- **Smooth (idle AA)** — while the view sits still, accumulates jittered sub-pixel
  samples into a float buffer and shows their running average, converging to a much
  cleaner image over a few frames at no interaction cost. Needs float render targets
  (`EXT_color_buffer_float`); falls back to the normal render if unsupported.
- **Relief lighting** — an optional toggle that shades the fractal as a lit 3-D
  surface (azimuth / elevation / depth sliders). The surface normal is taken from
  the screen-space gradient of the escape-time field, so it works for any `f`; it
  applies to the escape-based modes (not domain colouring) and is skipped during
  interaction for responsiveness.
- **Post-processing** — an optional final fullscreen pass adding a vignette and
  output gamma. On-screen only for now: exported PNGs include lighting (it lives in
  the fractal shader) but not this grade.
- **Boundary outline** — an optional overlay that darkens the set boundary
  (screen-space, from the escape-field gradient) with a width slider; composes with
  any escape-based mode.

## Overlays

Beyond the colouring, the 2D overlay visualises the dynamics directly:

- **Orbit + fate** — the white point's orbit is drawn and classified by its long-run
  fate (escaped / fixed point / period-_p_ cycle / bounded); the polyline and its dots
  are colour-coded and the fate is shown in the label. On the parameter plane this reads
  as "is _c_ in the set?"; on the dynamical plane it's the chosen start point's dynamics.
- **Critical orbit** — an optional dashed overlay of the critical point's orbit (0 for the
  polynomial presets). A bounded critical orbit means the Julia set is connected; an
  escaping one means it is a Cantor dust.
- **Equipotential** — an optional shader overlay of escape-potential contours (a
  topographic "escape-velocity" map), with a density slider.

## Newton's method

Tick **Newton's method** to iterate the Newton map `z − f/f'` instead of `f` (the
current `f` is read as the polynomial whose roots are sought) and colour by
convergence — e.g. `f = z^3 - 1` gives the classic root-basin fractal. The
derivative is computed symbolically
([`src/expr/derivative.ts`](src/expr/derivative.ts)); it's available for holomorphic
`f` and reports a clear error for non-holomorphic builtins (`abs`, `re`, `im`, …).

## Architecture

```
index.html                  Vite entry; markup only (no inline styles/handlers)
src/
  main.ts                   Entry: builds both plots, wires controls + coupling
  presets.ts                Preset type + the two preset dictionaries
  complex.ts                Complex-number parse / format
  transforms.ts             Canvas <-> plot coordinate transforms
  arrays.ts                 2-vector helpers
  hiResExport.ts            Engine-agnostic export helpers (clamp, filename, ...)
  expr/                     The f / escape expression compiler
    lexer.ts parser.ts ast.ts   Source -> AST
    glsl.ts                 AST -> GLSL (abstract complex ops)
    evaluate.ts complexJs.ts    AST -> value (JS doubles); orbit + tests
  glsl/                     GLSL stdlib (TS modules exporting shader source)
    complexSingle.glsl.ts   Single-precision base ops (vec2)
    df64.glsl.ts complexDf64.glsl.ts   Double-float base ops (vec4) + df64Ref.ts
    complexDerived.glsl.ts  Precision-agnostic cpow / lambertw / inverse trig
  render/
    shaderBuilder.ts        Assembles the fragment shader (stdlib + f/escape + loop)
    glPlot.ts               GLPlot: WebGL2 renderer + state (single + df64 programs)
    overlay.ts              Orbit polyline / point / label on a 2D overlay canvas
    plotView.ts             GLPlot + overlay + native pointer/keyboard interaction
  ui/
    controls.ts             Typed read/write over the control inputs
    dom.ts                  Small typed DOM helpers
  styles/main.css           Stylesheet (CSS grid, responsive)
test/                       Vitest unit tests (pure modules + the compiler)
```

**One AST, two backends.** The expression compiler parses `f`/`escape` once and
emits both a GLSL function (for the GPU render) and a JS evaluator (for the orbit
overlay and unit tests) in terms of abstract complex ops (`cmul`, `cexp`, …). The
GLSL stdlib provides those ops in two precisions behind the same names, so the
compiled shader code is precision-agnostic; `GLPlot` compiles a single- and a
df64-precision program and selects df64 only once the zoom passes a threshold.

**Deep zoom (df64).** Single-precision GPU floats pixelate past ~10⁴× zoom. The
df64 path represents each real as a hi+lo float pair (~double precision) using
error-free transforms; a `* uOne` uniform barrier stops the shader compiler from
reassociating those transforms away. The algorithms are validated against a JS
`Math.fround` reference (`test/df64.test.ts`).

**Perturbation (deep zoom, z²+c).** For the Mandelbrot map on the parameter plane,
the **perturbation (deep zoom)** toggle goes deeper than df64. The CPU iterates one
high-precision _reference orbit_ at the view centre; the GPU then renders every pixel
as a small delta around it (`z = Z + δz`, `δz' = 2·Z·δz + δz² + δc`) in ordinary
single-float arithmetic — fast, and limited by the reference precision rather than the
GPU's. The view centre is carried in **double-double** precision (`src/render/dd.ts`,
~31 digits) and the reference orbit is iterated at that centre, so views stay locatable
to ~10²⁸×; both are unit-tested (`test/perturbation.test.ts`, `test/dd.test.ts`). Both
planes are eligible for z²+c — the Mandelbrot set (parameter plane) and its Julia sets
(dynamical plane); other maps fall back to df64.

## Deployment

```bash
npm run build      # outputs static files to dist/
npm run preview    # sanity-check the build locally
```

The Vite config sets `base: "./"`, so all asset URLs in the build are
**relative** — `dist/` works whether it's served from a domain root or a
sub-path (e.g. a GitHub Pages project site at `/ComplexDynamicsJS/`). The favicon
is copied from `public/` into `dist/` automatically.

To publish on **GitHub Pages**, serve the contents of `dist/` (for example via a
`gh-pages` branch or a Pages GitHub Action that runs `npm ci && npm run build`
and uploads `dist/`). No extra path configuration is needed because the base is
already relative.

## Troubleshooting

| Symptom                                          | Likely cause / fix                                                                                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Both canvases are blank                          | WebGL2 unavailable or disabled in the browser; check the console for context-creation or shader-compile errors.                                            |
| A custom `f` / `escape` won't render             | A parse/compile error; the renderer keeps the last good shader. Check the console for the message and fix the expression.                                  |
| Deep zoom briefly looks pixelated, then sharpens | The df64 shader compiles in the background on the first deep zoom; the view shows single precision and upgrades to full precision when the build finishes. |
| `npm run dev` fails: port 5173 in use            | The port is pinned (`strictPort`). Stop the other process or change `server.port` in `vite.config.ts`.                                                     |
| A preset renders but the orbit is wrong          | The escape predicate diverges from `f`; check the preset's `escape` expression in `src/presets.ts`.                                                        |

## Known limitations

- **Export size cap:** high-resolution export is bounded by the GPU's maximum
  texture size (commonly 4096–16384px); larger options are disabled in the size
  dropdown. See [Saving images](#saving-images).
- **Post-processing in exports:** relief lighting is included in exported images
  (it's part of the fractal shader), but the post-processing grade (vignette /
  gamma) is currently applied on-screen only.
- **Deep zoom depth:** the df64 path extends usable zoom to ~10¹²× (vs ~10⁴× for
  single precision); beyond that, df64 precision runs out and the image pixelates.
  For z²+c on the parameter plane, the **perturbation (deep zoom)** toggle goes
  further still (structure resolves where df64 has flattened). Its centre is tracked
  in double-double precision (≈10²⁸×); it has no glitch rebasing yet, so a view
  centred on a short-orbit exterior point can under-render, and a bignum reference
  (for 10¹⁰⁰⁺×) is planned next.
- **Heavy df64 shaders:** the first deep zoom of a transcendental-heavy preset
  (the Schwarz maps) compiles a large df64 shader. This now happens in the
  background (the view shows single precision and upgrades when ready), so it no
  longer freezes interaction; the compiled program is cached afterwards.
- **`npm audit`:** the only reported advisories are in dev-only tooling
  (esbuild/Vite dev server). `npm audit --omit=dev` reports zero — nothing ships
  to production.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add a preset, add a function to
the expression language, change the colouring, add a control, and the pre-PR
checklist — plus the two gotchas (keeping the GLSL/JS backends in sync and the
df64 reference/barrier).

## License

MIT — see [LICENSE](LICENSE).
