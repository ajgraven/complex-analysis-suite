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
import { isoShown } from "../../ui/stage/mode.js";
import { h, type Child } from "@cas/ui";
import { drawnBranch } from "../stageView.js";
import { mathSpoken, mathText } from "../math.js";
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
  // The DEFAULT is the stage's, through one predicate — see `ui/stage/mode.ts`'s `isoShown`. This
  // line and `stageView`'s `iso === true` were two readers of the same tri-state, which is why the
  // control read pressed on every branch record while the stage drew nothing and the first click
  // only un-pressed it.
  const isoOn = isoShown(state.iso, declaredProduct !== null);

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
    // `log^m` the monodromy is additive and the contours break at the cut.
    isoOn
      ? h(
          "p",
          { key: "isoNote", class: "muted small" },
          ...mathText(
            (declaredProduct?.factors ?? []).some((f) => f.kind === "log")
              ? "Crossing the cut adds $2\\pi i$ to $\\log f$, so $|f|$ jumps with it and these contours break at the cut."
              : "$|f|$ does not depend on the determination, so these contours run through any cut.",
            "iso",
          ),
        )
      : null,
    // **The system the STAGE draws, not the sandbox's.** Under a record `state.branch` is the reader's
    // parked sandbox system (its own doc says so), and reading it here left the "Crossing a cut"
    // block absent for every tier-D record at the 2026-09-20 review — the same defect as the stage's,
    // through the same field. `drawnBranch` is the one decision, shared with `stageView`.
    monodromy(effectiveBranch(drawnBranch(state, resolution))),
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
            ...mathText(
              declaredProduct === null
                ? "The colouring is the principal branch of each factor; the declared determination is not on the stage."
                : "The colouring is drawn in the declared determination, each factor in its own argument window, so the picture and the checks are on the same sheet.",
              "sheetNote",
            ),
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
      // **Unicode, not `$z_0$`, and the reason is a measurement.** This button wears `.segmented`,
      // which is `display: flex` — so its text is an anonymous flex item, and a flex container
      // trims the whitespace at the edges of one. The space before the formula disappeared and the
      // label read `Cuts as rays fromz₀`. A picker label and a button label are the two places in
      // this app where a formula is set in Unicode rather than typeset.
      "Cuts as rays from z₀",
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
            "Join into one cut",
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
              "Split into rays",
            ),
  ];

  const body: Child[] = [
    ...head,
    h("div", { key: "tools", class: "btnRow" }, ...tools),
    branch.shadow === true
      ? h(
          "p",
          { key: "shadowNote", class: "muted small" },
          ...mathText(
            // The middle sentence is not in the plan's replacement and is kept deliberately: the
            // sandbox's own default put a branch point on $z_0$, where the mode refuses on the
            // first click, correctly and uselessly, with nothing on screen to say why.
            "Cuts are the rays from $z_0$; drag $z_0$ to move them. A branch point at $z_0$ casts no " +
              "ray, so move one clear of the other. A bounded cut (dogbone) cannot be drawn in this mode; " +
              "switch it off to build one.",
            "shadowNote",
          ),
        )
      : null,
    // **THE SANDBOX'S CUT AND THE SANDBOX'S COLOURING ARE DIFFERENT OBJECTS**, and a reader can see
    // both at once, so the app has to say it.
    branch.points.length === 0
      ? null
      : h(
          "p",
          { key: "seam", class: "muted small" },
          ...mathText(
            // **Two cases, because the two objects on screen are not the same object.** A declared
            // cut drawn beside a principal-branch colour seam is the one thing this note exists to
            // separate; both cases close on the same invariance clause.
            state.declaration === null
              ? "The colouring is the principal branch of the expression above; the cut is your declaration, " +
                  "and the two need not coincide. The cut is where the declared argument jumps; " +
                  "$\\oint_\\gamma f\\,dz$ does not depend on where the cut lies while it avoids $\\gamma$."
              : "The colouring is built from the factorisation you declared, each factor in its own window, " +
                  "so the seam is your cut. The cut is where the declared argument jumps; " +
                  "$\\oint_\\gamma f\\,dz$ does not depend on where the cut lies while it avoids $\\gamma$.",
            "seam",
          ),
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
        ...mathText(
          "To integrate a multivalued integrand, declare its branch factor: " +
            "$f(z) = z^{\\alpha}\\,R(z)$ with a chosen argument window. The box then holds $R(z)$.",
          "why",
        ),
      ),
      h(
        "div",
        { key: "declare", class: "btnRow" },
        ...shown.points.map((point) =>
          h(
            "button",
            { key: `d:${point.id}`, onClick: () => actions.declare(point.id) },
            ...mathText(`Declare branch factor at $${point.label}$`, `dl:${point.id}`),
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
        h("span", { key: "l", class: "muted small" }, "Argument window"),
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
            h("span", { key: "l", class: "muted small" }, "Factor form"),
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
            h("span", { key: "l", class: "muted small" }, ...mathText("$\\log^m$, $m =$", "logm")),
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
        h("span", { key: "l", class: "muted small" }, "Sheet"),
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
          ...mathText(
            shown.sheet === 0
              ? "Sheet 0: the determination as declared."
              : order.kind === "power"
                ? `$\\times e^{2\\pi i \\cdot ${formatFrac(order.alpha.mul(Frac.of(BigInt(shown.sheet))))}}$, and the cut does not move.`
                : `$\\log + ${shown.sheet === 1 ? "" : `${shown.sheet}\\cdot`}2\\pi i$: a log's monodromy is additive, so no factor closes it.`,
            `sheetN${shown.sheet}`,
          ),
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
          "Remove branch factor",
        ),
        h("span", { key: "n", class: "muted small" }, "puts the whole integrand back in the box."),
      ),
      // ---- is the split the integrand it claims to be? ----
      // **Through `mathText`, like every other engine sentence**, and step 2.1's browser pass is
      // why: `splitCheck`'s refusal names $R(z)$, and printed as text it put two dollar signs on
      // screen. A verdict is a sentence in the `$…$` convention wherever it is composed.
      resolution.kind === "declared-refused"
        ? h("p", { key: "bad", class: "verdict" }, badge("⚠"), " ", ...mathText(resolution.reason, "bad"))
        : null,
      resolution.kind === "declared" && resolution.split !== null
        ? h(
            "p",
            { key: "split", class: "verdict" },
            badge(resolution.split.ok ? "≤" : "⚠"),
            " ",
            ...mathText(resolution.split.detail, "split"),
          )
        : null,
    );
  }

  const report = checkAdmissibility(branch);
  return card(
    "cuts",
    ...body,
    h("div", { key: "decl", class: "declaration" }, ...decl),
    h("p", { key: "verdict", class: "verdict" }, badge(report.certificate.level), " ", ...mathText(report.detail, "adm")),
    report.ok || report.repair === undefined
      ? null
      : h("p", { key: "repair", class: "muted small" }, ...mathText(report.repair, "admfix")),
    h(
      "ul",
      { key: "points", class: "pieces2" },
      ...branch.points.map((point) =>
        h(
          "li",
          { key: `b:${point.id}` },
          h("span", { key: "n", class: "pieceName" }, ...mathText(`$${point.label}$`, `pl:${point.id}`)),
          h(
            "select",
            {
              key: "o",
              // **The point's LABEL, spoken — not its id.** Measured on the sandbox keyhole, these
              // two read *order of branch point b1* and *remove branch point b1*: `b1` is the
              // program's filing name for the point, the one M6.1's `SINGLE_POINT_ID` bug was
              // about, and the row typesets the reader's name for it two lines above.
              "aria-label": `order of branch point ${mathSpoken(`$${point.label}$`)}`,
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
              "aria-label": `remove branch point ${mathSpoken(`$${point.label}$`)}`,
              onClick: () => actions.setBranch(removeBranchPoint(branch, point.id)),
            },
            "remove",
          ),
        ),
      ),
    ),
  );
};
