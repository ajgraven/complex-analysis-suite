// The ONE colormap the two panes share (ADR-0038, HD-6.3). Both the per-pixel disk shader
// (diskShader.ts) and the forward-mapped body mesh (bodyMeshShader.ts) concatenate this snippet, so a
// complex velocity reads the SAME colour in both planes — the point of the unification. Hue is the flow
// direction arg(v)/2π (a full hue wheel), value is a speed gauge |v|/(|v|+scale) so the far field sits
// at mid-brightness and the flow's speed-up over the body reads brighter. `contourf` is the shared
// anti-aliased level-line stripe (streamlines ψ = Im W_ref). Requires COMPLEX_SINGLE_GLSL (for `cvec`,
// `carg`, `cabsf`, `cre1`) and HSV2RGB_GLSL (for `hsv2rgb`) to be concatenated before it.
export const FIELD_COLOR_GLSL = /* glsl */ `
// Domain-colour a complex velocity: hue = flow direction, value = speed gauge (scale = far-field speed).
vec3 fieldColor(cvec vel, float scale) {
  float m = cabsf(vel);
  float hue = fract(cre1(carg(vel)) * 0.15915494309189535 + 1.0); // arg(v) / 2π
  float val = m / (m + scale);
  return hsv2rgb(vec3(hue, 0.82, val));
}

// Anti-aliased level-line stripe of a scalar field (1 on a contour, 0 between), width tracking screen
// slope via fwidth so lines stay ~1px at any zoom.
float contourf(float v) {
  float d = abs(v - floor(v + 0.5));
  float w = fwidth(v) * 1.2 + 1e-6;
  return 1.0 - smoothstep(0.0, w, d);
}
`;
