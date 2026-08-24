/**
 * The interactive WebGL2 plot: owns the context (with loss/restore), the compiled program (rebuilt
 * when f changes), the colormap atlas texture, the view (center + world half-height), the color state,
 * and HiDPI / progressive (draft-while-interacting) rendering. Coordinate helpers keep the world point
 * under the cursor fixed during pan and zoom. Deep-zoom (df64) is deferred (backlog L1); the view is a
 * plain float64 center for now, which the coordinate math keeps swap-ready.
 *
 * Two more render paths reuse the *same* `colorAt` (Phase 5, `render3d/`): the **analytic landscape**
 * (5A/5B — a grid mesh displaced by the height field, through an orbit camera) and the **Riemann sphere**
 * (5C — a fullscreen per-fragment ray-cast, so ∞ is a literal point). All three programs are rebuilt
 * together on every `f` change; `mode` (`2d` / `3d` / `sphere`) selects which `paint()` draws, and the 2D
 * path is unchanged when `mode` is `2d`.
 */
import { createProgram } from "@cas/gpu/shader";
import { compileF } from "@cas/expr/glsl";
import { parse } from "@cas/expr/parser";
import { freeParameters, substitute } from "@cas/expr/ast";
import { differentiate } from "@cas/expr/derivative";
import { makeComplexFn } from "@cas/expr/evaluate";
import type { Complex } from "@cas/expr/complex";
import { detectRiemannForm, type RiemannForm } from "../riemann/inverse.js";
import { detectAlgebraicCurve, type AlgebraicCurve } from "../riemann/algebraicCurve.js";
import { buildCurveMesh } from "../riemann/curveMesh.js";
import { buildRiemannProgram, buildCurveProgram } from "../render3d/riemannSurface.js";
import {
  buildParamPickMesh,
  pickMeshFromCurve,
  pickRiemannSurface,
  type PickMesh,
  type RiemannHit,
} from "../riemann/pickMesh.js";
import {
  type Vec3,
  add3,
  sub3,
  scale3,
  cross3,
  normalize3,
  length3,
} from "../render3d/mat4.js";
import { buildFragmentShader, VERTEX_SHADER } from "./colorShader.js";
import { bakeAtlas } from "./colormaps.js";
import { injectPngText } from "@cas/export";
import { clampLongEdge, exportDims } from "./exportImage.js";
import {
  type OrbitCamera,
  DEFAULT_CAMERA,
  TOP_DOWN,
  clampElevation,
  cameraEye,
  viewProjection,
  landscapeWorldPerPixel,
} from "../render3d/camera.js";
import { buildGridMesh, GRID_N_BASE } from "../render3d/mesh.js";
import { pickHeightField } from "../render3d/pick.js";
import { buildSurfaceProgram } from "../render3d/surfaceShader.js";
import {
  type Quat,
  arcballDelta,
  quatMultiply,
  quatNormalize,
  worldToModel,
  DEFAULT_ROTATION,
  SPHERE_DIST_MIN,
  SPHERE_DIST_MAX,
  SPHERE_DIST_DEFAULT,
} from "../render3d/sphere.js";
import { buildSphereFragment } from "../render3d/sphereShader.js";

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

/** A CSS-pixel viewport rect (a `getBoundingClientRect`-compatible subset): the region a client pixel is
 *  measured against — the whole canvas in 2D, or the flat half in the linked view. */
export interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
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
  /** 1 = flag undersampled pixels (where the phase winds fast — near poles, essential singularities, or zeros). */
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
  uOpacity: WebGLUniformLocation | null;
}

/** The Riemann-sphere uniforms, on top of the shared {@link ColorUniformLocs}. */
interface SphereUniforms extends ColorUniformLocs {
  uResolution: WebGLUniformLocation | null;
  uEyeDist: WebGLUniformLocation | null;
  uTanHalfFov: WebGLUniformLocation | null;
  uWorldToModel: WebGLUniformLocation | null;
  uLightDir: WebGLUniformLocation | null;
}

/** The Riemann-surface uniforms (ADR-0027), on top of the shared {@link ColorUniformLocs}. */
interface RiemannUniforms extends ColorUniformLocs {
  uVP: WebGLUniformLocation | null;
  uTCenter: WebGLUniformLocation | null;
  uTHalf: WebGLUniformLocation | null;
  uHeightSource: WebGLUniformLocation | null;
  uHeightScale: WebGLUniformLocation | null;
  uLightDir: WebGLUniformLocation | null;
  uShaded: WebGLUniformLocation | null;
  uOpacity: WebGLUniformLocation | null;
}

/** The algebraic-curve uniforms (ADR-0028): the baked-mesh program has no t-window (positions are baked). */
interface CurveUniforms extends ColorUniformLocs {
  uVP: WebGLUniformLocation | null;
  uHeightSource: WebGLUniformLocation | null;
  uHeightScale: WebGLUniformLocation | null;
  uLightDir: WebGLUniformLocation | null;
  uShaded: WebGLUniformLocation | null;
  uOpacity: WebGLUniformLocation | null;
}

