/**
 * The animation variable `t` (catalog G2). `t` is an ordinary named parameter (ADR-0011) — compiled to
 * a `uParam_t` uniform like any other — but instead of a ℂ-pad it gets a **transport**: play / pause, a
 * scrubber over a real segment `[t0, t1]`, a speed, and a loop toggle. A `requestAnimationFrame` loop
 * advances `t`'s real value; each frame is a re-uniform + draft render (the CD live-parameter pattern),
 * and pausing does a full render + instrument recompute. So a formula that mentions `t` — e.g.
 * `(z - 0.6*exp(i*t)) / (1 - 0.6*exp(-i*t)*z)` — animates as a live family.
 *
 * The frame-stepping is factored into the pure {@link stepT} (advance-with-wrap/clamp), which is unit
 * tested; the DOM + rAF wiring is verified headlessly.
 */

/** The animation segment + playback settings. `t` sweeps `[t0, t1]`; `speed` is units of `t` per real
 *  second; `loop` wraps at `t1` (else playback stops there). */
export interface AnimConfig {
  t0: number;
  t1: number;
  speed: number;
  loop: boolean;
}

/** A neutral, periodic default: `t ∈ [0, 2π]`, one unit/sec, looping — so `exp(i·t)` traces the circle
 *  once every ~6.3 s. */
export const DEFAULT_ANIM: AnimConfig = { t0: 0, t1: 2 * Math.PI, speed: 1, loop: true };

const mod = (x: number, m: number): number => ((x % m) + m) % m;

/**
 * Advance `t` by `dt` seconds at `cfg.speed`, wrapping into `[t0, t1)` when `loop` (else clamping and
 * reporting `ended` at `t1`). A non-positive span is a no-op that reports `ended` (a degenerate segment).
 */
export function stepT(
  t: number,
  dt: number,
  cfg: AnimConfig,
): { t: number; ended: boolean } {
  const span = cfg.t1 - cfg.t0;
  if (!(span > 0)) return { t: cfg.t0, ended: true };
  const nt = t + cfg.speed * dt;
  if (cfg.loop) return { t: cfg.t0 + mod(nt - cfg.t0, span), ended: false };
  if (nt >= cfg.t1) return { t: cfg.t1, ended: true };
  return { t: nt, ended: false };
}

export interface AnimHooks {
  /** The current value of `t` (its real part — the source of truth is the `Plot`). */
  getT(): number;
  /** Set `t`. `committed` is false during a play frame / live scrub (draft render), true on pause /
   *  scrub release (full render + instrument recompute). */
  setT(t: number, committed: boolean): void;
}

export interface Animator {
  /** Re-sync the transport to the current `config` + `t` (call when `t` appears or a link is loaded). */
  sync(): void;
  /** Stop playback (call when `t` leaves the formula). */
  stop(): void;
  /** Whether playback is currently running. */
  isPlaying(): boolean;
}

/**
 * Wire the transport controls inside `root` (queried by class) to the animation loop. `config` is owned
 * by the caller and mutated in place by the transport's fields, so the caller can persist it.
 */
export function createAnimator(
  root: HTMLElement,
  config: AnimConfig,
  hooks: AnimHooks,
): Animator {
  const q = <T extends HTMLElement>(sel: string): T | null => root.querySelector<T>(sel);
  const playBtn = q<HTMLButtonElement>(".anim-play");
  const scrub = q<HTMLInputElement>(".anim-scrub");
  const readout = q<HTMLElement>(".anim-readout");
  const t0Input = q<HTMLInputElement>(".anim-t0");
  const t1Input = q<HTMLInputElement>(".anim-t1");
  const speedInput = q<HTMLInputElement>(".anim-speed");
  const loopInput = q<HTMLInputElement>(".anim-loop");

  let playing = false;
  let raf = 0;
  let lastTs: number | null = null;

  const r2 = (x: number): number => Math.round(x * 100) / 100;

  const setScrubBounds = (): void => {
    if (!scrub) return;
    scrub.min = String(config.t0);
    scrub.max = String(config.t1);
    scrub.step = String(Math.max((config.t1 - config.t0) / 500, 1e-4));
  };

  const showT = (t: number): void => {
    if (readout) readout.textContent = `t = ${r2(t)}`;
    if (scrub && document.activeElement !== scrub) scrub.value = String(t);
  };

  const setPlayLabel = (): void => {
    if (playBtn) {
      playBtn.textContent = playing ? "⏸" : "▶";
      playBtn.setAttribute("aria-label", playing ? "pause" : "play");
    }
  };

  const pause = (commit: boolean): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastTs = null;
    const wasPlaying = playing;
    playing = false;
    setPlayLabel();
    if (commit && wasPlaying) hooks.setT(hooks.getT(), true);
  };

  const frame = (ts: number): void => {
    if (!playing) return;
    const dt = lastTs === null ? 0 : (ts - lastTs) / 1000;
    lastTs = ts;
    const { t, ended } = stepT(hooks.getT(), dt, config);
    hooks.setT(t, false); // draft render while playing
    showT(t);
    if (ended) {
      pause(false);
      hooks.setT(t, true); // settle at the endpoint with a full render
    } else {
      raf = requestAnimationFrame(frame);
    }
  };

  const play = (): void => {
    if (playing) return;
    playing = true;
    lastTs = null;
    setPlayLabel();
    raf = requestAnimationFrame(frame);
  };

  playBtn?.addEventListener("click", () => (playing ? pause(true) : play()));

  // Manual scrub stops playback, then previews (input) and settles (change).
  scrub?.addEventListener("input", () => {
    if (playing) pause(false);
    hooks.setT(Number(scrub.value), false);
    showT(Number(scrub.value));
  });
  scrub?.addEventListener("change", () => hooks.setT(Number(scrub.value), true));

  const onConfigEdit = (): void => {
    if (t0Input) config.t0 = Number(t0Input.value);
    if (t1Input) config.t1 = Number(t1Input.value);
    if (speedInput) config.speed = Math.max(0, Number(speedInput.value));
    if (loopInput) config.loop = loopInput.checked;
    setScrubBounds();
    // keep t within the (possibly new) segment
    const clamped = Math.min(config.t1, Math.max(config.t0, hooks.getT()));
    hooks.setT(clamped, true);
    showT(clamped);
  };
  t0Input?.addEventListener("change", onConfigEdit);
  t1Input?.addEventListener("change", onConfigEdit);
  speedInput?.addEventListener("input", () => {
    config.speed = Math.max(0, Number(speedInput.value));
  });
  loopInput?.addEventListener("change", () => {
    config.loop = loopInput.checked;
  });

  return {
    sync(): void {
      if (t0Input) t0Input.value = String(config.t0);
      if (t1Input) t1Input.value = String(config.t1);
      if (speedInput) speedInput.value = String(config.speed);
      if (loopInput) loopInput.checked = config.loop;
      setScrubBounds();
      showT(hooks.getT());
    },
    stop(): void {
      pause(false);
    },
    isPlaying(): boolean {
      return playing;
    },
  };
}
