// The Derivation card — the argument in order, one disclosure per stage.
//
// M8 step 1.5b, plan's Phase 1 form (the stepper is Phase 3). **Nothing here composes a claim.**
// `engine/derivation.ts` reads the ledger's rows and their certificates and hands back stages; this
// file turns that structure into descriptions. That separation is the whole defence against PLAN
// §9's R2, *certification theatre*: a renderer that minted its own labels could choose them, and
// `@cas/rigor`'s branding exists to make exactly that impossible — so every badge below comes from a
// `Level` the engine already computed, and the only literal glyph is the `⚠` that REPLACES a level
// on a row whose status is `failed`.
//
// What the old shell did and this does not: it wrapped the whole derivation in ONE `<details>` and
// laid the stages out as flat `<div>`s, so a reader hunting the step that failed scrolled past every
// step that did not. Here each stage is its own disclosure, **the failing one opens itself**, and an
// explicit click wins and survives every recompute — `session.open[id]` is tri-state for that reason
// (`undefined` is "never touched", which is not "closed").
//
// One thing the old shell said that this does not: its header printed `derivation.failedAt` raw, so
// a reader met `KILL` — a DATA KEY — where `vocabulary.ts` §0.2 is emphatic that ids are never
// labels. It goes through `constraintLabel`, which is the same word the Result card's own row
// carries, so the two cannot come to disagree about what the group is called.
import {
  buildDerivation,
  type Derivation,
  type DerivationLine,
  type DerivationStage,
  type PoleRow,
  type Statement,
} from "../../engine/derivation.js";
import { constraintLabel } from "../../engine/vocabulary.js";
import { contourIntegrandLatex, targetLatex } from "../../families/latex.js";
import { relationText } from "../../families/describe.js";
import { fmt, fmtCx } from "../../kernel/decimal.js";
import type { Piece } from "../../engine/contour/model.js";
import { h, type Child, type Desc } from "../dom.js";
import { mathText } from "../math.js";
import { card, nothing, type Card, type CardContext } from "./card.js";

/** `=` / `≤` / `≈` / `⚠` as the square stamp `theme.css` draws. The Result card's own helper. */
const badge = (level: string, key = "b"): Desc =>
  h("span", { key, class: "badge", "data-level": level }, level);

/**
 * A disclosure whose default is a COMPUTED fact and whose explicit state is the reader's.
 *
 * `session.open[id]` is tri-state on purpose: `undefined` is "never touched", which is what lets the
 * failing stage open itself the moment a row fails and STAY closed afterwards if the reader has shut
 * it. A boolean with a false default cannot express that, and one with a true default would re-open
 * on every recompute — and a derivation recomputes on every frame of a contour drag, so the second
 * failure mode is a panel that will not stay shut while the reader is dragging.
 */
function disclosure(
  ctx: CardContext,
  id: string,
  byDefault: boolean,
  summary: Child,
  ...body: Child[]
): Desc {
  const open = ctx.session.open[id] ?? byDefault;
  return h(
    "details",
    {
      key: `d:${id}`,
      open,
      onToggle: (e: Event) => {
        const el = e.target as HTMLDetailsElement;
        if (el.open !== (ctx.session.open[id] ?? byDefault)) ctx.actions.setOpen(id, el.open);
      },
    },
    h("summary", { key: "s" }, summary),
    ...body,
  );
}

/** Everything the card reads, gathered once — a record's from its run, the sandbox's from `analyse`. */
interface Facts {
  readonly derivation: Derivation | null;
  /** Why there is nothing, when there is nothing. Never a blank and never a number. */
  readonly why: string;
}

/**
 * The problem as the CALLER can state it — which is a different sentence in each mode.
 *
 * A record knows its unknowns, the expression actually integrated and (where it has an auxiliary)
 * how the two are related; the sandbox knows the box and the pieces and nothing else. Both arrive as
 * `$…$` sentences, because every other formula in the rail is typeset and a Unicode one beside them
 * is the inconsistency step 0.5b removed — so the record's two go through `families/latex.ts` rather
 * than through `describe.ts`'s text forms, which the OLD shell used because it had no typesetter in
 * this path.
 */
