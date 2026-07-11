# Implementation Plan: Riemann-sphere view for unbounded Ω (TODO #14)

**Status**: ready for implementation
**Tracking**: TODO.md entry #14 (High priority)
**Approved scope**: boundary + Schwarz fractal as sphere texture, unbounded
families only, new dedicated tab, raw WebGL 2 (no library dependencies).

---

## Context

For **unbounded** quadrature domains the "interesting" region is the bounded
complement K (where the poles and finite Schwarz dynamics live), and Ω
extends to ∞. In the flat-plane view this means most of the visible canvas
is "escape to infinity" — pretty but uninformative — and the user has to
mentally account for the point at infinity that the dynamics maps toward.

Stereographic projection of 𝐂 onto the unit sphere puts ∞ at a single
finite point (the north pole), so the escaping set of the Schwarz dynamics
becomes a **compact cluster around the pole** instead of trailing off to
the canvas edge. K appears as a small spherical cap; ∂Ω is a finite closed
curve on the sphere; the entire dynamics is visible at once. For papers
and lecture slides this is the canonical visualization of an unbounded QD.

This plan adds a new **"Riemann sphere"** tab that:

- captures the current φ from the QD/LQD tab (same source-of-φ pattern as
  the Schwarz tab),
- renders the **Schwarz σ-iteration fractal as a texture on the sphere**,
  reusing the existing GPU shader from `schwarz-webgl.js` (rendered to an
  offscreen framebuffer instead of the canvas),
- overlays the boundary polyline, finite poles, and the north pole (∞) as
  3D primitives,
- provides orbit / zoom camera controls,
- is **gated to unbounded families only with a soft warning** (the math is
  well-defined for bounded Ω but produces an uninformative spherical cap;
  the render is still allowed, just flagged).

Built with raw WebGL 2 — no rendering-library dependencies (the app itself is Vite-built). Mirrors
the lazy-mounted tab pattern already in use for Schwarz and Param-slice.

---

## Architecture

### New tab: "Riemann sphere"

Same pattern as Schwarz / Param-slice tabs (lazy mount on `tab-changed`
event, own sidebar in `#controls-sphere`, dedicated GL canvas behind the
main 2D canvas). The capture-φ button mirrors the Schwarz tab so the user
explicitly snapshots a φ rather than the tab auto-tracking edits in the
Inverse tab.

### Module layout

| File | Role |
|---|---|
| `app/sphere/sphere-common.js` | Pure math kernel: stereographic projection `w ↔ (x,y,z)`, sphere mesh generation (UV-sphere), camera/projection matrix helpers (`lookAt`, `perspective`, `multiply`), project-polyline helper. No DOM. Reusable in node-test.js. |
| `app/sphere/sphere-webgl.js` | WebGL 2 renderer: offscreen-FBO fractal-texture pass (delegates to the existing Schwarz shader), textured-sphere pass, boundary-polyline pass, pole-marker pass. Camera/orbit controls. Exports a `createSphereRenderer(canvas)` factory. |
| `app/sphere/sphere-ui.js` | Tab UI: source-of-φ capture button, render controls (max iter / colormap / mask-region size / boundary visibility), camera reset, hover readout. Lazy-mounts on `tab-changed`. |

Add 3 `<script>` tags to `index.html` after the param-slice block.

### Canvas / layer stacking

Add a new `<canvas id="sphere-gl-canvas">` placed in `#plot-area` behind
the main `#canvas`, mirroring the existing `#schwarz-gl-canvas`. Hidden by
default; the sphere tab shows it on activation and hides it on tab-out.
The main `#canvas` 2D context is used by sphere-ui only for an HTML hover
readout box (or skip even that and use a `<div>` overlay).

**Recommendation**: do all 3D drawing in the GL canvas. Keep the 2D
canvas cleared while the sphere tab is active.

---

## Stereographic projection math

Conventional unit-sphere projection from the **north pole** (so ∞ ↔ north
pole, origin ↔ south pole):

**Forward (𝐂 → S²)**:
```
let r2 = u*u + v*v
x = 2u / (1 + r2)
y = 2v / (1 + r2)
z = (r2 − 1) / (r2 + 1)
```
∞ → (0, 0, 1) ✓; origin → (0, 0, −1) ✓; |w| = 1 → equator z = 0 ✓.

**Inverse (S² \ {north pole} → 𝐂)**:
```
u = x / (1 − z)
v = y / (1 − z)
```
Singular at z = 1 (the north pole = ∞). The sphere fragment shader uses
this to compute w for each surface pixel; near the pole, |w| blows up, but
the fractal shader's "outside the mask" / "escaped" branch handles large
|w| gracefully — those pixels just show the "escaped" color.

