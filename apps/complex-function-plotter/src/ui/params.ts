/**
 * Live-parameter controls (catalog G1). For every named parameter the map reads — the set
 * `@cas/expr`'s `freeParameters` reports (ADR-0011) — this renders one compact block:
 *
 *  - a draggable **ℂ-pad**: set the value anywhere in the complex window `[-R, R]²` (a unit circle is
 *    drawn, since so many families — Blaschke, Möbius — live on/inside `|a| = 1`);
 *  - **re / im** number fields for precise entry (unbounded — a logistic `a` may sit at 3.5, off the pad);
 *  - a **real slider**: sweep the real part along a segment — the single-real-DOF control the animation
 *    variable `t` (G2) will later drive.
 *
 * All three edit one shared `[re, im]`. An edit fires `onInput` continuously (the caller does a fast
 * draft render — the CD live-parameter pattern: a re-uniform, never a recompile) and `onCommit` when it
 * settles (pointer up / field commit — the caller does a full render + recomputes the instruments).
 * The controls own no value state of record: `get` reads the source of truth (the `Plot`), so a formula
 * edit that preserves a parameter keeps its value, and `sync()` re-pulls after an external change.
 */

/** The ℂ-pad / real-slider window: `re, im ∈ [-PARAM_RANGE, PARAM_RANGE]`. Values typed into the number
 *  fields may exceed it (the pad then pins its dot to the edge). */
export const PARAM_RANGE = 2;

const PAD_SIZE = 84; // CSS px (square)

/** Map a pad pixel (CSS px, y-down) on a `size`×`size` pad to a complex value in `[-r, r]²`, clamped. */
export function padToValue(
  px: number,
  py: number,
  size: number,
  r = PARAM_RANGE,
): [number, number] {
  const clamp = (v: number): number => Math.min(r, Math.max(-r, v));
  return [clamp((px / size - 0.5) * 2 * r), clamp((0.5 - py / size) * 2 * r)];
}

/** Map a complex value to a pad pixel (CSS px, y-down) on a `size`×`size` pad (not clamped). */
export function valueToPad(
  v: readonly [number, number],
  size: number,
  r = PARAM_RANGE,
): [number, number] {
  return [((v[0] / r) * 0.5 + 0.5) * size, (0.5 - (v[1] / r) * 0.5) * size];
}

export interface ParamHooks {
  /** Current value of a parameter — the source of truth lives outside (the `Plot`). */
  get(name: string): [number, number];
  /** A value changed live (during a drag / typing) — do a fast draft render. */
  onInput(name: string, value: [number, number]): void;
  /** The change settled (pointer up / field commit) — do a full render + recompute instruments. */
  onCommit(name: string, value: [number, number]): void;
}

export interface ParamControls {
  /** Rebuild the controls to exactly `names` (clearing any removed), each initialized from `get`. */
  refresh(names: readonly string[]): void;
  /** Re-pull every control's value from `get` and redraw (after a preset / link / animation change). */
  sync(): void;
}

const r4 = (x: number): number => Math.round(x * 1e4) / 1e4;
const finite = (x: number): number => (Number.isFinite(x) ? x : 0);

