// @cas/schwarz/gpu — the WebGL2 σ evaluator, the GPU twin of the package's CPU engine. Lifted from the
// QD app's hand-written Schwarz shader (S4b, docs/design/SIGMA-HANDOFF.md), specialized to the one
// family CD reconstructs: the classical unbounded-Laurent map with optional finite-pole branches.
//
// The GLSL constants (SIGMA_*_GLSL) are the reusable shader source a consumer concatenates into a full
// fragment shader; the probe harness (buildSigmaProbeGLSL / packPhi / uploadPhi / runSigmaGLSL) is the
// CPU-parity net and the uniform-upload path CD's renderer reuses.
export {
  MAX_BRANCHES,
  MAX_K,
  MAX_LAURENT,
  SIGMA_CONSTS_GLSL,
  SIGMA_UNIFORMS_GLSL,
  SIGMA_COMPLEX_GLSL,
  SIGMA_EVAL_GLSL,
} from "./sigma.glsl.js";
export {
  SIGMA_PROBE_VERTEX,
  buildSigmaProbeGLSL,
  packPhi,
  uploadPhi,
  runSigmaGLSL,
} from "./probe.js";
export type { SigmaPhi, PackedPhi } from "./probe.js";
