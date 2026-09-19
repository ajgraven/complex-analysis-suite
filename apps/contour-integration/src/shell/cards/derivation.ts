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
import type { DerivationLine, PoleRow, Statement } from "../../engine/derivation.js";
import type { DerivationStep } from "../../engine/steps.js";
import type { SweepRow } from "../session.js";
import { constraintLabel, paramSymbol, tagLabel } from "../../engine/vocabulary.js";
import { argumentOf, stepIndex } from "../argument.js";
import { drillMask } from "../drillPanel.js";
import { fmt, fmtCx } from "../../kernel/decimal.js";
import { h, type Child, type Desc } from "../dom.js";
import { scrub } from "../scrub.js";
import { planSweep } from "../sweep.js";
import type { Param } from "../../engine/contour/model.js";
import { math, mathPlain, mathText } from "../math.js";
import { card, disclosure, nothing, type Card, type CardContext } from "./card.js";

/** `=` / `≤` / `≈` / `⚠` as the square stamp `theme.css` draws. The Result card's own helper. */
const badge = (level: string, key = "b"): Desc =>
  h("span", { key, class: "badge", "data-level": level }, level);

/**
 * The claim, with the one numeral in it a reader may SCRUB — M8 step 3.2.
 *
 * **The split lands INSIDE a `$…$` group, which is why this is not two `mathText` calls.**
 * `certificateClaimAt` cuts the sentence at `at $R = ‹value›$`, so the head ends on an UNMATCHED
 * `$` and the tail opens with its partner — and `splitMath`'s own rule for an odd number of
 * delimiters is to re-join the tail as TEXT, which would print `at $R = ` on screen and leave the
 * rest of the formula unset. So the fragment is reopened by hand: everything before the head's last
 * `$` is an ordinary sentence, what follows it is LaTeX that KaTeX sets on its own (`R = `), the
 * scrub goes after it, and the tail's leading `$` is dropped because the head already opened it.
 *
 * A line with no `param` arg falls straight through to the sentence it has always rendered, which
 * is 15 of the corpus's 42 bounds — the four producers that print `toExponential(3)` or a formatted
 * fraction, which no `{value, digits}` can reproduce without editing what the reader sees.
 */
function claimText(ctx: CardContext, line: DerivationLine, i: number): readonly Child[] {
  const arg = line.claim?.args.param;
  const param = arg?.kind === "param" ? paramOf(ctx, arg.name) : undefined;
  const head = line.claim?.args.head;
  const tail = line.claim?.args.tail;
  if (
    arg?.kind !== "param" ||
    param === undefined ||
    head?.kind !== "text" ||
    tail?.kind !== "text"
  ) {
    return mathText(line.text, `lt${i}`);
  }
  const opener = head.text.lastIndexOf("$");
  if (opener < 0 || tail.text[0] !== "$") return mathText(line.text, `lt${i}`);
  return [
    ...mathText(head.text.slice(0, opener), `lh${i}`),
    math(head.text.slice(opener + 1), {
      key: `lo${i}`,
      label: head.text.slice(opener + 1),
    }),
    scrub({
      param,
      key: `ls${i}`,
      onChange: (v) => ctx.actions.setParam(param.name, v),
      onScrubbing: (on) => ctx.actions.setScrubbing(on),
    }),
    ...mathText(tail.text.slice(1), `lz${i}`),
  ];
}

/** The live `Param` behind a claim's name — the record's under a record, the state's otherwise. */
function paramOf(ctx: CardContext, name: string): Param | undefined {
  const { state, resolution } = ctx;
  const contour =
    resolution.kind === "gallery"
      ? (resolution.run?.contour ?? state.contour)
      : state.contour;
  return contour.params[name];
}

/** One `Step` of an audit trail: the mark comes from `ok`, never from the sentence. */
function stepLine(
  step: { readonly ok: boolean; readonly text: string },
  key: string,
): Desc {
  return h(
    "p",
    // A ✗ step is the diagnostic, so it is coloured as one rather than left to be spotted among the
    // ticks — three glyphs down a list is not a scannable difference (`.checkList > li.failed`'s
    // reason, applied to the trail).
    { key, class: step.ok ? "muted small" : "restriction small" },
    step.ok ? "✓ " : "✗ ",
    ...mathText(step.text, `${key}x`),
  );
}

