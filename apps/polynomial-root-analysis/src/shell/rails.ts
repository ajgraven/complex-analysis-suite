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
import type { Analysis } from "../engine/analysis/analyse.js";
import { analysisCard } from "./analysisCard.js";

/** The gain matrix's shared log scale, so one root's row can be read against another's. */
function gainScale(c: readonly Conditioning[] | null): [number, number] {
  const logs = (c ?? []).flatMap((r) =>
    r.gains.filter((g) => Number.isFinite(g) && g > 0).map((g) => Math.log10(g)),
  );
  if (!logs.length) return [0, 1];
  const lo = Math.min(...logs);
  const hi = Math.max(...logs);
  return hi - lo < 1e-9 ? [lo - 0.5, hi + 0.5] : [lo, hi];
}

/**
 * How far a root moves per unit of each aₖ — the drag gain matrix's row for this root, as a heat row
 * on the shared log scale (brighter moves more), the selected coefficient's cell outlined and its gain
 * spelled out. `≈`: an explanation of the picture, not a claim.
 */
function gainRow(
  gains: readonly number[] | undefined,
  j: number | null,
  scale: [number, number],
): Desc | null {
  if (!gains || gains.length === 0) return null;
  const [lo, hi] = scale;
  const cells = gains.map((g, k) => {
    const t = Number.isFinite(g) ? (g > 0 ? (Math.log10(g) - lo) / (hi - lo) : 0) : 1;
    const light = 10 + 62 * Math.max(0, Math.min(1, t));
    return h("span", {
      key: `k${k}`,
      class: "gain-cell",
      "data-selected": k === j ? "true" : undefined,
      style: `background:hsl(42 95% ${light.toFixed(0)}%)`,
    });
  });
  const shown = (g: number): string => (Number.isFinite(g) ? g.toPrecision(3) : "∞");
  const text =
    j !== null && j < gains.length
      ? `moves ≈ ${shown(gains[j])} per unit of a${subscript(j)}`
      : (() => {
          let k = 0;
          gains.forEach((g, i) => {
            if (!(g <= gains[k])) k = i;
          });
          return `moves most per unit of a${subscript(k)} (≈ ${shown(gains[k])})`;
        })();
  return h(
    "span",
    { key: "gain", class: "root-gain" },
    h("span", { key: "row", class: "gain-row", "aria-hidden": "true" }, ...cells),
    text,
  );
}

export interface LeftModel {
  readonly text: string;
  readonly textRefusal: string | null;
  readonly ringRefusal: string | null;
  readonly ring: Ring;
  readonly poly: Polynomial | null;
  readonly overlay: boolean;
  readonly discs: boolean;
  readonly critical: boolean;
  readonly coefficient: number | null;
  readonly trails: boolean;
  readonly pseudozero: number | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly copyStatus: string;
}

export interface LeftHandlers {
  readonly onText: (text: string) => void;
  readonly onRing: (ring: Ring) => void;
  readonly onOverlay: (on: boolean) => void;
  readonly onDiscs: (on: boolean) => void;
  readonly onCritical: (on: boolean) => void;
  readonly onCoefficient: (j: number | null) => void;
  readonly onTrails: (on: boolean) => void;
  readonly onPseudozero: (log10eps: number | null) => void;
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
        "label",
        { key: "cr", class: "check" },
        h("input", {
          key: "i",
          type: "checkbox",
          checked: m.critical,
          onChange: (e: Event) => on.onCritical((e.target as HTMLInputElement).checked),
        }),
        " Show the critical points and the roots' convex hull",
      ),
      h(
        "label",
        { key: "tr", class: "check" },
        h("input", {
          key: "i",
          type: "checkbox",
          checked: m.trails,
          onChange: (e: Event) => on.onTrails((e.target as HTMLInputElement).checked),
        }),
        " Keep the roots' trails after a drag",
      ),
      h(
        "label",
        { key: "coef", class: "field" },
        h("span", { key: "t" }, "Branch points of"),
        h(
          "select",
          {
            key: "s",
            value: m.coefficient === null ? "none" : String(m.coefficient),
            onChange: (e: Event) => {
              const v = (e.target as HTMLSelectElement).value;
              on.onCoefficient(v === "none" ? null : Number(v));
            },
          },
          h("option", { key: "none", value: "none" }, "none"),
          ...Array.from({ length: (m.poly?.degree ?? 0) + 1 }, (_, k) =>
            h("option", { key: `a${k}`, value: String(k) }, `a${subscript(k)}`),
          ),
        ),
      ),
      h(
        "label",
        { key: "pzOn", class: "check" },
        h("input", {
          key: "i",
          type: "checkbox",
          checked: m.pseudozero !== null,
          onChange: (e: Event) =>
            on.onPseudozero(
              (e.target as HTMLInputElement).checked ? Math.log10(2 ** -53) : null,
            ),
        }),
        " Show the pseudozero set",
      ),
      m.pseudozero !== null
        ? h(
            "label",
            { key: "pzLevel", class: "field" },
            h("span", { key: "t" }, "log₁₀ ε"),
            h("input", {
              key: "r",
              type: "range",
              min: "-16",
              max: "-1",
              step: "0.5",
              value: String(m.pseudozero),
              "aria-valuetext": `ε = 10 to the ${Math.round(m.pseudozero * 100) / 100}`,
              onChange: (e: Event) =>
                on.onPseudozero(Number((e.target as HTMLInputElement).value)),
            }),
            h("output", { key: "o" }, (Math.round(m.pseudozero * 10) / 10).toFixed(1)),
          )
        : null,
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
  readonly analysis: Analysis | null;
  readonly coefficient: number | null;
  readonly critical: boolean;
  readonly pseudozero: number | null;
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

export function rightRail(m: RightModel): Child[] {
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
  const scale = gainScale(m.conditioning);
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
                gainRow(m.conditioning?.[i]?.gains, m.coefficient, scale),
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
    analysisCard({
      poly: m.poly,
      analysis: m.analysis,
      coefficient: m.coefficient,
      critical: m.critical,
      pseudozero: m.pseudozero,
    }),
  ];
}
