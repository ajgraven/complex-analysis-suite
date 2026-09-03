// The body-pane mesh shaders (ADR-0038, HD-6.3). The right pane is a forward-mapped coloured mesh: the
// CPU tessellates the disk exterior {|w| ≥ 1} and warps every vertex through ψ to z = ψ(w) (bodyMesh.ts),
// tagging it with the exact physical velocity dW/dz = W_ref'(w)/ψ'(w) and the stream function Im W_ref(w).
// The vertex shader places z with the SAME viewport transform the disk pane's planeFromFrag inverts, and
// the fragment shader colours from the interpolated velocity + contours the interpolated stream function,
// via the SAME shared fieldColor.glsl — so the body pane reads in the same colours and streamlines as the
// disk pane. No per-pixel inverse ψ⁻¹ is ever needed (the cusped bodies have none); the map is only ever
// evaluated FORWARD. The velocity is interpolated as a vector (no arg branch-cut seam) and arg/|·| are
// taken per-fragment.
import { COMPLEX_SINGLE_GLSL, HSV2RGB_GLSL } from "@cas/gpu/glsl";
import { FIELD_COLOR_GLSL } from "./fieldColor.glsl.js";

export const BODY_MESH_VERTEX_SHADER = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aPos;    // z = ψ(w), body-plane world coords
layout(location = 1) in vec2 aVel;    // dW/dz = W_ref'(w)/ψ'(w), physical complex velocity
layout(location = 2) in float aStream; // Im W_ref(w), the stream function

uniform vec2  uCenter;
uniform float uHalfSpan;
uniform vec2  uResolution;

out vec2 vVel;
out float vStream;

void main() {
  float aspect = uResolution.x / uResolution.y;
  float x = (aPos.x - uCenter.x) / (uHalfSpan * aspect);
  float y = (aPos.y - uCenter.y) / uHalfSpan;
  vVel = aVel;
  vStream = aStream;
  gl_Position = vec4(x, y, 0.0, 1.0);
}
`;

export const BODY_MESH_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
in vec2 vVel;
in float vStream;
out vec4 outColor;

${COMPLEX_SINGLE_GLSL}
${HSV2RGB_GLSL}
${FIELD_COLOR_GLSL}

uniform float uModScale;
uniform float uStreamSpacing;

void main() {
  vec3 col = fieldColor(vVel, uModScale);
  float stream = contourf(vStream / uStreamSpacing); // streamlines ψ = Im W_ref, carried onto the body
  col = mix(col, vec3(0.97), 0.85 * stream);
  outColor = vec4(col, 1.0);
}
`;