function lineItem(ctx: CardContext, stage: Block, line: DerivationLine, i: number): Desc {
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
      : h(
          "p",
          { key: "rs", class: "restriction small" },
          ...mathText(line.restriction, `lr${i}`),
        ),
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
    h("span", { key: "c", class: "pieceName" }, ...claimText(ctx, line, i)),
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
              row.orderCertain
                ? null
                : h("span", { key: "u", class: "tag warn" }, tagLabel("order-uncertain")),
              row.possiblyRemovable
                ? h(
                    "span",
                    { key: "r", class: "tag warn" },
                    tagLabel("possibly-removable"),
                  )
                : null,
            ),
            h(
              "td",
              { key: "r" },
              row.residue === undefined
                ? h(
                    "span",
                    { key: "n", class: "muted small" },
                    row.basis === "exact" ? "—" : tagLabel("numerical"),
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
                : h(
                    "span",
                    { key: "u", class: "tag warn" },
                    ...mathText(tagLabel("winding-undecided"), "wu"),
                  ),
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
/**
 * What `stageBlock` and its two helpers actually read.
 *
 * A structural supertype of BOTH `DerivationStage` and `DerivationStep`, so the Phase 1 form (every
 * stage as a disclosure) and the stepper (one step at a time) render through the same code — which
 * is what makes `All` the same picture it always was rather than a second renderer that drifts.
 */
type Block = {
  readonly id: string;
  readonly title: string;
  readonly why: string;
  readonly statements: readonly Statement[];
  readonly lines: readonly DerivationLine[];
  readonly poles: readonly PoleRow[];
  readonly failed: boolean;
};

function stageCount(stage: Block, failedLines: number): string {
  if (failedLines > 0) return `${failedLines} of ${stage.lines.length} failed`;
  const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? "" : "s"}`;
  if (stage.lines.length > 0) return plural(stage.lines.length, "check");
  const rest = [
    ...(stage.statements.length > 0
      ? [plural(stage.statements.length, "statement")]
      : []),
    ...(stage.poles.length > 0 ? [plural(stage.poles.length, "pole")] : []),
  ];
  return rest.length > 0 ? rest.join(", ") : "nothing established";
}

function stageBlock(ctx: CardContext, stage: Block): Desc {
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
    //
    // **Typeset since step 3.1b**, and it had to be: a stage's title is a word (*Hypotheses*) but a
    // STEP's can carry a formula — `Boundary terms · the $R \to \infty$ semicircle` is the piece's
    // own name, and `Let $R \to \infty$` is the limit step's. Passed as a plain string it put raw
    // delimiters on screen, which step 2.1's rendered denylist catches.
    h(
      "span",
      { key: "sum" },
      ...mathText(stage.title, `st:${stage.id}`),
      ` — ${stageCount(stage, failedLines)}`,
    ),
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
  // **THE DERIVATION CARRIES RUNG ii's ANSWERS IN PROSE** — its KILL stage says which lemma
  // discharges which piece — so masking the ledger's KILL column and leaving this open would be
  // masking nothing at all. `drillMask` already folds in the clause that brings it back the moment
  // the rung is checked, so both masked rungs are one test here rather than two conditions.
  if (drillMask(ctx) !== "none") {
    return card("derivation", nothing("Hidden: what each piece is for is the question."));
  }
  const { derivation, steps, why } = argumentOf(ctx);
  if (derivation === null) return card("derivation", nothing(why));

  // **One word for one thing** — M8 step 3.1b, found by looking at it in a browser. The head said
  // `10 steps` (the ledger's LINES) above a stepper reading `4 / 8` (the argument's steps), two
  // counts of two different things under one word, on one card. A line is a CHECK — the Result
  // card's own disclosure already says *What was checked* — and a step is a step of the argument.
  const claims = derivation.stages.reduce((n, s) => n + s.lines.length, 0);
  const head = derivation.closes
    ? `${steps.length} steps · ${claims} checks, each with its evidence`
    : // `failedAt` is a DATA KEY (`vocabulary.ts` §0.2) — `KILL`, `LEGALITY`. The old shell printed
      // it raw, so a reader met house jargon here and the textbook name for the same group two
      // cards away. When no single constraint stopped it there is nothing to name, and saying so is
      // not the same as naming nothing.
      `where it stops: ${derivation.failedAt === null ? "no single step" : constraintLabel(derivation.failedAt)}`;

  // **Clamped where it is READ, not validated where it is written** — `session.step`'s own contract.
  // The step count changes with the record and the fixture, so a stale index is the ordinary case:
  // a reader on step 6 of a keyhole who picks a unit-circle record has asked for a step that does
  // not exist, and landing on the last one is the answer to that rather than an error.
  const found = stepIndex(steps, ctx.session.step);
  const stepping = found !== null;
  const index = found ?? 0;
  const shown = stepping ? [steps[index] as DerivationStep] : steps;

  const conclusion = derivation.conclusion;
  // **The answer is not printed under every step.** It has its own step — the conclusion — and
  // repeating it beneath step 2 would give away the ending of the argument the stepper exists to
  // walk, which is exactly what Worked-example mode is for. In `All` it stays where it has been
  // since step 1.5b, at the foot of the whole argument.
  const showConclusion =
    conclusion !== undefined && (!stepping || shown[0]?.kind === "conclusion");

  return card(
    "derivation",
    h("p", { key: "head", class: "muted small" }, head),
    h(
      "div",
      {
        key: "stepper",
        class: "stepper",
        // **On the whole stepped region, not on the card** — the plan says *← → when the card has
        // focus* and a `<section>` is not focusable; giving it `tabindex="0"` would add a tab stop
        // before every card's contents in the suite's busiest rail. Wrapping the controls AND the
        // step body means the arrows work wherever focus is inside the argument, which is what the
        // sentence was after.
        onKeydown: (e: Event) => onStepKey(ctx, steps.length, index, e as KeyboardEvent),
      },
      stepperControls(ctx, steps, stepping, index),
      ...shown.map((step) =>
        // **Stepping shows the step OPEN**, not as a disclosure a reader must then click: the
        // stepper has already answered "which one", and a closed card behind a Next button asks the
        // same question twice.
        stepping ? openBlock(ctx, step) : stageBlock(ctx, step),
      ),
    ),
    // Badged from the CONCLUSION's own evidence, which is NOT the argument-wide meet: a vanishing
    // arc owes a `≤` at finite R and an `=` for its limit, and only the limit enters the answer
    // (DESIGN §4 Pass 3). Carrying the meet here would cap every gallery result at `≤`.
    !showConclusion || conclusion === undefined
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

/**
 * ← and → move the stepper; nothing else is touched.
 *
 * **There is no "unless a field wants the arrows" guard, and that is deliberate.** The first draft
 * had one keyed on `INPUT`/`SELECT`/`TEXTAREA`; the sweep found it unreachable, because nothing in
 * this card takes an arrow key — and measuring what WILL showed the guard would not have helped
 * either: step 3.2's inline scrub is a `role="slider"` span, not an input, so a tag test would have
 * read as though the case were handled while letting it through. The guard arrives with its
 * consumer.
 */
function onStepKey(
  ctx: CardContext,
  count: number,
  index: number,
  e: KeyboardEvent,
): void {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  if (ctx.session.step === "all" || count === 0) return;
  e.preventDefault();
  const next = e.key === "ArrowLeft" ? index - 1 : index + 1;
  ctx.actions.setStep(Math.min(Math.max(0, next), count - 1));
}

/**
 * Prev / the dots / Next / All — and `Step through` when every step is showing.
 *
 * The dots are a LIST of buttons rather than a decoration: each one is the step it names, so a
 * reader who can see the shape of the argument can also jump into the middle of it, and a reader
 * who cannot see it at all gets the same nine controls named `Step 3 of 9 — Boundary terms · …`.
 */
function stepperControls(
  ctx: CardContext,
  steps: readonly DerivationStep[],
  stepping: boolean,
  index: number,
): Desc {
  const { actions } = ctx;
  if (steps.length === 0) return h("div", { key: "ctl" });
  if (!stepping) {
    return h(
      "div",
      { key: "ctl", class: "stepBar" },
      h(
        "button",
        {
          key: "enter",
          type: "button",
          class: "stepBtn",
          onClick: () => actions.setStep(0),
        },
        `Step through — ${steps.length}`,
      ),
    );
  }
  const step = steps[index] as DerivationStep;
  return h(
    "div",
    { key: "ctl", class: "stepBar", role: "group", "aria-label": "derivation steps" },
    h(
      "button",
      {
        key: "prev",
        type: "button",
        class: "stepBtn",
        disabled: index === 0,
        "aria-label": "previous step",
        onClick: () => actions.setStep(index - 1),
      },
      "‹",
    ),
    h(
      "ol",
      { key: "dots", class: "stepDots" },
      ...steps.map((s, i) =>
        h(
          "li",
          { key: `d:${s.id}` },
          h("button", {
            key: "b",
            type: "button",
            class: "stepDot",
            // The step a reader is ON, named for assistive tech the same way it is drawn.
            ...(i === index ? { "aria-current": "step" } : {}),
            // `mathPlain`, not the raw title: a step's title carries `$…$` (*Let $R \to \infty$*,
            // *Boundary terms · the $R \to \infty$ semicircle*), and an `aria-label` is one of the
            // places a fragment cannot go — so a screen-reader user heard the LaTeX source, dollars
            // and backslashes included, for the two steps of every record that have a limit. Older
            // than this step (3.1b), found by reading the accessible name in a browser.
            "aria-label": `step ${i + 1} of ${steps.length} — ${mathPlain(s.title)}`,
            "data-failed": s.failed ? "1" : undefined,
            onClick: () => actions.setStep(i),
          }),
        ),
      ),
    ),
    h(
      "button",
      {
        key: "next",
        type: "button",
        class: "stepBtn",
        disabled: index === steps.length - 1,
        "aria-label": "next step",
        onClick: () => actions.setStep(index + 1),
      },
      "›",
    ),
    h("span", { key: "of", class: "muted small" }, `${index + 1} / ${steps.length}`),
    h(
      "button",
      {
        key: "all",
        type: "button",
        class: "stepBtn",
        onClick: () => actions.setStep("all"),
      },
      "All",
    ),
    h(
      "span",
      { key: "sr", class: "srOnly" },
      `Step ${index + 1} of ${steps.length}: ${mathPlain(step.title)}`,
    ),
  );
}

/** One step, open — the same body `stageBlock` puts inside its disclosure, without the disclosure. */
function openBlock(ctx: CardContext, step: DerivationStep): Desc {
  return h(
    "div",
    { key: `open:${step.id}`, class: "stepBody", "data-step": step.id },
    h("h3", { key: "t" }, ...mathText(step.title, `ot:${step.id}`)),
    h("p", { key: "why", class: "muted small" }, ...mathText(step.why, `w:${step.id}`)),
    ...step.statements.map((s, i) =>
      h(
        "p",
        { key: `st:${i}`, class: "small" },
        h("span", { key: "l", class: "tag" }, ...mathText(s.label, `sl${i}`)),
        " ",
        ...mathText(s.text, `sv${i}`),
      ),
    ),
    step.poles.length === 0 ? null : poleTable(step.poles),
    step.lines.length === 0
      ? null
      : h(
          "ul",
          { key: "lines", class: "pieces2" },
          ...step.lines.map((line, i) => lineItem(ctx, step, line, i)),
        ),
    ...limitPlay(ctx, step),
  );
}

/**
 * The limit step's play control and its table — M8 step 3.2.
 *
 * **On the limit step alone, and only where the parameter can actually be swept.** A step whose
 * parameter has no `limit` gets no control rather than a disabled one: there is nowhere for it to
 * go, and a control that cannot act teaches a reader the app is broken (the `openFrontDoor`
 * placeholder's own lesson, step 1.4).
 *
 * **But the TABLE is not part of that rule, and making it one was a defect.** A finished sweep
 * leaves the parameter ON its endpoint, where `planSweep` has nothing to plan and returns null —
 * so a single `return []` covering both took the table off the screen at the exact moment it was
 * complete. Measured in a browser: four presses of `Step` filled four rows with the `≤` column
 * falling 2.6e-5 → 1.5e-8 → 9.1e-12 → 5.3e-15, and the fifth press — the one that reaches the
 * limit — left the card with no table at all. The buttons still come and go with the plan; the
 * evidence stays.
 */
function limitPlay(ctx: CardContext, step: DerivationStep): readonly Child[] {
  if (step.kind !== "limit" || step.focus.param === undefined) return [];
  const param = paramOf(ctx, step.focus.param);
  if (param === undefined) return [];
  const sweep = ctx.session.sweep?.stepId === step.id ? ctx.session.sweep : null;
  const plannable = planSweep(param) !== null;
  if (!plannable && (sweep === null || sweep.rows.length === 0)) return [];
  const running = sweep?.running === true;

  // **Which piece the limit has to kill.** Every line whose certified bound names this parameter is
  // a candidate; tier G declares FOUR (the square's four sides) and the binding one is the largest,
  // because that is the one whose vanishing the limit is being taken to establish. Decided here
  // because the card is the only reader that can see the whole step list.
  const governed = boundsFor(ctx, step.focus.param);
  const worst = governed.reduce<{ pieceId: string; bound: number } | null>(
    (best, b) => (best === null || b.bound > best.bound ? b : best),
    null,
  );

  return [
    !plannable
      ? null
      : h(
          "div",
          { key: "play", class: "sweepBar" },
          h(
            "button",
            {
              key: "go",
              type: "button",
              class: "stepBtn",
              // The label says what pressing it DOES now, which is the only thing a reader can act on:
              // a control labelled "play" while it is playing is a lie about its own state.
              onClick: () =>
                ctx.actions.playSweep({
                  stepId: step.id,
                  param: param.name,
                  pieceId: worst?.pieceId ?? null,
                }),
            },
            running ? "Stop" : "Play the limit",
          ),
          // **The step button is offered ALWAYS, not only under `prefers-reduced-motion`.** The media
          // query decides what `Play` does (the app asks it at every press); this is the same jump a
          // reader may want without changing an operating-system setting to get it.
          h(
            "button",
            {
              key: "one",
              type: "button",
              class: "stepBtn",
              onClick: () =>
                ctx.actions.playSweep({
                  stepId: step.id,
                  param: param.name,
                  pieceId: worst?.pieceId ?? null,
                  stepOnce: true,
                }),
            },
            "Step",
          ),
        ),
    sweep === null || sweep.rows.length === 0
      ? null
      : sweepTable(sweep.rows, param.name, worst !== null),
  ];
}

/** Every certified bound in the argument that names this parameter, with the piece it is about. */
function boundsFor(
  ctx: CardContext,
  param: string,
): { pieceId: string; bound: number }[] {
  const stages = argumentOf(ctx).derivation?.stages ?? [];
  return stages
    .flatMap((stage) => stage.lines)
    .flatMap((line) =>
      line.evaluated?.param === param && line.pieceId !== undefined
        ? [{ pieceId: line.pieceId, bound: line.evaluated.bound }]
        : [],
    );
}

/**
 * What the sweep found, one row per checkpoint.
 *
 * Every cell is BADGED, and the three badges differ on purpose: the bound is what the engine
 * certified (`≤`), the measured term and the target are quadrature (`≈`). A table that badged them
 * alike would say the measured column had been proved, which is the inversion the honest-labelling
 * guardrail exists to prevent — and this table's whole point is to let a reader watch a `≤` column
 * shrink past an `≈` one.
 */
function sweepTable(rows: readonly SweepRow[], param: string, hasPiece: boolean): Desc {
  return h(
    "table",
    { key: "sweep", class: "sweepTable" },
    h(
      "thead",
      { key: "h" },
      h(
        "tr",
        { key: "r" },
        h("th", { key: "a", scope: "col" }, ...mathText(`$${paramSymbol(param)}$`, "sh")),
        h("th", { key: "b", scope: "col" }, "bound"),
        h("th", { key: "m", scope: "col" }, hasPiece ? "measured" : "—"),
        h("th", { key: "t", scope: "col" }, "target"),
      ),
    ),
    h(
      "tbody",
      { key: "b" },
      ...rows.map((row, i) =>
        h(
          "tr",
          { key: `r${i}` },
          h("td", { key: "a", class: "num" }, fmt(row.at)),
          h(
            "td",
            { key: "b", class: "num" },
            row.bound === null ? "—" : badge("≤", "bb"),
            row.bound === null ? null : ` ${row.bound.toExponential(3)}`,
          ),
          h(
            "td",
            { key: "m", class: "num" },
            row.measured === null ? "—" : badge("≈", "mb"),
            row.measured === null ? null : ` ${fmtCx(row.measured)}`,
          ),
          h(
            "td",
            { key: "t", class: "num" },
            row.target === null ? "—" : badge("≈", "tb"),
            row.target === null ? null : ` ${fmtCx(row.target)}`,
          ),
        ),
      ),
    ),
  );
}
