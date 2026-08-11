// The GLSL source strings that compose the suite's shaders: the single- and df64-precision complex
// stdlibs, the derived transcendentals, the df64 double-float primitives, plus the small shared
// building blocks every renderer otherwise re-declares — the trivial fullscreen vertex program, the
// HSV→RGB helper, and the fragment-coordinate → complex-plane viewport map. Consumers concatenate
// these into a program (e.g. the escape-time scaffold in the Complex Dynamics app's shaderBuilder).
// There are no JS-level dependencies between them — they compose at the GLSL level, by function name,
// at shader-assembly time. The ordering contract is only that a snippet using `cvec` / `vec_` (e.g.
// planeFromFrag) is concatenated after COMPLEX_SINGLE_GLSL, which defines those aliases.
export { DF64_GLSL } from "./df64.glsl.js";
export { COMPLEX_SINGLE_GLSL } from "./complexSingle.glsl.js";
export { COMPLEX_DF64_GLSL } from "./complexDf64.glsl.js";
export { COMPLEX_DERIVED_GLSL } from "./complexDerived.glsl.js";
export { FULLSCREEN_VERTEX_GLSL } from "./fullscreenVertex.glsl.js";
export { HSV2RGB_GLSL } from "./hsv2rgb.glsl.js";
export { PLANE_FROM_FRAG_GLSL } from "./planeFromFrag.glsl.js";
