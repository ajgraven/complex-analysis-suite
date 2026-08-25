// The control surface: a palette to ADD singularities and a contextual inspector to EDIT the selected
// one. The monopole inspector exposes the coefficient as its honest decomposition c = q + iγ — a
// CHARGE slider (real part = source/flux) and a CIRCULATION slider (imaginary part = vortex) — with a
// live "residue = q + iγ" readout, so the paper's charge+vortex superposition is directly manipulable.
// The uniform stream (speed U, angle α) rides the toolbar. Everything mutates the shared AppState and
// asks for a repaint; `onSelectionChange` rebuilds the inspector, `refresh` keeps its live readouts in
// step while a handle is dragged on the canvas.
import type { AppState, Placed } from "../state.js";
import { freshId, findSingularity } from "../state.js";
import { uniformFromSpeedAngle } from "../field.js";

export interface Controls {
  /** Rebuild the inspector for the current selection (call when the selection changes). */
  onSelectionChange(): void;
  /** Update the inspector's live readouts (position, residue) without rebuilding (call each paint). */
  refresh(): void;
  destroy(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

interface SliderRow {
  row: HTMLElement;
  input: HTMLInputElement;
  value: HTMLElement;
}
function slider(label: string, min: number, max: number, step: number, value: number): SliderRow {
  const row = el("label", "row");
  const head = el("span", "row-h");
  const name = el("span", "row-l", label);
  const val = el("span", "row-v", value.toFixed(2));
  head.append(name, val);
  const input = el("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  row.append(head, input);
  return { row, input, value: val };
}

const fmt = (v: number): string => (Math.abs(v) < 5e-3 ? "0" : v.toFixed(2));
const complex = (re: number, im: number): string => `${fmt(re)} ${im < 0 ? "−" : "+"} ${fmt(Math.abs(im))}i`;

export function createControls(app: HTMLElement, state: AppState, requestRender: () => void): Controls {
  // --- toolbar: brand · palette · uniform stream -----------------------------
  const bar = el("header", "toolbar");
  const brand = el("div", "brand");
  brand.innerHTML = "<strong>2D Electrostatics</strong><span>charges · sources · vortices · flow</span>";

  const palette = el("div", "palette");
  palette.setAttribute("role", "group");
  palette.setAttribute("aria-label", "Add a singularity");

  const replaceById = (id: number, next: Placed): void => {
    state.singularities = state.singularities.map((s) => (s.id === id ? next : s));
  };

  const add = (make: (id: number) => Placed): void => {
    const s = make(freshId());
    state.singularities = [...state.singularities, s];
    state.selected = s.id;
    requestRender();
    onSelectionChange();
  };
  const at = (): [number, number] => [state.view.center[0], state.view.center[1]];
  const paletteBtn = (label: string, title: string, make: (id: number) => Placed): HTMLButtonElement => {
    const b = el("button", "pal-btn", label);
    b.type = "button";
    b.title = title;
    b.addEventListener("click", () => add(make));
    return b;
  };
  palette.append(
    paletteBtn("Source", "Add a positive charge / source (real residue)", (id) => ({
      id,
      kind: "monopole",
      at: at(),
      c: [1, 0],
    })),
    paletteBtn("Sink", "Add a negative charge / sink", (id) => ({ id, kind: "monopole", at: at(), c: [-1, 0] })),
    paletteBtn("Vortex", "Add a point vortex (imaginary residue → circulation)", (id) => ({
      id,
      kind: "monopole",
      at: at(),
      c: [0, 1],
    })),
    paletteBtn("Doublet", "Add a doublet / dipole", (id) => ({ id, kind: "doublet", at: at(), mu: [0.5, 0] })),
  );

  // Uniform stream: speed U, angle α. Stored as the constant field E0 = U·e^{−iα}.
  let uniformU = Math.hypot(state.uniform[0], state.uniform[1]);
  let uniformA = uniformU > 1e-9 ? -Math.atan2(state.uniform[1], state.uniform[0]) : 0;
  const applyUniform = (): void => {
    state.uniform = uniformFromSpeedAngle(uniformU, uniformA);
    requestRender();
  };
  const uni = el("div", "uniform");
  uni.setAttribute("role", "group");
  uni.setAttribute("aria-label", "Uniform stream");
  const uSpeed = slider("Stream U", 0, 3, 0.05, uniformU);
  const uAngle = slider("Angle α°", -180, 180, 1, (uniformA * 180) / Math.PI);
  uSpeed.input.addEventListener("input", () => {
    uniformU = Number(uSpeed.input.value);
    uSpeed.value.textContent = uniformU.toFixed(2);
    applyUniform();
  });
  uAngle.input.addEventListener("input", () => {
    uniformA = (Number(uAngle.input.value) * Math.PI) / 180;
    uAngle.value.textContent = `${uAngle.input.value}°`;
    applyUniform();
  });
  uni.append(uSpeed.row, uAngle.row);

  bar.append(brand, palette, uni);

  // --- inspector: contextual editor for the selected singularity -------------
  const inspector = el("aside", "inspector");
  inspector.setAttribute("aria-label", "Selected singularity");
  inspector.hidden = true;

  // Live readouts we refresh without a rebuild (position tracks canvas drags; residue tracks sliders).
  let liveId: number | null = null;
  let posEl: HTMLElement | null = null;
  let residueEl: HTMLElement | null = null;

  const onSelectionChange = (): void => {
    inspector.textContent = "";
    liveId = null;
    posEl = null;
    residueEl = null;
    const sel = findSingularity(state, state.selected);
    if (!sel) {
      inspector.hidden = true;
      return;
    }
    inspector.hidden = false;
    liveId = sel.id;

    const title = el(
      "h2",
      "insp-t",
      sel.kind === "doublet" ? "Doublet" : "Monopole — charge + vortex",
    );
    inspector.append(title);

    if (sel.kind === "monopole") {
      const q = slider("Charge q (flux)", -5, 5, 0.05, sel.c[0]);
      const g = slider("Circulation γ", -5, 5, 0.05, sel.c[1]);
      const residueRow = el("div", "readout");
      residueEl = residueRow;
      const setResidue = (): void => {
        const cur = findSingularity(state, sel.id);
        if (cur && cur.kind === "monopole") residueRow.textContent = `residue c = ${complex(cur.c[0], cur.c[1])}`;
      };
      q.input.addEventListener("input", () => {
        const cur = findSingularity(state, sel.id);
        if (!cur || cur.kind !== "monopole") return;
        const v = Number(q.input.value);
        q.value.textContent = v.toFixed(2);
        replaceById(sel.id, { ...cur, c: [v, cur.c[1]] });
        setResidue();
        requestRender();
      });
      g.input.addEventListener("input", () => {
        const cur = findSingularity(state, sel.id);
        if (!cur || cur.kind !== "monopole") return;
        const v = Number(g.input.value);
        g.value.textContent = v.toFixed(2);
        replaceById(sel.id, { ...cur, c: [cur.c[0], v] });
        setResidue();
        requestRender();
      });
      inspector.append(q.row, g.row, residueRow);
      setResidue();
    } else {
      const strength = Math.hypot(sel.mu[0], sel.mu[1]);
      const axis = (Math.atan2(sel.mu[1], sel.mu[0]) * 180) / Math.PI;
      const sRow = slider("Strength |μ|", 0, 3, 0.05, strength);
      const aRow = slider("Axis β°", -180, 180, 1, axis);
      const apply = (): void => {
        const cur = findSingularity(state, sel.id);
        if (!cur || cur.kind !== "doublet") return;
        const m = Number(sRow.input.value);
        const b = (Number(aRow.input.value) * Math.PI) / 180;
        replaceById(sel.id, { ...cur, mu: [m * Math.cos(b), m * Math.sin(b)] });
        requestRender();
      };
      sRow.input.addEventListener("input", () => {
        sRow.value.textContent = Number(sRow.input.value).toFixed(2);
        apply();
      });
      aRow.input.addEventListener("input", () => {
        aRow.value.textContent = `${aRow.input.value}°`;
        apply();
      });
      inspector.append(sRow.row, aRow.row);
    }

    const pos = el("div", "readout");
    posEl = pos;
    inspector.append(pos);

    const del = el("button", "danger", "Delete");
    del.type = "button";
    del.addEventListener("click", () => {
      state.singularities = state.singularities.filter((s) => s.id !== sel.id);
      state.selected = null;
      requestRender();
      onSelectionChange();
    });
    inspector.append(del);

    refresh();
  };

  const refresh = (): void => {
    if (liveId === null) return;
    const sel = findSingularity(state, liveId);
    if (!sel) return;
    if (posEl) posEl.textContent = `at ${complex(sel.at[0], sel.at[1])}`;
    if (residueEl && sel.kind === "monopole") residueEl.textContent = `residue c = ${complex(sel.c[0], sel.c[1])}`;
  };

  app.append(bar, inspector);

  return {
    onSelectionChange,
    refresh,
    destroy(): void {
      bar.remove();
      inspector.remove();
    },
  };
}
