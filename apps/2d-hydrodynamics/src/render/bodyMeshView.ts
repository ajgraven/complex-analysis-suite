// The body-pane GL renderer (ADR-0038, HD-6.3): draws the forward-mapped coloured mesh (bodyMesh.ts)
// through the mesh shaders (bodyMeshShader.ts). The interleaved vertex buffer [posX, posY, velX, velY,
// stream] is re-uploaded each paint (the map/flow change with the controls); the index buffer is static
// (the polar topology is fixed) so it is uploaded once and reused. One renderer per pane canvas.
import { createProgram } from "@cas/gpu/shader";
import { BODY_MESH_VERTEX_SHADER, BODY_MESH_FRAGMENT_SHADER } from "./bodyMeshShader.js";
import { type BodyMesh } from "./bodyMesh.js";
import { type FieldView } from "./diskView.js";

export interface BodyMeshRenderer {
  render(mesh: BodyMesh, view: FieldView, modScale: number, streamSpacing: number): void;
  destroy(): void;
}

export function createBodyMeshRenderer(gl: WebGL2RenderingContext): BodyMeshRenderer {
  const program = createProgram(gl, BODY_MESH_VERTEX_SHADER, BODY_MESH_FRAGMENT_SHADER);
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  const ibo = gl.createBuffer();
  if (!vao || !vbo || !ibo) throw new Error("2D Hydrodynamics body pane: failed to allocate GL buffers.");

  const BYTES = Float32Array.BYTES_PER_ELEMENT; // 4
  const strideBytes = 5 * BYTES;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.enableVertexAttribArray(0); // aPos
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, strideBytes, 0);
  gl.enableVertexAttribArray(1); // aVel
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, strideBytes, 2 * BYTES);
  gl.enableVertexAttribArray(2); // aStream
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, strideBytes, 4 * BYTES);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bindVertexArray(null);

  const u = {
    center: gl.getUniformLocation(program, "uCenter"),
    halfSpan: gl.getUniformLocation(program, "uHalfSpan"),
    resolution: gl.getUniformLocation(program, "uResolution"),
    modScale: gl.getUniformLocation(program, "uModScale"),
    stream: gl.getUniformLocation(program, "uStreamSpacing"),
  };

  let uploadedIndexCount = -1;

  return {
    render(mesh: BodyMesh, view: FieldView, modScale: number, streamSpacing: number): void {
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.DYNAMIC_DRAW);
      if (mesh.indices.length !== uploadedIndexCount) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
        uploadedIndexCount = mesh.indices.length;
      }
      gl.useProgram(program);
      gl.uniform2f(u.center, view.center[0], view.center[1]);
      gl.uniform1f(u.halfSpan, view.halfSpan);
      gl.uniform2f(u.resolution, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(u.modScale, modScale);
      gl.uniform1f(u.stream, streamSpacing);
      gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);
    },
    destroy(): void {
      gl.deleteBuffer(vbo);
      gl.deleteBuffer(ibo);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    },
  };
}
