/**
 * The trivial fullscreen vertex program every renderer in the suite otherwise re-declares: a
 * pass-through that puts a clip-space quad/triangle's `aPos` straight into `gl_Position`, leaving all
 * the work to the fragment shader. `layout(location = 0)` pins the attribute to index 0, so a consumer
 * may bind it either by explicit index (Complex Dynamics' glPlot uses `vertexAttribPointer(0, …)`) or
 * by `getAttribLocation("aPos")` (everyone else) — both resolve to the same slot.
 */
export const FULLSCREEN_VERTEX_GLSL = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;
