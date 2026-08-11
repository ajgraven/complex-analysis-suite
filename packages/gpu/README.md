# @cas/gpu

The suite's **WebGL2 substrate**: the double-float (**df64**) deep-zoom kernel, a
complex-number GLSL standard library, the shader compile/link plumbing, and the
**dual-backend harness** that proves single-precision GLSL agrees with float64 JS. Extracted
from the Complex Dynamics app in
[Phase 5](../../docs/MIGRATION.md#phase-5--extract-gpu-and-promote-expr) — the hardest
extraction, so it was sequenced late and pulled by the correspondence tool's real need.

Sits in the foundation layer; depends only on [`@cas/expr`](../expr) (for the dual-backend
harness's probe shaders).

## Install

```jsonc
"dependencies": { "@cas/gpu": "workspace:*" }
```

Consumed **from source** — the `exports` map points at `./src/*.ts`, one sub-path per
concern; the consumer's bundler transpiles what it imports.

## API

```ts
import { createProgram, compileShader, linkProgram } from "@cas/gpu/shader";
import {
  DF64_GLSL,
  COMPLEX_SINGLE_GLSL,
  COMPLEX_DF64_GLSL,
  COMPLEX_DERIVED_GLSL,
} from "@cas/gpu/glsl";
import { df, dfAdd, dfMul, dfExp, toNumber } from "@cas/gpu/df64";
import {
  DUAL_BACKEND_CORPUS,
  buildProbeGLSL,
  jsReference,
  runGLSL,
  compareResults,
} from "@cas/gpu/dual-backend";
import {
  sampleStops,
  buildGradientLUT,
  buildColormapLUT,
  makeColormapTexture,
} from "@cas/gpu/colormap";
```

**Colormaps** (`./colormap`) — `sampleStops(stops, t)` interpolates a `ColorStop[]` ramp;
`buildGradientLUT` / `buildColormapLUT` bake one into a lookup table; `makeColormapTexture(gl, …)`
uploads it as a GL texture. Extracted once it had its second consumer per ADR-0007 — Complex
Dynamics (`src/palettes.ts`) and the Quadrature app's Schwarz renderer both use it.

**Shader plumbing** (`./shader`) — `compileShader(gl, type, src)`, `linkProgram(gl, vs, fs)`,
and `createProgram(gl, vsSource, fsSource)` (compile + link in one call), each throwing with
the driver's log on failure.

**GLSL standard library** (`./glsl`) — source-string constants you concatenate into a
fragment shader: `DF64_GLSL` (double-float primitive ops), `COMPLEX_SINGLE_GLSL` (`vec2`
complex arithmetic), `COMPLEX_DF64_GLSL` (`vec4` df64 complex arithmetic), and
`COMPLEX_DERIVED_GLSL` (transcendentals built on the stdlib). Plus three small building blocks
every renderer otherwise re-declares (ADR-0016): `FULLSCREEN_VERTEX_GLSL` (the trivial
fullscreen-triangle vertex program, `layout(location = 0) in vec2 aPos`), `HSV2RGB_GLSL` (the
HSV→RGB hue-wheel helper), and `PLANE_FROM_FRAG_GLSL` (a `planeFromFrag()` mapping a fragment
coordinate to a complex-plane point — concatenate it **after** `COMPLEX_SINGLE_GLSL`, which
defines the `cvec` / `vec_` aliases it uses).

**df64 reference** (`./df64`) — the JS mirror of the shader's double-float math (`DF =
[hi, lo]` float32 pair): `df · toNumber · dfAdd · dfSub · dfMul · dfDiv · dfSqrt · dfExp ·
dfLog · dfNeg`. Error-free Dekker/Knuth transforms give ≈46–48 mantissa bits vs. single's
24 — enough to push deep-zoom well past the float32 limit. It exists so the GLSL df64 path
can be unit-tested against a JS oracle in Node, without a GPU.

**Dual-backend harness** (`./dual-backend`) — the machinery behind the **GLSL ≈ JS**
invariant: `buildProbeGLSL(source)` assembles a self-contained probe shader from an
[`@cas/expr`](../expr) source string, `jsReference(...)` evaluates the same expression on the
float64 JS backend, `runGLSL(gl, ...)` runs it in a live WebGL2 context, and
`compareResults(...)` returns `{ maxError, meanError, errors }`. `DUAL_BACKEND_CORPUS` is a
ready set of holomorphic, anti-holomorphic, rational, and transcendental cases; single-GLSL
matches float64 JS to ≈1.5e-7 relative error across them.

## Tests

`test/df64.test.ts` (the double-float ops vs. an IEEE reference) and
`test/dualBackend.test.ts` (`buildProbeGLSL` / `jsReference` / `compareResults` in Node).
`runGLSL` needs a real WebGL2 context (with `EXT_color_buffer_float` for float readback), so
the end-to-end GPU leg is validated in a preview browser rather than headless Node.

## Not yet here

Per the extraction's demand-driven scope: the full escape-time **program scaffold**,
sphere/projection remaps, and per-program compile caching remain in
the apps until a second consumer needs them
([ADR-0007](../../docs/DECISIONS.md#adr-0007-incremental-extraction-driven-by-real-need)).
This package is the shared _substrate_ (df64 + complex GLSL + compile/link + the dual-backend
proof), not a turnkey renderer.
