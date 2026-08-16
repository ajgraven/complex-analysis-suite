// render/polygonEditor.ts — the draggable-vertex polygon editor (M2). A small self-contained canvas where
// the user designs the domain polygon K by dragging its vertices (add / remove / reset). The canvas
// redraws live during a drag, but `onChange` fires only ON COMMIT (pointer release / button action) — the
// point to run the expensive Schwarz–Christoffel refit — so a high-frequency drag doesn't hammer the solve.
// The polygon is defined up to similarity — the right panel renders its Faber transform on the canonical
// (centred, real-c) K, exactly as the polygon PRESETS already do — so this designs the SHAPE, not an
// absolute placement. Vertices are `[x,y]` world coordinates, kept counter-clockwise for the exterior SC
// solve and clamped to the serializable coordinate bound so a shared `#vs=` link stays on-canvas.
import { MAX_POLYGON_COORD, MAX_POLYGON_VERTS, MIN_POLYGON_VERTS } from "../viewState.js";

type Vec2 = [number, number];

const VIEW_HALF = MAX_POLYGON_COORD + 0.3; // world half-extent shown, a margin beyond the editable bound
const HANDLE_R = 6; // vertex handle radius (px)

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Signed area × 2 (shoelace); > 0 ⇒ counter-clockwise. */
function signedArea2(v: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0; i < v.length; i++) {
    const p = v[i];
    const q = v[(i + 1) % v.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a;
}

/** Ensure counter-clockwise orientation (the exterior SC solver's input convention). */
function toCCW(v: Vec2[]): Vec2[] {
  return signedArea2(v) < 0 ? v.slice().reverse() : v;
}

export interface PolygonEditor {
  /** The editor's root element (insert into the DOM). */
  readonly el: HTMLElement;
  /** Load a polygon (replaces the current one) without firing onChange. */
  setPolygon(verts: readonly (readonly [number, number])[]): void;
  /** Show a status line (e.g. the fit's converged/degraded state); `warn` styles it as a warning. */
  setStatus(text: string, warn: boolean): void;
  /** Current vertices (a copy). */
  vertices(): Vec2[];
  dispose(): void;
}

/**
 * Create the polygon editor. `onChange(verts)` fires with the CCW vertices on COMMIT only — pointer release
 * after a drag, and the add/remove/reset buttons — which is when the host runs the SC refit and writes the
 * permalink. The canvas itself redraws continuously during a drag for immediate visual feedback.
 */
export function createPolygonEditor(onChange: (verts: Vec2[]) => void): PolygonEditor {
  let verts: Vec2[] = [];
  let dragIdx = -1;

  const root = el("div", { class: "poly-editor" });
  const canvas = el("canvas", { class: "poly-editor-canvas", width: "280", height: "240" });
  const bar = el("div", { class: "poly-editor-bar" });
  const addBtn = el("button", { type: "button", title: "Add a vertex on the longest edge" }, "＋ vertex");
  const delBtn = el("button", { type: "button", title: "Remove a vertex" }, "－ vertex");
  const resetBtn = el("button", { type: "button", title: "Reset to a pentagon" }, "reset");
  const status = el("span", { class: "poly-editor-status" });
  bar.append(addBtn, delBtn, resetBtn, status);
  const hint = el("div", { class: "poly-editor-hint" }, "Drag vertices to shape the domain K (defined up to similarity).");
  root.append(canvas, bar, hint);

  const ctx = canvas.getContext("2d");

  // World ↔ pixel (square, undistorted): one scale for both axes, centred in the canvas.
  const scale = (): number => Math.min(canvas.width, canvas.height) / (2 * VIEW_HALF);
  const toPx = (p: Vec2): Vec2 => [canvas.width / 2 + p[0] * scale(), canvas.height / 2 - p[1] * scale()];
  const toWorld = (px: number, py: number): Vec2 => [(px - canvas.width / 2) / scale(), -(py - canvas.height / 2) / scale()];

  function draw(): void {
    if (!ctx) return;
    const { width: w, height: h } = canvas;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#12141b";
    ctx.fillRect(0, 0, w, h);
    // grid + axes
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let g = -VIEW_HALF; g <= VIEW_HALF; g += 0.5) {
      const a = toPx([g, -VIEW_HALF]);
      const b = toPx([g, VIEW_HALF]);
      const c = toPx([-VIEW_HALF, g]);
      const d = toPx([VIEW_HALF, g]);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.moveTo(c[0], c[1]);
      ctx.lineTo(d[0], d[1]);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    const ox = toPx([0, 0]);
    ctx.beginPath();
    ctx.moveTo(0, ox[1]);
    ctx.lineTo(w, ox[1]);
    ctx.moveTo(ox[0], 0);
    ctx.lineTo(ox[0], h);
    ctx.stroke();
    if (verts.length >= 2) {
      // polygon fill + outline
      ctx.beginPath();
      const p0 = toPx(verts[0]);
      ctx.moveTo(p0[0], p0[1]);
      for (let i = 1; i < verts.length; i++) {
        const p = toPx(verts[i]);
        ctx.lineTo(p[0], p[1]);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(120,170,255,0.14)";
      ctx.fill();
      ctx.strokeStyle = "rgba(150,190,255,0.85)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // handles
      for (let i = 0; i < verts.length; i++) {
        const p = toPx(verts[i]);
        ctx.beginPath();
        ctx.arc(p[0], p[1], HANDLE_R, 0, 2 * Math.PI);
        ctx.fillStyle = i === dragIdx ? "#ffd479" : "#eaf0ff";
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  const emit = (): void => onChange(toCCW(verts.map((v): Vec2 => [v[0], v[1]])));
  const clamp = (x: number): number => Math.max(-MAX_POLYGON_COORD, Math.min(MAX_POLYGON_COORD, x));

  function pointerPos(e: PointerEvent): Vec2 {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height];
  }
  function hitVertex(px: number, py: number): number {
    for (let i = 0; i < verts.length; i++) {
      const p = toPx(verts[i]);
      if (Math.hypot(p[0] - px, p[1] - py) <= HANDLE_R + 4) return i;
    }
    return -1;
  }

  canvas.addEventListener("pointerdown", (e) => {
    const [px, py] = pointerPos(e);
    dragIdx = hitVertex(px, py);
    if (dragIdx >= 0) {
      canvas.setPointerCapture(e.pointerId);
      draw();
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (dragIdx < 0) return;
    const [px, py] = pointerPos(e);
    const w = toWorld(px, py);
    verts[dragIdx] = [clamp(w[0]), clamp(w[1])];
    draw(); // live canvas feedback only; the refit runs on release
  });
  const endDrag = (e: PointerEvent): void => {
    if (dragIdx < 0) return;
    dragIdx = -1;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    draw();
    emit(); // committed
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  addBtn.addEventListener("click", () => {
    if (verts.length >= MAX_POLYGON_VERTS || verts.length < 2) return;
    // Insert on the longest edge, but OFFSET outward (perpendicular, away from the centroid) so the new
    // vertex is a genuine corner (interior angle ≠ π) — an exact edge midpoint is a degenerate "straight"
    // vertex the exterior SC solve cannot place.
    let best = 0;
    let bestLen = -1;
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len > bestLen) {
        bestLen = len;
        best = i;
      }
    }
    const a = verts[best];
    const b = verts[(best + 1) % verts.length];
    const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const cx = verts.reduce((s, v) => s + v[0], 0) / verts.length;
    const cy = verts.reduce((s, v) => s + v[1], 0) / verts.length;
    let nx = -(b[1] - a[1]) / bestLen;
    let ny = (b[0] - a[0]) / bestLen;
    if (nx * (mid[0] - cx) + ny * (mid[1] - cy) < 0) {
      nx = -nx;
      ny = -ny;
    } // point outward
    const off = 0.18 * bestLen;
    verts.splice(best + 1, 0, [
      clamp(mid[0] + off * nx),
      clamp(mid[1] + off * ny),
    ]);
    draw();
    emit();
  });
  delBtn.addEventListener("click", () => {
    if (verts.length <= MIN_POLYGON_VERTS) return;
    verts.pop();
    draw();
    emit();
  });
  resetBtn.addEventListener("click", () => {
    verts = Array.from({ length: 5 }, (_, k): Vec2 => {
      const t = Math.PI / 2 + (2 * Math.PI * k) / 5;
      return [Number((1.2 * Math.cos(t)).toFixed(3)), Number((1.2 * Math.sin(t)).toFixed(3))];
    });
    draw();
    emit();
  });

  return {
    el: root,
    setPolygon(v) {
      verts = v.map((p): Vec2 => [p[0], p[1]]);
      dragIdx = -1;
      draw();
    },
    setStatus(text, warn) {
      status.textContent = text;
      status.classList.toggle("warn", warn);
    },
    vertices: () => verts.map((v): Vec2 => [v[0], v[1]]),
    dispose() {
      root.remove();
    },
  };
}