function problemStatements(ctx: CardContext, pieces: readonly Piece[]): Statement[] {
  const { state, resolution } = ctx;
  if (resolution.kind === "gallery") {
    const { family, golden } = resolution;
    const out: Statement[] = family.targets.map((t) => ({
      label: "target",
      text: `$${targetLatex(t, { at: golden.params })}$`,
    }));
    out.push({
      label: "contour integrand",
      text: `$${contourIntegrandLatex(family, { at: golden.params })}$`,
    });
    if (family.auxiliary !== undefined) out.push({ label: "relation", text: relationText(family) });
    return out;
  }
  // **With a factor declared the box does not hold the integrand**, it holds `R(z)` — the box
  // changed meaning when the factor was declared (`state.ts`'s declared route) — so calling it "the
  // integrand" here would name the whole function and print a part of it.
  return [
    { label: state.declaration === null ? "integrand" : "cofactor", text: state.expr },
    { label: "contour", text: pieces.map((p) => p.name).join(", ") },
  ];
}

function factsOf(ctx: CardContext): Facts {
  const { state, resolution } = ctx;
  // The SPEC is the piece list the derivation attributes its lines to. A record's comes from the run
  // (a family parameter rebuilds the contour as well as the integrand, so the state's copy can be a
  // step behind); the sandbox's is the state's, which is the only one there is.
  if (resolution.kind === "gallery") {
    const run = resolution.run;
    if (run === null) return { derivation: null, why: resolution.fatal ?? "This record could not be run." };
    return {
      derivation: buildDerivation({
        ledger: run.ledger,
        poles: run.poles,
        integral: run.integral,
        theorem: run.theorem,
        spec: run.contour.pieces,
        statements: problemStatements(ctx, run.contour.pieces),
        ...(resolution.solved === null ? {} : { solved: resolution.solved }),
      }),
      why: "",
    };
  }
  if (resolution.kind === "plain" || resolution.kind === "declared") {
    // The poles are the CONTEXT's, for the stage's own reason (step 1.3): `Analysis` carries the
    // ledger and not the pole report, so `resolveState` cannot hand one back.
    if (ctx.poles === null) return { derivation: null, why: "The integrand could not be read." };
    const a = resolution.analysis;
    return {
      derivation: buildDerivation({
        ledger: a.ledger,
        poles: ctx.poles,
        integral: a.integral,
        theorem: a.theorem,
        spec: state.contour.pieces,
        statements: problemStatements(ctx, state.contour.pieces),
      }),
      why: "",
    };
  }
  return {
    derivation: null,
    why:
      resolution.kind === "declared-refused"
        ? resolution.reason
        : (resolution.reason ?? "There is no integrand."),
  };
}

/** One `Step` of an audit trail: the mark comes from `ok`, never from the sentence. */
function stepLine(step: { readonly ok: boolean; readonly text: string }, key: string): Desc {
  return h(
    "p",
    // A ✗ step is the diagnostic, so it is coloured as one rather than left to be spotted among the
    // ticks — three glyphs down a list is not a scannable difference (`.ledger2 > li.failed`'s
    // reason, applied to the trail).
    { key, class: step.ok ? "muted small" : "restriction small" },
    step.ok ? "✓ " : "✗ ",
    ...mathText(step.text, `${key}x`),
  );
}

