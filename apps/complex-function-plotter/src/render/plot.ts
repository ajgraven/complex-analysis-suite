/**
 * The interactive WebGL2 plot: owns the context (with loss/restore), the compiled program (rebuilt
 * when f changes), the colormap atlas texture, the view (center + world half-height), the color state,
 * and HiDPI / progressive (draft-while-interacting) rendering. Coordinate helpers keep the world point
 * under the cursor fixed during pan and zoom. Deep-zoom (df64) is deferred (backlog L1); the view is a
 * plain float64 center for now, which the coordinate math keeps swap-ready.
 *
 * A second, 3D render path (Phase 5, 5A) draws the same map as an **analytic landscape**: a grid mesh
 * displaced by the height field and coloured by the *same* `colorAt`, through an orbit camera
 * (`render3d/`). Both programs are rebuilt together on every `f` change; `mode` selects which `paint()`
 * draws, and the 2D path is unchanged when `mode` is `2d`.
 */
import { createProgram } from "@cas/gpu/shader";
import { compileF } from "@cas/expr/glsl";
import { parse } from "@cas/expr/parser";
import { freeParameters, substitute } from "@cas/expr/ast";
import { differentiate } from "@cas/expr/derivative";
import { buildFragmentShader, VERTEX_SHADER } from "./colorShader.js";
import { bakeAtlas } from "./colormaps.js";
import {
  type OrbitCamera,
  DEFAULT_CAMERA,
  TOP_DOWN,
  clampElevation,
  cameraEye,
  viewProjection,
} from "../render3d/camera.js";
import { buildGridMesh } from "../render3d/mesh.js";
import { buildSurfaceProgram } from "../render3d/surfaceShader.js";

/** A live parameter value `[re, im]` (ADR-0011). Kept as a plain tuple, the shape the `uParam_<name>`
 *  uniforms and the JS instruments both consume. */
export type ParamValue = [number, number];

/** Default value for a newly-introduced parameter — nonzero so the map is visibly parameter-dependent
 *  the moment a name appears (e.g. `a*z*(1-z)` renders rather than collapsing to 0). */
const NEW_PARAM_DEFAULT: ParamValue = [1, 0];

export interface View {
  cx: number;
  cy: number;
  /** World half-height of the viewport; x extent is span·aspect. */
  span: number;
}

export interface ColorState {
  /** Index into COLORMAPS (atlas row). */
  colormap: number;
  /** Modulus transfer: 0 constant, 1 linear, 2 rational, 3 log, 4 log-log. */
  modulus: number;
  /** Reference |f| for the linear / log / log-log transfers. */
  modScale: number;
  /** Enhancement overlay: 0 none, 1 modulus rings, 2 phase sectors, 3 conformal grid, 4 polar chessboard, 5 Re/Im grid. */
  enhance: number;
  /** Sectors per turn / grid density for the enhancement (where applicable). */
  sectors: number;
  /** Enhancement style: 0 shaded bands, 1 crisp lines. */
  crisp: number;
  /** Hue rotation (radians) applied to arg before the colormap lookup. */
  hueShift: number;
  /** Hue winding direction: +1 or -1. */
  hueSign: number;
  /** Colour-vision-deficiency preview: 0 none, 1 protan, 2 deutan, 3 tritan (a viewing aid). */
  cvd: number;
  /** 1 = flag undersampled pixels (near poles / essential singularities). */
  uncertainty: number;
  /** Draw the |f| = c contour when > 0 (0 = off). */
  levelAbs: number;
  /** 1 = draw the arg f = levelArg contour. */
  levelArgOn: number;
  /** arg-level for the level set, in radians. */
  levelArg: number;
}

/** The colouring uniforms shared by the 2D fragment and the 3D surface fragment (both include the same
 *  `colorAt`), so one setter fills them for either program. */
interface ColorUniformLocs {
  uPhaseLUT: WebGLUniformLocation | null;
  uPhaseRow: WebGLUniformLocation | null;
  uModulus: WebGLUniformLocation | null;
  uModScale: WebGLUniformLocation | null;
  uEnhance: WebGLUniformLocation | null;
  uSectors: WebGLUniformLocation | null;
  uCrisp: WebGLUniformLocation | null;
  uHueShift: WebGLUniformLocation | null;
  uHueSign: WebGLUniformLocation | null;
  uCvd: WebGLUniformLocation | null;
  uUncertainty: WebGLUniformLocation | null;
  uLevelAbs: WebGLUniformLocation | null;
  uLevelArgOn: WebGLUniformLocation | null;
  uLevelArg: WebGLUniformLocation | null;
}

