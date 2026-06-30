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

The rendering engine has no dependencies (hand-written WebGL2); a few small libraries
power peripheral features (KaTeX for formula typesetting, driver.js for the tour, gif.js
for GIF export), all bundled by Vite. CI (GitHub Actions,
[`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs lint, typecheck, tests, and
build on every push and pull request.

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
the abs-variants tricorn, multicorn (`z̄³+c`), burning ship, butterfly, and celtic; the rational/logistic
magnet, lambda, and two **rational families** ((`z²+c)/(1+cz²)` and `(z²+c)/(1−z²)`); the
transcendental exponential map, teardrop Schwarz, and exp Schwarz; and a biomorph.

The **rational families** illustrate maps whose ∞ is _not_ a superattracting fixed point: orbits
converge to finite attracting cycles rather than escaping, so escape-time colouring is blank and they
open in the **period** colouring (which detects the attracting cycle and reveals the Fatou structure).
Their free finite critical point is 0, so the parameter plane tracks the orbit of 0 exactly like
`z²+c`. Critical points of any rational `f` come from
[`findRationalCriticalPoints`](src/render/critical.ts) (roots of the numerator of `f′`, via
Durand–Kerner), and the inspector reports their attracting cycles and multipliers unchanged.

A few use non-textbook conventions, noted here for honesty: **tricorn** and **celtic**
are faithful (`conj(z)²+c` and `|Re(z²)|+i·Im(z²)+c`); **burning ship** is parameterised
with `−c` (intentional — it places the classic ship at a positive centre); **magnet** is
Magnet I (`((z²+c−1)/(2z+c−2))²`) and escapes on either divergence (`|z|>3`) or
convergence to its fixed point `z=1`; **lambda** is the logistic `c·z(1−z)`; and
**butterfly**, **teardrop Schwarz**, and **exp Schwarz** are custom maps (the "Schwarz"
names are decorative — they are not Schwarz-triangle maps).

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
- On a **touch screen**, one finger pans (or drags the white point) and a
  **two-finger pinch** zooms toward the gesture midpoint (lift to one finger
  mid-pinch and it continues as a pan); a **double-tap** zooms in toward the tap.
  On a phone the layout becomes single-column with finger-sized controls, and the
  settings open in a **bottom sheet** (the floating _Controls_ button) so the plot
  stays visible while you adjust them. The desktop layout is unchanged.
- **Accessibility:** each plot is keyboard-focusable (`Tab` to it, then arrow keys
  pan, +/− zoom, and **Enter** sets the point — `c` or `z₀` — to the view centre and
  opens the inspector) and exposes an ARIA label; a visually-hidden live region
  announces the view (centre/zoom) and the parameter `c` to screen readers as they
  change.
- Press **Enter** (or **apply changes**) to apply edits to the input fields — while
  edits are pending the changed fields are highlighted, an "unapplied edits" hint shows,
  and the Apply button is ringed; **reset** reverts every option (including colouring) to
  the selected preset.
- Below each plot a compact row shows its **iterations**, **canvas size (px)**, **centre**, and
  **zoom** — edit any and press **Enter** or the plot's **apply** button (it lights up when there
  are unapplied edits). The escape test, **c**, and **Copy coordinates** (full-precision `c` / centre
  / zoom to the clipboard) sit under **more ▾**. A caption under each plot names the coupling and
  shows the live **c** shared by both planes.
- **↶ undo / ↷ redo** (or **Ctrl+Z** / **Ctrl+Y**) step through your recent changes —
  formula, view, colouring, and toggles — as a single history.
- Choose a colour scheme with the **coloring** control — see
  [Colouring](#colouring).
- The entered **f(z, c)** is typeset live (KaTeX) beneath the formula input, and the
  **tour** button runs a short guided walkthrough of the interface.
- The top **app bar** holds the global actions: **Theme**, **tour**, **Glossary**, **Share
  link**, and a **Views ▾** menu. **Glossary** opens an in-app reference of the
  complex-dynamics terms and the app's non-textbook conventions; inline **?** links beside
  the inspector readouts and overlay labels jump straight to the relevant entry.
- The **Theme** button cycles auto / dark / light (auto follows your OS colour scheme);
  the choice is remembered across visits.
- On a wide screen, **Stack plots** switches the two plots from side-by-side to a vertical stack
  (each much larger), **Hide controls** collapses the sidebar so the plots fill the width, and each
  plot's **⤢ expand** button maximises just that plot (the other plot and the sidebar hide; **Esc**
  or the button restores). Stack / Hide remember your choice across visits. In any of these enlarged
  modes a **drag-grip in each plot's bottom-right corner** lets you resize that plot (drag, or focus
  it and use the arrow keys) — handy for shrinking stacked plots so both fit on screen. The plots fill
  the freed space at the current render resolution — raise a plot's **canvas px** if a very large view
  looks soft.
- **Share link** copies a URL whose hash encodes the current view — formula, both planes'
  centre/zoom/iterations, colouring mode/palette, every toggle, the dynamical orbit start
  z₀, and the custom-gradient stops — so opening it reproduces the view. Deep-zoom centres are
  captured at full double-double precision, so even views past the float64 zoom limit reproduce
  exactly.
- Under the **Views ▾** menu: **Save view** stores the current view under a name (in the
  browser); pick it from the **Saved views** dropdown to restore it, or **Delete** to
  remove it. Saved views persist across visits (localStorage) and capture the same state
  as a share link.
- The **Places…** dropdown flies the parameter plane to a famous spot in the Mandelbrot set
  (Seahorse Valley, Elephant Valley, the Triple Spiral, the Feigenbaum point, a Misiurewicz
  point …); it sets `f = z²+c` and the centre/zoom, leaving your colouring as-is, and is
  undoable like any other view change.
- When `f` uses the free variable **`a`**, an `a` slider appears under the formula — drag
  it to sweep a live parameter and watch the fractal change.
- **Auto iterations** raises the iteration cap automatically as you zoom in, so deep
  views keep their detail. The cap grows logarithmically with zoom — a roughly constant
  number of extra iterations per decade of magnification — and a **strength** slider sets
  how aggressively. While it's on, the effective count actually in use is shown next to each
  plot's iterations box (it scales by that plane's own zoom). The renderer also recovers
  automatically if the WebGL context is lost.

## Saving images

Each plot has **Save** (download a PNG) and **Copy** (copy a PNG to the
clipboard) buttons in the **Export image** section, with two adjacent controls:

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

The **Animate** section records short **WebM** clips (`MediaRecorder` over the canvas'
`captureStream`, no dependency — the GL canvases use `preserveDrawingBuffer` so the
capture isn't black):

- **Record Julia morph** sweeps the parameter `c` around a small circle about the
  current point, morphing the dynamical plane.
- **Record zoom-in** zooms into the parameter plane (log-interpolated) from the current
  view — navigate onto some structure first.
- **Keyframe path** — capture parameter-plane views with **Add keyframe**, scrub between
  them with the slider, and **Record path** to save the interpolated fly-through (centre
  linear, zoom geometric).
- **GIF export** — **Morph GIF** and the keyframe **GIF** button encode the same
  animations to a downscaled animated GIF (gif.js, in web workers) for easy sharing.

Frames are forced to full resolution during capture. Keep the tab focused while
recording (the loop is paced by `requestAnimationFrame`). See
[`src/ui/recorder.ts`](src/ui/recorder.ts).

## Colouring

Several shared controls drive how the plots are coloured (the default is **Smooth**;
all are shader uniforms, so switching never recompiles):

- **Coloring (mode)** — how each pixel is coloured:
  - _Escape time_ — discrete escape-time bands (the classic look).
  - _Smooth (continuous)_ — continuous escape time (no banding); applies to
    magnitude-divergence escapes (`abs(z) > R`), otherwise falls back to discrete.
  - _Escape time (histogram)_ — histogram-equalised escape time, so colours cover
    roughly equal area regardless of the iteration cap.
  - _Distance (edges, screen-space)_ — a screen-space distance estimate that highlights
    the boundary and filaments.
  - _Distance (analytic)_ — the true exterior distance estimate `|z|·log|z| / |z′|` from
    the running derivative, giving razor-sharp, resolution-independent filaments. Only for
    holomorphic `f` (the option is disabled for abs-maps like Burning Ship, under Newton,
    and under perturbation — use the screen-space estimate there).
  - _Orbit trap_ — colours by the orbit's closest approach to a chosen **trap shape**
    (a "trap shape" dropdown appears): cross (the axes), point (the origin), line (the
    real axis), circle (|z|=1), or a Gaussian-integer lattice. Switching shape is a
    shader-uniform change (no recompile) and works for any `f`.
  - _Stripe average_ — average of `½ + ½·sin(s·arg z)` over the orbit (smoothed),
    the classic radial "stripe" filaments; works for any `f`.
  - _Triangle average_ — triangle-inequality average (exact for `z² + c`,
    approximate for other `f`), giving flame-like filaments.
  - _Binary decomposition_ — escape-time bands split by the escape half-plane.
  - _Period (interior)_ — colours non-escaping points by their attracting-cycle
    period, revealing the hyperbolic components (cardioid, bulbs).
  - _Multiplier map (interior)_ — colours non-escaping points by the attracting-cycle
    **multiplier** `λ = ∏ f′`: hue = arg λ (the internal angle), brightness fading from
    white at the superattracting centre to dark toward the component boundary (|λ| → 1);
    escaping points keep the smooth escape-time palette (the classic "internal coordinates"
    look). Needs a holomorphic `f`.
  - _Distance (interior)_ — the interior counterpart of exterior distance estimation: for `c`
    inside a hyperbolic component (z²+c, parameter plane) it estimates the distance to that
    component's boundary, carving the flat interior into a smooth relief (brightest deep inside,
    fading to 0 at the edge). Pairs with relief / normal-map lighting; z²+c parameter plane only.
  - _Marty (Julia-set normality)_ — colours by the spherical derivative
    `|（f^k)′(z₀)| / (1 + |z_k|²)`, which grows on the Julia set (where the family `{f^k}` fails
    to be normal) and stays small in the Fatou set, so it lights up the Julia set. A useful
    alternative to distance estimation where the Böttcher-based colourings are weak. Needs a
    holomorphic `f`.
  - _Newton basins (by root)_ — hue = arg of the value the orbit ends on; under **Newton's
    method** that value is the root each pixel converges to, so the basins of different roots
    take distinct hues (the classic multi-coloured Newton fractal). Brightness = convergence
    speed.
  - _Domain colouring_ — hue = arg, brightness = magnitude of one application of
    `f(z, c)` (most meaningful on the dynamical plane; ignores the palette).
- **Palette** — Classic, Viridis and Cividis (both colourblind-safe), Magma,
  Grayscale, or a **Custom gradient** — an editable colour-stop ramp (drag/add/remove
  stops on the preview bar, randomise, import/export JSON). Applies to the scalar modes.
- **Rotation** — rotates the palette through the colours (colour cycling); applies
  to every palette.
- **Anti-aliasing** — Off / 2× / 3× supersampling, on full-resolution renders only
  (disabled during interaction for responsiveness).
- **Refine while idle** — while the view sits still, accumulates jittered sub-pixel
  samples into a float buffer and shows their running average, converging to a much
  cleaner image over a few frames at no interaction cost. Needs float render targets
  (`EXT_color_buffer_float`); falls back to the normal render if unsupported.
- **Relief lighting** — an optional toggle that shades the fractal as a lit 3-D
  surface (azimuth / elevation / depth sliders). For holomorphic `f` the surface normal
  comes from the **analytic** running derivative (`z/z′`), which stays sharp at any zoom;
  for abs-maps and other non-holomorphic `f` it falls back to the screen-space gradient of
  the escape-time field. Applies to the escape-based modes (not domain colouring) and is
  skipped during interaction for responsiveness.
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
  `zⁿ+c` family, ½ for lambda; a custom `f` is assumed to have its critical point at 0).
  A bounded critical orbit means the Julia set is connected; an escaping one means it is a
  Cantor dust.
- **Equipotential** — an optional shader overlay of escape-potential contours (a
  topographic potential map — the Green's function G = log|φ|), with a density slider.
- **Farey bulb labels** — on the Mandelbrot parameter plane, label the hyperbolic
  components attached to the main cardioid by their internal angle _p_/_q_ (½ at the
  period-2 neck, ⅓ and ⅔ for the period-3 bulbs …), placed at the attachment point
  `c = μ/2 − μ²/4`, `μ = e^{2πi·p/q}`. Finer fractions appear as you zoom in; the option
  is available only for `z²+c`.
- **External rays** — enter an external angle (a fraction like `1/3`, `1/7`, or a decimal in
  turns) and trace its ray on both planes: the **parameter ray** of the Mandelbrot set and
  the **dynamic ray** of the current Julia set, drawn by Newton continuation of the Böttcher
  coordinate. The angle-`0` ray lands at the cusp `c = 1/4`, `1/2` at the antenna tip
  `c = −2`, and `1/7`, `2/7` at the period-3 bulb neck. Available for `z²+c`; double-precision,
  so it is accurate at shallow-to-moderate zoom (deep-zoom rays would need extended precision).
- **Bulb ray pairs** — a toggle that draws, for every visible Farey bulb, the **two** external
  parameter rays landing at its root — the angles bounding the bulb's wake (⅓ and ⅔ at the
  period-2 neck, 1/7 and 2/7 for the ⅓ bulb …). It pairs with the Farey labels (same visible
  set); parameter plane, `z²+c` only.
- **Point inspector** — click either plot (or drag its white point) to open a small report
  on that point's orbit: its fate, the attracting-cycle **period**, the cycle **multiplier**
  `λ = ∏ f′` (magnitude, argument, and attracting/repelling/indifferent), the **Fatou-component
  type** (attracting / superattracting / parabolic / **Siegel** disc / **Cremer** — an
  indifferent cycle is split by its rotation number θ = arg λ/2π through the Brjuno test, with
  an estimated disc radius), the **internal angle** _p_/_q_ (the bulb's combinatorial rotation
  number — ½ at the period-2 neck, ⅓ at the period-3 bulb …), and, for escaping points, the
  **distance to the set**. The parameter
  plane inspects the critical orbit at the clicked `c`; the dynamical plane the clicked
  `z₀`. Multiplier and distance need a holomorphic `f` (period and angle hold for any `f`).
  On the **dynamical plane** the located attracting cycle is marked (ringed dots joined in
  orbit order), and when its cycle has a rotation number _p_/_q_ a **Show orbit portrait** button
  draws the external rays landing at the α fixed point and reports the portrait's valence, rotation
  number, and characteristic arc. On the **parameter plane**, when a finite cycle is found, a **Find nucleus**
  button Newton-snaps `c` to the exact superattracting centre, and **Show bulb rays** turns
  on that bulb's landing rays; a **Misiurewicz** finder Newton-snaps to the exact preperiodic
  point `fᵐ⁺ᵏ(0) = fᵐ(0)` nearest the view, and **Siegel c for θ** jumps to the cardioid point
  `λ/2 − λ²/4` for a typed rotation number. At a **Misiurewicz-type point** (where the critical
  orbit lands on a repelling cycle, |λ| > 1) a **Self-similar zoom (×ρ)** button magnifies the
  parameter view by |ρ| = |λ| about it — Tan Lei's asymptotic self-similarity (e.g. ×4 at
  `c = −2`, ×4√2 at `c = i`). **Copy report** copies the readout and **Export
  orbit** downloads the inspected orbit as a CSV — both at full precision. **Pin note** drops a
  labelled gold marker at the inspected point — anchored in plot coordinates, so it tracks pans
  and zooms — and pinned notes ride along in share links and saved views; **Clear** removes them.
- **Critical-orbit hover preview** — hovering a point on the parameter plane shows a small
  preview of its critical orbit (green if bounded → connected Julia set; orange if it
  escapes → Cantor dust), pinned to the plot's corner.
- **Mating check** — enter two main-cardioid bulbs (rotation numbers _p_/_q_) and the panel
  reports whether the two `z²+c` maps can be **mated** (their filled Julia sets glued into one
  rational map): by Rees–Shishikura–Tan Lei they mate iff their limbs are not complex-conjugate,
  i.e. _p₁_/_q₁_ + _p₂_/_q₂_ ≠ 1 (the ½ bulb is the only self-conjugate one). The inspector's
  **Limb** row shows a bulb's conjugate limb and whether it self-mates.
- **Go to external angle** — type an external angle θ = _p_/_q_ (turns) and the parameter ray at θ
  is traced to its landing (the globally-convergent inverse of ray drawing — no nearby click
  needed); a **periodic** θ then Newton-snaps to the exact component **centre** (1/7 → the rabbit,
  1/3 → the basilica, 2/5 → a period-4 centre) and a **preperiodic** θ lands at its **Misiurewicz**
  point (1/6 → _c_ = _i_). The panel also reports θ's **core entropy** _h_ = log λ and
  **biaccessibility dimension** _B_ = _h_/log 2 (Thurston's angle-pair algorithm; satellite angles
  like 1/7 give _h_ = 0, primitive ones like 3/7 give _h_ = log φ). `z²+c`.
- **Symbolic console** — type an **internal address** (the increasing periods from the main cardioid
  to a component, e.g. `1-3` rabbit, `1-2-4-8` cascade, `1-3-6`) and the **stripping algorithm**
  returns its **kneading sequence** ν and the two **characteristic external angles** θ⁻, θ⁺ that
  bound the component's wake (`1-3-6 → 10/63, 17/63`), drawn as a pair of gold parameter rays;
  **Go to component** then snaps to its centre. A non-admissible address (the smallest is `1-2-4-5-6`,
  kneading ABAAB⋆) is reported as realised by no component, rather than guessed. `z²+c`.
- **Inverse-iteration Julia** (Overlays) — paints the dynamical-plane Julia set directly as the
  closure of random backward orbits `z ↦ ±√(z−c)` from the repelling fixed point (the "chaos
  game"), drawing the boundary crisply where forward escape-time struggles (thin dendrites, Cantor
  dusts). `z²+c` (closed-form inverse); c = 0 → the unit circle, c = −1 → the basilica.
- **Siegel invariant curves** (Overlays) — at an irrationally-indifferent **Siegel** parameter (use
  _Go to external angle_ or _Siegel c for θ_ to reach one), samples orbits outward from the
  indifferent fixed point and draws the ones that stay bounded — the nested rotation curves filling
  the Siegel disc. Only shown for a genuine Brjuno rotation number (parabolic / Cremer have no
  disc). `z²+c`.
- **Riemann sphere** — renders the current Julia set onto the Riemann sphere (orthographic
  stereographic snapshot: the screen centre is the south pole _z_ = 0, the rim is the equator
  |_z_| = 1), so you see the whole dynamical plane including the dynamics at ∞ in one view;
  downloadable as a PNG. CPU snapshot, independent of the live render. `z²+c`.

## Exterior map (uniformization)

The **Exterior map** panel reconstructs the Laurent coefficients of the conformal map that
uniformizes the _outside_ of a set — the inverse Böttcher map

    ψ(w) = γ₁·w + b₀ + b₁/w + b₂/w² + …   (leading γ₁ = the capacity; 1 for a monic map)

for two objects:

- **Dynamical plane — ∂K.** The exterior map of the filled Julia set at the live `c`, for
  **any polynomial f** — not just `z^d + c`. The coefficients follow an **exact recurrence**
  from the Böttcher functional equation `f(ψ(w)) = ψ(wᵈ)`: the leading γ₁ = `a_d^(−1/(d−1))`
  is the capacity, then each `bₖ` from the lower ones — computed, not curve-fitted. Shown
  only when `K` is connected (every critical orbit bounded; otherwise the set is disconnected
  and the chart doesn't reach the boundary). f's polynomial coefficients are recovered exactly
  by a DFT at roots of unity. A **rational map with a superattracting ∞** (deg p − deg q ≥ 2,
  e.g. `z²+1/z`) also gets the coefficient readout — the germ at ∞ from its Laurent expansion —
  though its boundary overlay is deferred (it needs the ∞-basin connectivity). Transcendental /
  non-holomorphic / Newton f report "—".
- **Parameter plane — ∂M_d.** The exterior map of the multibrot connectedness locus (the
  Mandelbrot set for d = 2), for the **z^d + c** family only — its coefficients are _universal
  constants_ per degree (for d = 2 the classical rationals −½, ⅛, −¼, 15/128, …), from a
  Böttcher-product series reversion.

Choose how many coefficients to show, then **Copy** them or download a **CSV** (full
precision).

Tick **Draw the reconstructed boundary on the plots** to overlay the curve `ψ(r·e^{2πiθ})`
on each fractal — raise the **order** and watch it tighten onto the true boundary. The
**radius r** defaults to just above 1 (a smooth equipotential just outside the set); push
it toward r = 1 for the boundary itself, where the series converges cleanly only for
locally-connected sets. The `?` button opens the glossary (Böttcher coordinate,
uniformization, Laurent coefficients, capacity).

## Julia set properties

The **Julia set properties** panel (collapsed by default) reports computed properties of the
filled Julia set K_c at the live parameter `c`. Where a value needs the monic `z^d + c` form it
is exact; for a general `f` the same rows are filled numerically and labelled `≈` — an estimate
never overrides an exact analytic/symbolic value.

- **Connectivity** — for a polynomial `f`, the rigorous Fatou–Julia verdict from _every_ critical
  point (roots of `f′`, located by Durand–Kerner): connected (all critical orbits bounded), a
  totally-disconnected Cantor dust (all escape), or disconnected with infinitely many components
  (some escape, some bounded). For a non-polynomial `f` it is estimated from the image (the
  connected components of the bounded set, bridging the thin pinches that join a connected set only
  at single points).
- **Parameter c** — outside the set, hyperbolic (with the attracting period, multiplier |λ| and
  internal angle p/q), neutral, or bounded. For a non-holomorphic `f` the |λ| magnitude comes from
  the real 2×2 Jacobian (shown `≈`).
- **Fractal dimension** — the exact small-`c` value `1 + |c|²/(4 ln d)` inside the principal
  cardioid (Ruelle), plus a box-counting estimate of the boundary (labelled `≈`; box-counting is
  inherently ±0.05–0.2 and over-reads smooth curves).
- **Area of K_c** — a whole-set pixel-count estimate alongside, for monic `z^d + c`, the rigorous
  coefficient upper bound `π(1 − Σ k|bₖ|²)` from the exterior map (Gronwall's area theorem); 0 for
  a Cantor set.
- **Lyapunov exponent** of the critical orbit (a real-Jacobian Benettin estimate for a
  non-holomorphic `f`), the **bounding region** (the `z^d + c` escape disk, else the measured
  bounding box), the measured **symmetry** (central / mirror axes / k-fold rotation), and the
  **logarithmic capacity** — `|a_d|^{−1/(d−1)}` for any polynomial (1 for monic, 1/|λ| for the
  logistic `λz(1−z)`), and "—" for rational / transcendental / non-holomorphic maps where it is
  genuinely undefined.

The cheap analytic/orbit rows update live with `c`; the image-based estimates (box-counting
dimension, pixel area, extent, symmetry, image connectivity) recompute, debounced, only while the
panel is open. **Copy properties** puts the whole report on the clipboard; the `?` links open the
glossary (connectivity, fractal dimension, Lyapunov exponent, area, capacity, symmetry, bounding
region).

## Newton's method

Tick **Newton's method** to iterate the Newton map `z − f/f'` instead of `f` (the
current `f` is read as the polynomial whose roots are sought) and colour by
convergence — e.g. `f = z^3 - 1` gives the classic root-basin fractal. It is a
root-finder, so it's most meaningful for an `f` with several roots; on the escape-time
families (e.g. `z² + c`) it is mathematically degenerate. The derivative is computed
symbolically
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
GPU's. Pixels **rebase** (Zhuoran): when the delta would outgrow its reference (or the
stored orbit ends) the pixel re-references to Z₀ — an exact step that keeps the render
glitch-free and lifts the old reference-length limit. The view centre is carried in
**double-double** precision (`src/render/dd.ts`, ~31 digits) and the reference orbit is
iterated at that centre, so views stay locatable to ~10²⁸×; all are unit-tested
(`test/perturbation.test.ts`, `test/rebasing.test.ts`, `test/dd.test.ts`). Both planes
are eligible for z²+c — the Mandelbrot set (parameter plane) and its Julia sets
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
  For z²+c (both planes), the **perturbation (deep zoom)** toggle goes further still
  (structure resolves where df64 has flattened) — pixels rebase, so it is glitch-free —
  and is limited to ≈10²⁸× by its double-double reference centre. A bignum reference (for
  10¹⁰⁰⁺×) and per-pixel BLA iteration-skipping (the table is staged in `src/render/bla.ts`,
  not yet wired to the GPU kernel) remain future work.
