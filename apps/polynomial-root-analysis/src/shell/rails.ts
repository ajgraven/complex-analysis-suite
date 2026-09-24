// The two rails, described (not built): left — what is being analysed; right — what it proves.
// Rendered with @cas/ui's keyed builder, so a re-render never replaces a node whose key persists
// (the input keeps its caret; a focused radio keeps its focus).
import { describeLevel, type Certificate } from "@cas/rigor";
import { h, type Child, type Desc } from "@cas/ui";
import type { Polynomial, Ring } from "../engine/polynomial.js";
import type { Conditioning } from "../engine/roots/conditioning.js";
import { formatRadiusUpper, type DiscReport } from "../engine/roots/discs.js";
import type { GroupReport } from "../engine/roots/multiplicity.js";
import { discCerts, groupCert, coordinateCert } from "../engine/certify.js";
import { CARD, RING_HINT, RING_LABEL } from "../engine/vocabulary.js";
import { labelColour } from "../ui/camera.js";
import { subscript } from "../ui/ink.js";
import { formatCx, formatGauss } from "./format.js";

export interface LeftModel {
  readonly text: string;
  readonly textRefusal: string | null;
  readonly ringRefusal: string | null;
  readonly ring: Ring;
  readonly poly: Polynomial | null;
  readonly overlay: boolean;
  readonly discs: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly copyStatus: string;
}

export interface LeftHandlers {
  readonly onText: (text: string) => void;
  readonly onRing: (ring: Ring) => void;
  readonly onOverlay: (on: boolean) => void;
  readonly onDiscs: (on: boolean) => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onCopyLink: () => void;
  readonly onSaveFigure: () => void;
}

/** A level glyph with its meaning spelled out for a screen reader. */
export function level(cert: Certificate, key: string): Desc {
  return h(
    "span",
    { key, class: "level", "data-level": cert.level },
    h("span", { key: "g", "aria-hidden": "true" }, cert.level),
    h("span", { key: "t", class: "sr" }, `${describeLevel(cert.level)}: `),
  );
}

function card(key: string, title: string, ...body: Child[]): Desc {
  return h(
    "section",
    { key, class: "card", "aria-labelledby": `card-${key}` },
    h("h2", { key: "t", id: `card-${key}` }, title),
    ...body,
  );
}

function coefficientRows(p: Polynomial): Desc {
  const rows: Desc[] = [];
  for (let k = p.degree; k >= 0; k--) {
    const value = p.exact ? formatGauss(p.exact.coeff(k)) : formatCx(p.coeffs[k]);
    rows.push(
      h(
        "li",
        { key: `a${k}` },
        h("span", { key: "n", class: "coef-name" }, `a${subscript(k)}`),
        h(
          "span",
          { key: "l", class: "level", "data-level": p.exact ? "=" : "≈" },
          h("span", { key: "g", "aria-hidden": "true" }, p.exact ? "=" : "≈"),
          h("span", { key: "t", class: "sr" }, p.exact ? "exactly " : "approximately "),
        ),
        h("span", { key: "v", class: "coef-value" }, value),
      ),
    );
  }
  return h(
    "ul",
    {
      key: "coeffs",
      class: "coeffs",
      "aria-label": "Coefficients, highest degree first",
    },
    ...rows,
  );
}

export function leftRail(m: LeftModel, on: LeftHandlers): Desc[] {
  const rings: Ring[] = ["C", "R", "Q"];
  return [
    card(
      "poly",
      CARD.polynomial,
      h(
        "label",
        { key: "lab", class: "field" },
        h("span", { key: "c" }, "p(z) ="),
        h("input", {
          key: "in",
          type: "text",
          class: "poly-input",
          value: m.text,
          spellcheck: "false",
          autocomplete: "off",
          onChange: (e: Event) => on.onText((e.target as HTMLInputElement).value),
        }),
      ),
      m.textRefusal
        ? h(
            "p",
            { key: "refuse", class: "refusal", role: "alert" },
            `Not read: ${m.textRefusal}.`,
          )
        : null,
      h(
        "fieldset",
        { key: "ring", class: "ring" },
        h("legend", { key: "lg" }, "Coefficients in"),
        ...rings.map((r) =>
          h(
            "label",
            { key: r, class: "ring-choice" },
            h("input", {
              key: "i",
              type: "radio",
              name: "ring",
              value: r,
              checked: m.ring === r,
              onChange: () => on.onRing(r),
            }),
            h("span", { key: "s" }, ` ${RING_LABEL[r]} — ${RING_HINT[r]}`),
          ),
        ),
      ),
      m.ringRefusal
        ? h(
            "p",
            { key: "ringRefuse", class: "refusal", role: "alert" },
            `Not switched: ${m.ringRefusal}.`,
          )
        : null,
      m.poly ? coefficientRows(m.poly) : null,
    ),
    card(
      "view",
      CARD.view,
      h(
        "label",
        { key: "ov", class: "check" },
        h("input", {
          key: "i",
          type: "checkbox",
          checked: m.overlay,
          onChange: (e: Event) => on.onOverlay((e.target as HTMLInputElement).checked),
        }),
        " Draw the coefficients on the root plane",
      ),
      h(
        "label",
        { key: "dc", class: "check" },
        h("input", {
          key: "i",
          type: "checkbox",
          checked: m.discs,
          onChange: (e: Event) => on.onDiscs((e.target as HTMLInputElement).checked),
        }),
        " Show the inclusion discs",
      ),
      h(
        "div",
        { key: "btns", class: "buttons" },
        h(
          "button",
          { key: "u", type: "button", disabled: !m.canUndo, onClick: on.onUndo },
          "Undo",
        ),
        h(
          "button",
          { key: "r", type: "button", disabled: !m.canRedo, onClick: on.onRedo },
          "Redo",
        ),
        h("button", { key: "l", type: "button", onClick: on.onCopyLink }, "Copy link"),
        h(
          "button",
          { key: "f", type: "button", onClick: on.onSaveFigure },
          "Save figure",
        ),
      ),
      h("p", { key: "status", class: "status", role: "status" }, m.copyStatus),
    ),
  ];
}