interface Uniforms extends ColorUniformLocs {
  uCenter: WebGLUniformLocation | null;
  uHalfSpan: WebGLUniformLocation | null;
  uResolution: WebGLUniformLocation | null;
}

/** The 3D-surface-specific uniforms, on top of the shared {@link ColorUniformLocs}. */
interface SurfaceUniforms extends ColorUniformLocs {
  uVP: WebGLUniformLocation | null;
  uCenter: WebGLUniformLocation | null;
  uHalfSpan: WebGLUniformLocation | null;
  uAspect: WebGLUniformLocation | null;
  uHeightMode: WebGLUniformLocation | null;
  uHeightScale: WebGLUniformLocation | null;
  uLightDir: WebGLUniformLocation | null;
  uShaded: WebGLUniformLocation | null;
  uEye: WebGLUniformLocation | null;
  uSpecular: WebGLUniformLocation | null;
}

const MAX_BUFFER = 2200; // cap the largest framebuffer dimension (perf / memory guard)

export class Plot {
  private readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private uniforms: Uniforms | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private quadBuffer: WebGLBuffer | null = null;
  private atlasTex: WebGLTexture | null = null;
  private atlasHeight = 1;
  private fGlsl: string;
  // The compiled derivative `fpFn` = f'(z) for the analytic surface normal (5B, F4), or null when the
  // map isn't differentiable in the system (Γ / ζ / anti-holomorphic) — then the surface uses the
  // geometric normal. Recomputed with `f`.
  private fpGlsl: string | null = null;
  private draft = false;

  // 3D analytic-landscape path (Phase 5, 5A). A second program renders the domain grid mesh displaced
  // by the height field, reusing the same `colorAt`. Built alongside the 2D program on every `f` change;
  // `mode` selects which one `paint()` draws. The 2D path is byte-for-byte unchanged when `mode` is 2d.
  private readonly gridN = 160;
  private gridUvBuffer: WebGLBuffer | null = null;
  private gridIndexBuffer: WebGLBuffer | null = null;
  private gridIndexCount = 0;
  private surfaceProgram: WebGLProgram | null = null;
  private surfaceUniforms: SurfaceUniforms | null = null;
  private surfaceParamLocs = new Map<string, WebGLUniformLocation | null>();
  private surfaceVao: WebGLVertexArrayObject | null = null;

  /** Which view `paint()` draws. */
  mode: "2d" | "3d" = "2d";
  /** The orbit camera for the 3D landscape (its `target` is taken from the view centre at paint time). */
  camera: OrbitCamera = { ...DEFAULT_CAMERA };
  /** Height compression: 0 log|f|, 1 linear |f|, 2 stereographic (see `render3d/height.ts`). */
  heightMode = 0;
  /** Height exaggeration (world units per unit of normalized height). */
  heightScale = 1;
  /** Add a specular highlight to the landscape (5B, F2). */
  specular = false;
  /** ∞-inspector (5C, F8): plot `f(1/z)` instead of `f(z)`, so the origin shows the behaviour at ∞.
   *  Applied as a `z → 1/z` AST substitution, so the GPU (2D + surface) and the CPU instruments agree. */
  inspectInfinity = false;

  // Live named parameters (ADR-0011, catalog G1). `paramNamesList` is the ordered set the current `f`
  // reads (from `freeParameters`); `paramValues` holds each one's `[re, im]` (preserved across formula
  // edits so tweaking a value doesn't reset the others); `paramLocs` caches the `uParam_<name>` uniform
  // locations for the current program. Changing a value is a re-uniform (cheap); changing the SET of
  // names is a program rebuild (a new formula).
  private paramNamesList: string[] = [];
  private paramValues = new Map<string, ParamValue>();
  private paramLocs = new Map<string, WebGLUniformLocation | null>();

  view: View = { cx: 0, cy: 0, span: 2 };
  color: ColorState = {
    colormap: 0,
    modulus: 2,
    modScale: 8,
    enhance: 0,
    sectors: 12,
    crisp: 1,
    hueShift: 0,
    hueSign: 1,
    cvd: 0,
    uncertainty: 0,
    levelAbs: 0,
    levelArgOn: 0,
    levelArg: 0,
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    initialSource: string,
  ) {
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("WebGL2 is unavailable in this browser");
    this.gl = gl;
    this.fGlsl = this.compileSource(initialSource); // seeds paramNamesList / paramValues too
    this.initGpuResources();

    canvas.addEventListener("webglcontextlost", (e) => e.preventDefault());
    canvas.addEventListener("webglcontextrestored", () => {
      this.initGpuResources();
      this.render();
    });
  }