- **Heavy df64 shaders:** the first deep zoom of a transcendental-heavy preset
  (the Schwarz maps) compiles a large df64 shader. This now happens in the
  background (the view shows single precision and upgrades when ready), so it no
  longer freezes interaction; the compiled program is cached afterwards.
- **`npm audit`:** the only reported advisories are in dev-only tooling
  (esbuild/Vite dev server). `npm audit --omit=dev` reports zero — nothing ships
  to production.

## Methods & references

Each computed quantity is a standard construction from holomorphic dynamics / potential theory.
The algorithm and its source are listed below so a result can be described and checked. In-app,
each value is labelled exact (`=`), a rigorous bound (`≤`), or an estimate (`≈`); the **Glossary**
gives the per-quantity definitions and conventions.

**Rendering & colouring**

- _Escape-time & smooth (continuous) iteration count_ — normalised escape `n + 1 − log_d log|z|`.
  Peitgen & Saupe, _The Science of Fractal Images_ (Springer, 1988).
- _Distance estimation (DEM)_ — `d ≈ |z|·log|z| / |z′|` from the running derivative. Milnor,
  _Dynamics in One Complex Variable_ (3rd ed., Princeton, 2006); Peitgen & Saupe (1988).

**Exterior map (uniformization)**

- _Böttcher coordinate & external rays_ — φ conjugates `f` to `w ↦ wᵈ` near ∞; rays carry the
  angle map `θ ↦ dθ`. Douady & Hubbard, _Étude dynamique des polynômes complexes_ (Orsay, 1984–85);
  Milnor (2006).