export interface RightModel {
  readonly poly: Polynomial | null;
  readonly discs: DiscReport | null;
  readonly groups: GroupReport | null;
  readonly conditioning: readonly Conditioning[] | null;
  readonly selectedRoot: number | null;
}

function summary(p: Polynomial, discs: DiscReport): Desc {
  if (!discs.ok) {
    const cert = discCerts(discs)[0];
    return h(
      "p",
      { key: "sum", class: "summary" },
      level(cert, "lv"),
      `No discs: ${discs.reason}.`,
    );
  }
  const k = discs.components;
  const text =
    k === p.degree
      ? `${p.degree} discs, pairwise disjoint: each holds exactly one root of p.`
      : `${k} separate groups of discs: each group holds exactly as many roots of p, counted with multiplicity, as it has discs.`;
  return h("p", { key: "sum", class: "summary" }, level(discCerts(discs)[0], "lv"), text);
}

export function rightRail(m: RightModel): Desc[] {
  if (!m.poly || !m.discs || !m.groups) {
    return [
      card(
        "roots",
        CARD.roots,
        h("p", { key: "none", class: "summary" }, "There is no polynomial to analyse."),
      ),
    ];
  }
  const p = m.poly;
  const discs = m.discs;
  const groups: Child[] = [];
  if (m.groups.ok) {
    m.groups.groups.forEach((g, gi) => {
      const cert = groupCert(g);
      groups.push(
        h(
          "li",
          { key: `g${gi}`, class: "group" },
          h("p", { key: "claim", class: "claim" }, level(cert, "lv"), cert.claim),
          h(
            "ul",
            { key: "members", class: "members" },
            ...g.members.map((i) => {
              const label = p.labels[i];
              const d = discs.ok ? discs.discs[i] : null;
              const kappa = m.conditioning?.[i]?.kappa;
              return h(
                "li",
                {
                  key: `r${label}`,
                  class: "root",
                  "data-selected": m.selectedRoot === i ? "true" : undefined,
                },
                h("span", {
                  key: "sw",
                  class: "swatch",
                  style: `background:${labelColour(label, p.degree)}`,
                  "aria-hidden": "true",
                }),
                h("span", { key: "name", class: "root-name" }, `r${subscript(label)}`),
                level(coordinateCert(), "lv"),
                h("span", { key: "val", class: "root-value" }, formatCx(p.roots[i])),
                d
                  ? h(
                      "span",
                      { key: "disc", class: "root-disc" },
                      `disc radius ≤ ${formatRadiusUpper(d.radius)}`,
                    )
                  : null,
                kappa !== undefined
                  ? h(
                      "span",
                      { key: "kappa", class: "root-kappa" },
                      `κ ≈ ${Number.isFinite(kappa) ? kappa.toPrecision(3) : "∞"}`,
                    )
                  : null,
              );
            }),
          ),
        ),
      );
    });
  } else {
    groups.push(h("li", { key: "refused", class: "refusal" }, m.groups.reason));
  }
  return [
    card(
      "roots",
      CARD.roots,
      summary(p, discs),
      p.source === "coeffs" && !p.converged
        ? h(
            "p",
            { key: "unconv", class: "refusal" },
            "The root solve did not settle; the coordinates are its last iterates, and only the discs are claimed.",
          )
        : null,
      h("ul", { key: "groups", class: "groups" }, ...groups),
      h(
        "p",
        { key: "legend", class: "legend" },
        "Coordinates are estimates. Each disc is proved to hold the stated number of roots of the polynomial whose coefficients are listed; κ is how far a root moves per relative change in the coefficients.",
      ),
    ),
  ];
}