  /**
   * Parse + compile `src`, updating `paramNamesList` / `paramValues` for the map's named parameters
   * (preserving the value of any name that survives the edit, defaulting a new name), and return the
   * GLSL. The plotter always takes the general `{ params }` path — so it binds every parameter through
   * `uParam_<name>` and never touches the legacy `uA` (ADR-0011). Throws `ExprError` on a bad parse.
   */
  private compileSource(src: string): string {
    let ast = parse(src);
    if (this.inspectInfinity) ast = substitute(ast, "z", parse("1/z")); // plot f(1/z) — the ∞-inspector
    const names = freeParameters(ast);
    const glsl = compileF(ast, "fFn", { params: names });
    // f' for the analytic surface normal (5B), when the map is differentiable in the system. Compiled
    // with the same parameters so `fpFn` aliases from the same `uParam_<name>` uniforms as `fFn`.
    try {
      this.fpGlsl = compileF(differentiate(ast, "z"), "fpFn", { params: names });
    } catch {
      this.fpGlsl = null; // non-holomorphic / no derivative builtin → geometric normal
    }
    const nextValues = new Map<string, ParamValue>();
    for (const n of names)
      nextValues.set(n, this.paramValues.get(n) ?? [...NEW_PARAM_DEFAULT]);
    this.paramNamesList = names;
    this.paramValues = nextValues;
    return glsl;
  }