These formulas + a couple of derivative formulas live in
`sphere-common.js`. The node-test verifies forward/inverse roundtrip
(`projectToSphere(w)` then `unprojectFromSphere(...)` recovers w within
1e-12) and the conformal-radius checks (|w|=1 maps to equator z=0;
|w|=2 maps to z=3/5; etc.).

### Sphere mesh

UV-sphere with configurable resolution (default: 96 longitudes × 48
latitudes ≈ 9k triangles). UV coords come for free:
`u_tex = longitude / 2π`, `v_tex = latitude / π`. Stored as flat
`Float32Array` interleaved position+UV with a `Uint16Array` index buffer.
Built once per tab activation; never resized.

### Camera

Standard 3D camera with orbit (azimuth + elevation), zoom (distance),
look-at = origin (sphere center). 4×4 view matrix via `lookAt(eye, target,
up)`; perspective projection via `perspective(fovY, aspect, near, far)`.
~80 lines of matrix math in `sphere-common.js`, no library needed.

Default view: looking from (0, 0, 2.5) along −z, up = +y. Mouse drag
adjusts azimuth/elevation in spherical coords; wheel adjusts distance
(zoom). Reset button restores the default. Right-click pan is optional in v1.

---

## Rendering pipeline

Three passes per frame:

### Pass 1: Fractal-to-texture (cached)

Reuse the existing **Schwarz WebGL 2 shader** from
`app/schwarz/schwarz-webgl.js`, but render to an offscreen framebuffer
attached to a 2D RGBA8 texture instead of the main canvas. The texture
covers a square region of 𝐂 large enough to bound the visible escape
behavior: `[−R, R] × [−R, R]` with R = `max(K-boundary-radius × 3,
some sensible minimum)`. Sphere fragments mapping to |w| > R use a
single "far-field" color (the same escape color as |w| > escapeR in the
Schwarz iteration).

Cached across camera moves — only re-rendered when φ changes, max-iter
changes, or colormap changes. Resolution configurable (512 / 1024 /
2048); 1024² is the default and gives ~2-pixel-per-sample fidelity at
typical sphere screen sizes.

**Implementation strategy**: factor the existing Schwarz shader's
"create program → set uniforms → draw full-screen triangle" sequence
into a reusable `renderFractalToTarget(target, params)` function in
`schwarz-webgl.js`, where `target` is either the canvas (existing
default) or `{ framebuffer, width, height }`. Most of the existing code
stays put; we add a target argument and a couple of `gl.bindFramebuffer`
calls. Backwards-compatible — existing Schwarz tab callers pass nothing
and get canvas rendering as before.

### Pass 2: Sphere shading

Render the UV-sphere mesh with this fragment shader (simplified):

```glsl
in vec3 vNormal;       // sphere-surface point (unit vector — sphere is unit)
uniform sampler2D uFractal;
uniform float uMaskHalfExtent;   // R in world units
uniform vec4 uFarFieldColor;
uniform float uRimDarken;        // 0..0.5 typically

out vec4 fragColor;

void main() {
  vec3 n = normalize(vNormal);
  if (1.0 - n.z < 1e-6) {
    // North pole = ∞. Painted with the far-field color.
    fragColor = uFarFieldColor;
    return;
  }
  // Inverse stereographic.
  float u = n.x / (1.0 - n.z);
  float v = n.y / (1.0 - n.z);
  if (max(abs(u), abs(v)) > uMaskHalfExtent) {
    fragColor = uFarFieldColor;
  } else {
    // Map w ∈ [−R, R]² → [0, 1]² texture coords.
    vec2 uv = vec2(u, v) / (2.0 * uMaskHalfExtent) + 0.5;
    fragColor = texture(uFractal, uv);
  }
  // Optional rim shading: slight darkening near the sphere silhouette
  // gives a 3D shape cue without obscuring the texture.
  float rim = 1.0 - pow(max(0.0, dot(n, vec3(0,0,1))), 2.0);
  fragColor.rgb *= 1.0 - uRimDarken * rim;
}
```

Depth-test on, back-face culling on (we only see the front hemisphere).

### Pass 3: Overlay (boundary + poles + ∞-marker)

- **Boundary polyline**: project each ∂K sample → sphere via the forward
  projection in `sphere-common.js`, draw as a `gl.LINE_STRIP` with line
  width via a thin tube-quad-strip (true WebGL lines have width=1).
  Drawn after the sphere with `gl.depthFunc(gl.LEQUAL)` and a small
  `gl.polygonOffset` so the line sits "on" the sphere surface rather
  than z-fighting with it.