function lineItem(ctx: CardContext, stage: DerivationStage, line: DerivationLine, i: number): Desc {
  const { session, actions } = ctx;
  // Read out of the line ONCE: a narrowing on `line.pieceId` does not survive into the closures
  // below, and `hover(undefined)` is not `hover(null)` — one clears the highlight, the other is a
  // type error waiting to be silenced.
  const pieceId = line.pieceId;
  const provId = `derivation:${stage.id}:prov:${i}`;
  const failedSteps = line.provenance.filter((s) => !s.ok).length;

  const body: Child[] = [
    h("p", { key: "m", class: "muted small" }, ...mathText(line.method, `lm${i}`)),
    // **A restricted claim that loses its restriction is not a vaguer claim, it is a false one**
    // (`@cas/rigor`'s own words), so this is never behind a disclosure.
    line.restriction === undefined
      ? null
      : h("p", { key: "rs", class: "restriction small" }, ...mathText(line.restriction, `lr${i}`)),
    line.repair === undefined
      ? null
      : h("p", { key: "rp", class: "repair small" }, ...mathText(line.repair, `lf${i}`)),
  ];

  if (line.provenance.length > 0) {
    body.push(
      disclosure(
        ctx,
        provId,
        // **Open when this line's own trail contains the failure.** A satisfied line's trail is an
        // audit — worth having, not worth reading first; a failed line's ✗ step is the answer to the
        // question the reader is asking, and folding it away is the old shell's one good instinct
        // here (it never folded a failed step) expressed as a computed default rather than as a
        // second code path.
        line.status === "failed" && failedSteps > 0,
        failedSteps > 0
          ? `audit trail — ${line.provenance.length} steps, ${failedSteps} failed`
          : `audit trail — ${line.provenance.length} step${line.provenance.length === 1 ? "" : "s"}`,
        ...line.provenance.map((s, k) => stepLine(s, `pv${k}`)),
      ),
    );
  }

  return h(
    "li",
    {
      key: `ln:${i}`,
      // The rail end of the three-surface highlight (`pieces2 > li.hot`): the piece list, the stage
      // and this line all key it on `Piece.id`. Matching by NAME would break the first time two
      // pieces were named alike — a keyhole's two lips are.
      class: pieceId !== undefined && session.hover.piece === pieceId ? "hot" : undefined,
      ...(pieceId === undefined
        ? {}
        : {
            onPointerenter: () => actions.hover(pieceId),
            onPointerleave: () => actions.hover(null),
          }),
    },
    badge(line.status === "failed" ? "⚠" : line.level),
    h("span", { key: "c", class: "pieceName" }, ...mathText(line.text, `lt${i}`)),
    // **A piece's NAME is a `$…$` sentence too**, and this is where that was found: `Piece.name` for
    // the circle template is literally `the circle $|z - a| = R$`, so setting it as a text node put
    // two raw dollars and a run of LaTeX on screen beside a line whose own claim was typeset. Every
    // string that may carry the convention goes through `mathText`, with no exceptions for the ones
    // that look like labels.
    line.pieceName === undefined
      ? null
      : h("span", { key: "pn", class: "tag" }, ...mathText(line.pieceName, `pn${i}`)),
    h("div", { key: "d", class: "pieceValue" }, ...body),
  );
}

/**
 * Pass 2's per-pole rows.
 *
 * **Drawn where the engine put them, which is the Residues stage and nowhere else.** `stage.poles`
 * is non-empty only for `catch` (`buildDerivation`'s own `stage.id === "catch" ? poleRows(...) : []`),
 * so re-asking "is this the residues stage?" here would be a second place for that to be decided and
 * an edit away from a table under a heading it does not belong to.
 *
 * It carries **no `Level`**, deliberately: the levelled claim about the residues is the CATCH line
 * above it, whose certificate was minted where the residues were computed. Every cell that is a
 * doubt rather than a value is a `tag warn`, and there are four different doubts — the winding was
 * never decided, the pole was only located numerically, it may be removable, its order is inferred.
 */
function poleTable(rows: readonly PoleRow[]): Desc {
  return h(
    "div",
    { key: "poles" },
    h(
      "p",
      { key: "note", class: "muted small" },
      "per pole — the winding number and the count are separate facts:",
    ),
    h(
      "table",
      { key: "tbl", class: "poleTable" },
      h(
        "thead",
        { key: "h" },
        h(
          "tr",
          { key: "hr" },
          h("th", { key: "a", scope: "col" }, "z₀"),
          h("th", { key: "o", scope: "col" }, "order"),
          h("th", { key: "r", scope: "col" }, "Res(f, z₀)"),
          h("th", { key: "i", scope: "col" }, "Ind(γ, z₀)"),
        ),
      ),
      h(
        "tbody",
        { key: "b" },
        ...rows.map((row) =>
          h(
            "tr",
            { key: `p:${row.at[0]},${row.at[1]}` },
            h("td", { key: "a", class: "num" }, fmtCx(row.at)),
            h(
              "td",
              { key: "o", class: "num" },
              String(row.order),
              row.orderCertain ? null : h("span", { key: "u", class: "tag warn" }, "uncertain"),
              row.possiblyRemovable ? h("span", { key: "r", class: "tag warn" }, "may be removable") : null,
            ),
            h(
              "td",
              { key: "r" },
              row.residue === undefined
                ? h(
                    "span",
                    { key: "n", class: "muted small" },
                    row.basis === "exact" ? "—" : "located numerically",
                  )
                : h("span", { key: "v", class: "num" }, row.residue),
            ),
            // **A winding nobody DECIDED is not a winding of zero.** Printing `0` for it would put a
            // coefficient into `2πi Σ n·Res` that no predicate established.
            h(
              "td",
              { key: "i", class: "num" },
              row.windingDecided && row.winding !== undefined
                ? fmt(row.winding)
                : h("span", { key: "u", class: "tag warn" }, "undecided"),
            ),
          ),
        ),
      ),
    ),
  );
}