const MAX_BUFFER = 2200; // cap the largest framebuffer dimension (perf / memory guard)
const SPHERE_FOV = (50 * Math.PI) / 180; // vertical field of view for the Riemann-sphere camera
// 3D landscape framing (§B): the perspective eye distance = span * SURFACE_FRAMING / tan(fov/2), so the
// surface fills a consistent share of the viewport at every zoom. Tuned so the default Γ view fills the
// window without clipping its pole spikes.
const SURFACE_FRAMING = 0.42;

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
  // `gridN` (cells per side) adapts to the zoom (§B): {@link reconcileMeshResolution}, so a deep zoom
  // stays smooth without a wastefully dense mesh when zoomed out.
  private gridN = GRID_N_BASE;
  private gridUvBuffer: WebGLBuffer | null = null;
  private gridIndexBuffer: WebGLBuffer | null = null;
  private gridIndexCount = 0;
  private surfaceProgram: WebGLProgram | null = null;
  private surfaceUniforms: SurfaceUniforms | null = null;
  private surfaceParamLocs = new Map<string, WebGLUniformLocation | null>();
  private surfaceVao: WebGLVertexArrayObject | null = null;

  // Riemann-sphere path (Phase 5, 5C / F7). A third fullscreen program ray-casts the sphere, reusing the
  // same `colorAt`; the drag accumulates `sphereRotation` (a quaternion), the wheel dollies `sphereDist`.
  private sphereProgram: WebGLProgram | null = null;
  private sphereUniforms: SphereUniforms | null = null;
  private sphereParamLocs = new Map<string, WebGLUniformLocation | null>();
  private sphereVao: WebGLVertexArrayObject | null = null;
  private sphereRotation: Quat = DEFAULT_ROTATION;
  private sphereDist = SPHERE_DIST_DEFAULT;

  // Riemann-surface path (ADR-0027). A fourth program renders the true multi-sheeted surface of a
  // recognized invertible primitive (√, ⁿ√, z^(p/q), log, arcsin/arccos/arctan + affine wraps) by the
  // parametrize-by-w method: the same grid mesh is reinterpreted over the value plane (uniformizer `t`),
  // positioned by `z = gZFn(t)`, coloured by the shared `colorAt`, lifted by the Re/Im-w charisma. Built
  // from the compiled inverse ASTs the registry supplies; null when the active map isn't a recognized
  // primitive (then the mode is unavailable and the app offers only the principal-branch views).
  private riemannForm: RiemannForm | null = null;
  private gzGlsl: string | null = null; // compiled z = gZFn(t)  (position)
  private gwGlsl: string | null = null; // compiled w = gWFn(t)  (value / colour)
  private riemannProgram: WebGLProgram | null = null;
  private riemannUniforms: RiemannUniforms | null = null;
  private riemannVao: WebGLVertexArrayObject | null = null;
  private riemannTarget: Vec3 = [0, 0, 0]; // framed surface centroid (orbit look-at)
  private riemannBaseDist = 6; // framing distance that fits the surface (dolly resets to this)
  /** Orbit-camera dolly distance for the Riemann surface (set to frame the surface; wheel/pinch adjust). */
  riemannDist = 6;
  /** Charisma axis: 0 = Re w (algebraic interlocking sheets), 1 = Im w (the log helicoid). */
  riemannHeightSource = 0;
  /** How many sheets to render for an infinite-sheeted primitive (log / inverse trig); finite ones ignore it. */
  riemannSheets = 3;
  /** Linked base-plane pane (M3.2, ADR-0029): split the Riemann view — the flat base plane beside the
   *  surface, hover-linked. The base plane reads {@link view} (the curve mesh is built over it; for the
   *  parametric path {@link view} is framed to the surface's base-plane extent when this turns on). */
  riemannLinked = false;
  /** The parametric surface's base-plane (z) extent, from the last framing — used to frame the linked
   *  base-plane pane's {@link view} so it shows the region the surface actually covers. */
  private riemannXYBounds: { minx: number; maxx: number; miny: number; maxy: number } | null = null;

  // Algebraic-curve path (ADR-0028, M2a). When the active map is NOT an M1 primitive but IS a single-radical
  // algebraic map `w = R(z)^(p/q)`, the surface is a CPU-built baked mesh (NPP proximity gluing over the
  // z-view) rendered by the function-independent curve program. `riemannKindV` records which path is live.
  private riemannCurve: AlgebraicCurve | null = null;
  private riemannKindV: "param" | "curve" | null = null;
  private curveProgram: WebGLProgram | null = null;
  private curveUniforms: CurveUniforms | null = null;
  private curveVao: WebGLVertexArrayObject | null = null;
  private curvePosBuffer: WebGLBuffer | null = null;
  private curveWBuffer: WebGLBuffer | null = null;
  private curveSheetFns: ((z: Complex, c: Complex) => Complex)[] = []; // one per branch combo (principal)
  private curveTriCount = 0;
  private curveHoles = 0;
  private curveCapped = false;
  // Raw curve-mesh bounds (world xy + Re/Im-w ranges, WITHOUT heightScale) so a height-axis / exaggeration
  // change re-frames the camera cheaply (charisma height is a shader uniform) without rebuilding the mesh.
  private curveBounds: {
    minx: number;
    maxx: number;
    miny: number;
    maxy: number;
    minReW: number;
    maxReW: number;
    minImW: number;
    maxImW: number;
  } | null = null;

  // Multi-sheet hover-pick (M3.1, ADR-0029). The curve arrays are cached from the last `buildCurveMesh` (they
  // were upload-and-discard before) so the pick can ray-cast the same triangles. The parametric pick mesh is
  // sampled lazily (`paramPickDirty`) — only when a hover actually needs it — and reused until the form /
  // t-window changes (a height-axis / exaggeration change does NOT dirty it: height is recomputed at pick
  // time from the stored uniformizer basis, matching the shader).
  private curvePickPositions: Float32Array | null = null;
  private curvePickValues: Float32Array | null = null;
  private paramPickMesh: PickMesh | null = null;
  private paramPickDirty = true;

  /** Which view `paint()` draws. `linked` renders the 2D portrait and the 3D landscape side by side
   *  (split viewports), both reading the same `view`, so navigating either keeps them in sync (I7). */
  mode: "2d" | "3d" | "sphere" | "linked" | "riemann" = "2d";
  /** The orbit camera for the 3D landscape (its `target` is taken from the view centre at paint time). */
  camera: OrbitCamera = { ...DEFAULT_CAMERA };
  /** Height compression: 0 log|f|, 1 linear |f|, 2 stereographic (see `render3d/height.ts`). */
  heightMode = 0;
  /** Height exaggeration (world units per unit of normalized height). */
  heightScale = 1;
  /** Add a specular highlight to the landscape (5B, F2). */
  specular = false;
  /** Surface opacity for the 3D landscape (§E): 1 = opaque; < 1 draws translucent (alpha-blended). */
  opacity = 1;
  /** ∞-inspector (5C, F8): plot `f(1/z)` instead of `f(z)`, so the origin shows the behaviour at ∞.
   *  Applied as a `z → 1/z` AST substitution, so the GPU (2D + surface) and the CPU instruments agree. */
  inspectInfinity = false;
  /** Derivative overlay (H9): plot `f′(z)` instead of `f(z)`. Applied as a symbolic `d/dz` on the AST
   *  (after any ∞-substitution), so every downstream instrument describes the plotted derivative. Throws
   *  on a map with no symbolic derivative — the caller keeps the previous program and shows the error. */
  plotDerivative = false;

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
    if (this.plotDerivative) ast = differentiate(ast, "z"); // plot f′ — the derivative overlay (H9)
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
    // Riemann-surface mode (ADR-0027): recognize the plotted map as an invertible primitive and compile
    // its parametrize-by-w position/value maps. `null` (the common case) leaves the mode unavailable. The
    // maps reference no live parameters (affine constants are baked), so they compile with no params.
    const prevPrim = this.riemannForm?.primitive;
    const prevKind = this.riemannKindV;
    this.riemannForm = detectRiemannForm(ast);
    // The algebraic-curve path (ADR-0028) is consulted only when the M1 parametric form declines, so
    // single primitives keep the cheaper, exact parametric surface.
    this.riemannCurve = this.riemannForm ? null : detectAlgebraicCurve(ast);
    this.riemannKindV = this.riemannForm ? "param" : this.riemannCurve ? "curve" : null;
    if (this.riemannForm) {
      this.gzGlsl = compileF(this.riemannForm.zFromT, "gZFn");
      this.gwGlsl = compileF(this.riemannForm.wFromT, "gWFn");
      // Reset the charisma axis / sheet count to the form's defaults only when the PRIMITIVE changes, so an
      // edit within the same family (log(z) → log(2z)) keeps the user's chosen axis and sheet count.
      if (this.riemannForm.primitive !== prevPrim) {
        this.riemannHeightSource = this.riemannForm.heightSource === "im" ? 1 : 0;
        this.riemannSheets = this.riemannForm.sheetCount;
      }
    } else {
      this.gzGlsl = null;
      this.gwGlsl = null;
      // Entering the curve path (from a non-curve state) defaults to Re-w charisma; a curve→curve edit
      // keeps the user's chosen axis.
      if (this.riemannCurve && prevKind !== "curve") this.riemannHeightSource = 0;
    }
    // Compile the per-combo sheet evaluators (principal; the root-of-unity factors are baked into each AST).
    this.curveSheetFns = this.riemannCurve
      ? this.riemannCurve.sheetExprs.map((e) => makeComplexFn(e, {}))
      : [];
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
    this.initCurveGpu();
    this.rebuildCurveMesh();
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
    this.rebuildSphereProgram();
    this.rebuildRiemannProgram();
    this.rebuildCurveMesh(); // no-op until initCurveGpu has created the buffers
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
      uOpacity: loc("uOpacity"),
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

  /** Build the Riemann-sphere program (a fullscreen ray-cast fragment sharing the fullscreen-triangle
   *  vertex shader) for the current `f`, its uniforms, and its VAO. Called from {@link rebuildProgram}. */
  private rebuildSphereProgram(): void {
    const gl = this.gl;
    const program = createProgram(
      gl,
      VERTEX_SHADER,
      buildSphereFragment(this.fGlsl, this.paramNamesList),
    );
    if (this.sphereProgram) gl.deleteProgram(this.sphereProgram);
    this.sphereProgram = program;
    this.sphereParamLocs = new Map(
      this.paramNamesList.map((n) => [n, gl.getUniformLocation(program, `uParam_${n}`)]),
    );
    const loc = (name: string): WebGLUniformLocation | null =>
      gl.getUniformLocation(program, name);
    this.sphereUniforms = {
      uResolution: loc("uResolution"),
      uEyeDist: loc("uEyeDist"),
      uTanHalfFov: loc("uTanHalfFov"),
      uWorldToModel: loc("uWorldToModel"),
      uLightDir: loc("uLightDir"),
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
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    if (this.sphereVao) gl.deleteVertexArray(this.sphereVao);
    this.sphereVao = svao;
  }

  /** Build the Riemann-surface program (ADR-0027) for the current recognized form, its uniforms, and its
   *  VAO (the shared grid buffers bound to `aUV` + the index buffer). A no-op that clears the program when
   *  the active map isn't a recognized primitive. Called from {@link rebuildProgram}. */
  private rebuildRiemannProgram(): void {
    const gl = this.gl;
    if (this.riemannProgram) {
      gl.deleteProgram(this.riemannProgram);
      this.riemannProgram = null;
    }
    if (this.riemannVao) {
      gl.deleteVertexArray(this.riemannVao);
      this.riemannVao = null;
    }
    this.paramPickMesh = null; // the form changed — the hover-pick mesh (M3.1) must be re-sampled
    this.paramPickDirty = true;
    if (!this.riemannForm || !this.gzGlsl || !this.gwGlsl) return;
    const src = buildRiemannProgram(this.gzGlsl, this.gwGlsl);
    const program = createProgram(gl, src.vertex, src.fragment);
    this.riemannProgram = program;
    const loc = (name: string): WebGLUniformLocation | null =>
      gl.getUniformLocation(program, name);
    this.riemannUniforms = {
      uVP: loc("uVP"),
      uTCenter: loc("uTCenter"),
      uTHalf: loc("uTHalf"),
      uHeightSource: loc("uHeightSource"),
      uHeightScale: loc("uHeightScale"),
      uLightDir: loc("uLightDir"),
      uShaded: loc("uShaded"),
      uOpacity: loc("uOpacity"),
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
    const rvao = gl.createVertexArray();
    gl.bindVertexArray(rvao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridUvBuffer);
    const aUV = gl.getAttribLocation(program, "aUV");
    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.gridIndexBuffer); // recorded in the VAO
    gl.bindVertexArray(null);
    this.riemannVao = rvao;
    this.updateRiemannFraming();
  }

  /** The `t`-window half-extents for the current form + sheet count (about the origin). */
  private riemannWindow(): { halfX: number; halfY: number } {
    return this.riemannForm ? this.riemannForm.window(this.riemannSheets) : { halfX: 2, halfY: 2 };
  }

  /** Sample the surface over its `t`-window (CPU inverse) to frame the orbit camera on it: the look-at
   *  point becomes the surface centroid and the dolly distance is set to fit its radius. Pole-adjacent
   *  samples (e.g. tan near ±π/2) are discarded so a few blow-ups don't wreck the framing. Recomputed when
   *  the form, sheet count, height source, or height scale changes. */
  private updateRiemannFraming(): void {
    const form = this.riemannForm;
    if (!form) return;
    const zc = makeComplexFn(form.zFromT, {});
    const { halfX, halfY } = this.riemannWindow();
    const N = 15;
    let minx = Infinity,
      maxx = -Infinity,
      miny = Infinity,
      maxy = -Infinity,
      minh = Infinity,
      maxh = -Infinity;
    for (let j = 0; j < N; j++) {
      const ti = -halfY + (2 * halfY * j) / (N - 1);
      for (let i = 0; i < N; i++) {
        const tr = -halfX + (2 * halfX * i) / (N - 1);
        // Charisma height comes from the uniformizer t (bounded by the window), matching the shader.
        const h = (this.riemannHeightSource === 1 ? ti : tr) * this.heightScale;
        let z: Complex;
        try {
          z = zc([tr, ti], [0, 0]);
        } catch {
          continue;
        }
        if (!Number.isFinite(z[0]) || !Number.isFinite(z[1])) continue;
        if (Math.hypot(z[0], z[1]) > 1e3) continue; // skip pole-adjacent position blow-ups (tan/log edges)
        minx = Math.min(minx, z[0]);
        maxx = Math.max(maxx, z[0]);
        miny = Math.min(miny, z[1]);
        maxy = Math.max(maxy, z[1]);
        minh = Math.min(minh, h);
        maxh = Math.max(maxh, h);
      }
    }
    this.riemannXYBounds = Number.isFinite(minx) ? { minx, maxx, miny, maxy } : null;
    this.frameToBounds(minx, maxx, miny, maxy, minh, maxh);
  }

  /** Set the orbit target + dolly distance to fit a world bounding box (shared by the parametric and the
   *  algebraic-curve framing). The distance is clamped to a sane envelope (a defensive backstop). */
  private frameToBounds(
    minx: number,
    maxx: number,
    miny: number,
    maxy: number,
    minh: number,
    maxh: number,
  ): void {
    if (!Number.isFinite(minx) || !Number.isFinite(maxx)) {
      this.riemannTarget = [0, 0, 0];
      this.riemannBaseDist = 6;
      this.riemannDist = 6;
      return;
    }
    const radius = Math.max((maxx - minx) / 2, (maxy - miny) / 2, (maxh - minh) / 2, 0.5);
    this.riemannTarget = [(minx + maxx) / 2, (miny + maxy) / 2, (minh + maxh) / 2];
    this.riemannBaseDist = Math.min(1e4, Math.max(0.1, (1.35 * radius) / Math.tan(this.camera.fov / 2)));
    this.riemannDist = this.riemannBaseDist;
  }

  /** Create the algebraic-curve GPU resources once (ADR-0028): the function-independent baked-mesh program,
   *  its attribute buffers (`aPos` world xy, `aW` sheet value), and its VAO. Called from
   *  {@link initGpuResources} (also on a context restore). The mesh itself is (re)built by
   *  {@link rebuildCurveMesh}. */
  private initCurveGpu(): void {
    const gl = this.gl;
    const src = buildCurveProgram();
    const program = createProgram(gl, src.vertex, src.fragment);
    if (this.curveProgram) gl.deleteProgram(this.curveProgram);
    this.curveProgram = program;
    const loc = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(program, name);
    this.curveUniforms = {
      uVP: loc("uVP"),
      uHeightSource: loc("uHeightSource"),
      uHeightScale: loc("uHeightScale"),
      uLightDir: loc("uLightDir"),
      uShaded: loc("uShaded"),
      uOpacity: loc("uOpacity"),
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
    this.curvePosBuffer = gl.createBuffer();
    this.curveWBuffer = gl.createBuffer();
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.curvePosBuffer);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.curveWBuffer);
    const aW = gl.getAttribLocation(program, "aW");
    gl.enableVertexAttribArray(aW);
    gl.vertexAttribPointer(aW, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    if (this.curveVao) gl.deleteVertexArray(this.curveVao);
    this.curveVao = vao;
  }

  /** (Re)build the algebraic-curve mesh (ADR-0028) for the current map + z-view, upload it to the attribute
   *  buffers, and frame the orbit camera on it. A no-op unless the active map is a recognized curve (and the
   *  GPU buffers exist). The z-window is the current {@link view}; the charisma height is applied in-shader,
   *  so this need not rerun on a height-axis / exaggeration change (only the framing does — see
   *  {@link reframeRiemann}). */
  private rebuildCurveMesh(): void {
    if (this.riemannKindV !== "curve" || !this.riemannCurve || !this.curvePosBuffer || !this.curveWBuffer)
      return;
    const gl = this.gl;
    const aspect = this.canvas.height > 0 ? this.canvas.width / this.canvas.height : 1;
    const fns = this.curveSheetFns;
    const mesh = buildCurveMesh(
      { sheetsAt: (z) => fns.map((f) => f(z, [0, 0])), sheetCount: fns.length },
      { cx: this.view.cx, cy: this.view.cy, span: this.view.span, aspect },
    );
    this.curveTriCount = mesh.triangleCount;
    this.curveHoles = mesh.droppedTriangles;
    this.curveCapped = mesh.capped;
    this.curvePickPositions = mesh.positions; // cache for the hover-pick ray-cast (M3.1)
    this.curvePickValues = mesh.values;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.curvePosBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.curveWBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.values, gl.DYNAMIC_DRAW);
    // Record raw bounds (xy + Re/Im-w ranges, no heightScale) so a height change re-frames without a rebuild.
    const pos = mesh.positions;
    const val = mesh.values;
    const b = {
      minx: Infinity,
      maxx: -Infinity,
      miny: Infinity,
      maxy: -Infinity,
      minReW: Infinity,
      maxReW: -Infinity,
      minImW: Infinity,
      maxImW: -Infinity,
    };
    for (let i = 0; i < pos.length; i += 2) {
      b.minx = Math.min(b.minx, pos[i]);
      b.maxx = Math.max(b.maxx, pos[i]);
      b.miny = Math.min(b.miny, pos[i + 1]);
      b.maxy = Math.max(b.maxy, pos[i + 1]);
      b.minReW = Math.min(b.minReW, val[i]);
      b.maxReW = Math.max(b.maxReW, val[i]);
      b.minImW = Math.min(b.minImW, val[i + 1]);
      b.maxImW = Math.max(b.maxImW, val[i + 1]);
    }
    this.curveBounds = pos.length ? b : null;
    this.frameCurve();
  }

  /** Frame the orbit camera on the current curve mesh from its stored bounds and the live height axis /
   *  exaggeration — cheap (no mesh rebuild), so a height slider stays smooth. */
  private frameCurve(): void {
    const b = this.curveBounds;
    if (!b) {
      this.frameToBounds(NaN, NaN, NaN, NaN, NaN, NaN);
      return;
    }
    const wLo = this.riemannHeightSource === 1 ? b.minImW : b.minReW;
    const wHi = this.riemannHeightSource === 1 ? b.maxImW : b.maxReW;
    const s = this.heightScale;
    this.frameToBounds(b.minx, b.maxx, b.miny, b.maxy, wLo * s, wHi * s);
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
    if (this.mode === "sphere") this.paintSphere();
    else if (this.mode === "3d") this.paintSurface();
    else if (this.mode === "linked") this.paintLinked();
    else if (this.mode === "riemann") this.paintRiemann();
    else this.paint2D();
  }

  /** Draw the 2D portrait and the 3D landscape side by side (I7): the left half is the flat portrait, the
   *  right half the surface, both from the same `view` — so a pan/zoom in the flat half moves the surface's
   *  domain and vice versa. Scissored so each half clears / draws only its own region. */
  private paintLinked(): void {
    const gl = this.gl;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const halfW = Math.max(1, Math.round(W / 2));
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, 0, halfW, H); // left half — the flat portrait fills its viewport, no clear needed
    this.paint2D(0, 0, halfW, H);
    gl.scissor(halfW, 0, W - halfW, H); // right half — the surface clears + draws its own region
    this.paintSurface(halfW, 0, W - halfW, H);
    gl.disable(gl.SCISSOR_TEST);
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

  /** Draw the flat portrait into a viewport (defaulting to the whole canvas; a sub-rect for the linked
   *  view's left half). `uResolution` = the viewport size, so the aspect is right at any width. */
  private paint2D(
    vx = 0,
    vy = 0,
    vw: number = this.canvas.width,
    vh: number = this.canvas.height,
  ): void {
    const gl = this.gl;
    const u = this.uniforms;
    if (!this.program || !u) return;
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.viewport(vx, vy, vw, vh);
    gl.uniform2f(u.uCenter, this.view.cx, this.view.cy);
    gl.uniform1f(u.uHalfSpan, this.view.span);
    gl.uniform2f(u.uResolution, vw, vh);
    this.applyColorUniforms(u);
    this.applyParamUniforms(this.paramLocs);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Draw the analytic-landscape surface: the grid mesh displaced by the height field, orbit-camera
   *  projected, coloured by the shared `colorAt`. The camera looks at the view centre `[cx, cy, 0]`, so
   *  a top-down orthographic camera lines the surface up with the 2D portrait. */
  private paintSurface(
    vx = 0,
    vy = 0,
    vw: number = this.canvas.width,
    vh: number = this.canvas.height,
  ): void {
    const gl = this.gl;
    const u = this.surfaceUniforms;
    if (!this.surfaceProgram || !u || !this.surfaceVao) return;
    const aspect = vh > 0 ? vw / vh : 1;
    gl.useProgram(this.surfaceProgram);
    gl.bindVertexArray(this.surfaceVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.viewport(vx, vy, vw, vh);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.06, 0.068, 0.082, 1); // ≈ the app's --bg, so the surface sits in a dark scene
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const cam = this.surfaceCamera();
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
    gl.uniform1f(u.uOpacity, this.opacity);
    this.applyColorUniforms(u); // also sets uModScale, which the vertex height law shares
    this.applyParamUniforms(this.surfaceParamLocs);
    // A translucent surface (§E) blends over the scene and its own far side. Stop writing depth so
    // nearer triangles don't z-reject the farther ones behind them (they draw in index order — a mild,
    // acceptable painter's approximation for one smooth layer). The depth clear above already ran with
    // the default write mask on, so the buffer is clean. Opaque surfaces keep exact depth occlusion.
    const translucent = this.opacity < 1;
    if (translucent) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
    }
    gl.drawElements(gl.TRIANGLES, this.gridIndexCount, gl.UNSIGNED_INT, 0);
    if (translucent) {
      gl.disable(gl.BLEND);
      gl.depthMask(true);
    }
    gl.disable(gl.DEPTH_TEST);
  }

  /** Draw the Riemann sphere: a fullscreen ray-cast, oriented by `sphereRotation`, coloured by the shared
   *  `colorAt` (so ∞ is the literal north pole). No depth test — the ray-cast owns visibility. */
  private paintSphere(): void {
    const gl = this.gl;
    const u = this.sphereUniforms;
    if (!this.sphereProgram || !u || !this.sphereVao) return;
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.sphereProgram);
    gl.bindVertexArray(this.sphereVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(u.uResolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uEyeDist, this.sphereDist);
    gl.uniform1f(u.uTanHalfFov, Math.tan(SPHERE_FOV / 2));
    gl.uniformMatrix3fv(u.uWorldToModel, false, worldToModel(this.sphereRotation));
    gl.uniform3f(u.uLightDir, 0.4, 0.5, 0.75);
    this.applyColorUniforms(u);
    this.applyParamUniforms(this.sphereParamLocs);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Draw the Riemann view: the surface alone (full canvas), or — when {@link riemannLinked} — the flat
   *  base plane beside the surface (M3.2), scissored like {@link paintLinked}. */
  private paintRiemann(): void {
    if (this.riemannLinked) {
      this.paintRiemannLinked();
      return;
    }
    this.paintRiemannSurface();
  }

  /** Draw the live Riemann surface into a viewport (default: the whole canvas) — dispatch to the parametric
   *  (M1) or the baked algebraic-curve (M2) path. */
  private paintRiemannSurface(
    vx = 0,
    vy = 0,
    vw: number = this.canvas.width,
    vh: number = this.canvas.height,
  ): void {
    if (this.riemannKindV === "curve") this.paintRiemannCurve(vx, vy, vw, vh);
    else this.paintRiemannParam(vx, vy, vw, vh);
  }

  /** Draw the flat base plane (left) beside the Riemann surface (right), both scissored (M3.2). The base
   *  plane reads {@link view}; the surface owns its orbit framing. Navigating either updates the readout via
   *  the hover-link (main.ts), not a shared view. */
  private paintRiemannLinked(): void {
    const gl = this.gl;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const halfW = Math.max(1, Math.round(W / 2));
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, 0, halfW, H); // left half — the flat base-plane portrait
    this.paint2D(0, 0, halfW, H);
    gl.scissor(halfW, 0, W - halfW, H); // right half — the surface clears + draws its own region
    this.paintRiemannSurface(halfW, 0, W - halfW, H);
    gl.disable(gl.SCISSOR_TEST);
  }

  /** Draw the parametric (M1, ADR-0027) surface: the grid mesh reinterpreted over the value plane,
   *  positioned by `z = gZFn(t)`, lifted by the Re/Im-t charisma, coloured by the shared `colorAt`, through
   *  an orbit camera framed on the surface. A no-op (dark clear) when no parametric form is active. */
  private paintRiemannParam(
    vx = 0,
    vy = 0,
    vw: number = this.canvas.width,
    vh: number = this.canvas.height,
  ): void {
    const gl = this.gl;
    const u = this.riemannUniforms;
    gl.viewport(vx, vy, vw, vh);
    gl.clearColor(0.06, 0.068, 0.082, 1); // ≈ the app's --bg (scissored to this pane in the linked view)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!this.riemannProgram || !u || !this.riemannVao) return;
    const aspect = vh > 0 ? vw / vh : 1;
    const cam = this.riemannCamera(); // perspective, framed on the surface (shared with the hover-pick)
    const { halfX, halfY } = this.riemannWindow();
    gl.useProgram(this.riemannProgram);
    gl.bindVertexArray(this.riemannVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.enable(gl.DEPTH_TEST);
    // Frame the surface with a world-half-height ≈ its dolly-scaled radius so near/far bracket it.
    const worldHalf = Math.max(0.5, this.riemannDist * Math.tan(cam.fov / 2));
    gl.uniformMatrix4fv(u.uVP, false, viewProjection(cam, aspect, worldHalf));
    gl.uniform2f(u.uTCenter, 0, 0);
    gl.uniform2f(u.uTHalf, halfX, halfY);
    gl.uniform1i(u.uHeightSource, this.riemannHeightSource);
    gl.uniform1f(u.uHeightScale, this.heightScale);
    gl.uniform3f(u.uLightDir, 0.4, 0.5, 0.75);
    gl.uniform1f(u.uShaded, 1);
    gl.uniform1f(u.uOpacity, this.opacity);
    this.applyColorUniforms(u);
    const translucent = this.opacity < 1;
    if (translucent) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
    }
    gl.drawElements(gl.TRIANGLES, this.gridIndexCount, gl.UNSIGNED_INT, 0);
    if (translucent) {
      gl.disable(gl.BLEND);
      gl.depthMask(true);
    }
    gl.disable(gl.DEPTH_TEST);
  }

  /** Draw the baked algebraic-curve surface (M2a, ADR-0028): the CPU-built triangle soup (world xy +
   *  per-vertex sheet value), lifted in-shader by the Re/Im-w charisma, coloured by the shared `colorAt`,
   *  through the same orbit camera. A no-op (dark clear) when no curve is active or the mesh is empty. */
  private paintRiemannCurve(
    vx = 0,
    vy = 0,
    vw: number = this.canvas.width,
    vh: number = this.canvas.height,
  ): void {
    const gl = this.gl;
    const u = this.curveUniforms;
    gl.viewport(vx, vy, vw, vh);
    gl.clearColor(0.06, 0.068, 0.082, 1); // ≈ the app's --bg (scissored to this pane in the linked view)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!this.curveProgram || !u || !this.curveVao || this.curveTriCount === 0) return;
    const aspect = vh > 0 ? vw / vh : 1;
    const cam = this.riemannCamera(); // perspective, framed on the surface (shared with the hover-pick)
    gl.useProgram(this.curveProgram);
    gl.bindVertexArray(this.curveVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.enable(gl.DEPTH_TEST);
    const worldHalf = Math.max(0.5, this.riemannDist * Math.tan(cam.fov / 2));
    gl.uniformMatrix4fv(u.uVP, false, viewProjection(cam, aspect, worldHalf));
    gl.uniform1i(u.uHeightSource, this.riemannHeightSource);
    gl.uniform1f(u.uHeightScale, this.heightScale);
    gl.uniform3f(u.uLightDir, 0.4, 0.5, 0.75);
    gl.uniform1f(u.uShaded, 1);
    gl.uniform1f(u.uOpacity, this.opacity);
    this.applyColorUniforms(u);
    const translucent = this.opacity < 1;
    if (translucent) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
    }
    gl.drawArrays(gl.TRIANGLES, 0, this.curveTriCount * 3);
    if (translucent) {
      gl.disable(gl.BLEND);
      gl.depthMask(true);
    }
    gl.disable(gl.DEPTH_TEST);
  }

  // --- Riemann-surface controls (ADR-0027 / ADR-0028) ---------------------------------------------
  /** Whether the active map has a renderable Riemann surface — an M1 invertible primitive OR an M2a
   *  single-radical algebraic curve — so the Riemann-surface mode is offered. */
  riemannAvailable(): boolean {
    return this.riemannForm !== null || this.riemannCurve !== null;
  }

  /** Which Riemann path is live for the active map: parametric (M1), baked curve (M2a), or none. */
  riemannModeKind(): "param" | "curve" | null {
    return this.riemannKindV;
  }

  /** The parametric (M1) form, or null (curve / none). */
  riemannInfo(): RiemannForm | null {
    return this.riemannForm;
  }

  /** A unified badge descriptor for whichever Riemann path is live, or null. Curve stats (ramification
   *  holes, budget cap) come from the last built mesh — surfaced honestly. */
  riemannDescriptor(): {
    label: string;
    monodromy: string;
    branchNote: string;
    sheetKind: "finite" | "infinite";
    holes: number;
    capped: boolean;
  } | null {
    if (this.riemannForm) {
      const f = this.riemannForm;
      return {
        label: f.label,
        monodromy: f.monodromy,
        branchNote: f.branchNote,
        sheetKind: f.sheetKind,
        holes: 0,
        capped: false,
      };
    }
    if (this.riemannCurve) {
      const c = this.riemannCurve;
      return {
        label: c.label,
        monodromy:
          `${c.sheetCount} sheets` + (c.radicalCount > 1 ? ` · ${c.radicalCount} radicals` : ""),
        branchNote: "sheets glue across the cut; ramification points are small holes",
        sheetKind: "finite",
        holes: this.curveHoles,
        capped: this.curveCapped,
      };
    }
    return null;
  }

  /** Re-frame the Riemann camera, rebuilding the curve mesh over the current z-view when the curve path is
   *  live (use on a view / formula change or mode entry). Safe to call when no surface is active. */
  reframeRiemann(): void {
    if (this.riemannKindV === "curve") this.rebuildCurveMesh();
    else {
      this.updateRiemannFraming();
      this.paramPickDirty = true; // the t-window (sheet count) may have changed — re-sample the pick mesh
    }
  }

  /** Frame the linked base-plane pane's {@link view} on the region the surface covers. For the curve path
   *  the mesh is already built over {@link view}, so it's left as-is; for the parametric path {@link view}
   *  is otherwise unrelated to the surface, so it's set to the surface's base-plane (z) extent. A no-op
   *  unless a surface is active. */
  frameRiemannBaseView(): void {
    if (this.riemannKindV !== "param") return; // curve: `view` already frames the mesh's z-rectangle
    const b = this.riemannXYBounds;
    if (!b) return;
    const halfX = (b.maxx - b.minx) / 2;
    const halfY = (b.maxy - b.miny) / 2;
    this.view = {
      cx: (b.minx + b.maxx) / 2,
      cy: (b.miny + b.maxy) / 2,
      span: Math.max(halfX, halfY, 0.5) * 1.15, // world half-height; a touch of margin
    };
  }

  /** Cheap re-frame after a height-axis / exaggeration change: the curve mesh is unchanged (charisma is a
   *  shader uniform), so only the framing is recomputed — no mesh rebuild, so a height slider stays smooth. */
  reframeRiemannLight(): void {
    if (this.riemannKindV === "curve") this.frameCurve();
    else this.updateRiemannFraming();
  }

  /** Dolly the Riemann orbit camera in/out by a multiplicative factor (clamped). */
  dollyRiemann(factor: number): void {
    this.riemannDist = Math.min(1e5, Math.max(0.05, this.riemannDist * factor));
  }

  /** Reset the Riemann orbit camera to its framed default distance (the surface fitted to the viewport). */
  resetRiemann(): void {
    this.riemannDist = this.riemannBaseDist;
  }

  /** The CPU pick mesh for the live Riemann path (M3.1): the cached curve soup, or the lazily-sampled
   *  parametric grid (built on first use after a form / t-window change), or null (no surface active). */
  private currentRiemannPickMesh(): PickMesh | null {
    if (this.riemannKindV === "curve") {
      return this.curvePickPositions && this.curvePickValues
        ? pickMeshFromCurve(this.curvePickPositions, this.curvePickValues)
        : null;
    }
    if (this.riemannKindV === "param" && this.riemannForm) {
      if (this.paramPickDirty || !this.paramPickMesh) {
        const zFn = makeComplexFn(this.riemannForm.zFromT, {});
        const wFn = makeComplexFn(this.riemannForm.wFromT, {});
        this.paramPickMesh = buildParamPickMesh(
          (t) => zFn(t, [0, 0]),
          (t) => wFn(t, [0, 0]),
          this.riemannWindow(),
        );
        this.paramPickDirty = false;
      }
      return this.paramPickMesh;
    }
    return null;
  }

  /** The Riemann orbit camera (perspective; framed on the surface) — shared by the paint and the pick so
   *  the hover lands on exactly what's drawn. */
  private riemannCamera(): OrbitCamera {
    return {
      ...this.camera,
      ortho: false,
      distance: this.riemannDist,
      target: this.riemannTarget,
    };
  }

  /**
   * Multi-sheet hover-pick (M3.1, ADR-0029): the on-surface point under a client pixel — its base point `z`,
   * the value `w` on the front-most sheet, and the local sheet census (`sheetIndex` of `sheetCount`) over
   * that `z`. Ray-casts the drawn triangles through the same framed camera as the paint, so self-occlusion is
   * honoured (the eye's sheet, not a base-plane shadow). Null over empty scene / when no surface is active.
   */
  pickRiemann(clientX: number, clientY: number, vp?: ViewportRect): RiemannHit | null {
    const mesh = this.currentRiemannPickMesh();
    if (!mesh || mesh.triangleCount === 0) return null;
    const r = this.rect(vp);
    if (r.width <= 0 || r.height <= 0) return null;
    const ndcX = ((clientX - r.left) / r.width) * 2 - 1;
    const ndcY = 1 - ((clientY - r.top) / r.height) * 2;
    const cam = this.riemannCamera();
    const eye = cameraEye(cam);
    const fwd = normalize3(sub3(cam.target, eye));
    let right = cross3(fwd, [0, 0, 1]);
    if (length3(right) < 1e-6) right = [1, 0, 0]; // looking straight down the height axis
    right = normalize3(right);
    const up = normalize3(cross3(right, fwd));
    const tan = Math.tan(cam.fov / 2);
    const aspect = r.width / r.height;
    const dir = normalize3(
      add3(fwd, add3(scale3(right, ndcX * tan * aspect), scale3(up, ndcY * tan))),
    );
    return pickRiemannSurface(mesh, { origin: eye, dir }, this.riemannHeightSource, this.heightScale);
  }

  // --- Riemann-sphere controls (Phase 5, 5C) ------------------------------------------------------
  /** Rotate the sphere by an arcball drag between two normalized pointer positions (uv ∈ [0, 1]²). */
  rotateSphere(prevUv: [number, number], uv: [number, number]): void {
    this.sphereRotation = quatNormalize(
      quatMultiply(arcballDelta(prevUv, uv), this.sphereRotation),
    );
  }

  /** Dolly the sphere camera in/out by a multiplicative factor (clamped outside the unit sphere). */
  dollySphere(factor: number): void {
    this.sphereDist = Math.min(
      SPHERE_DIST_MAX,
      Math.max(SPHERE_DIST_MIN, this.sphereDist * factor),
    );
  }

  /** Reset the sphere to its default orientation and distance. */
  resetSphere(): void {
    this.sphereRotation = DEFAULT_ROTATION;
    this.sphereDist = SPHERE_DIST_DEFAULT;
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

  /**
   * Pan the 3D landscape by a screen-drag delta (CSS px): move the look-at point (= the view centre) in
   * the ground plane so the grabbed domain point tracks the cursor — a "recenter to explore ℂ" pan, so
   * the surface always stays framed (no empty space past its edges). Screen-right and screen-up are
   * projected onto z = 0 through the camera azimuth; the world-per-pixel is **span-coupled** (via
   * {@link landscapeWorldPerPixel}), matching the framing the surface is actually drawn with
   * ({@link surfaceCamera}). That is the whole point of the scale: the stored `camera.distance` is only
   * the orbit dolly and stays fixed through a span-zoom, so deriving the scale from it (as this once did)
   * made the pan speed independent of zoom — a deep zoom then flew across the plane. Signs match the 2D
   * grab-pan feel (content follows the cursor).
   */
  panSurface(dxPx: number, dyPx: number, viewportHeightPx: number): void {
    const cam = this.camera;
    const wpp = landscapeWorldPerPixel(
      this.view.span,
      viewportHeightPx,
      cam.ortho,
      SURFACE_FRAMING,
    );
    const ca = Math.cos(cam.azimuth);
    const sa = Math.sin(cam.azimuth);
    this.view.cx += wpp * (dxPx * sa - dyPx * ca);
    this.view.cy += wpp * (-dxPx * ca - dyPx * sa);
  }

  /** Zoom the 3D landscape by scaling the view span about its centre (§B): scrolling shows more / less
   *  of ℂ, and the span-coupled framing keeps the surface filling the window. Same clamp as {@link zoomAt}. */
  zoomSpan(factor: number): void {
    this.view.span = Math.min(1e6, Math.max(1e-9, this.view.span * factor));
  }

  /** Rebuild the surface grid mesh at `targetN` cells/side (the caller computes it from a field scan —
   *  see `gridResolutionForField`); a no-op when it already matches, so it is cheap to call on every
   *  commit. Re-uploads into the existing buffers, so the surface VAO (which records them) stays valid —
   *  no program / VAO rebuild. */
  reconcileMeshResolution(targetN: number): void {
    const n = Math.round(targetN);
    if (
      !Number.isFinite(n) ||
      n === this.gridN ||
      !this.gridUvBuffer ||
      !this.gridIndexBuffer ||
      !this.surfaceVao
    )
      return;
    this.gridN = n;
    const gl = this.gl;
    const mesh = buildGridMesh(n);
    this.gridIndexCount = mesh.indexCount;
    gl.bindVertexArray(this.surfaceVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.gridUvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.gridIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }

  /** The render camera for the 3D landscape: the orbit camera framed to fill the viewport (§B — the
   *  perspective eye distance tracks the view span; the top-down ortho snap keeps its own distance, its
   *  box sized from span directly, so top-down still equals the 2D portrait) and re-targeted at the view
   *  centre. Shared by the surface paint and the cursor pick so they agree exactly. */
  private surfaceCamera(): OrbitCamera {
    const framedDistance = (this.view.span * SURFACE_FRAMING) / Math.tan(this.camera.fov / 2);
    return {
      ...this.camera,
      distance: this.camera.ortho ? this.camera.distance : framedDistance,
      target: [this.view.cx, this.view.cy, 0],
    };
  }

  /** Value-inspector pick (catalog H1): the domain point (re, im) ON the 3D surface under a client pixel,
   *  or null if the cursor is over empty scene. `heightFn(re, im)` is the CPU height field (|f| → height),
   *  supplied by the caller so this stays DOM/GL-free. Uses the same framed camera as the paint, so the
   *  pick matches what's drawn (surface height + self-occlusion accounted for, not a base-plane shadow). */
  pickSurface(
    clientX: number,
    clientY: number,
    heightFn: (re: number, im: number) => number,
    vp?: ViewportRect,
  ): [number, number] | null {
    const r = this.rect(vp);
    if (r.width <= 0 || r.height <= 0) return null;
    const ndcX = ((clientX - r.left) / r.width) * 2 - 1;
    const ndcY = 1 - ((clientY - r.top) / r.height) * 2;
    const cam = this.surfaceCamera();
    return pickHeightField(
      {
        eye: cameraEye(cam),
        target: cam.target,
        fov: cam.fov,
        ortho: cam.ortho,
        worldHalfHeight: this.view.span,
      },
      ndcX,
      ndcY,
      r.width / r.height,
      heightFn,
    );
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
  // All take an optional CSS viewport rect (the region the flat portrait occupies): the whole canvas in
  // 2D mode, or the left half in the linked view — so a pan/zoom in the linked flat pane maps correctly.
  private rect(vp?: ViewportRect): ViewportRect {
    return vp ?? this.canvas.getBoundingClientRect();
  }

  private aspect(vp?: ViewportRect): number {
    const r = this.rect(vp);
    return r.height > 0 ? r.width / r.height : 1;
  }

  screenToWorld(clientX: number, clientY: number, vp?: ViewportRect): [number, number] {
    const r = this.rect(vp);
    const nx = r.width > 0 ? (clientX - r.left) / r.width - 0.5 : 0;
    const ny = r.height > 0 ? 0.5 - (clientY - r.top) / r.height : 0;
    return [
      this.view.cx + nx * 2 * this.view.span * this.aspect(vp),
      this.view.cy + ny * 2 * this.view.span,
    ];
  }

  /** Move the center so that `world` sits under the given client pixel (drag-pan / zoom anchor). */
  setCenterAtScreen(
    clientX: number,
    clientY: number,
    world: [number, number],
    vp?: ViewportRect,
  ): void {
    const r = this.rect(vp);
    const nx = r.width > 0 ? (clientX - r.left) / r.width - 0.5 : 0;
    const ny = r.height > 0 ? 0.5 - (clientY - r.top) / r.height : 0;
    this.view.cx = world[0] - nx * 2 * this.view.span * this.aspect(vp);
    this.view.cy = world[1] - ny * 2 * this.view.span;
  }

  /** Zoom by `factor` about a client pixel, keeping the world point under it fixed. */
  zoomAt(clientX: number, clientY: number, factor: number, vp?: ViewportRect): void {
    const before = this.screenToWorld(clientX, clientY, vp);
    this.view.span = Math.min(1e6, Math.max(1e-9, this.view.span * factor));
    this.setCenterAtScreen(clientX, clientY, before, vp);
  }

  /**
   * A hi-resolution PNG of the current view (any mode — 2D, landscape, or sphere) whose LONG edge is
   * `longEdge` px, aspect preserved, embedding `metadata` as reproducibility `tEXt` (catalog K1/K3). The
   * `preserveDrawingBuffer` context means this is just "grow the buffer, paint, read back": we size the
   * drawing buffer up (bypassing {@link resize}, which caps at DPR / `MAX_BUFFER` for the live view),
   * {@link paint} the current mode, `toBlob`, then restore the live buffer with a normal {@link draw}.
   * Async (canvas `toBlob` is), and it may down-clamp `longEdge` to the GL `MAX_TEXTURE_SIZE`.
   */
  async exportBlob(
    longEdge: number,
    metadata: Record<string, string> = {},
  ): Promise<Blob> {
    const { size } = clampLongEdge(
      longEdge,
      this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number,
    );
    const { w, h } = exportDims(this.aspect() || 1, size);
    this.canvas.width = w;
    this.canvas.height = h;
    this.paint();
    const raw = await new Promise<Blob>((resolve, reject) => {
      this.canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))),
        "image/png",
      );
    });
    this.draw(false); // restore the live buffer to the CSS size (also re-clears the export size)
    if (Object.keys(metadata).length === 0) return raw;
    // injectPngText returns a fresh full-length buffer at offset 0, so its `.buffer` is exactly the PNG
    // bytes (the cast just narrows ArrayBufferLike → ArrayBuffer for the strict BlobPart type).
    const stamped = injectPngText(new Uint8Array(await raw.arrayBuffer()), metadata);
    return new Blob([stamped.buffer as ArrayBuffer], { type: "image/png" });
  }

  /** The largest hi-res export long-edge this device supports (the GL `MAX_TEXTURE_SIZE`), so the UI can
   *  offer only sizes that will actually render. */
  maxExportEdge(): number {
    return this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
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
