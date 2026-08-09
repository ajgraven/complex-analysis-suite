# @cas/expr

The suite's **expression compiler**: one AST for a small complex-analysis expression
language that emits **both** a JavaScript evaluator (for orbits, overlays, and tests) and a
**GLSL** shader body (for rendering) from a single source of truth. It is the executable half
of the [map-representation keystone](../../docs/ARCHITECTURE.md#5-the-keystone-map-representation)
(the serializable half is [`@cas/interchange`](../interchange)).

The dual-backend design carries a load-bearing invariant — **GLSL ≈ JS** on the same input —
which is a _tested contract_, not an assumption (see
[`@cas/gpu`'s dual-backend harness](../gpu) and
[RISKS Hard Part 2](../../docs/RISKS.md#hard-part-2-the-dualbackend-glsljs-sync-invariant-at-suite-scale)).
Promoted from the Complex Dynamics app in
[Phase 5](../../docs/MIGRATION.md#phase-5--extract-gpu-and-promote-expr).

## Install

```jsonc
// an app's package.json
"dependencies": { "@cas/expr": "workspace:*" }
```

`@cas/expr` is consumed **from source** — its `exports` map points at `./src/*.ts`, and each
consumer's Vite/Vitest bundler transpiles it. It has 10 sub-path entry points so a consumer
imports only the passes it needs; no `dist` build to keep in sync.

## The language

A CindyScript-compatible subset over complex numbers, with the reserved formal arguments `z`, `c`
and any number of **live named parameters** (`a`, `b`, `k`, …):

- **constants** `e · pi · i · tau · phi · γ` (τ = 2π, φ = golden ratio, γ = Euler–Mascheroni; `γ` is
  the Greek character, distinct from the Γ function) and **imaginary literals** `2i`, `3.5i`, `1e3i`
  (a number with a trailing `i`; it binds as one unit, so `2i^2 = (2i)^2`); **operators** `+ - * / ^`
  (principal-branch complex powers), comparisons `> < ==`, `if(cond,a,b)`, `not(...)`;
- **functions** — `re im conjugate abs arg sqrt exp log sin cos tan arcsin arccos arctan arctan2 mod lambertw gamma zeta round floor ceil` (`conjugate` is first-class, so anti-holomorphic maps like `conjugate(z)^2 + c` are native; `gamma`/`zeta` are Γ/ζ — see Special functions below);
- **`;`-separated statements** with local assignment; the `escape` predicate may call
  `f(z, c)`.

### Named parameters (ADR-0011)

Any free variable that is neither `z`/`c` nor a local is a **parameter**, bound at evaluation time.
`freeParameters(node)` lists them (sorted) so a host builds one control per name.

- **JS** — pass a `name → Complex` map: `makeComplexFn(parse("a*z + b"), { a: [2,0], b: [1,0] })`.
  The legacy convention — a single positional `Complex` bound to `a` — still works
  (`makeComplexFn(node, [3,0]) === makeComplexFn(node, { a: [3,0] })`), so Complex Dynamics is unchanged.
- **GLSL** — `compileF(node, "fFn", { params: freeParameters(node) })` aliases each parameter from a
  `uParam_<name>` uniform (the host declares/sets them). With no options, the legacy single parameter
  `a` aliases from `uA`, byte-for-byte as before.

Parameters bind to **uniforms**, so moving a control is a re-uniform, not a recompile; they are also
carried into `f(...)` recursion, keeping the GLSL ≈ JS invariant inside self-reference.

### Special functions (Phase 4)

`gamma` is Γ(z) via the classic Lanczos approximation (g = 7) with the reflection formula for the left
half-plane. Like the hyperbolics, it is **derived** — one implementation in terms of the base ops
(`cexp`/`clog`/`csin`/`cpow`), so both GLSL precisions get it, and a JS twin with the same coefficients
keeps the backends in step (numerically checked to float32 ε against known Γ values, both branches).

`zeta` is the Riemann ζ(s) via **Borwein's** acceleration of the alternating series — the `d_k`
coefficients built by a ratio recurrence (no factorial overflow, so the GLSL and JS backends run the
same code, no baked constants). The core is accurate through the critical strip; **Re(s) < 0** takes the
functional equation `ζ(s) = 2^s π^(s−1) sin(πs/2) Γ(1−s) ζ(1−s)`, reusing `gamma` — so it shows the pole
at `s = 1`, the trivial zeros at `−2, −4, …`, and the nontrivial zeros on `Re = ½`. In **float32** it is
limited to ~1e-6 and degrades high up the strip (the plotter shows an honest precision badge; deep
Riemann–Siegel is a future concern).

Both `gamma` and `zeta` are **not** differentiable in the system yet (their derivatives need digamma /
ζ′ builtins), so the instruments that require `f′` skip a map built on them. The DLMF colouring mode is
the rest of Phase 4.

## API

```ts
import { parse, makeComplexFn, makeEscapeFn, compileF, compileEscape } from "@cas/expr";
```

| Pass               | Entry                                        | What it gives you                                                                                                                                                                          |
| ------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Parse**          | `@cas/expr` / `./parser`, `./lexer`, `./ast` | `tokenize(src) → Token[]`, `parse(src) → Node`; the `Node` tagged-union AST + helpers (`referencesVar`, `isFreeParameter`, `freeParameters`); `ExprError` (carries `pos`)                  |
| **Evaluate (JS)**  | `./evaluate`                                 | `makeComplexFn(node, params?) → (z,c) → Complex` and `makeEscapeFn(node, params?) → (z,c) → boolean` — the float64 reference backend (`params` = a `Complex` for `a`, or a name→value map) |
| **Compile (GLSL)** | `./glsl`                                     | `compileF(node, name?, opts?)` and `compileEscape(node, opts?)` — emit GLSL fragment functions (`opts.params` opts into named parameters); `glslFloat` for literals                        |
| **Differentiate**  | `./derivative`                               | `differentiate(node, v?) → Node` (symbolic ∂/∂v) and `newtonIteration(f, df)` (GLSL Newton step)                                                                                           |
| **Rational**       | `./rational`                                 | `fToRational(node, c, a)` → the rational `{num, den}`, or `null` if the map is transcendental                                                                                              |
| **LaTeX**          | `./latex`                                    | `toLatex(node)` — KaTeX-ready, minimal parentheses                                                                                                                                         |
| **Complex (JS)**   | `./complex`, `./complexJs`                   | the `Complex = [re, im]` tuple ops (`C.add · C.mul · C.exp · …`) the JS backend runs on                                                                                                    |

## Tests

`test/` — parser/AST, evaluate↔compile, derivative, LaTeX, param-`a` handling, **`namedParams`**,
**`constantsLiterals`** (the `2i` imaginary literal + `tau`/`phi`/`γ` across all backends), **`gamma`**
(Γ known values, reflection, the functional equation, and non-differentiability), **`zeta`** (ζ special
values, trivial + first nontrivial zeros, the pole at 1, non-differentiability),
(the ADR-0011 named-parameter model — enumeration, JS map + legacy positional, GLSL `uParam_<name>`
aliases, recursion propagation), and **`complexParity`** (the JS complex library vs. its intended
GLSL semantics). The end-to-end
GLSL≈JS numeric invariant is proven in [`@cas/gpu`'s dual-backend harness](../gpu), which
imports this package to build probe shaders.
