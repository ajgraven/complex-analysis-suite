// @cas/ui — the shared suite navigation header.
//
// Turns the seven island apps (UX audit finding #1: one-way navigation — once inside an app the only way
// back to the launcher or across to a sibling is the browser back button) into a suite: a back-to-launcher
// link + sibling links, computed relative to the deployed layout (each app sits at `../<id>/` beneath the
// launcher root). Optionally (U7) a "Send to…" HAND-OFF picker that lists the sibling apps which accept
// the current app's interchange-exportable payload — replacing today's 3 hard-coded `window.open` buttons
// with real discovery (interop audit). The picker is caller-driven (the app supplies `accepts`/`hrefFor`),
// so @cas/ui stays app- and interchange-agnostic in U0; wiring it to @cas/interchange's known kinds is U7.

import { SUITE_APPS, type SuiteApp } from "./apps.js";

export interface HandoffConfig {
  /** Sibling apps that accept the current app's exportable state — the picker lists only these. */
  accepts(app: SuiteApp): boolean;
  /** Deep-link URL that opens `app` on the current state. */
  hrefFor(app: SuiteApp): string;
  /** Picker label (default "Send to…"). */
  readonly label?: string;
}

export interface NavHeaderOptions {
  /** This app's id — marked `aria-current="page"` and excluded from the sibling links. */
  readonly current: string;
  /** App registry (default `SUITE_APPS`). */
  readonly apps?: readonly SuiteApp[];
  /** Back-to-launcher href (default "../"). */
  readonly launcherHref?: string;
  /** Sibling href builder (default `(a) => "../" + a.id + "/"`). */
  readonly siblingHref?: (app: SuiteApp) => string;
  /** U7 hand-off picker. Omitted in U0 — no picker is rendered. */
  readonly handoff?: HandoffConfig;
  /** Document to build in (default the container's / the global). Injectable for tests. */
  readonly doc?: Document;
}

export interface NavHeader {
  /** The <nav> element appended to the container. */
  readonly el: HTMLElement;
  destroy(): void;
}

/** Mount the suite navigation header into `container`. */
export function mountNavHeader(container: HTMLElement, opts: NavHeaderOptions): NavHeader {
  const doc = opts.doc ?? container.ownerDocument;
  const apps = opts.apps ?? SUITE_APPS;
  const siblingHref = opts.siblingHref ?? ((a: SuiteApp): string => `../${a.id}/`);

  const nav = doc.createElement("nav");
  nav.className = "cas-nav";
  nav.setAttribute("aria-label", "Suite navigation");

  const home = doc.createElement("a");
  home.className = "cas-nav-home";
  home.href = opts.launcherHref ?? "../";
  home.textContent = "Suite";
  home.setAttribute("aria-label", "Back to the suite launcher");
  nav.appendChild(home);

  const list = doc.createElement("ul");
  list.className = "cas-nav-apps";
  for (const app of apps) {
    const li = doc.createElement("li");
    if (app.id === opts.current) {
      const span = doc.createElement("span");
      span.textContent = app.label;
      span.setAttribute("aria-current", "page");
      li.appendChild(span);
    } else if (app.soon) {
      const span = doc.createElement("span");
      span.textContent = app.label;
      span.setAttribute("aria-disabled", "true");
      li.appendChild(span);
    } else {
      const a = doc.createElement("a");
      a.href = siblingHref(app);
      a.textContent = app.label;
      li.appendChild(a);
    }
    list.appendChild(li);
  }
  nav.appendChild(list);

  // U7 hand-off picker — only rendered when configured (no app wires it in U0).
  if (opts.handoff) {
    const h = opts.handoff;
    const targets = apps.filter((a) => a.id !== opts.current && !a.soon && h.accepts(a));
    if (targets.length > 0) {
      const group = doc.createElement("div");
      group.className = "cas-nav-handoff";
      const labelEl = doc.createElement("span");
      labelEl.className = "cas-nav-handoff-label";
      labelEl.textContent = h.label ?? "Send to…";
      group.appendChild(labelEl);
      for (const app of targets) {
        const a = doc.createElement("a");
        a.className = "cas-nav-handoff-target";
        a.href = h.hrefFor(app);
        a.textContent = app.label;
        group.appendChild(a);
      }
      nav.appendChild(group);
    }
  }

  container.appendChild(nav);
  return {
    el: nav,
    destroy(): void {
      nav.remove();
    },
  };
}
