// The forward-mapped body mesh (ADR-0038, HD-6.3). Tessellate the disk exterior {1 ≤ |w| ≤ rMax} into a
// polar grid and warp every vertex through ψ to z = ψ(w), tagging it with the exact physical velocity
// dW/dz = W_ref'(w)/ψ'(w) and the stream function Im W_ref(w). The GPU (bodyMeshShader.ts) draws the
// coloured field by interpolating these across the triangles — no per-pixel inverse ψ⁻¹ (the cusped
// bodies have none). Pure (no WebGL), so the geometry is node-tested; the rings are denser near the body
// (r = rMax^{j/nR}) where the field bends most, and the r = 1 ring is exactly ψ(∂𝔻), the body outline.
import { type Pt } from "@cas/flow";
import { physicalVelocity, potential, type ResolvedBody } from "../bodyModel.js";

export interface BodyMesh {
  /** Interleaved vertices: [posX, posY, velX, velY, stream] × vertexCount. */
  readonly vertices: Float32Array;
  /** Triangle indices into the vertex array (two triangles per polar cell). */
  readonly indices: Uint32Array;
  readonly vertexCount: number;
  /** Floats per vertex (5). */
  readonly stride: number;
  /** ψ(∂𝔻) — the r = 1 ring, the body outline (nTheta + 1 points, seam duplicated). */
  readonly outline: Pt[];
}

export interface BodyMeshOptions {
  /** Outer radius of the tessellated disk exterior (must cover the view). */
  readonly rMax?: number;
  /** Radial divisions (rings = nR + 1). */
  readonly nR?: number;
  /** Angular divisions (columns = nTheta + 1, the seam duplicated to close the ring). */
  readonly nTheta?: number;
}

const STRIDE = 5;

/** Build the coloured body mesh for a resolved body (airfoil or gallery). */
export function buildBodyMesh(body: ResolvedBody, opts: BodyMeshOptions = {}): BodyMesh {
  const rMax = opts.rMax ?? 8;
  const nR = opts.nR ?? 48;
  const nTheta = opts.nTheta ?? 360;
  const cols = nTheta + 1;
  const rows = nR + 1;
  const vertexCount = rows * cols;

  const vertices = new Float32Array(vertexCount * STRIDE);
  const outline: Pt[] = [];

  const logRMax = Math.log(rMax);
  let v = 0;
  for (let j = 0; j < rows; j++) {
    const r = Math.exp((logRMax * j) / nR); // r₀ = 1, r_nR = rMax, denser near the body
    for (let i = 0; i < cols; i++) {
      const t = (2 * Math.PI * i) / nTheta;
      const w: Pt = [r * Math.cos(t), r * Math.sin(t)];
      const z = body.psi(w);
      const vel = physicalVelocity(body, w);
      const stream = potential(body, w)[1]; // Im W_ref = the stream function ψ
      vertices[v] = z[0];
      vertices[v + 1] = z[1];
      vertices[v + 2] = vel[0];
      vertices[v + 3] = vel[1];
      vertices[v + 4] = stream;
      v += STRIDE;
      if (j === 0) outline.push(z); // the r = 1 ring is ψ(∂𝔻)
    }
  }

  const indices = new Uint32Array(nR * nTheta * 6);
  let k = 0;
  for (let j = 0; j < nR; j++) {
    for (let i = 0; i < nTheta; i++) {
      const a = j * cols + i;
      const b = a + 1; // (j, i+1)
      const c = a + cols; // (j+1, i)
      const d = c + 1; // (j+1, i+1)
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }

  return { vertices, indices, vertexCount, stride: STRIDE, outline };
}
