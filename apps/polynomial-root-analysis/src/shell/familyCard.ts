// The Family card (PLAN §7 PRA-7): a polynomial p(t, z) as a family of polynomials in z, its branch
// points in t, the flower of lassos from one base point, the group they generate — the Galois group
// over ℂ(t) — and the bridge to ℚ: the group over ℚ(t), and how the member at t₀ compares with it.
import { formatCycles } from "@cas/monodromy";
import { h, type Child, type Desc } from "@cas/ui";
import { math } from "@cas/ui/math";
import type { Certificate } from "@cas/rigor";
import {
  arithmeticCert,
  familyBranchCert,
  monodromyCert,
  monodromyGroupCert,
  specialisationCert,
} from "../engine/certify.js";
import { FAMILY_PRESETS } from "../engine/family/family.js";
import { relate, type SpecialGalois } from "../engine/family/bridge.js";
import { FAMILY, METHOD } from "../engine/vocabulary.js";
import { subscript } from "../ui/ink.js";
import { polyLatexIn } from "./analysisCard.js";
import { formatCx } from "./format.js";
import { level } from "./level.js";
import type { FamilyResolution, FamilyState } from "./state.js";

export interface FamilyModel {
  /** The family in the state, if any. */
  readonly state: FamilyState | null;
  readonly resolution: FamilyResolution | null;
  /** The text in the box (what was typed, when it did not read). */
  readonly text: string;
  readonly refusal: string | null;
  /** What the Galois card knows of the member p(t₀, z). */
  readonly special: SpecialGalois;
}

export interface FamilyHandlers {
  readonly onOpen: (text: string, base: string | null) => void;
  readonly onBase: (text: string) => void;
  readonly onSpecialise: () => void;
  readonly onBack: () => void;
  readonly onLeave: () => void;
}

function claim(key: string, c: Certificate, text: string): Desc {
  return h("p", { key, class: "claim" }, level(c, "lv"), text);
}

function bridge(r: FamilyResolution, special: SpecialGalois, n: number): Desc {
  const rows: Child[] = [h("h3", { key: "h" }, FAMILY.bridgeHeading)];
  if (r.group) {
    const g = monodromyGroupCert(r.group.recognition, r.group.missing, n);
    rows.push(
      claim(
        "geo",
        g,
        g.level === "⚠"
          ? `Over ℂ(t): no group — ${g.method}.`
          : `Over ℂ(t): ${g.claim}${r.group.order ? `, order ${r.group.order}` : ""}${
              r.groupBase !== null
                ? ` (from the lassos at t = ${r.groupBase}, where every tether is clear)`
                : ""
            }.`,
      ),
    );
    rows.push(h("p", { key: "geoWhy", class: "legend" }, METHOD.geometric));
  }
  if (r.arithmetic) {
    const a = arithmeticCert(r.arithmetic, n);
    rows.push(
      claim(
        "arith",
        a,
        a.level === "⚠"
          ? `Over ℚ(t): not named — ${a.method}.`
          : `Over ℚ(t): ${a.claim}.`,
      ),
    );
  }
  if (r.base) {
    const t0 = r.baseText;
    if (!r.base.im.isZero())
      rows.push(h("p", { key: "spec", class: "legend" }, FAMILY.notRational));
    else if (r.arithmetic) {
      const rel = relate(r.arithmetic, special);
      const name =
        special.kind === "named"
          ? special.name
          : special.kind === "reducible"
            ? "intransitive — p(t₀, z) factors"
            : "";
      const c = specialisationCert(rel, t0, name);
      rows.push(
        claim(
          "spec",
          c,
          c.level === "⚠"
            ? `At t = ${t0}: no comparison — ${c.method}.`
            : `${c.claim.charAt(0).toUpperCase()}${c.claim.slice(1)}.`,
        ),
      );
    }
  }
  rows.push(h("p", { key: "why", class: "legend" }, FAMILY.bridgeWhy));
  return h("div", { key: "bridge", class: "bridge" }, ...rows);
}