  /** (Re)create the quad, atlas texture, and program — used at startup and after a context restore. */
  private initGpuResources(): void {
    const gl = this.gl;
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    // The reusable domain grid mesh for the 3D surface (uploaded once; the vertex shader maps its UVs
    // into the current view rectangle, so the same buffers serve any pan/zoom).
    const mesh = buildGridMesh(this.gridN);
    this.gridIndexCount = mesh.indexCount;
    this.gridUvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridUvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.STATIC_DRAW);
    this.gridIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.gridIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    this.buildAtlas();
    this.rebuildProgram();
  }

  private buildAtlas(): void {
    const gl = this.gl;
    const atlas = bakeAtlas(256);
    this.atlasHeight = atlas.height;
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      atlas.width,
      atlas.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      atlas.data,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); // phase wraps seamlessly at 0/1
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.atlasTex = tex;
  }

  private rebuildProgram(): void {
    const gl = this.gl;
    const program = createProgram(
      gl,
      VERTEX_SHADER,
      buildFragmentShader(this.fGlsl, this.paramNamesList),
    );
    if (this.program) gl.deleteProgram(this.program);
    this.program = program;
    this.paramLocs = new Map(
      this.paramNamesList.map((n) => [n, gl.getUniformLocation(program, `uParam_${n}`)]),
    );
    this.uniforms = {
      uCenter: gl.getUniformLocation(program, "uCenter"),
      uHalfSpan: gl.getUniformLocation(program, "uHalfSpan"),
      uResolution: gl.getUniformLocation(program, "uResolution"),
      uPhaseLUT: gl.getUniformLocation(program, "uPhaseLUT"),
      uPhaseRow: gl.getUniformLocation(program, "uPhaseRow"),
      uModulus: gl.getUniformLocation(program, "uModulus"),
      uModScale: gl.getUniformLocation(program, "uModScale"),
      uEnhance: gl.getUniformLocation(program, "uEnhance"),
      uSectors: gl.getUniformLocation(program, "uSectors"),
      uCrisp: gl.getUniformLocation(program, "uCrisp"),
      uHueShift: gl.getUniformLocation(program, "uHueShift"),
      uHueSign: gl.getUniformLocation(program, "uHueSign"),
      uCvd: gl.getUniformLocation(program, "uCvd"),
      uUncertainty: gl.getUniformLocation(program, "uUncertainty"),
      uLevelAbs: gl.getUniformLocation(program, "uLevelAbs"),
      uLevelArgOn: gl.getUniformLocation(program, "uLevelArgOn"),
      uLevelArg: gl.getUniformLocation(program, "uLevelArg"),
    };
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    if (this.vao) gl.deleteVertexArray(this.vao);
    this.vao = vao;

    this.rebuildSurfaceProgram();
  }

  /** Build the 3D surface program (vertex-displaced grid + `colorAt` fragment) for the current `f`, its
   *  uniform locations, and its VAO (the shared grid buffers bound to `aUV` + the index buffer). Called
   *  from {@link rebuildProgram}, so the surface tracks every formula / parameter-set change. */
  private rebuildSurfaceProgram(): void {
    const gl = this.gl;
    const src = buildSurfaceProgram(this.fGlsl, this.paramNamesList, this.fpGlsl);
    const program = createProgram(gl, src.vertex, src.fragment);
    if (this.surfaceProgram) gl.deleteProgram(this.surfaceProgram);
    this.surfaceProgram = program;
    this.surfaceParamLocs = new Map(
      this.paramNamesList.map((n) => [n, gl.getUniformLocation(program, `uParam_${n}`)]),
    );
    const loc = (name: string): WebGLUniformLocation | null =>
      gl.getUniformLocation(program, name);
    this.surfaceUniforms = {
      uVP: loc("uVP"),
      uCenter: loc("uCenter"),
      uHalfSpan: loc("uHalfSpan"),
      uAspect: loc("uAspect"),
      uHeightMode: loc("uHeightMode"),
      uHeightScale: loc("uHeightScale"),
      uLightDir: loc("uLightDir"),
      uShaded: loc("uShaded"),
      uEye: loc("uEye"),
      uSpecular: loc("uSpecular"),
      uPhaseLUT: loc("uPhaseLUT"),
      uPhaseRow: loc("uPhaseRow"),
      uModulus: loc("uModulus"),
      uModScale: loc("uModScale"),
      uEnhance: loc("uEnhance"),
      uSectors: loc("uSectors"),
      uCrisp: loc("uCrisp"),
      uHueShift: loc("uHueShift"),
      uHueSign: loc("uHueSign"),
      uCvd: loc("uCvd"),
      uUncertainty: loc("uUncertainty"),
      uLevelAbs: loc("uLevelAbs"),
      uLevelArgOn: loc("uLevelArgOn"),
      uLevelArg: loc("uLevelArg"),
    };
    const svao = gl.createVertexArray();
    gl.bindVertexArray(svao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridUvBuffer);
    const aUV = gl.getAttribLocation(program, "aUV");
    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.gridIndexBuffer); // recorded in the VAO
    gl.bindVertexArray(null);
    if (this.surfaceVao) gl.deleteVertexArray(this.surfaceVao);
    this.surfaceVao = svao;
  }

  /**
   * Compile `src` and swap in the new program, keeping the old one on failure (so a transient typo
   * never blanks the canvas). Throws the `@cas/expr` ExprError / a shader-compile Error for the caller
   * to surface — the view and color state are untouched.
   */
  setFunction(src: string): void {
    const prevGlsl = this.fGlsl;
    const prevFp = this.fpGlsl;
    const prevNames = this.paramNamesList;
    const prevValues = this.paramValues;
    const next = this.compileSource(src); // throws ExprError on a bad parse; updates param + f' state
    this.fGlsl = next;
    try {
      this.rebuildProgram(); // throws if the assembled GLSL fails to compile
    } catch (err) {
      this.fGlsl = prevGlsl;
      this.fpGlsl = prevFp;
      this.paramNamesList = prevNames;
      this.paramValues = prevValues;
      this.rebuildProgram();
      throw err;
    }
  }

  // --- Live parameters (ADR-0011, catalog G1) -----------------------------------------------------
  /** The map's live parameter names, in stable (sorted) order — one control per name. */
  paramNames(): readonly string[] {
    return this.paramNamesList;
  }

  /** The current value of a parameter (`[0, 0]` if it isn't one of this map's parameters). */
  paramValue(name: string): ParamValue {
    return this.paramValues.get(name) ?? [0, 0];
  }

  /** All parameter values as a plain map — for share-links and the CPU instruments (`makeComplexFn`). */
  paramsRecord(): Record<string, ParamValue> {
    return Object.fromEntries(this.paramValues);
  }

  /** Set a parameter value (a re-uniform, no recompile). Ignores names the current map doesn't use. */
  setParamValue(name: string, value: ParamValue): void {
    if (this.paramValues.has(name)) this.paramValues.set(name, [value[0], value[1]]);
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = (this.draft ? 0.5 : 1) * dpr;
    let w = Math.max(1, Math.round(this.canvas.clientWidth * scale));
    let h = Math.max(1, Math.round(this.canvas.clientHeight * scale));
    const largest = Math.max(w, h);
    if (largest > MAX_BUFFER) {
      const k = MAX_BUFFER / largest;
      w = Math.max(1, Math.round(w * k));
      h = Math.max(1, Math.round(h * k));
    }
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** Render once. Pass `draft = true` for a fast half-resolution pass during interaction (L3). */
  draw(draft = false): void {
    this.draft = draft;
    this.render();
  }

  private render(): void {
    this.resize();
    this.paint();
  }

  /** Draw the current state into the canvas at its current buffer size (no resize) — shared by the live
   *  {@link render} and the {@link renderThumbnail} sweep capture. Dispatches to the flat portrait or the
   *  3D landscape by {@link mode}. */
  private paint(): void {
    if (this.mode === "3d") this.paintSurface();
    else this.paint2D();
  }

  /** Set the shared colour uniforms (phase LUT + modulus + enhancement + level sets + uncertainty + CVD)
   *  on whichever program is current — identical for the 2D fragment and the 3D surface fragment. */
  private applyColorUniforms(u: ColorUniformLocs): void {
    const gl = this.gl;
    const c = this.color;
    gl.uniform1i(u.uPhaseLUT, 0);
    gl.uniform1f(u.uPhaseRow, (c.colormap + 0.5) / this.atlasHeight);
    gl.uniform1i(u.uModulus, c.modulus);
    gl.uniform1f(u.uModScale, c.modScale);
    gl.uniform1i(u.uEnhance, c.enhance);
    gl.uniform1f(u.uSectors, c.sectors);
    gl.uniform1i(u.uCrisp, c.crisp);
    gl.uniform1f(u.uHueShift, c.hueShift);
    gl.uniform1f(u.uHueSign, c.hueSign);
    gl.uniform1i(u.uCvd, c.cvd);
    gl.uniform1i(u.uUncertainty, c.uncertainty);
    gl.uniform1f(u.uLevelAbs, c.levelAbs);
    gl.uniform1i(u.uLevelArgOn, c.levelArgOn);
    gl.uniform1f(u.uLevelArg, c.levelArg);
  }

  /** Set the live named-parameter uniforms (ADR-0011) on the given program's locations. */
  private applyParamUniforms(locs: Map<string, WebGLUniformLocation | null>): void {
    for (const name of this.paramNamesList) {
      const v = this.paramValues.get(name) ?? [0, 0];
      this.gl.uniform2f(locs.get(name) ?? null, v[0], v[1]);
    }
  }

  private paint2D(): void {
    const gl = this.gl;
    const u = this.uniforms;
    if (!this.program || !u) return;
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(u.uCenter, this.view.cx, this.view.cy);
    gl.uniform1f(u.uHalfSpan, this.view.span);
    gl.uniform2f(u.uResolution, this.canvas.width, this.canvas.height);
    this.applyColorUniforms(u);
    this.applyParamUniforms(this.paramLocs);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Draw the analytic-landscape surface: the grid mesh displaced by the height field, orbit-camera
   *  projected, coloured by the shared `colorAt`. The camera looks at the view centre `[cx, cy, 0]`, so
   *  a top-down orthographic camera lines the surface up with the 2D portrait. */
  private paintSurface(): void {
    const gl = this.gl;
    const u = this.surfaceUniforms;
    if (!this.surfaceProgram || !u || !this.surfaceVao) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const aspect = h > 0 ? w / h : 1;
    gl.useProgram(this.surfaceProgram);
    gl.bindVertexArray(this.surfaceVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.viewport(0, 0, w, h);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.06, 0.068, 0.082, 1); // ≈ the app's --bg, so the surface sits in a dark scene
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const cam: OrbitCamera = { ...this.camera, target: [this.view.cx, this.view.cy, 0] };
    gl.uniformMatrix4fv(u.uVP, false, viewProjection(cam, aspect, this.view.span));
    gl.uniform2f(u.uCenter, this.view.cx, this.view.cy);
    gl.uniform1f(u.uHalfSpan, this.view.span);
    gl.uniform1f(u.uAspect, aspect);
    gl.uniform1i(u.uHeightMode, this.heightMode);
    gl.uniform1f(u.uHeightScale, this.heightScale);
    gl.uniform3f(u.uLightDir, 0.4, 0.5, 0.75);
    const eye = cameraEye(cam);
    gl.uniform3f(u.uEye, eye[0], eye[1], eye[2]);
    gl.uniform1i(u.uSpecular, this.specular ? 1 : 0);
    // Shade the landscape, except in the exact top-down view — there it must reproduce the 2D portrait.
    const topDown = cam.ortho && cam.elevation > Math.PI / 2 - 1e-3;
    gl.uniform1f(u.uShaded, topDown ? 0 : 1);
    this.applyColorUniforms(u); // also sets uModScale, which the vertex height law shares
    this.applyParamUniforms(this.surfaceParamLocs);
    gl.drawElements(gl.TRIANGLES, this.gridIndexCount, gl.UNSIGNED_INT, 0);
    gl.disable(gl.DEPTH_TEST);
  }

  // --- 3D landscape controls (Phase 5, 5A) --------------------------------------------------------
  /** Orbit the camera by screen-drag deltas (radians); switches to perspective (leaves top-down). */
  orbit(dAzimuth: number, dElevation: number): void {
    this.camera.azimuth += dAzimuth;
    this.camera.elevation = clampElevation(this.camera.elevation + dElevation);
    this.camera.ortho = false;
  }

  /** Dolly the camera in/out by a multiplicative factor (clamped). */
  dolly(factor: number): void {
    this.camera.distance = Math.min(60, Math.max(0.3, this.camera.distance * factor));
  }

  /** Snap to the exact top-down orthographic view — the landscape then equals the 2D portrait. */
  topDown(): void {
    this.camera = { ...this.camera, ...TOP_DOWN };
  }

  /** Reset the orbit camera to its default three-quarter framing. */
  resetCamera(): void {
    this.camera = { ...DEFAULT_CAMERA };
  }

  // --- Coordinate helpers (CSS pixels in client space -> world) -----------------------------------
  private aspect(): number {
    const r = this.canvas.getBoundingClientRect();
    return r.height > 0 ? r.width / r.height : 1;
  }

  screenToWorld(clientX: number, clientY: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    const nx = r.width > 0 ? (clientX - r.left) / r.width - 0.5 : 0;
    const ny = r.height > 0 ? 0.5 - (clientY - r.top) / r.height : 0;
    return [
      this.view.cx + nx * 2 * this.view.span * this.aspect(),
      this.view.cy + ny * 2 * this.view.span,
    ];
  }

  /** Move the center so that `world` sits under the given client pixel (drag-pan / zoom anchor). */
  setCenterAtScreen(clientX: number, clientY: number, world: [number, number]): void {
    const r = this.canvas.getBoundingClientRect();
    const nx = r.width > 0 ? (clientX - r.left) / r.width - 0.5 : 0;
    const ny = r.height > 0 ? 0.5 - (clientY - r.top) / r.height : 0;
    this.view.cx = world[0] - nx * 2 * this.view.span * this.aspect();
    this.view.cy = world[1] - ny * 2 * this.view.span;
  }

  /** Zoom by `factor` about a client pixel, keeping the world point under it fixed. */
  zoomAt(clientX: number, clientY: number, factor: number): void {
    const before = this.screenToWorld(clientX, clientY);
    this.view.span = Math.min(1e6, Math.max(1e-9, this.view.span * factor));
    this.setCenterAtScreen(clientX, clientY, before);
  }

  /** A full-resolution PNG data URL of the current frame (basic export; hi-res tiling is Phase 6). */
  toDataURL(): string {
    this.draw(false);
    return this.canvas.toDataURL("image/png");
  }

  /**
   * Render the current state at a small buffer (`dim`×`dim/aspect`) and return a PNG data URL — the
   * per-cell capture for the parameter-sweep montage (catalog G4). It bypasses {@link resize} (so the
   * buffer stays at the thumbnail size) and does NOT restore; the caller sets each parameter value, calls
   * this per value, then does one `draw()` to restore the full-resolution live view. Because the whole
   * loop is synchronous, the browser only composites that final restored frame — the thumbnail-sized
   * intermediate renders never reach the screen, so the main canvas doesn't flicker.
   */
  renderThumbnail(dim: number): string {
    const aspect = this.aspect() || 1;
    this.canvas.width = Math.max(1, Math.round(dim));
    this.canvas.height = Math.max(1, Math.round(dim / aspect));
    this.paint();
    return this.canvas.toDataURL("image/png");
  }
}
