/**
 * The sidebar's five tabs — Function · Appearance · Precision · Instruments · Studio.
 *
 * The pane had grown to twenty-six control groups in one scroll, which measured at three times the
 * viewport on a laptop: the settings that decide what is on screen were reachable only by scrolling
 * past the ones that decide how it is coloured. Tabs cut it to a third, and are the only arrangement
 * in which a picture-changing setting can end up on a tab you are not looking at — which is exactly
 * what the active-settings strip above them exists to cancel. (WP10/U4, review 2026-09-16.)
 *
 * **The groups are MOVED, not rewritten.** Each tab is a list of element ids (or of a control id
 * whose enclosing `.field` moves with it), so the mapping is one table rather than a restructured
 * 1,700-line document, and a group keeps every internal id, handler and style it already had.
 *
 * The open tab is a per-VIEWER convenience: it goes in `localStorage` under the app's `cdjs.*`
 * convention and is deliberately NOT in `SHARE_IDS`, because a permalink restores a mathematical
 * view and which tab the sender happened to have open is not part of one.
 */

/** A member of a tab: an element id, or a control id whose enclosing `.field` travels with it. */
export interface TabMember {
  /** The element's own id. */
  readonly id: string;
  /** When true, move `#id`'s enclosing `.field` instead of the element itself. */
  readonly field?: boolean;
}

export interface TabSpec {
  readonly id: string;
  readonly label: string;
  readonly members: readonly TabMember[];
}

const f = (id: string): TabMember => ({ id, field: true });
const g = (id: string): TabMember => ({ id });

export const SIDEBAR_TABS: readonly TabSpec[] = [
  {
    id: "function",
    label: "Function",
    // What is ITERATED. Newton lives here rather than under precision, where it used to sit: it
    // changes the map, not the accuracy — the plot iterates z − f/f′ instead of f.
    members: [
      f("inpf"),
      g("newton-field"),
      f("import-map"),
      f("schwarz-open"),
      g("param-a-field"),
      f("fractal_presets"),
    ],
  },
  {
    id: "appearance",
    label: "Appearance",
    members: [
      f("mode"),
      f("palette"),
      g("trap-field"),
      g("appearance-group"),
      g("overlays-group"),
      g("gradient-editor"),
    ],
  },
  {
    id: "precision",
    label: "Precision",
    members: [g("precision-group")],
  },
  {
    id: "instruments",
    label: "Instruments",
    members: [
      g("julia-props-group"),
      g("exterior-group"),
      g("angle-group"),
      g("angles-of-point-group"),
      g("component-data-group"),
      g("yoccoz-group"),
      g("lamination-group"),
      g("address-group"),
      g("mating-group"),
      g("herman-group"),
    ],
  },
  {
    id: "studio",
    label: "Studio",
    members: [g("view-group"), g("studio-group")],
  },
];

const TAB_KEY = "cdjs.tab";

export interface SidebarTabs {
  /** Show `id` (and remember it); a member id also works — it selects that member's tab. */
  select(id: string): void;
  /** The open tab's id. */
  current(): string;
  /** Switch to the tab owning `memberId` and move focus to `focusId` (default: the member). */
  reveal(memberId: string, focusId?: string): void;
}

/** The element a member refers to, or null when it is not in this document. */
function memberEl(m: TabMember): HTMLElement | null {
  const el = document.getElementById(m.id);
  if (!el) return null;
  if (!m.field) return el;
  const field = el.closest(".field");
  return field instanceof HTMLElement ? field : el;
}

/**
 * Build the tablist and the panels, move every member into its panel, and wire the keyboard.
 *
 * Roving `tabindex` with Left/Right/Home/End, `aria-selected`, `aria-controls`/`aria-labelledby` —
 * the WAI-ARIA tabs pattern, asserted in the shell test rather than left as a follow-up.
 */
