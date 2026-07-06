// The GLSL source strings that compose the suite's complex-arithmetic shaders: the single- and
// df64-precision complex stdlibs, the derived transcendentals, and the df64 double-float
// primitives. Consumers concatenate these into a fragment program (e.g. the escape-time scaffold
// in the Complex Dynamics app's shaderBuilder). There are no JS-level dependencies between them —
// they compose at the GLSL level, by function name, at shader-assembly time.
export { DF64_GLSL } from "./df64.glsl.js";
export { COMPLEX_SINGLE_GLSL } from "./complexSingle.glsl.js";
export { COMPLEX_DF64_GLSL } from "./complexDf64.glsl.js";
export { COMPLEX_DERIVED_GLSL } from "./complexDerived.glsl.js";
