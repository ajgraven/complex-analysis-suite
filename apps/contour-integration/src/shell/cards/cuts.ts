// The Branch-cuts card — the declared cut system, and the factorisation it belongs to.
//
// M8 step 1.4b, ported structurally from the old shell's `renderBranchCard` + `renderDeclaration`.
// **Its prose is left as it is**: Phase 2 rewrites the sentences, and rewriting them here would put
// two wording passes in flight over the same paragraphs. What changes is the mechanics — every
// control is KEYED, so a `<select>` survives its own `change` and the sheet spinner keeps its caret.
//
// The card spans both modes on purpose. Under a record the cuts are the record's and cannot be
// edited, but the modulus-contour toggle is the device that answers the seam, and it is the same
// device over the reader's own expression in the sandbox.
import { Frac } from "@cas/exact";

import {
  INFINITY,
  type BranchChoice,
} from "../../kernel/branch/model.js";
import { checkAdmissibility } from "../../kernel/branch/admissibility.js";
import { allCrossingMonodromy } from "../../kernel/branch/monodromy.js";
import { formatFrac } from "../../kernel/formatExact.js";
import {
  OFFERED_ORDERS,
  addBranchPoint,
  joinToOneCut,
  orderLabel,
  removeBranchPoint,
  setCutFromWindow,
  setOrder,
  setShadow,
  setSheet,
  splitToRays,
} from "../../engine/branchEdit.js";
import { declaredOrder } from "../../shell/state.js";
import { effectiveBranch } from "../../kernel/branch/model.js";
import { h, type Child } from "../dom.js";
import { mathText } from "../math.js";
import { card, type Card } from "./card.js";

/** The two windows the sandbox offers. Both appear in the tier-D gallery. */
const WINDOWS: readonly { readonly label: string; readonly value: readonly [Frac, Frac] }[] = [
  { label: "arg ∈ [0, 2π)", value: [Frac.ZERO, Frac.of(2n)] },
  { label: "arg ∈ [−π, π)", value: [Frac.of(-1n), Frac.ONE] },
];

/** `=` / `≤` / `≈` / `⚠` as the square stamp `theme.css` draws. */
const badge = (level: string): Child => h("span", { key: "b", class: "badge", "data-level": level }, level);

/**
 * What crossing each cut would cost — research 06 §3.2's factor, in front of the reader BEFORE they
 * drag into a refusal rather than inside it.
 *
 * The refusal names it too (`engine/ledger.ts`), but a reader who only meets it there meets it as a
 * punishment. Here it is the number that makes the drag legible.
 */
function monodromy(branch: BranchChoice): Child {
  const all = allCrossingMonodromy(branch);
  if (all.length === 0) return null;
  return h(
    "div",
    { key: "mono" },
    h("h3", { key: "h", class: "small muted" }, "Crossing a cut"),
    h(
      "ul",
      { key: "l", class: "pieces2" },
      // **`detail`, not `literal` + `reduced` re-assembled.** Those two are bare LaTeX fragments,
      // and the old shell prints them as TEXT — so its card shows `× e^{2\pi i \cdot \frac{1}{2}}`
      // on screen, backslashes and all. `detail` is the same content as one `$…$` sentence, already
      // in step 0.5b's convention and already carrying BOTH of §3.4's forms and the reason they
      // agree; re-assembling it here would be a second wording of a sentence the kernel writes.
      ...all.map((m, i) => h("li", { key: `m${i}` }, ...mathText(m.detail, `mo${i}`))),
    ),
  );
}