export function familyCard(m: FamilyModel, on: FamilyHandlers): Desc {
  const r = m.resolution;
  const open = m.state?.open === true;
  const rows: Child[] = [];

  // Specialised: the sandbox holds one member; the card keeps only the way back and the bridge.
  if (m.state && !open && r && r.matches && r.reading) {
    rows.push(
      h(
        "p",
        { key: "member", class: "summary" },
        FAMILY.specialised(r.reading.text, r.baseText),
      ),
      bridge(r, m.special, r.reading.degree),
      h(
        "div",
        { key: "tools", class: "toolbar" },
        h("button", { key: "back", type: "button", onclick: on.onBack }, FAMILY.back),
        h("button", { key: "leave", type: "button", onclick: on.onLeave }, FAMILY.leave),
      ),
    );
    return card(...rows);
  }

  rows.push(
    h("p", { key: "what", class: "legend" }, FAMILY.what),
    h(
      "ul",
      { key: "presets", class: "preset-chips", "aria-label": FAMILY.presets },
      ...FAMILY_PRESETS.map((pr) =>
        h(
          "li",
          { key: pr.id },
          h(
            "button",
            {
              key: "b",
              type: "button",
              class: "chip",
              "aria-pressed": open && m.state?.text === pr.text ? "true" : "false",
              onclick: () => on.onOpen(pr.text, pr.base ?? null),
            },
            pr.label,
          ),
        ),
      ),
    ),
    h(
      "label",
      { key: "box", class: "field" },
      h("span", { key: "c" }, FAMILY.box),
      h("input", {
        key: "in",
        type: "text",
        class: "family-input",
        value: m.text,
        spellcheck: "false",
        autocomplete: "off",
        onChange: (e: Event) => on.onOpen((e.target as HTMLInputElement).value, null),
      }),
    ),
    m.refusal
      ? h(
          "p",
          { key: "refuse", class: "refusal", role: "alert" },
          `Not read: ${m.refusal}.`,
        )
      : null,
  );
  if (!open || !r) return card(...rows);

  rows.push(
    h(
      "label",
      { key: "base", class: "field" },
      h("span", { key: "c" }, FAMILY.base),
      h("input", {
        key: "in",
        type: "text",
        class: "base-input",
        value: r.baseText,
        spellcheck: "false",
        autocomplete: "off",
        onChange: (e: Event) => on.onBase((e.target as HTMLInputElement).value),
      }),
    ),
    h("p", { key: "baseWhy", class: "legend" }, FAMILY.baseWhy),
  );
  if (r.refusal)
    rows.push(
      h(
        "p",
        { key: "fref", class: "refusal", role: "alert" },
        `No family: ${r.refusal}.`,
      ),
    );
  const f = r.reading;
  if (!f) return card(...rows);

  const bc = familyBranchCert(f);
  const disc = polyLatexIn(f.disc, "t");
  rows.push(
    h(
      "div",
      { key: "branch", class: "branch" },
      claim(
        "head",
        bc,
        `${FAMILY.points(f.points.length)}${f.multiplicity.some((x) => x > 1) ? " (at some, two collisions at once)" : ""}.`,
      ),
      disc
        ? h(
            "p",
            { key: "poly", class: "formula" },
            math(`\\Delta(t) = ${disc}`, {
              key: "m",
              label: "the discriminant as a polynomial in t",
              display: false,
            }),
          )
        : null,
      h(
        "ul",
        { key: "list", class: "branch-list", "aria-label": FAMILY.pointsLabel },
        ...f.points.map((z, i) =>
          h("li", { key: `b${i}` }, `#${i + 1}: t ≈ ${formatCx(z, 6)}`),
        ),
      ),
    ),
  );

  if (r.runs) {
    rows.push(
      h("p", { key: "flowerHead", class: "legend" }, FAMILY.flower),
      h(
        "ul",
        { key: "flower", class: "flower", "aria-label": FAMILY.flowerLabel },
        ...r.runs.map((run, k) => {
          const c = monodromyCert(run);
          return h(
            "li",
            { key: `l${k}` },
            level(c, "lv"),
            `γ${subscript(k + 1)}: `,
            run.ok
              ? `σ = ${formatCycles(run.labelPerm)}`
              : `no permutation — ${run.reason}.`,
          );
        }),
      ),
    );
  }
  rows.push(bridge(r, m.special, f.degree));
  rows.push(
    h(
      "div",
      { key: "tools", class: "toolbar" },
      h(
        "button",
        { key: "spec", type: "button", onclick: on.onSpecialise },
        FAMILY.specialise(r.baseText),
      ),
      h("button", { key: "leave", type: "button", onclick: on.onLeave }, FAMILY.leave),
    ),
  );
  return card(...rows);
}

function card(...body: Child[]): Desc {
  return h(
    "section",
    { key: "family", class: "card", "aria-labelledby": "card-family" },
    h("h2", { key: "t", id: "card-family" }, FAMILY.heading),
    ...body,
  );
}