- _Exterior Laurent coefficients_ — a triangular recursion from the Böttcher functional equation
  (filled Julia set), and a Böttcher-product reversion for the Mandelbrot/multibrot set: Jungreis,
  "The uniformization of the complement of the Mandelbrot set", _Duke Math. J._ 52 (1985).
- _Bulb rotation numbers (Farey)_ — cardioid attachment `c = μ/2 − μ²/4`, `μ = e^{2πip/q}`, with
  Farey/mediant ordering. Douady & Hubbard (1984–85); Milnor (2006).

**Dynamical invariants**

- _Cycle multiplier & classification_ — `λ = ∏ f′(zₖ)`; attracting / indifferent / repelling /
  parabolic. Milnor (2006); Carleson & Gamelin, _Complex Dynamics_ (Springer, 1993).
- _Connectivity (Fatou–Julia)_ — `Kᶜ` is connected ⟺ every critical orbit is bounded, a Cantor set
  ⟺ all escape. Critical points via Durand–Kerner (Weierstrass) simultaneous root-finding: Durand
  (1960); Kerner, _Numer. Math._ 8 (1966). Theorem: Fatou (1919) & Julia (1918); Milnor (2006).
- _Lyapunov exponent_ — orbit average of `log|f′|`, or the renormalised-tangent (Benettin) method
  for non-holomorphic `f`: Benettin, Galgani, Giorgilli & Strelcyn, _Meccanica_ 15 (1980).