/**
 * What a stage's summary counts.
 *
 * **A stage with no LINES is not an empty stage**, and reading `0 steps` on `The problem` — which
 * carries the record's target and the expression actually integrated — says the opposite of what is
 * there. `setup` never has a line at all (nothing about the problem statement was certified, which
 * is exactly why it arrives as a `Statement`), and a refused argument's `Residues` can hold a pole
 * table and nothing else. So the summary counts whichever of the three the stage actually has.
 */
function stageCount(stage: DerivationStage, failedLines: number): string {
  if (failedLines > 0) return `${failedLines} of ${stage.lines.length} failed`;
  const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? "" : "s"}`;
  if (stage.lines.length > 0) return plural(stage.lines.length, "step");
  const rest = [
    ...(stage.statements.length > 0 ? [plural(stage.statements.length, "statement")] : []),
    ...(stage.poles.length > 0 ? [plural(stage.poles.length, "pole")] : []),
  ];
  return rest.length > 0 ? rest.join(", ") : "nothing established";
}

function stageBlock(ctx: CardContext, stage: DerivationStage): Desc {
  const failedLines = stage.lines.filter((l) => l.status === "failed").length;
  return disclosure(
    ctx,
    `derivation:${stage.id}`,
    // **The failing stage is the product here**, the way the headline is the product of the Result
    // card: a reader whose argument did not close is looking for the step that stopped it, and one
    // whose argument did close should not have to scroll past a proof.
    stage.failed,
    // The summary says how many and whether any failed, so a reader deciding whether to open it does
    // not have to open it to find out.
    `${stage.title} — ${stageCount(stage, failedLines)}`,
    // Why this step is in the argument at all: a property of the METHOD rather than of this
    // integral, which is why `derivation.ts` can carry it as data.
    h("p", { key: "why", class: "muted small" }, ...mathText(stage.why, `w:${stage.id}`)),
    ...stage.statements.map((s, i) =>
      h(
        "p",
        { key: `st:${i}`, class: "small" },
        h("span", { key: "l", class: "tag" }, ...mathText(s.label, `sl${i}`)),
        " ",
        ...mathText(s.text, `sv${i}`),
      ),
    ),
    stage.poles.length === 0 ? null : poleTable(stage.poles),
    stage.lines.length === 0
      ? null
      : h(
          "ul",
          { key: "lines", class: "pieces2" },
          ...stage.lines.map((line, i) => lineItem(ctx, stage, line, i)),
        ),
  );
}

export const derivationCard: Card = (ctx) => {
  const { derivation, why } = factsOf(ctx);
  if (derivation === null) return card("derivation", nothing(why));

  const steps = derivation.stages.reduce((n, s) => n + s.lines.length, 0);
  const head = derivation.closes
    ? `${steps} steps, each with its evidence`
    : // `failedAt` is a DATA KEY (`vocabulary.ts` §0.2) — `KILL`, `LEGALITY`. The old shell printed
      // it raw, so a reader met house jargon here and the textbook name for the same group two
      // cards away. When no single constraint stopped it there is nothing to name, and saying so is
      // not the same as naming nothing.
      `where it stops: ${derivation.failedAt === null ? "no single step" : constraintLabel(derivation.failedAt)}`;

  const conclusion = derivation.conclusion;
  return card(
    "derivation",
    h("p", { key: "head", class: "muted small" }, head),
    ...derivation.stages.map((stage) => stageBlock(ctx, stage)),
    // Badged from the CONCLUSION's own evidence, which is NOT the argument-wide meet: a vanishing
    // arc owes a `≤` at finite R and an `=` for its limit, and only the limit enters the answer
    // (DESIGN §4 Pass 3). Carrying the meet here would cap every gallery result at `≤`.
    conclusion === undefined
      ? null
      : h(
          "p",
          { key: "concl", class: "verdict" },
          badge(conclusion.level),
          h("span", { key: "l" }, ...mathText(conclusion.label, "cl")),
          " = ",
          h("span", { key: "v", class: "num" }, ...mathText(conclusion.text, "cv")),
        ),
  );
};
