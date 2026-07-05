/**
 * Interactive editor for the custom-gradient palette: a live preview bar with
 * draggable colour stops (click the bar to add, drag to move, pick a colour, remove),
 * a randomiser, and JSON import/export. Emits the current stops via `onChange`; the
 * actual rendering is done by GLPlot from the same stop model ({@link buildGradient}).
 */

import { sampleGradient, type GradientStop } from "../palettes";

export interface GradientEditor {
  getStops(): GradientStop[];
  /** Replace the stops without emitting `onChange` (e.g. on reset). */
  setStops(stops: GradientStop[]): void;
  setVisible(visible: boolean): void;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const clampByte = (n: number): number =>
  Math.min(255, Math.max(0, Math.round(Number.isFinite(n) ? n : 0)));

function toHex([r, g, b]: [number, number, number]): string {
  const h = (n: number): string => clampByte(n).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function fromHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function cssGradient(stops: GradientStop[]): string {
  const parts = [...stops]
    .sort((a, b) => a.t - b.t)
    .map((s) => `rgb(${s.color[0]},${s.color[1]},${s.color[2]}) ${(s.t * 100).toFixed(1)}%`);
  return `linear-gradient(to right, ${parts.join(", ")})`;
}

/** Colour at position `t` by linear interpolation between stops (clamped), rounded to bytes. */
function interpColor(stops: GradientStop[], t: number): [number, number, number] {
  const [r, g, b] = sampleGradient(stops, t);
  return [Math.round(r), Math.round(g), Math.round(b)];
}

function randomStops(): GradientStop[] {
  const count = 3 + Math.floor(Math.random() * 3); // 3..5 stops
  const stops: GradientStop[] = [];
  for (let i = 0; i < count; i++) {
    stops.push({
      t: i / (count - 1),
      color: [
        Math.floor(Math.random() * 256),
        Math.floor(Math.random() * 256),
        Math.floor(Math.random() * 256),
      ],
    });
  }
  return stops;
}

/**
 * Parse + validate a gradient-stops JSON string into clamped `{t, color}` stops, or null
 * if malformed. Shared by the editor's "load JSON" control and the permalink / saved-view
 * restore path so both reject bad input identically (≥2 stops, numeric `t`, 3-number
 * `color`; `t` clamped to [0,1] and colours to bytes).
 */
export function parseGradientStops(json: string): GradientStop[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length < 2) return null;
  const out: GradientStop[] = [];
  for (const raw of parsed as unknown[]) {
    const r = raw as { t?: unknown; color?: unknown };
    if (typeof r.t !== "number" || !Array.isArray(r.color) || r.color.length !== 3) return null;
    const c = r.color as unknown[];
    out.push({
      t: clamp01(r.t),
      color: [clampByte(Number(c[0])), clampByte(Number(c[1])), clampByte(Number(c[2]))],
    });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/** Build the editor inside `container` and wire all interactions. */
export function setupGradientEditor(
  container: HTMLElement,
  initial: GradientStop[],
  onChange: (stops: GradientStop[]) => void,
): GradientEditor {
  let stops: GradientStop[] = initial.map((s) => ({ t: s.t, color: [...s.color] }));
  let selected = 0;

  container.replaceChildren();
  const bar = document.createElement("div");
  bar.className = "gradient-bar";
  const handles = document.createElement("div");
  handles.className = "gradient-handles";
  bar.appendChild(handles);

  const controls = document.createElement("div");
  controls.className = "gradient-controls";
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.title = "Selected stop colour";
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.textContent = "remove stop";
  const randomBtn = document.createElement("button");
  randomBtn.type = "button";
  randomBtn.textContent = "randomize";
  const hint = document.createElement("span");
  hint.className = "gradient-hint";
  hint.textContent = "click the bar to add a stop · drag to move";
  controls.append(colorInput, removeBtn, randomBtn, hint);

  const io = document.createElement("div");
  io.className = "gradient-io";
  const jsonArea = document.createElement("textarea");
  jsonArea.rows = 2;
  jsonArea.spellcheck = false;
  jsonArea.setAttribute("aria-label", "Gradient JSON (copy to export, edit and Load to import)");
  const loadBtn = document.createElement("button");
  loadBtn.type = "button";
  loadBtn.textContent = "load JSON";
  io.append(jsonArea, loadBtn);

  container.append(bar, controls, io);

  function emit(): void {
    onChange(stops.map((s) => ({ t: s.t, color: [...s.color] })));
  }

  function render(): void {
    selected = Math.min(selected, stops.length - 1);
    bar.style.background = cssGradient(stops);
    handles.replaceChildren();
    stops.forEach((s, i) => {
      const h = document.createElement("button");
      h.type = "button";
      h.className = "gradient-handle" + (i === selected ? " selected" : "");
      h.style.left = `${s.t * 100}%`;
      h.style.background = toHex(s.color);
      h.dataset.i = String(i);
      h.setAttribute("aria-label", `Colour stop at ${Math.round(s.t * 100)}%`);
      handles.appendChild(h);
    });
    colorInput.value = toHex(stops[selected].color);
    removeBtn.disabled = stops.length <= 2;
    jsonArea.value = JSON.stringify(
      stops.map((s) => ({ t: Number(s.t.toFixed(3)), color: s.color })),
    );
  }

  const tFromEvent = (e: PointerEvent): number => {
    const rect = bar.getBoundingClientRect();
    return clamp01((e.clientX - rect.left) / rect.width);
  };

  // Drag a stop. Capture on the (persistent) handles container, not the handle
  // element, since render() recreates the handle DOM on every move.
  let dragStop: GradientStop | null = null;
  handles.addEventListener("pointerdown", (e) => {
    const target = (e.target as HTMLElement).closest(".gradient-handle") as HTMLElement | null;
    if (!target) return; // empty area → let the bar's add-stop handler run
    selected = Number(target.dataset.i);
    dragStop = stops[selected];
    handles.setPointerCapture(e.pointerId);
    render();
    e.stopPropagation();
  });
  handles.addEventListener("pointermove", (e) => {
    if (!dragStop) return;
    dragStop.t = tFromEvent(e);
    stops.sort((a, b) => a.t - b.t);
    selected = stops.indexOf(dragStop);
    render();
    emit();
  });
  const endDrag = (): void => {
    dragStop = null;
  };
  handles.addEventListener("pointerup", endDrag);
  handles.addEventListener("pointercancel", endDrag);

  // Click an empty part of the bar to add a stop there.
  bar.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest(".gradient-handle")) return;
    const t = tFromEvent(e);
    const stop: GradientStop = { t, color: interpColor(stops, t) };
    stops.push(stop);
    stops.sort((a, b) => a.t - b.t);
    selected = stops.indexOf(stop);
    render();
    emit();
  });

  colorInput.addEventListener("input", () => {
    stops[selected].color = fromHex(colorInput.value);
    render();
    emit();
  });
  removeBtn.addEventListener("click", () => {
    if (stops.length <= 2) return;
    stops.splice(selected, 1);
    selected = Math.max(0, selected - 1);
    render();
    emit();
  });
  randomBtn.addEventListener("click", () => {
    stops = randomStops();
    selected = 0;
    render();
    emit();
  });
  loadBtn.addEventListener("click", () => {
    const next = parseGradientStops(jsonArea.value);
    if (!next) {
      jsonArea.classList.add("invalid");
      window.setTimeout(() => jsonArea.classList.remove("invalid"), 1200);
      return;
    }
    stops = next;
    selected = 0;
    render();
    emit();
  });

  render();

  return {
    getStops: () => stops.map((s) => ({ t: s.t, color: [...s.color] })),
    setStops: (next) => {
      stops = next.map((s) => ({ t: s.t, color: [...s.color] }));
      selected = 0;
      render();
    },
    setVisible: (visible) => {
      container.hidden = !visible;
    },
  };
}
