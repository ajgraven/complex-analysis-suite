// The Galois card (right rail): the factorisation over ℚ, and for each irreducible factor the list of
// cycle types its Galois group is proved to contain — one per prime — with the group named only when
// a theorem names it from that list (DESIGN §4.5). An open case prints the rows it has and "not yet
// identified", never a name.
import { h, type Child, type Desc } from "@cas/ui";
import { math } from "@cas/ui/math";
import { factorisationCert, galoisCerts, identityCerts } from "../engine/certify.js";
import type { Certificate } from "@cas/rigor";
import type { FactorEvidence, GaloisEvidence } from "../engine/galois/tier0.js";
import { CARD, GALOIS } from "../engine/vocabulary.js";
import { level } from "./level.js";

export type GaloisModel =
  | { readonly kind: "refused"; readonly reason: string }
  | { readonly kind: "busy" }
  | { readonly kind: "failed"; readonly reason: string }
  | { readonly kind: "done"; readonly evidence: GaloisEvidence };

/** An integer polynomial (ascending decimal strings) as LaTeX and as plain text, in z. */
export function zPolyText(coeffs: readonly string[]): { latex: string; plain: string } {
  const latex: string[] = [];
  const plain: string[] = [];
  for (let k = coeffs.length - 1; k >= 0; k--) {
    const c = BigInt(coeffs[k]);
    if (c === 0n) continue;
    const neg = c < 0n;
    const mag = neg ? -c : c;
    const first = latex.length === 0;
    const coef = mag === 1n && k > 0 ? "" : mag.toString();
    const monoL = k === 0 ? "" : k === 1 ? "z" : `z^{${k}}`;
    const monoP = k === 0 ? "" : k === 1 ? "z" : `z^${k}`;
    latex.push(`${neg ? "-" : first ? "" : "+"}${coef}${monoL}`);
    plain.push(`${neg ? (first ? "−" : " − ") : first ? "" : " + "}${coef}${monoP}`);
  }
  return { latex: latex.join(" "), plain: plain.join("") };
}

/**
 * A cycle type drawn: one ring of dots per cycle, a fixed point a lone dot. Decorative — the text
 * beside it carries the meaning, so it is hidden from assistive technology.
 */
function cycleGlyph(type: readonly number[], key: string): Desc {
  return h(
    "span",
    { key, class: "cycles", "aria-hidden": "true" },
    ...type.map((l, c) =>
      h(
        "span",
        { key: `c${c}`, class: "cycle", "data-length": String(l) },
        ...Array.from({ length: l }, (_, i) => {
          const r = l === 1 ? 0 : Math.min(9, 2.2 + 1.1 * l);
          const t = (2 * Math.PI * i) / l - Math.PI / 2;
          return h("span", {
            key: `d${i}`,
            class: "cycle-dot",
            style: `transform:translate(${(r * Math.cos(t)).toFixed(2)}px,${(r * Math.sin(t)).toFixed(2)}px)`,
          });
        }),
      ),
    ),
  );
}

/** The best-fitting candidates shown; the rest are counted, not hidden. */
const CANDIDATES_SHOWN = 6;

/** What the card needs from the page beyond the evidence: the root labels, and a way to play a generator. */
export interface GaloisView {
  /** The reader's label for root i (irreducible polynomials only). */
  readonly labels: readonly number[] | null;
  readonly onPlay?: (perm: readonly number[]) => void;
}

function certList(key: string, label: string, certs: readonly Certificate[]): Desc {
  return h(
    "ul",
    { key, class: "galois-rows", "aria-label": label },
    ...certs.map((r, k) =>
      h(
        "li",
        { key: `r${k}` },
        level(r, "lv"),
        h("span", { key: "c" }, r.claim),
        h("span", { key: "w", class: "witness" }, ` — ${r.method}`),
      ),
    ),
  );
}

