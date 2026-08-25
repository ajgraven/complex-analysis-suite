// The control surface: a palette to ADD singularities and a contextual inspector to EDIT the selected
// one. The monopole inspector exposes the coefficient as its honest decomposition c = q + iγ — a
// CHARGE slider (real part = source/flux) and a CIRCULATION slider (imaginary part = vortex) — with a
// live "residue = q + iγ" readout, so the paper's charge+vortex superposition is directly manipulable.
// The uniform stream (speed U, angle α) rides the toolbar. Everything mutates the shared AppState and
// asks for a repaint; `onSelectionChange` rebuilds the inspector, `refresh` keeps its live readouts in
// step while a handle is dragged on the canvas.
import type { AppState, Placed, Lens, Tool } from "../state.js";
import { freshId, findSingularity } from "../state.js";
import { uniformFromSpeedAngle } from "../field.js";
import { PRESETS, presetById } from "../presets.js";
import { encodeState } from "../persist.js";

export interface ControlsOptions {
  /** Composite the field + overlay into a PNG (with the permalink embedded) and download it. */
  readonly onSavePng: () => void;
  /** Start or stop the animated tracer-particle flow loop to match `state.motion`. */
  readonly onToggleMotion: () => void;
}

// The two readings of the SAME complex potential — a relabel, not a recompute (the streamlines and
// equipotentials are identical curves; only the vocabulary changes). One toggle swaps every label.
interface Terms {
  chargeLabel: string;
  circLabel: string;
  residueNote: string;
  fieldLines: string;
  equipot: string;
  direction: string;
  strength: string;
}
export function termsFor(l: Lens): Terms {
  return l === "hydrodynamic"
    ? {
        chargeLabel: "Source m (flux)",
        circLabel: "Circulation Γ",
        residueNote: "source + i·circulation",
        fieldLines: "Streamlines",
        equipot: "Velocity potential",
        direction: "flow direction",
        strength: "flow speed",
      }
    : {
        chargeLabel: "Charge q (flux)",
        circLabel: "Circulation γ",
        residueNote: "flux + i·circulation",
        fieldLines: "Field lines",
        equipot: "Equipotentials",
        direction: "field direction",
        strength: "field strength",
      };
}

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

