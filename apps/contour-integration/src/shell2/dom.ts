// The keyed builder: a description of the DOM, and a patch that reconciles it.
//
// M8 step 1.1, plan §4.0. About 120 lines and NO dependency — ADR-0007 admits no framework without
// a second consumer, and one app's shell is one consumer.
//
// **What it exists to make impossible.** The old shell rebuilds a card with `replaceChildren` and
// then discovers what that costs: M7.2's sweep found that rebuilding the contour card on a mouse
// move destroys its buttons, so a reader who had tabbed to `Cancel` lost focus the moment the
// pointer crossed the stage. That is not a cosmetic bug and it is not fixable by remembering to
// guard each call site — there are dozens. It is fixable by never replacing a node whose key
// persists, which is what `patch` does.
//
// Three rules, each of which was a real defect:
//
//  1. **A node with a persisting key is updated, never re-created.** Focus, scroll position, text
//     selection and a `<details>` element's animation state all live on the node.
//  2. **Form controls are patched by PROPERTY and only when the value differs.** Writing `value`
//     with the string it already holds is a no-op in every browser; writing a DIFFERENT string
//     while the user is typing moves the caret, so the guard is the comparison, not a focus test.
//  3. **A listener is replaced by swapping the function, not by adding one.** One wrapper per node
//     per event type is installed once and dispatches to whatever handler the latest description
//     carried — so re-rendering a button a hundred times leaves one `click` listener, not a hundred.
//
// Unkeyed children get a positional key (`@3:button`), so the reconciler has exactly one path and
// "keyed" versus "unkeyed" is not a second mode that could behave differently.

/** A property name that is written to the node rather than set as an attribute. */
const PROPERTIES = new Set(["value", "checked", "open", "disabled", "selected", "indeterminate"]);

/** What a node's key is, so the next patch can find it again. Never written into the document. */
const KEY = new WeakMap<Node, string>();
/** The live handler for each (node, event type) — swapped in place; the wrapper below reads it. */
const HANDLERS = new WeakMap<Node, Map<string, (e: Event) => void>>();
/** Event types whose one wrapper is already installed on the node. */
const WRAPPED = new WeakMap<Node, Set<string>>();

export type Child = Desc | string | number | null | undefined | false;

export interface Desc {
  readonly tag: string;
  readonly key?: string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly children: readonly Child[];
}

/**
 * Describe an element.
 *
 * Props are read by convention, which keeps the call sites terse: `key` addresses the node, `on*` is
 * a listener (`onClick`, `onInput`), `html` is raw innerHTML (KaTeX's output and nothing else),
 * anything in {@link PROPERTIES} is written as a property, and everything else is an attribute —
 * `undefined` or `null` removes it, `true` sets it empty, `false` removes it.
 */
export function h(tag: string, props: Readonly<Record<string, unknown>> = {}, ...children: Child[]): Desc {
  const { key, ...rest } = props as { key?: string } & Record<string, unknown>;
  return { tag, ...(key === undefined ? {} : { key }), props: rest, children };
}

/** Text as a child. Plain strings work too; this is for when a key is wanted. */
export function text(value: string, key?: string): Desc {
  return { tag: "#text", ...(key === undefined ? {} : { key }), props: { nodeValue: value }, children: [] };
}

function normalise(children: readonly Child[]): Desc[] {
  const out: Desc[] = [];
  for (const c of children) {
    if (c === null || c === undefined || c === false || c === "") continue;
    out.push(typeof c === "string" || typeof c === "number" ? text(String(c)) : c);
  }
  return out;
}

function keyOf(desc: Desc, index: number): string {
  return desc.key ?? `@${index}:${desc.tag}`;
}

function create(desc: Desc): Node {
  if (desc.tag === "#text") return document.createTextNode(String(desc.props.nodeValue ?? ""));
  return document.createElement(desc.tag);
}

