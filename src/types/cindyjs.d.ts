/**
 * Minimal ambient declarations for the parts of the CindyJS / CindyGL API this
 * app uses. CindyJS is loaded as a global via a classic <script> tag (see
 * index.html), so it is declared on the global scope rather than imported.
 *
 * This is intentionally narrow — it types only `evokeCS` and `exportPNG` plus a
 * loose config object, not the full library surface.
 */

interface CindyGeometryElement {
  name: string;
  kind: string;
  type: string;
  pos: [number, number];
  size: number;
}

interface CindyConfig {
  canvasname: string;
  scripts: Record<string, string>;
  geometry: CindyGeometryElement[];
  ports: Array<Record<string, unknown>>;
}

interface CindyInstance {
  /** Evaluate a CindyScript snippet against this instance. */
  evokeCS(code: string): void;
  /** Export the current canvas as a PNG download with the given filename. */
  exportPNG(filename: string): void;
}

declare function CindyJS(config: CindyConfig): CindyInstance;
