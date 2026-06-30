/**
 * suggestions.ts — a small, non-obstructive "suggestion" advisory layer.
 *
 * The app exposes a lot of settings (iteration cap, precision, colouring mode, …) whose wrong
 * combination silently degrades the picture. This engine watches the live state and, when an
 * *advisor* detects a fixable problem, surfaces a compact dismissible badge over the affected plot
 * with one-click action(s) to fix it — never changing anything on its own.
 *
 * Design:
 *   • An {@link Advisor} is a (near-)pure function `() => Suggestion | null` that reads live state.
 *     Advisors are registered in priority order; the first non-dismissed one per plot wins.
 *   • {@link SuggestionEngine.schedule} debounces re-evaluation, so it is safe to call on every
 *     view / setting change. Evaluation is wrapped so a throwing advisor can never break the app.
 *   • One badge per plot (anchored in each `.canvas-stack`); applying an action fires the action and
 *     re-evaluates, dismissing hides it and suppresses that suggestion id for the session.
 *
 * Anti-annoyance is enforced here, not per-advisor: debounce, one badge at a time, every suggestion
 * dismissible, dismissals remembered for the session, and a global on/off switch.
 */
import { byId } from "./dom";

export type PlotScope = "param" | "dyn";

export interface SuggestionAction {
  /** Button label, e.g. "Increase to 1785". */
  label: string;
  /** Apply the fix. The engine re-evaluates shortly afterwards (so the badge clears if fixed). */
  run: () => void;
  /** Render as the emphasised primary button. */
  primary?: boolean;
}

export interface Suggestion {
  /** Stable type id (used for session dismissal), e.g. "under-iteration". */
  id: string;
  /** Which plot the badge attaches to. */
  scope: PlotScope;
  severity: "info" | "warn";
  /** Short human-readable message. */
  message: string;
  actions: SuggestionAction[];
}

/** Reads live state and returns a suggestion, or null when nothing is wrong. */
export type Advisor = () => Suggestion | null;

interface BadgeRefs {
  root: HTMLElement;
  text: HTMLElement;
  actions: HTMLElement;
  dismiss: HTMLButtonElement;
}

export class SuggestionEngine {
  private advisors: Advisor[] = [];
  private readonly badges: Record<PlotScope, BadgeRefs>;
  /** `${scope}:${id}` suppressed for the rest of this session (until reload). */
  private readonly dismissed = new Set<string>();
  private readonly shown: Record<PlotScope, string | null> = { param: null, dyn: null };
  private enabled = true;
  private timer = 0;

  constructor(paramBadgeId: string, dynBadgeId: string) {
    this.badges = { param: this.refs(paramBadgeId), dyn: this.refs(dynBadgeId) };
    for (const scope of ["param", "dyn"] as const) {
      this.badges[scope].dismiss.addEventListener("click", () => this.dismiss(scope));
    }
  }

  private refs(id: string): BadgeRefs {
    const root = byId(id);
    return {
      root,
      text: root.querySelector(".suggestion-text") as HTMLElement,
      actions: root.querySelector(".suggestion-actions") as HTMLElement,
      dismiss: root.querySelector(".suggestion-dismiss") as HTMLButtonElement,
    };
  }

  /** Register an advisor. Earlier registrations have higher priority within a plot. */
  register(advisor: Advisor): void {
    this.advisors.push(advisor);
  }

  /** Master on/off (e.g. a settings toggle). When off, all badges hide. */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.hide("param");
      this.hide("dyn");
    } else {
      this.schedule();
    }
  }

  /** Debounced re-evaluation; safe to call on every view / setting change. */
  schedule(delayMs = 400): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      this.evaluate();
    }, delayMs);
  }

  /** Run all advisors now and update each plot's badge. */
  evaluate(): void {
    if (!this.enabled) return;
    const top: Record<PlotScope, Suggestion | null> = { param: null, dyn: null };
    for (const advisor of this.advisors) {
      let s: Suggestion | null = null;
      try {
        s = advisor();
      } catch {
        s = null; // an advisor must never break the app
      }
      if (!s || this.dismissed.has(`${s.scope}:${s.id}`)) continue;
      if (!top[s.scope]) top[s.scope] = s; // registration order = priority
    }
    for (const scope of ["param", "dyn"] as const) {
      const s = top[scope];
      if (s) this.show(scope, s);
      else this.hide(scope);
    }
  }

  private show(scope: PlotScope, s: Suggestion): void {
    const b = this.badges[scope];
    b.text.textContent = s.message;
    b.root.dataset.severity = s.severity;
    b.actions.replaceChildren();
    for (const a of s.actions) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "suggestion-action" + (a.primary ? " primary" : "");
      btn.textContent = a.label;
      btn.addEventListener("click", () => {
        a.run();
        this.schedule(200); // re-evaluate just after the fix so the badge clears if resolved
      });
      b.actions.appendChild(btn);
    }
    b.root.hidden = false;
    this.shown[scope] = s.id;
  }

  private hide(scope: PlotScope): void {
    this.badges[scope].root.hidden = true;
    this.shown[scope] = null;
  }

  private dismiss(scope: PlotScope): void {
    const id = this.shown[scope];
    if (id) this.dismissed.add(`${scope}:${id}`); // suppress this suggestion for the session
    this.hide(scope);
  }
}
