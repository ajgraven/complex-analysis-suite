// The Monodromy card (PLAN §5.1, §5.2 rules 4–6): loops in the selected coefficient's plane — authored
// as words from lassos, inverses and commutators, or drawn — their certified permutations, the group
// the lassos generate, and a button that plays a permutation on the roots themselves.
import { formatCycles, isIdentity, type Perm } from "@cas/monodromy";
import type { Certificate } from "@cas/rigor";
import { h, type Child, type Desc } from "@cas/ui";
import type { Loop, LoopContext } from "../engine/loops/loop.js";
import { loopName } from "../engine/loops/loop.js";
import type { LoopRun } from "../engine/loops/run.js";
import { monodromyCert } from "../engine/certify.js";
import { CARD, MONODROMY } from "../engine/vocabulary.js";
import { subscript } from "../ui/ink.js";
import { formatCx } from "./format.js";
import { level } from "./level.js";
import { canCommute, nodes } from "./loopEdit.js";

export interface MonodromyModel {
  readonly context: LoopContext | null;
  readonly loop: Loop | null;
  readonly run: LoopRun | null;
  /** Append each new lasso to the word rather than replacing it. */
  readonly building: boolean;
  /** Vertices placed so far with the pen, or null when the pen is away. */
  readonly pen: number | null;
  /** The group of every lasso, once asked for. */
  readonly group: { readonly cert: Certificate; readonly order: number | null } | null;
  /** The last motion played, if any. */
  readonly motion: { readonly fallback: boolean; readonly lenses: number } | null;
}

export interface MonodromyHandlers {
  readonly onLasso: (k: number) => void;
  readonly onBuild: (on: boolean) => void;
  readonly onInvert: () => void;
  readonly onCommute: () => void;
  readonly onPen: () => void;
  readonly onClear: () => void;
  readonly onRunNode: (l: Loop) => void;
  readonly onPlay: () => void;
  readonly onGroup: () => void;
}

/** σ in the roots' LABELS, 1-based: `σ = (1 3)(2 5)`. */
export function sigmaText(p: Perm): string {
  return `σ = ${formatCycles(p)}`;
}

function card(...body: Child[]): Desc {
  return h(
    "section",
    { key: "monodromy", class: "card", "aria-labelledby": "card-monodromy" },
    h("h2", { key: "t", id: "card-monodromy" }, CARD.monodromy),
    ...body,
  );
}

export function monodromyCard(m: MonodromyModel, on: MonodromyHandlers): Desc {
  const ctx = m.context;
  if (!ctx) return card(h("p", { key: "none", class: "legend" }, MONODROMY.none));
  const j = ctx.coefficient;
  if (ctx.branchPoints.length === 0)
    return card(h("p", { key: "none", class: "legend" }, MONODROMY.noPoints(j)));

  const chips = h(
    "ul",
    {
      key: "chips",
      class: "lasso-chips",
      "aria-label": `Loops round the branch points of a${j}`,
    },
    ...ctx.branchPoints.map((b, k) =>
      h(
        "li",
        { key: `c${k}` },
        h(
          "button",
          {
            key: "b",
            type: "button",
            class: "chip",
            "aria-label": `Loop round branch point ${k + 1}, at a${j} ≈ ${formatCx(b, 6)}`,
            onclick: () => on.onLasso(k),
          },
          `γ${subscript(k + 1)}`,
        ),
      ),
    ),
  );

  const tools = h(
    "div",
    { key: "tools", class: "toolbar" },
    h(
      "label",
      { key: "build", class: "check" },
      h("input", {
        key: "i",
        type: "checkbox",
        checked: m.building,
        onchange: (e: Event) => on.onBuild((e.target as HTMLInputElement).checked),
      }),
      ` ${MONODROMY.build}`,
    ),
    h(
      "button",
      { key: "inv", type: "button", disabled: !m.loop, onclick: on.onInvert },
      "Invert",
    ),
    h(
      "button",
      {
        key: "com",
        type: "button",
        disabled: !canCommute(m.loop),
        onclick: on.onCommute,
      },
      "Commutator of the last two",
    ),
    h(
      "button",
      {
        key: "pen",
        type: "button",
        "aria-pressed": m.pen !== null ? "true" : "false",
        onclick: on.onPen,
      },
      m.pen === null ? "Draw a loop" : `Finish the drawn loop (${m.pen} points)`,
    ),
    h(
      "button",
      { key: "clr", type: "button", disabled: !m.loop, onclick: on.onClear },
      "Clear",
    ),
  );

  const rows: Child[] = [
    h("p", { key: "what", class: "legend" }, MONODROMY.what),
    chips,
    tools,
  ];

  if (m.loop) {
    rows.push(
      h(
        "ol",
        { key: "tree", class: "word-tree", "aria-label": "The loop, part by part" },
        ...nodes(m.loop).map((n, i) =>
          h(
            "li",
            { key: `n${i}`, style: `margin-left:${n.depth}em` },
            h(
              "button",
              {
                key: "b",
                type: "button",
                class: "node",
                "aria-label": `Run just ${loopName(n.loop)}`,
                onclick: () => on.onRunNode(n.loop),
              },
              loopName(n.loop),
            ),
          ),
        ),
      ),
    );
  }

  if (m.run) {
    const cert = monodromyCert(m.run);
    rows.push(
      h(
        "p",
        { key: "sigma", class: "claim" },
        level(cert, "lv"),
        m.run.ok ? sigmaText(m.run.labelPerm) : `no permutation: ${m.run.reason}.`,
      ),
    );
    if (m.run.ok) rows.push(h("p", { key: "how", class: "legend" }, cert.method));
    rows.push(
      h(
        "button",
        {
          key: "play",
          type: "button",
          disabled: !m.run.ok || isIdentity(m.run.labelPerm),
          onclick: on.onPlay,
        },
        "Play σ on the roots",
      ),
    );
    if (m.motion)
      rows.push(
        h(
          "p",
          { key: "motion", class: "legend" },
          m.motion.fallback
            ? `${MONODROMY.motion} Moving them all at once came too close, so it runs as ${m.motion.lenses} swaps in turn.`
            : MONODROMY.motion,
        ),
      );
  }

  rows.push(
    h("button", { key: "grp", type: "button", onclick: on.onGroup }, MONODROMY.group(j)),
  );
  if (m.group) {
    const c = m.group.cert;
    rows.push(
      h(
        "p",
        { key: "group", class: "claim" },
        level(c, "lv"),
        c.level === "⚠"
          ? `no group: ${c.method}.`
          : `${c.claim}${m.group.order ? `, order ${m.group.order}` : ""}.`,
      ),
    );
  }
  return card(...rows);
}