export const cutsCard: Card = ({ state, resolution, actions }) => {
  const branch = state.branch;
  const shown = effectiveBranch(branch);
  const declaredProduct =
    resolution.kind === "gallery"
      ? (resolution.run?.declared?.product ?? null)
      : resolution.kind === "declared"
        ? resolution.declared
        : null;
  const isoOn = state.iso ?? declaredProduct !== null;

  const head: Child[] = [
    h(
      "div",
      { key: "iso", class: "btnRow" },
      h(
        "button",
        {
          key: "b",
          class: "segmented",
          "aria-pressed": String(isoOn),
          onClick: () => actions.setIso(!isoOn),
        },
        "modulus contours",
      ),
    ),
    // **The claim is not the same in the two cases, so the sentence is not either.** For a power
    // product `|f|` is single-valued and a level curve crosses the seam without noticing it; for a
    // `log^m` the monodromy is ADDITIVE and the contours break at the cut.
    isoOn
      ? h(
          "p",
          { key: "isoNote", class: "muted small" },
          (declaredProduct?.factors ?? []).some((f) => f.kind === "log")
            ? "|f| carries a log, so it is NOT single-valued: crossing the cut adds 2πi and the modulus jumps with it. These contours break at the cut, and no choice of argument window can make them meet."
            : "|f| does not depend on the determination, so these contours run straight through any cut — which is the clearest evidence that a seam in the colour is a choice about the argument and not something the function does.",
        )
      : null,
    monodromy(shown),
  ];

  if (state.mode !== "sandbox") {
    const family = resolution.kind === "gallery" ? resolution.family : null;
    return card(
      "cuts",
      ...head,
      h("p", { key: "ro", class: "muted small" }, "A record's cuts are the record's. Switch to the sandbox to draw one."),
      family?.branch === undefined
        ? null
        : h(
            "p",
            { key: "sheet", class: "muted small" },
            declaredProduct === null
              ? "the colouring behind the contour is drawn in the principal branch of each factor; this record's determination is declared but not on the stage."
              : "the colouring behind the contour is drawn in the determination this record DECLARES — each factor in its own argument window — so the picture and the ledger are on the same sheet.",
          ),
    );
  }

  // ── the sandbox's editor ──────────────────────────────────────────────────────────────────
  const bounded = branch.cuts.find((c) => c.from !== INFINITY && c.to !== INFINITY);
  const tools: Child[] = [
    h(
      "button",
      {
        key: "shadow",
        class: "segmented",
        "aria-pressed": String(branch.shadow === true),
        onClick: () => actions.setBranch(setShadow(branch, branch.shadow !== true)),
      },
      "shadow cuts",
    ),
    h(
      "button",
      {
        key: "add",
        onClick: () =>
          // Placed at the middle of the view rather than at the origin, so a second point does not
          // land on the first and a point never appears off screen.
          actions.setBranch(
            addBranchPoint(
              branch,
              branch.points.length === 0 ? [0, 0] : [state.view.center[0] + 1, state.view.center[1]],
            ),
          ),
      },
      "+ branch point",
    ),
    // **Not in shadow mode**, and review is why: those buttons read `branch.cuts` — the declaration
    // — which shadow mode ignores, so they edited something invisible and changed nothing on screen.
    branch.shadow === true
      ? null
      : branch.points.length === 2 && bounded === undefined
        ? h(
            "button",
            {
              key: "join",
              onClick: () => {
                const next = joinToOneCut(branch, branch.points[0].id, branch.points[1].id);
                if (next !== null) actions.setBranch(next);
              },
            },
            "join into one cut",
          )
        : bounded === undefined
          ? null
          : h(
              "button",
              {
                key: "split",
                onClick: () => {
                  const next = splitToRays(branch, bounded.id);
                  if (next !== null) actions.setBranch(next);
                },
              },
              "split into two rays",
            ),
  ];

  const body: Child[] = [
    ...head,
    h("div", { key: "tools", class: "btnRow" }, ...tools),
    branch.shadow === true
      ? h(
          "p",
          { key: "shadowNote", class: "muted small" },
          "the cuts are the rays pointing away from z₀ — drag the base point to swing them. A branch point sitting on z₀ casts no shadow, so move one clear of the other. Every shadow reaches infinity, so a bounded arc — the dogbone — cannot be one: switch this off to build it.",
        )
      : null,
    // **THE SANDBOX'S CUT AND THE SANDBOX'S COLOURING ARE DIFFERENT OBJECTS**, and a reader can see
    // both at once, so the app has to say it.
    branch.points.length === 0
      ? null
      : h(
          "p",
          { key: "seam", class: "muted small" },
          state.declaration === null
            ? "the colouring is the principal branch of the expression above; the cut is your declaration, and the two need not coincide. Moving the cut changes the verdict, not the seam."
            : "the colouring is built from the factorisation you declared, each factor in its own window — so the seam IS your cut, as it is under a gallery record. Moving the cut still changes the verdict and not the seam, because ∮ reads the window and never the geometry.",
        ),
  ];

  if (branch.points.length === 0) {
    return card(
      "cuts",
      ...body,
      h("p", { key: "none", class: "muted small" }, "No branch points declared, so the integrand is treated as single-valued."),
    );
  }

  // ── the declared factorisation ────────────────────────────────────────────────────────────
  const order = declaredOrder(state);
  const decl: Child[] = [];
  if (state.declaration === null || order === null) {
    decl.push(
      h(
        "p",
        { key: "why", class: "muted small" },
        "The integrand above is taken whole, in the principal branch of every sub-expression — so " +
          "its residues are not decidable and there is no ∮. Declare a factorisation to get one: " +
          "the box then holds R(z) and the factor is read in its own window.",
      ),
      h(
        "div",
        { key: "declare", class: "btnRow" },
        ...shown.points.map((point) =>
          h(
            "button",
            { key: `d:${point.id}`, onClick: () => actions.declare(point.id) },
            `declare a factor on ${point.label}`,
          ),
        ),
      ),
    );
  } else {
    const d = state.declaration;
    decl.push(
      h("h3", { key: "dh", class: "small" }, "Declared factor"),
      h(
        "div",
        { key: "win", class: "pickRow" },
        h("span", { key: "l", class: "muted small" }, "window"),
        h(
          "select",
          {
            key: "s",
            "aria-label": "argument window of the declared factor",
            value: WINDOWS.find((w) => d.window[0].equals(w.value[0]))?.label ?? WINDOWS[0].label,
            onChange: (e: Event) => {
              const chosen = WINDOWS.find((w) => w.label === (e.target as HTMLSelectElement).value);
              if (chosen === undefined) return;
              // **Declaring the determination IS declaring the cut**, so the cut is rebuilt from the
              // new window rather than left where it was — otherwise the two would disagree about
              // where the discontinuity is, silently. `setCutFromWindow` rebuilds the GEOMETRY on
              // the point the declaration names and nothing else (M6.1a's bug).
              const nextCut = setCutFromWindow(branch, d.pointId, chosen.value, order);
              actions.setDeclaration({ ...d, window: chosen.value }, nextCut ?? undefined);
            },
          },
          ...WINDOWS.map((w) => h("option", { key: w.label, value: w.label }, w.label)),
        ),
      ),
      order.kind === "power"
        ? h(
            "div",
            { key: "orient", class: "pickRow" },
            h("span", { key: "l", class: "muted small" }, "written"),
            h(
              "button",
              {
                key: "b",
                "aria-label": "orientation of the declared factor",
                onClick: () => actions.setDeclaration({ ...d, sign: d.sign === 1 ? -1 : 1 }),
              },
              d.sign === 1 ? "(z − b)" : "(b − z)",
            ),
          )
        : h(
            "label",
            { key: "logm", class: "pickRow" },
            h("span", { key: "l", class: "muted small" }, "log^m, m ="),
            h("input", {
              key: "i",
              type: "number",
              min: "1",
              step: "1",
              class: "mono",
              value: String(d.logPower),
              "aria-label": "power m of log^m",
              onChange: (e: Event) => {
                const v = Math.round(Number((e.target as HTMLInputElement).value));
                if (Number.isFinite(v)) actions.setDeclaration({ ...d, logPower: Math.max(1, v) });
              },
            }),
          ),
      // ---- the sheet spinner (research 06 §5.3) ----
      // A sheet is a whole-turn offset of the declared window, so the spinner moves the ANSWER and
      // leaves the cut exactly where it is; the note names the factor so that is visible.
      h(
        "label",
        { key: "sheet", class: "pickRow" },
        h("span", { key: "l", class: "muted small" }, "sheet"),
        h("input", {
          key: "i",
          type: "number",
          step: "1",
          class: "mono",
          value: String(shown.sheet),
          "aria-label": "sheet the answer is reported on",
          onChange: (e: Event) => {
            const v = Number((e.target as HTMLInputElement).value);
            if (Number.isFinite(v)) actions.setBranch(setSheet(branch, v));
          },
        }),
        h(
          "span",
          { key: "n", class: "muted small" },
          shown.sheet === 0
            ? "sheet 0 — the determination as declared"
            : order.kind === "power"
              ? `× e^(2πi·${formatFrac(order.alpha.mul(Frac.of(BigInt(shown.sheet))))}), and the cut does not move`
              : `log + ${shown.sheet === 1 ? "" : `${shown.sheet}·`}2πi — a log's monodromy is ADDITIVE, so no factor closes it`,
        ),
      ),
      h(
        "div",
        { key: "undo", class: "btnRow" },
        h(
          "button",
          {
            key: "b",
            "aria-label": "undeclare the factor and put the whole integrand back in the box",
            onClick: () => actions.undeclare(),
          },
          "undeclare",
        ),
        h("span", { key: "n", class: "muted small" }, "puts the whole integrand back in the box."),
      ),
      // ---- is the split the integrand it claims to be? ----
      resolution.kind === "declared-refused"
        ? h("p", { key: "bad", class: "verdict" }, badge("⚠"), ` ${resolution.reason}`)
        : null,
      resolution.kind === "declared" && resolution.split !== null
        ? h(
            "p",
            { key: "split", class: "verdict" },
            badge(resolution.split.ok ? "≤" : "⚠"),
            ` ${resolution.split.detail}`,
          )
        : null,
    );
  }

  const report = checkAdmissibility(branch);
  return card(
    "cuts",
    ...body,
    h("div", { key: "decl", class: "declaration" }, ...decl),
    h("p", { key: "verdict", class: "verdict" }, badge(report.certificate.level), ` ${report.detail}`),
    report.ok || report.repair === undefined
      ? null
      : h("p", { key: "repair", class: "muted small" }, report.repair),
    h(
      "ul",
      { key: "points", class: "pieces2" },
      ...branch.points.map((point) =>
        h(
          "li",
          { key: `b:${point.id}` },
          h("span", { key: "n", class: "pieceName" }, point.label),
          h(
            "select",
            {
              key: "o",
              "aria-label": `order of branch point ${point.id}`,
              value: OFFERED_ORDERS.find((o) => orderLabel(o.order) === orderLabel(point.order))?.label ?? "",
              onChange: (e: Event) => {
                const chosen = OFFERED_ORDERS.find((o) => o.label === (e.target as HTMLSelectElement).value);
                if (chosen !== undefined) actions.setBranch(setOrder(branch, point.id, chosen.order));
              },
            },
            ...OFFERED_ORDERS.map((o) => h("option", { key: o.label, value: o.label }, o.label)),
          ),
          h(
            "button",
            {
              key: "x",
              "aria-label": `remove branch point ${point.id}`,
              onClick: () => actions.setBranch(removeBranchPoint(branch, point.id)),
            },
            "remove",
          ),
        ),
      ),
    ),
  );
};
