// apps/2d-hydrodynamics — the app hub (HD-0). The hydrodynamic twin of 2D Electrostatics: ideal
// (inviscid, irrotational) flow past a body B, realized as flow past the unit disk 𝔻* carried through a
// conformal map ψ: 𝔻* → ext(B). This landing page introduces the construction and previews the body
// roster; the airfoil page (HD-1) and the transplant gallery (HD-2) fill in behind it. Established by
// ADR-0037, with the airfoil promoted out of 2D Electrostatics.
import "./styles/main.css";
import "@cas/ui/nav.css";
import { runWithFatalBoundary, mountNavHeader } from "@cas/ui";
import { BODIES, type BodyEntry } from "./bodies.js";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A clickable card for one body ψ: 𝔻* → ext(B), linking to its page (the airfoil page, or the gallery
 *  deep-linked by body). */
function bodyCard(b: BodyEntry): HTMLElement {
  const card = el("a", "body-card");
  (card as HTMLAnchorElement).href = b.href;
  card.append(el("h3", "body-name", b.label));
  const psi = el("p", "body-psi");
  psi.append(el("span", "psi-label", "ψ = "), el("code", undefined, b.psi));
  card.append(psi, el("p", "body-desc", `carries 𝔻* onto ${b.body}.`));
  if (b.lift) {
    card.append(el("span", "tag tag-lift", "Kutta condition · lift"));
  } else {
    card.append(el("span", "tag", "circulation free"));
  }
  return card;
}

function main(): void {
  const app = document.getElementById("app");
  if (!app) return;
  app.textContent = "";

  mountNavHeader(app, { current: "2d-hydrodynamics" });

  const root = el("main", "hub");

  const head = el("header", "hub-head");
  head.append(el("h1", undefined, "2D Hydrodynamics"));
  head.append(
    el(
      "p",
      "lede",
      "Ideal (inviscid, irrotational) flow past a body — the reading of the complex potential " +
        "W = φ + iψ that its electrostatic twin cannot reduce to dropped charges. Flow past a body B is " +
        "flow past the unit disk 𝔻*, carried onto B by a conformal map ψ: 𝔻* → ext(B); where B has a sharp " +
        "trailing edge, the Kutta condition fixes the circulation and gives the lift.",
    ),
  );
  root.append(head);

  const airfoil = BODIES.filter((b) => b.kind === "airfoil");
  const gallery = BODIES.filter((b) => b.kind === "closed-form");

  const airfoilSection = el("section", "hub-section");
  airfoilSection.append(el("h2", undefined, "The airfoil"));
  airfoilSection.append(
    el(
      "p",
      "section-note",
      "The crown jewel: flow past a Joukowski / Kármán–Trefftz wing, where the map that carries the flow " +
        "also produces the lift.",
    ),
  );
  const airfoilGrid = el("div", "card-grid");
  for (const b of airfoil) airfoilGrid.append(bodyCard(b));
  airfoilSection.append(airfoilGrid);
  root.append(airfoilSection);

  const gallerySection = el("section", "hub-section");
  gallerySection.append(el("h2", undefined, "The transplant gallery"));
  gallerySection.append(
    el(
      "p",
      "section-note",
      "The same construction for a family of closed-form bodies ψ(z) = z + Σ bₖ/zᵏ — every quantity exact (=).",
    ),
  );
  const galleryGrid = el("div", "card-grid");
  for (const b of gallery) galleryGrid.append(bodyCard(b));
  gallerySection.append(galleryGrid);
  root.append(gallerySection);

  app.append(root);
}

runWithFatalBoundary(main);