function setListener(node: Node, type: string, fn: (e: Event) => void): void {
  let map = HANDLERS.get(node);
  if (map === undefined) {
    map = new Map();
    HANDLERS.set(node, map);
  }
  map.set(type, fn);
  let wrapped = WRAPPED.get(node);
  if (wrapped === undefined) {
    wrapped = new Set();
    WRAPPED.set(node, wrapped);
  }
  if (wrapped.has(type)) return;
  wrapped.add(type);
  // **The wrapper is installed once and reads the CURRENT handler.** Adding a listener per render
  // is how a button comes to fire its action twice, then three times; removing the old one first
  // requires holding a reference the caller does not have.
  node.addEventListener(type, (e: Event) => HANDLERS.get(node)?.get(type)?.(e));
}

function clearListener(node: Node, type: string): void {
  HANDLERS.get(node)?.delete(type);
}

function applyProps(node: Node, desc: Desc, previous: Readonly<Record<string, unknown>>): void {
  if (desc.tag === "#text") {
    const next = String(desc.props.nodeValue ?? "");
    if (node.nodeValue !== next) node.nodeValue = next;
    return;
  }
  const el = node as HTMLElement & Record<string, unknown>;
  for (const name of Object.keys(previous)) {
    if (name in desc.props) continue;
    if (name.startsWith("on")) clearListener(node, name.slice(2).toLowerCase());
    else if (PROPERTIES.has(name)) el[name] = name === "value" ? "" : false;
    else if (name === "html") el.innerHTML = "";
    else el.removeAttribute(name);
  }
  for (const [name, value] of Object.entries(desc.props)) {
    if (name.startsWith("on")) {
      if (typeof value === "function") setListener(node, name.slice(2).toLowerCase(), value as (e: Event) => void);
      else clearListener(node, name.slice(2).toLowerCase());
      continue;
    }
    if (name === "html") {
      if (el.innerHTML !== value) el.innerHTML = String(value ?? "");
      continue;
    }
    if (PROPERTIES.has(name)) {
      // Rule 2: only when it DIFFERS. Writing the same string is a no-op, and writing a different
      // one while the reader is typing moves the caret — which is why the comparison is the guard.
      if (el[name] !== value) el[name] = value;
      continue;
    }
    if (value === undefined || value === null || value === false) el.removeAttribute(name);
    else el.setAttribute(name, value === true ? "" : String(value));
  }
}

/** The props a node was last patched with, so removals can be detected. */
const LAST = new WeakMap<Node, Readonly<Record<string, unknown>>>();

/**
 * Reconcile `parent`'s children against `descriptions`, in place.
 *
 * Nodes are matched by key. A match of the same tag is UPDATED and moved if needed; anything
 * unmatched is created, and anything left over is removed. Recursion is depth-first, so a card's
 * whole subtree is patched by one call at its root.
 */
export function patch(parent: Node, descriptions: readonly Child[]): void {
  const descs = normalise(descriptions);
  const existing = new Map<string, Node>();
  for (const node of [...parent.childNodes]) {
    const k = KEY.get(node);
    if (k !== undefined) existing.set(k, node);
  }

  const wanted: Node[] = [];
  descs.forEach((desc, i) => {
    const k = keyOf(desc, i);
    const found = existing.get(k);
    // Rule 1: same key AND same tag means the SAME NODE, updated. A tag change is a different
    // element by any reading, so it is the one case that re-creates.
    const reuse =
      found !== undefined &&
      (desc.tag === "#text" ? found.nodeType === Node.TEXT_NODE : (found as HTMLElement).tagName?.toLowerCase() === desc.tag);
    const node = reuse ? (found as Node) : create(desc);
    if (reuse) existing.delete(k);
    KEY.set(node, k);
    applyProps(node, desc, LAST.get(node) ?? {});
    LAST.set(node, desc.props);
    if (desc.tag !== "#text" && !("html" in desc.props)) patch(node, desc.children);
    wanted.push(node);
  });

  for (const stale of existing.values()) stale.parentNode?.removeChild(stale);
  // Place them in order. `insertBefore` with the node already in position is a no-op in the DOM, so
  // an unchanged list does no work and no node is detached and re-attached (which would lose focus).
  wanted.forEach((node, i) => {
    const at = parent.childNodes[i];
    if (at !== node) parent.insertBefore(node, at ?? null);
  });
}
