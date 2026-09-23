// The PRA-0 page: the app's landmarks and its two panes, with nothing computed yet.
//
// PLAN §4.3 puts two panes side by side — the ROOT pane and the COEFFICIENT pane — and PRA-1 fills
// them. What this module fixes now is the structure every later milestone renders into and the a11y
// roster audits: one `<main>`, one `<h1>`, and every canvas NAMED (M6.4's invariants, asserted in
// test/scaffold.test.ts because the axe job does not block). The panes' names say they are empty,
// since a canvas described as showing roots that shows nothing would be the first unearned claim on
// the page.
import { attachCanvasA11y } from "@cas/ui";

export interface ScaffoldPane {
  readonly section: HTMLElement;
  readonly canvas: HTMLCanvasElement;
}

export interface Scaffold {
  readonly main: HTMLElement;
  readonly roots: ScaffoldPane;
  readonly coefficients: ScaffoldPane;
}

/** The two panes, in reading order. `id` keys the heading; `label` is the canvas's accessible name. */
export const PANES = [
  {
    id: "roots",
    heading: "Roots",
    label:
      "Root pane: the roots of p in the complex plane. Empty — nothing is computed yet.",
  },
  {
    id: "coefficients",
    heading: "Coefficients",
    label:
      "Coefficient pane: the coefficients of p in the complex plane. Empty — nothing is computed yet.",
  },
] as const;

export const NOTICE =
  "In construction. This page is the scaffold (PRA-0 of the plan): the two panes below are where a " +
  "polynomial's roots and coefficients will be drawn and dragged, starting at PRA-1. Nothing is " +
  "computed yet, so nothing is claimed.";

function pane(doc: Document, spec: (typeof PANES)[number]): ScaffoldPane {
  const section = doc.createElement("section");
  section.className = "pane";
  section.dataset.pane = spec.id;
  const heading = doc.createElement("h2");
  heading.id = `pane-${spec.id}`;
  heading.textContent = spec.heading;
  section.setAttribute("aria-labelledby", heading.id);
  const canvas = doc.createElement("canvas");
  section.append(heading, canvas);
  // Static until PRA-1 wires the drags; then this becomes role "application" with a keyboard map
  // (PLAN §5.2 rule 10).
  attachCanvasA11y(canvas, { label: spec.label, role: "img", doc });
  return { section, canvas };
}

/** Replace `host`'s children with the page's header, notice and the two empty panes. */
export function mountScaffold(host: HTMLElement): Scaffold {
  const doc = host.ownerDocument;
  const header = doc.createElement("header");
  header.className = "bar";
  const h1 = doc.createElement("h1");
  h1.className = "brand";
  h1.textContent = "Polynomial Root Analysis";
  header.append(h1);

  const main = doc.createElement("main");
  main.className = "stage";
  const notice = doc.createElement("p");
  notice.className = "notice";
  notice.textContent = NOTICE;
  const panes = doc.createElement("div");
  panes.className = "panes";
  main.append(notice, panes);

  host.replaceChildren(header, main);
  const [roots, coefficients] = PANES.map((spec) => {
    const p = pane(doc, spec);
    panes.append(p.section);
    return p;
  });
  return { main, roots, coefficients };
}