function factorSection(
  f: FactorEvidence,
  i: number,
  irreducible: boolean,
  labelled: boolean,
  view: GaloisView,
): Desc {
  const text = zPolyText(f.coefficients);
  const head: Child = labelled
    ? h(
        "p",
        { key: "head", class: "factor-head" },
        math(text.latex, { key: "m", label: text.plain, display: false }),
        f.multiplicity > 1 ? ` (to the power ${f.multiplicity})` : "",
      )
    : null;
  if (!f.galois)
    return h(
      "div",
      { key: `f${i}`, class: "factor" },
      head,
      h("p", { key: "lin", class: "legend" }, GALOIS.linear),
    );
  const n = f.degree;
  const c = galoisCerts(f.galois, n, irreducible);
  const g = f.galois;
  const id = g.identification;
  const labels = irreducible ? view.labels : null;
  const ic = identityCerts(id, labels);
  const playable =
    irreducible && id.tier === 1 && id.labelsHold && view.onPlay !== undefined;
  return h(
    "div",
    { key: `f${i}`, class: "factor" },
    head,
    h(
      "p",
      { key: "group", class: "claim galois-group" },
      level(c.group, "lv"),
      c.group.level === "⚠"
        ? `Contains the elements below; ${GALOIS.open}.`
        : `It is ${c.group.claim}.`,
    ),
    c.group.restriction
      ? h(
          "p",
          { key: "restr", class: "legend" },
          `${c.group.restriction[0].toUpperCase()}${c.group.restriction.slice(1)}.`,
        )
      : null,
    ic.solvable
      ? h(
          "p",
          { key: "solv", class: "claim" },
          level(ic.solvable, "lv"),
          `It is ${ic.solvable.claim}.`,
        )
      : null,
    id.tier === 1 && id.by === "descent"
      ? certList("steps", "How the group was found", ic.steps)
      : certList("rows", "What the group is proved to be or contain", c.rows),
    c.group.level === "⚠"
      ? h("p", { key: "why", class: "legend" }, `${c.group.method}.`)
      : null,
    ic.generators.length
      ? h(
          "div",
          { key: "gens", class: "generators" },
          h(
            "p",
            { key: "t", class: "legend" },
            `${GALOIS.generators}${labels ? "" : " (numbered by this factor's own roots)"}:`,
          ),
          h(
            "ul",
            { key: "l", class: "galois-rows", "aria-label": GALOIS.generators },
            ...ic.generators.map((gen, k) =>
              h(
                "li",
                { key: `g${k}` },
                level(gen.cert, "lv"),
                h("span", { key: "c", class: "perm" }, gen.cert.claim),
                h("span", { key: "w", class: "witness" }, ` — ${gen.cert.method}`),
                playable
                  ? h(
                      "button",
                      {
                        key: "play",
                        type: "button",
                        class: "play",
                        "aria-label": GALOIS.play(gen.cert.claim),
                        onclick: () => view.onPlay?.(gen.perm),
                      },
                      "Play",
                    )
                  : null,
              ),
            ),
          ),
        )
      : null,
    ic.candidates.length
      ? h(
          "div",
          { key: "cands", class: "candidates" },
          h("p", { key: "t", class: "legend" }, GALOIS.estimateWhy),
          certList("list", GALOIS.candidates, ic.candidates.slice(0, CANDIDATES_SHOWN)),
          ic.candidates.length > CANDIDATES_SHOWN
            ? h(
                "p",
                { key: "more", class: "legend" },
                GALOIS.moreCandidates(ic.candidates.length - CANDIDATES_SHOWN),
              )
            : null,
        )
      : null,
    h(
      "ul",
      {
        key: "types",
        class: "cycle-types",
        "aria-label": `Cycle types the group contains, ${g.cycleTypes.length} seen at ${g.primesUsed} primes`,
      },
      ...g.cycleTypes.map((w, k) =>
        h(
          "li",
          { key: `t${w.type.join("-")}` },
          cycleGlyph(w.type, "glyph"),
          h(
            "span",
            { key: "x", class: "type-text" },
            level(c.types[k], "lv"),
            h("span", { key: "c" }, c.types[k].claim),
            h(
              "span",
              { key: "w", class: "witness" },
              ` — first at p = ${w.prime}; ${w.count} of ${g.primesUsed} primes`,
            ),
          ),
        ),
      ),
    ),
  );
}

export function galoisCard(
  m: GaloisModel | null,
  view: GaloisView = { labels: null },
): Desc | null {
  if (!m) return null;
  const body: Child[] = [];
  if (m.kind === "refused")
    body.push(h("p", { key: "refused", class: "refusal" }, GALOIS.refused(m.reason)));
  else if (m.kind === "busy")
    body.push(
      h("p", { key: "busy", class: "legend", "aria-live": "polite" }, GALOIS.busy),
    );
  else if (m.kind === "failed")
    body.push(h("p", { key: "failed", class: "refusal" }, GALOIS.refused(m.reason)));
  else if (!m.evidence.ok)
    body.push(
      h("p", { key: "refused", class: "refusal" }, GALOIS.refused(m.evidence.reason)),
    );
  else {
    const ev = m.evidence;
    const fc = factorisationCert(ev);
    body.push(
      h(
        "p",
        { key: "fact", class: "claim" },
        level(fc, "lv"),
        `The polynomial ${ev.irreducible ? "is " : ""}${fc.claim}.`,
      ),
    );
    if (!ev.irreducible)
      body.push(h("p", { key: "red", class: "legend" }, GALOIS.reducible));
    ev.factors.forEach((f, i) =>
      body.push(factorSection(f, i, ev.irreducible, !ev.irreducible, view)),
    );
    body.push(h("p", { key: "what", class: "legend" }, GALOIS.what));
  }
  return h(
    "section",
    { key: "galois", class: "card", "aria-labelledby": "card-galois" },
    h("h2", { key: "t", id: "card-galois" }, CARD.galois),
    ...body,
  );
}