- **Finite poles**: each `a_j` projected to sphere → small filled circle
  (billboard quad oriented to camera). Color contrast against the
  fractal background (e.g. white with a black stroke).
- **North pole (∞) marker**: small ✸ glyph at (0, 0, 1) — also a
  billboard quad with a stamped texture or a small line star.
- **Equator + meridian guides** (optional, toggleable): faint grey
  great-circle lines as a 3D coordinate reference. Off by default.

Depth-tested against the sphere so geometry on the far hemisphere is
correctly hidden.

---

## Interaction

| Gesture | Effect |
|---|---|
| Left-drag | Orbit (azimuth + elevation) |
| Wheel | Zoom (camera distance) |
| Double-click | Reset view |
| Hover | Readout: sphere (x, y, z) and corresponding w (or "∞" near pole) |
| `r` key (optional) | Reset view (same as double-click) |

Re-render the sphere (passes 2 + 3) on every mouse-move during orbit —
the fractal texture is cached, so these are ~5-ms frames at 1024² target
resolution. Re-render pass 1 (fractal) only when φ / max-iter / colormap
changes.

---

## Sidebar UI

Lazy-mounted in `#controls-sphere` on first activation. Four cards:

1. **Source-of-φ** — same pattern as Schwarz tab. Status line shows
   captured φ's family + branch shape. Big "Use this φ" button reads
   `state.current.primary.phi` from the Inverse tab.
   **Soft gate**: if captured φ is bounded, show a clear warning
   ("Riemann-sphere view is informative only for unbounded Ω; the
   bounded case maps to a small spherical cap"). Still allow the render
   (it's well-defined).

2. **Fractal render** — max iterations (1–200), colormap dropdown
   (mirror Schwarz tab's list), scale mode (smooth / discrete / log /
   sqrt), mask region multiplier (e.g. 3× K radius, slider 1–10),
   texture resolution (512 / 1024 / 2048). "Recompute fractal" button
   to force-refresh after parameter changes.

3. **Sphere display** — boundary line color + width, show/hide poles,
   show/hide equator+meridian guides, rim shading amount (0–0.5
   slider), background color.

4. **Camera + readout** — "Reset view" button, hover readout (px coords
   + sphere (x,y,z) + w).

---

## Files to touch

| File | Action |
|---|---|
| `app/sphere/sphere-common.js` | **new** — projection math, mesh gen, camera matrices |
| `app/sphere/sphere-webgl.js` | **new** — WebGL 2 renderer (3 passes, camera, FBO management) |
| `app/sphere/sphere-ui.js` | **new** — tab UI, source-φ capture, controls, lazy mount |
| `app/schwarz/schwarz-webgl.js` | minor refactor: extract `renderFractalToTarget(target, params)` so `sphere-webgl` can render the fractal to an FBO. Backwards-compatible — existing callers default to canvas target. |
| `app/index.html` | add tab button (`<button data-tab="sphere">`), panel (`<div id="controls-sphere">`), 3 `<script>` tags, register `'sphere'` in `panels` map, add `<canvas id="sphere-gl-canvas">` behind main canvas |
| `app/style.css` | minor: sphere GL canvas positioning (same z-index trick as `#schwarz-gl-canvas`), sidebar card styling tweaks |
| `app/node-test.js` | add unit tests for projection roundtrip, mesh generation (vertex count + UV bounds), matrix helpers (orthogonality of `lookAt` frame, expected `perspective` matrix structure) |

No solver-side changes. No new files in `app/` outside the new `sphere/`
directory.

---

## Existing code being reused

- **Schwarz WebGL shader + family branch logic** (`app/schwarz/schwarz-webgl.js`,
  lines ~400–700: per-family branch sum, Newton inverse, σ iteration).
  The plan extracts a `renderFractalToTarget(target, params)` entry
  point so the same shader populates either the canvas (existing) or an
  offscreen texture (new).
- **Schwarz family adapters** (`app/schwarz/schwarz-common.js`
  `buildSchwarzFromPhi`, escape-radius computation): captured φ →
  Schwarz handle, same as the Schwarz tab.
- **Boundary samples**: reuse `state.current.primary.boundaryPts` (or
  call `QD.sampleBoundaryAdaptive(phi, ...)` directly) to obtain ∂K
  points for the polyline overlay.
- **Tab pattern + canvas-stacking** (`app/index.html` panels map,
  `app/schwarz/schwarz-ui.js` mount + GL-layer show/hide on
  `tab-changed`).
- **Colormap texture upload** (the schwarz-webgl colormap path) reused
  unchanged for the fractal texture pass.
- **`phi.unbounded` flag** in `app/ui.js` MODES table — `sphere-ui`
  reads it directly to drive the soft-warning gate; no MODE table
  change needed.

---

## Verification plan

1. **Unit tests** (`node-test.js`):
   - `sphere-common.js` projection roundtrip: 50 random `w` points →
     `projectToSphere(w)` → `unprojectFromSphere(...)` → max error
     < 1e-12. Include edge cases (0, |w|=1, |w|=1e6).
   - UV-sphere mesh: vertex count = (long+1)*(lat+1), all positions on
     unit sphere (|v| ≈ 1), UVs in [0,1].
   - `lookAt` returns an orthonormal frame; `perspective` matrix has
     the expected form (1/(aspect*tan(fovY/2)) in [0][0] etc.).

2. **Manual smoke (visual)**: load the **`Deltoid: h = w², c = 0.5`**
   unbounded preset → solve → switch to Riemann-sphere tab → click
   "Use this φ" → confirm:
   - The deltoid boundary appears as a small closed curve near the
     south pole.
   - The Schwarz fractal wraps around the rest of the sphere, with
     escape-time bands radiating toward the north pole.
   - Orbit drag rotates the view; zoom works; reset returns to default.

3. **Per-family smoke**: repeat for the `unboundedQD` one-pt preset,
   `unboundedLQD` one-pt preset, `unboundedLQD_singular` one-pt preset.
   All four should render without errors.

4. **Bounded-φ gate**: capture a bounded-cardioid φ → switch to sphere
   tab → confirm warning banner appears AND the render still works
   (showing K as a small spherical cap).

5. **Performance check**: console-log frame time for the sphere pass.
   With a 1024² fractal texture cached, drag-orbit should run at
   ≥30 fps on integrated graphics (≤33 ms/frame). Fractal recompute
   (when changing max-iter) should match the Schwarz tab's existing
   timing (~30–100 ms at 1024²).

6. **WebGL fallback**: if `gl.getContext('webgl2')` returns null,
   `sphere-ui` shows a clear "Riemann-sphere view requires WebGL 2"
   message in the source-of-φ card and disables the render button.
   No crash.

7. **Tab teardown**: open the Schwarz tab AND the sphere tab in
   sequence; confirm neither tab's GL canvas leaks frames into the
   other. Inspect with DevTools "Layers" panel.

---

## Implementation order (suggested, for incremental verification)

1. **S1**: `sphere-common.js` — math kernel + node-tests.
   *Self-contained, no deps; ship + verify before touching WebGL.*
2. **S2**: extract `renderFractalToTarget(target, params)` in
   `schwarz-webgl.js`. *Existing Schwarz tab must keep working.*
3. **S3**: `sphere-webgl.js` Pass 1 only — render the fractal to an
   FBO, then blit the texture full-screen to the GL canvas as a sanity
   check (should look identical to the Schwarz tab).
4. **S4**: `sphere-webgl.js` Pass 2 — UV sphere mesh + textured sphere
   shader. Hardcoded camera. Should see a static fractal-textured
   sphere.
5. **S5**: Camera controls (orbit/zoom/reset) + Pass 3 overlay
   (boundary + poles + ∞ marker).
6. **S6**: `sphere-ui.js` — sidebar, source-φ capture, controls wiring.
7. **S7**: `index.html` tab + style.css + node-tests.
8. **S8**: README / HANDOFF updates.

Each step ships in a state where the existing app remains fully
functional.

---

## Out of scope (deferred)

- **Bounded-φ optimization**: the sphere view works for bounded Ω but
  is visually uninformative. Adding a dedicated "south-pole zoom" mode
  is deferred.
- **Animation / morph**: a flat-→-sphere animated transition would be
  delightful but not required. Defer to a follow-up.
- **Stereographic projection from the south pole** (so origin → north
  pole) is occasionally preferred in some literatures. The conventional
  north-pole projection is hard-coded for v1; configurable choice
  deferred.
- **Equirectangular / Mercator unwrap** option for "flat sphere" exports
  is interesting but a separate feature.
- **Direct sphere-shader Schwarz iteration** (skip the texture
  intermediate and do the σ iteration per sphere fragment): more
  expensive per frame, no texture-resolution ceiling, but the per-frame
  cost would break the cached-texture interactivity story. Defer
  unless the cached approach proves visually inadequate.
