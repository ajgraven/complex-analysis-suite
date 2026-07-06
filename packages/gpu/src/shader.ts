// Shader compile/link plumbing — the WebGL2 boilerplate that every renderer in the suite
// otherwise duplicates (Complex Dynamics' glPlot, Quadrature Domains' schwarz-webgl / sphere-webgl).
// Compiling a shader and linking a program is data-independent: it knows nothing about escape-time,
// fractals, or which uniforms a program declares. Promoted to @cas/gpu so the renderers share one
// copy (ADR-0007 — the QD Schwarz/sphere renderers are the second consumer).
//
// Two granularities are offered because the consumers differ: CD builds programs straight from
// source strings (`createProgram`), while QD compiles the shared fractal shader once and links it
// into several programs (`compileShader` + `linkProgram`, the latter taking compiled shader objects).
//
// These call a live WebGL2 context, so they cannot be unit-tested in the node environment; they are
// exercised by both apps' builds and by CD's browser boot (the escape-time program is built through
// `createProgram`), and get property-test coverage with the dual-backend GLSL≈JS harness.

export function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader");
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log}`);
  }
  return shader;
}

/** Link two already-compiled shaders into a program. Does not delete the shaders (the caller owns
 *  their lifetime — QD reuses the shared fractal shader across programs). Throws on link failure. */
export function linkProgram(
  gl: WebGL2RenderingContext,
  vertex: WebGLShader,
  fragment: WebGLShader,
): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("Failed to create program");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${log}`);
  }
  return program;
}

/** Compile a vertex + fragment source pair and link them into a program. The shaders are flagged
 *  for deletion once linked, so they are freed with the program. Throws on compile or link failure. */
export function createProgram(
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string,
): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  try {
    return linkProgram(gl, vertex, fragment);
  } finally {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
  }
}
