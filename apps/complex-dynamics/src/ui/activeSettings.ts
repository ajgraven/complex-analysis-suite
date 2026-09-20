/**
 * The active-settings strip: every non-default setting that CHANGES THE RENDER, listed above the
 * tabs and reachable from any of them.
 *
 * This is the condition on which tabbing the sidebar is safe at all. Tabs are the only arrangement
 * measured to cut the pane down to a usable height, and they are also the only one in which a
 * setting that decides what is on screen can sit on a tab the reader is not looking at — "why is
 * this pixelated / dark / slow?" with the answer two tabs away. The strip cancels exactly that: it
 * names what is on, and each entry switches to the owning tab and focuses the control.
 *
 * **Only render-changing settings, and only when non-default**, so the common case costs no height
 * at all: the strip is hidden when the list is empty. A purely cosmetic non-default (a palette, a
 * trap shape) is deliberately absent — it is visible in the picture, which is the point of it.
 * (WP10/U4, review 2026-09-16.)
 */

export interface ActiveSetting {
  /** What to call it in the strip. */
  readonly label: string;
  /** The control to focus when the entry is pressed. */
  readonly control: string;
}

/** One watched setting: how to read it, and what to say when it is on. */
interface Watch {
  readonly control: string;
  readonly label: (el: HTMLElement) => string | null;
}

/** A checkbox that is on when it should be off. */
const onWhenChecked =
  (text: string) =>
  (el: HTMLElement): string | null =>
    el instanceof HTMLInputElement && el.checked ? text : null;

/** A checkbox that is OFF when its default is on. */
const offWhenUnchecked =
  (text: string) =>
  (el: HTMLElement): string | null =>
    el instanceof HTMLInputElement && !el.checked ? text : null;

/** A select whose default is `value`. */
const notDefault =
  (value: string, text: (v: string) => string) =>
  (el: HTMLElement): string | null =>
    el instanceof HTMLSelectElement && el.value !== value ? text(el.value) : null;

const WATCHED: readonly Watch[] = [
  { control: "newton", label: onWhenChecked("Newton's method") },
  { control: "perturbation", label: onWhenChecked("perturbation") },
  { control: "autoiter", label: onWhenChecked("auto-iterations") },
  { control: "aa", label: notDefault("1", (v) => `anti-aliasing ${v}×`) },
  { control: "accumulate", label: offWhenUnchecked("refine while idle: off") },
  { control: "light", label: onWhenChecked("relief lighting") },
  { control: "post", label: onWhenChecked("post-processing") },
  { control: "outline", label: onWhenChecked("boundary outline") },
  { control: "projection-mode", label: notDefault("linear", (v) => `${v} projection`) },
  { control: "sphere-param", label: onWhenChecked("sphere: parameter plane") },
  { control: "sphere-dyn", label: onWhenChecked("sphere: dynamical plane") },
];

/** Read the DOM and return everything the strip should list, in a stable order. */
export function activeSettings(): ActiveSetting[] {
  const out: ActiveSetting[] = [];
  for (const w of WATCHED) {
    const el = document.getElementById(w.control);
    if (!el) continue;
    const label = w.label(el);
    if (label !== null) out.push({ label, control: w.control });
  }
  return out;
}

/**
 * Render the strip into `host`, hiding it when nothing is non-default. `reveal` is called with the
 * control's id when an entry is pressed.
 */
export function renderActiveSettings(host: HTMLElement, reveal: (control: string) => void): void {
  const list = activeSettings();
  host.replaceChildren();
  host.hidden = list.length === 0;
  if (list.length === 0) return;
  const title = document.createElement("span");
  title.className = "pane-strip-title";
  title.textContent = "Active:";
  host.append(title);
  for (const s of list) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pane-strip-item";
    btn.textContent = s.label;
    btn.title = `Go to ${s.label}`;
    btn.addEventListener("click", () => reveal(s.control));
    host.append(btn);
  }
}
