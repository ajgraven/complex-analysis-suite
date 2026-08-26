// The shareable permalink (`#vs=`) for the sandbox: the uniform stream, the placed singularities, the
// view, and the lens, wrapped in @cas/interchange's app-namespaced, forward-compatible view-state
// envelope. Decoding is defensive — a malformed or partial payload restores what it can and ignores
// the rest — and rebuilds singularities with fresh ids.
import { encodeViewState, decodeViewState } from "@cas/interchange";
import type { AppState, Placed, Lens } from "./state.js";
import { freshId } from "./state.js";

const APP = "2de";

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
function pair(x: unknown): [number, number] | null {
  return Array.isArray(x) && x.length === 2 && isNum(x[0]) && isNum(x[1]) ? [x[0], x[1]] : null;
}

/** Encode the current app state into a `#vs=` permalink fragment. */
export function encodeState(state: AppState): string {
  const sings = state.singularities.map((s) =>
    s.kind === "monopole"
      ? { k: "m", at: [s.at[0], s.at[1]], c: [s.c[0], s.c[1]] }
      : { k: "d", at: [s.at[0], s.at[1]], mu: [s.mu[0], s.mu[1]] },
  );
  const payload: Record<string, unknown> = {
    uniform: [state.uniform[0], state.uniform[1]],
    sings,
    view: { center: [state.view.center[0], state.view.center[1]], halfSpan: state.view.halfSpan },
    lens: state.lens,
  };
  return encodeViewState(APP, payload);
}

/** Apply a `#vs=` permalink onto `state` in place. Returns true if anything was restored. */
export function applyStateFromHash(state: AppState, hashOrLink: string): boolean {
  const env = decodeViewState(hashOrLink);
  if (!env || env.app !== APP) return false;
  const s = env.state;
  let applied = false;

  const u = pair(s.uniform);
  if (u) {
    state.uniform = u;
    applied = true;
  }

  if (Array.isArray(s.sings)) {
    const rebuilt: Placed[] = [];
    for (const raw of s.sings) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const at = pair(r.at);
      if (!at) continue;
      if (r.k === "m") {
        const c = pair(r.c);
        if (c) rebuilt.push({ id: freshId(), kind: "monopole", at, c });
      } else if (r.k === "d") {
        const mu = pair(r.mu);
        if (mu) rebuilt.push({ id: freshId(), kind: "doublet", at, mu });
      }
    }
    state.singularities = rebuilt;
    applied = true;
  }

  if (s.view && typeof s.view === "object") {
    const view = s.view as Record<string, unknown>;
    const center = pair(view.center);
    const halfSpan = view.halfSpan;
    if (center && isNum(halfSpan) && halfSpan > 0) {
      state.view = { center, halfSpan };
      applied = true;
    }
  }

  if (s.lens === "electrostatic" || s.lens === "hydrodynamic") {
    state.lens = s.lens as Lens;
    applied = true;
  }

  return applied;
}