export function createControls(
  app: HTMLElement,
  state: AppState,
  requestRender: () => void,
  opts: ControlsOptions,
): Controls {
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
  uni.append(el("h2", "insp-t", "Uniform stream"), uSpeed.row, uAngle.row);

  bar.append(brand, palette);

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
      const t = termsFor(state.lens);
      const q = slider(t.chargeLabel, -5, 5, 0.05, sel.c[0]);
      const g = slider(t.circLabel, -5, 5, 0.05, sel.c[1]);
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
      inspector.append(q.row, g.row, residueRow, el("div", "hint", `= ${t.residueNote}`));
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

  // --- lens toggle (inserted into the toolbar) + persistent legend -----------
  const legend = el("aside", "legend");
  legend.setAttribute("aria-label", "Legend");
  const updateLegend = (): void => {
    const t = termsFor(state.lens);
    legend.innerHTML =
      `<div class="lg-row"><span class="lg-sw hue"></span>hue = ${t.direction}</div>` +
      `<div class="lg-row"><span class="lg-sw bright"></span>brightness = ${t.strength}</div>` +
      `<div class="lg-row"><span class="lg-line stream"></span>${t.fieldLines} (ψ = const)</div>` +
      `<div class="lg-row"><span class="lg-line equi"></span>${t.equipot} (φ = const)</div>`;
  };

  // Theorem caption (hybrid framing): shown while the flux/circulation probe tool is active.
  const caption = el("aside", "caption");
  caption.hidden = true;
  const updateCaption = (): void => {
    const word = state.lens === "hydrodynamic" ? "source" : "charge";
    caption.innerHTML =
      "<strong>Flux / circulation probe.</strong> Drag a loop Γ — the residue theorem gives " +
      `∮<sub>Γ</sub> E dz = Σ residues = (enclosed ${word}) + i·(circulation): ` +
      "<b>Re = Gauss's law</b>, <b>Im = Kelvin circulation</b>. Exact (=) for this closed-form field.";
  };

  const lensSeg = el("div", "modeseg");
  lensSeg.setAttribute("role", "group");
  lensSeg.setAttribute("aria-label", "Lens");
  const lensBtns = new Map<Lens, HTMLButtonElement>();
  const setLens = (l: Lens): void => {
    state.lens = l;
    for (const [id, b] of lensBtns) b.setAttribute("aria-pressed", String(id === l));
    onSelectionChange(); // relabel the inspector
    updateLegend();
    if (!caption.hidden) updateCaption();
    requestRender();
  };
  for (const [id, label] of [
    ["electrostatic", "Electrostatic"],
    ["hydrodynamic", "Fluid"],
  ] as [Lens, string][]) {
    const b = el("button", "seg-btn", label);
    b.type = "button";
    b.setAttribute("aria-pressed", String(id === state.lens));
    b.addEventListener("click", () => setLens(id));
    lensBtns.set(id, b);
    lensSeg.append(b);
  }
  // Tool toggle: Move (drag singularities) | Probe (draw a flux/circulation loop).
  const toolSeg = el("div", "modeseg");
  toolSeg.setAttribute("role", "group");
  toolSeg.setAttribute("aria-label", "Canvas tool");
  const toolBtns = new Map<Tool, HTMLButtonElement>();
  const setTool = (t: Tool): void => {
    state.tool = t;
    for (const [id, b] of toolBtns) b.setAttribute("aria-pressed", String(id === t));
    caption.hidden = t !== "probe";
    if (t === "probe") updateCaption();
    requestRender();
  };
  for (const [id, label] of [
    ["move", "Move"],
    ["probe", "Probe ∮"],
  ] as [Tool, string][]) {
    const b = el("button", "seg-btn", label);
    b.type = "button";
    b.setAttribute("aria-pressed", String(id === state.tool));
    b.addEventListener("click", () => setTool(id));
    toolBtns.set(id, b);
    toolSeg.append(b);
  }

  bar.insertBefore(lensSeg, palette);
  bar.insertBefore(toolSeg, palette);
  updateLegend();

  // --- actions: presets · save PNG · copy link (right side of the toolbar) ---
  const syncUniformControls = (): void => {
    uniformU = Math.hypot(state.uniform[0], state.uniform[1]);
    uniformA = uniformU > 1e-9 ? -Math.atan2(state.uniform[1], state.uniform[0]) : 0;
    uSpeed.input.value = String(uniformU);
    uSpeed.value.textContent = uniformU.toFixed(2);
    const deg = Math.round((uniformA * 180) / Math.PI);
    uAngle.input.value = String(deg);
    uAngle.value.textContent = `${deg}°`;
  };
  const applyPreset = (id: string): void => {
    const p = presetById(id);
    if (!p) return;
    state.uniform = [p.uniform[0], p.uniform[1]];
    state.singularities = p.sings.map((s) => ({ ...s, id: freshId() }));
    state.view = p.view;
    state.selected = null;
    state.probe = null;
    syncUniformControls();
    requestRender();
    onSelectionChange();
  };

  const actions = el("div", "actions");
  const presetWrap = el("label", "field-inline");
  presetWrap.append(el("span", "fi-l", "Preset"));
  const presetSel = document.createElement("select");
  presetSel.className = "preset-sel";
  for (const p of PRESETS) {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.name;
    presetSel.append(o);
  }
  presetSel.addEventListener("change", () => applyPreset(presetSel.value));
  presetWrap.append(presetSel);

  const flowBtn = el("button", "pal-btn", "Flow ▶");
  flowBtn.type = "button";
  flowBtn.title = "Animate tracer particles along the flow";
  flowBtn.setAttribute("aria-pressed", String(state.motion));
  flowBtn.addEventListener("click", () => {
    state.motion = !state.motion;
    flowBtn.setAttribute("aria-pressed", String(state.motion));
    flowBtn.textContent = state.motion ? "Flow ❚❚" : "Flow ▶";
    opts.onToggleMotion();
  });

  const sensorBtn = el("button", "pal-btn", "Sensor");
  sensorBtn.type = "button";
  sensorBtn.title = "Toggle a draggable field-probe puck (reads |E|/speed, direction, φ, ψ)";
  sensorBtn.setAttribute("aria-pressed", String(state.sensor !== null));
  sensorBtn.addEventListener("click", () => {
    state.sensor = state.sensor ? null : [state.view.center[0], state.view.center[1]];
    sensorBtn.setAttribute("aria-pressed", String(state.sensor !== null));
    requestRender();
  });

  const pngBtn = el("button", "pal-btn", "Save PNG");
  pngBtn.type = "button";
  pngBtn.addEventListener("click", () => opts.onSavePng());

  const linkBtn = el("button", "pal-btn", "Copy link");
  linkBtn.type = "button";
  linkBtn.addEventListener("click", () => {
    const url = location.origin + location.pathname + encodeState(state);
    const clip = navigator.clipboard;
    if (!clip) return;
    void clip
      .writeText(url)
      .then(() => {
        linkBtn.textContent = "Copied!";
        window.setTimeout(() => (linkBtn.textContent = "Copy link"), 1200);
      })
      .catch(() => undefined);
  });

  actions.append(presetWrap, flowBtn, sensorBtn, pngBtn, linkBtn);
  bar.append(actions);

  app.append(bar, inspector, legend, uni, caption);

  return {
    onSelectionChange,
    refresh,
    destroy(): void {
      bar.remove();
      inspector.remove();
      legend.remove();
      uni.remove();
      caption.remove();
    },
  };
}
