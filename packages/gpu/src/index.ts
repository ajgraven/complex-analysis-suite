// @cas/gpu — the shared GPU substrate (Phase 5, MIGRATION.md). Promoted from the Complex
// Dynamics app; the Quadrature Domains Schwarz renderer — which duplicates these primitives and
// wants df64 deep-zoom — is the second consumer that justifies the extraction (ADR-0007).
//
// This first slice carries the numeric core: the df64 double-float JS reference (`df`, `dfAdd`,
// … — also the test oracle for the GLSL port) and the complex-arithmetic GLSL stdlib. Shader
// compile/link and colormaps follow in later slices. Consumers may import the barrel
// (`@cas/gpu`), the df64 reference (`@cas/gpu/df64`), or the GLSL strings (`@cas/gpu/glsl`).
export * from "./glsl/df64Ref.js";
export * from "./glsl/index.js";
export * from "./shader.js";