**Geometry of the set**

- _Logarithmic capacity (= transfinite diameter)_ — `|a_d|^{−1/(d−1)}` for a degree-d polynomial.
  Ransford, _Potential Theory in the Complex Plane_ (Cambridge, 1995); Brolin, _Ark. Mat._ (1965).
- _Area (Gronwall bound)_ — `Area(Kᶜ) ≤ π(1 − Σ k|bₖ|²)` from the exterior coefficients. Gronwall
  (1914); Pommerenke, _Univalent Functions_ (1975); Duren, _Univalent Functions_ (1983).
- _Hausdorff dimension (small |c|)_ — `dim_H Jᶜ = 1 + |c|²/(4 ln 2) + O(|c|³)` for z²+c. Ruelle,
  "Repellers for real analytic maps", _Ergodic Theory Dynam. Systems_ 2 (1982); Bodart &
  Zinsmeister (1996).
- _Box-counting (Minkowski) dimension_ — a log–log fit of the boundary box count (coarse,
  pixel-resolution dependent). Falconer, _Fractal Geometry_ (Wiley, 1990).

**Numerics**

- _Double-double arithmetic_ (deep-zoom centre) — Dekker, _Numer. Math._ 18 (1971); Knuth, _TAOCP_
  vol. 2; Hida, Li & Bailey (2001).
- _Perturbation deep zoom_ — one high-precision reference orbit + per-pixel delta iteration.
  K. I. Martin, "SuperFractalThing" (2013); glitch-free **rebasing** — Zhuoran, via Heiland-Allen,
  [_Deep zoom theory and practice (again)_](https://mathr.co.uk/blog/2022-02-21_deep_zoom_theory_and_practice_again.html).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add a preset, add a function to
the expression language, change the colouring, add a control, and the pre-PR
checklist — plus the two gotchas (keeping the GLSL/JS backends in sync and the
df64 reference/barrier).

## License

MIT — see [LICENSE](LICENSE).