export function mountSidebarTabs(tablist: HTMLElement, panels: HTMLElement): SidebarTabs {
  const buttons: HTMLButtonElement[] = [];
  const bodies = new Map<string, HTMLElement>();
  /** Containers a member was taken OUT of — checked for emptiness once every move is done. */
  const emptied = new Set<HTMLElement>();
  /** member id → tab id, for `reveal`. */
  const owner = new Map<string, string>();

  for (const spec of SIDEBAR_TABS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = `tab-${spec.id}`;
    btn.className = "pane-tab";
    btn.textContent = spec.label;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-controls", `tabpanel-${spec.id}`);
    tablist.append(btn);
    buttons.push(btn);

    const body = document.createElement("div");
    body.id = `tabpanel-${spec.id}`;
    // `.panel` so every selector the moved groups were written against still applies.
    body.className = "panel pane-panel";
    body.setAttribute("role", "tabpanel");
    body.setAttribute("aria-labelledby", btn.id);
    body.tabIndex = 0; // the panel scrolls, so it must be reachable by keyboard (WAI-ARIA)
    panels.append(body);
    bodies.set(spec.id, body);

    for (const m of spec.members) {
      const el = memberEl(m);
      if (!el) continue; // a member the markup does not have is simply absent, not an error
      if (el.parentElement) emptied.add(el.parentElement);
      body.append(el);
      owner.set(m.id, spec.id);
    }
  }

  // A container this left with nothing in it goes with its contents.
  //
  // `<section class="panel" aria-label="Function and presets">` had ALL twelve of its groups moved
  // onto tabs (and its action row taken by the pinned footer), and the empty shell stayed behind: a
  // named `<section>` is a `region` LANDMARK, so a screen-reader user cycling landmarks arrived at
  // "Function and presets" and found nothing there, and `.panel`'s border and padding drew an empty
  // ~34 px box under the inspector. axe cannot see this — its `region` rule checks that content
  // sits INSIDE a region, never that a region has content — so WP11's clean audit was true and
  // blind. Only containers whose remaining children are all gone are removed, so one that keeps
  // anything of its own is left alone. (Review follow-up.)
  // "Empty" means no text and nothing a reader can use — not `children.length === 0`, because a
  // member's parent is an inner `.panel-group` wrapper and removing THAT is what leaves the section
  // hollow. So it cascades upward, stopping at the pane itself and at anything holding the tabs.
  const INTERACTIVE = "input, button, select, textarea, canvas, a, img, svg, pre";
  const isEmpty = (el: HTMLElement): boolean =>
    (el.textContent ?? "").trim() === "" && el.querySelector(INTERACTIVE) === null;
  for (const host of emptied) {
    let node: HTMLElement | null = host;
    while (
      node &&
      node !== panels &&
      node !== tablist &&
      !node.contains(panels) &&
      node.parentElement &&
      isEmpty(node)
    ) {
      const parent: HTMLElement | null = node.parentElement;
      node.remove();
      node = parent;
    }
  }

  let open = SIDEBAR_TABS[0].id;

  const paint = (): void => {
    for (const spec of SIDEBAR_TABS) {
      const selected = spec.id === open;
      const btn = buttons[SIDEBAR_TABS.indexOf(spec)];
      btn.setAttribute("aria-selected", selected ? "true" : "false");
      btn.tabIndex = selected ? 0 : -1; // roving tabindex: one stop for the whole tablist
      btn.classList.toggle("is-active", selected);
      const body = bodies.get(spec.id);
      if (body) body.hidden = !selected;
    }
  };

  /** The tab that owns `id`: a tab id, a member id, or — for `reveal` — any control INSIDE one. */
  const tabOf = (id: string): string | undefined => {
    if (bodies.has(id)) return id;
    const direct = owner.get(id);
    if (direct) return direct;
    // Nested: the strip names a CONTROL (`perturbation`), not the group that was moved
    // (`precision-group`), and the member table only knows the latter.
    const el = document.getElementById(id);
    if (!el) return undefined;
    for (const [tab, body] of bodies) if (body.contains(el)) return tab;
    return undefined;
  };

  const select = (id: string): void => {
    const tab = tabOf(id);
    if (!tab || tab === open) {
      if (tab) paint();
      return;
    }
    open = tab;
    paint();
    try {
      localStorage.setItem(TAB_KEY, open);
    } catch {
      /* localStorage unavailable (private mode) — the tab simply is not remembered */
    }
  };

  for (const [i, btn] of buttons.entries()) {
    btn.addEventListener("click", () => {
      select(SIDEBAR_TABS[i].id);
      btn.focus();
    });
    btn.addEventListener("keydown", (e) => {
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      let next = -1;
      if (step !== 0) next = (i + step + buttons.length) % buttons.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = buttons.length - 1;
      if (next < 0) return;
      e.preventDefault();
      select(SIDEBAR_TABS[next].id);
      buttons[next].focus();
    });
  }

  let stored: string | null = null;
  try {
    stored = localStorage.getItem(TAB_KEY);
  } catch {
    /* ignore */
  }
  if (stored && bodies.has(stored)) open = stored;
  paint();

  return {
    select,
    current: () => open,
    reveal(memberId, focusId) {
      select(memberId);
      const target = document.getElementById(focusId ?? memberId);
      if (!target) return;
      // A member inside a collapsed <details> is not reachable until it is open.
      const details = target.closest("details");
      if (details instanceof HTMLDetailsElement) details.open = true;
      // `scrollIntoView` is not implemented by every environment the shell runs in (jsdom has no
      // layout), and an unguarded call throws out of the click handler — taking the focus move,
      // which is the point of `reveal`, with it.
      if (typeof target.scrollIntoView === "function") target.scrollIntoView({ block: "nearest" });
      if (typeof target.focus === "function") target.focus();
    },
  };
}