export function createParamControls(
  container: HTMLElement,
  hooks: ParamHooks,
): ParamControls {
  // One redraw/pull closure per live control, so `sync()` can refresh them all after an external change.
  let pulls: Array<() => void> = [];

  const buildParam = (name: string): { el: HTMLElement; pull: () => void } => {
    let value: [number, number] = hooks.get(name);

    const wrap = document.createElement("div");
    wrap.className = "param";

    const head = document.createElement("div");
    head.className = "param-head";
    const nameEl = document.createElement("span");
    nameEl.className = "param-name";
    nameEl.textContent = name;
    const valEl = document.createElement("span");
    valEl.className = "param-val";
    head.append(nameEl, valEl);

    const body = document.createElement("div");
    body.className = "param-body";

    const pad = document.createElement("canvas");
    pad.className = "cpad";
    pad.setAttribute("aria-label", `${name} complex value pad`);

    const fields = document.createElement("div");
    fields.className = "param-fields";
    const reInput = document.createElement("input");
    reInput.type = "number";
    reInput.step = "0.05";
    const imInput = document.createElement("input");
    imInput.type = "number";
    imInput.step = "0.05";
    const reLabel = document.createElement("label");
    reLabel.textContent = "re";
    const imLabel = document.createElement("label");
    imLabel.textContent = "im";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "param-slider";
    slider.min = String(-PARAM_RANGE);
    slider.max = String(PARAM_RANGE);
    slider.step = "0.01";
    slider.setAttribute("aria-label", `${name} real part`);
    fields.append(reLabel, reInput, imLabel, imInput, slider);

    body.append(pad, fields);
    wrap.append(head, body);

    const fmt = (): string => {
      const im = value[1];
      return `${name} = ${r4(value[0])} ${im < 0 ? "−" : "+"} ${r4(Math.abs(im))}i`;
    };

    const drawPad = (): void => {
      const ctx = pad.getContext("2d");
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      pad.width = PAD_SIZE * dpr;
      pad.height = PAD_SIZE * dpr;
      pad.style.width = `${PAD_SIZE}px`;
      pad.style.height = `${PAD_SIZE}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, PAD_SIZE, PAD_SIZE);
      // window background
      ctx.fillStyle = "#0f1115";
      ctx.fillRect(0, 0, PAD_SIZE, PAD_SIZE);
      // axes through the origin
      const [ox, oy] = valueToPad([0, 0], PAD_SIZE);
      ctx.strokeStyle = "#2b3340";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, oy);
      ctx.lineTo(PAD_SIZE, oy);
      ctx.moveTo(ox, 0);
      ctx.lineTo(ox, PAD_SIZE);
      ctx.stroke();
      // the unit circle |a| = 1
      ctx.strokeStyle = "#3a4556";
      ctx.beginPath();
      ctx.arc(ox, oy, (PAD_SIZE / (2 * PARAM_RANGE)) * 1, 0, 2 * Math.PI);
      ctx.stroke();
      // current value (dot pinned to the pad edge if the value sits outside the window)
      const [vx, vy] = valueToPad(value, PAD_SIZE);
      const dx = Math.min(PAD_SIZE - 2, Math.max(2, vx));
      const dy = Math.min(PAD_SIZE - 2, Math.max(2, vy));
      ctx.fillStyle = "#6ea8fe";
      ctx.beginPath();
      ctx.arc(dx, dy, 4, 0, 2 * Math.PI);
      ctx.fill();
    };

    const syncUI = (): void => {
      valEl.textContent = fmt();
      // don't clobber a field the user is actively typing in
      if (document.activeElement !== reInput) reInput.value = String(r4(value[0]));
      if (document.activeElement !== imInput) imInput.value = String(r4(value[1]));
      if (document.activeElement !== slider) slider.value = String(value[0]);
      drawPad();
    };

    const apply = (v: [number, number], commit: boolean): void => {
      value = [finite(v[0]), finite(v[1])];
      syncUI();
      (commit ? hooks.onCommit : hooks.onInput)(name, value);
    };

    // --- ℂ-pad drag ---
    let dragging = false;
    const valueFromEvent = (e: PointerEvent): [number, number] => {
      const rect = pad.getBoundingClientRect();
      return padToValue(e.clientX - rect.left, e.clientY - rect.top, PAD_SIZE);
    };
    pad.addEventListener("pointerdown", (e) => {
      dragging = true;
      pad.setPointerCapture(e.pointerId);
      apply(valueFromEvent(e), false);
    });
    pad.addEventListener("pointermove", (e) => {
      if (dragging) apply(valueFromEvent(e), false);
    });
    const endPad = (e: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      apply(valueFromEvent(e), true);
    };
    pad.addEventListener("pointerup", endPad);
    pad.addEventListener("pointercancel", endPad);

    // --- number fields ---
    reInput.addEventListener("input", () =>
      apply([Number(reInput.value), value[1]], false),
    );
    reInput.addEventListener("change", () =>
      apply([Number(reInput.value), value[1]], true),
    );
    imInput.addEventListener("input", () =>
      apply([value[0], Number(imInput.value)], false),
    );
    imInput.addEventListener("change", () =>
      apply([value[0], Number(imInput.value)], true),
    );

    // --- real slider (sweeps re, keeps im) ---
    slider.addEventListener("input", () =>
      apply([Number(slider.value), value[1]], false),
    );
    slider.addEventListener("change", () =>
      apply([Number(slider.value), value[1]], true),
    );

    const pull = (): void => {
      value = hooks.get(name);
      syncUI();
    };
    pull();
    return { el: wrap, pull };
  };

  return {
    refresh(names: readonly string[]): void {
      container.replaceChildren();
      pulls = [];
      for (const name of names) {
        const { el, pull } = buildParam(name);
        container.append(el);
        pulls.push(pull);
      }
    },
    sync(): void {
      for (const pull of pulls) pull();
    },
  };
}
