// The faded drill, as a RAIL CARD — M8 step 1.7.
//
// M7.3 built the drill as a full-screen overlay with its own DOM; the shell rebuild demotes it to
// what it always was — one card in the right rail's top slot, plus a decision about what the rest of
// the page may show. `shell/drill.ts` still owns every verdict (what a rung asks, what the ledger
// says about a pick, what a drawing has to enclose); this file renders it and nothing else. Nothing
// here grades by comparing strings, and nothing computes a second opinion.
//
// **THE MASK IS ONE DECISION AND ONE READER.** {@link drillMask} answers "what is the drill hiding
// right now?", and the shell acts on the answer — the ledger drops its KILL rows, the derivation
// folds, the value card goes, the stage draws an EMPTY piece list. The old shell spread that
// question over three readers (`renderLedger`, `renderDerivation`, `renderResult`) each of which
// re-derived it with its own extra clause, which is how rung iii came to mask the ledger and unmask
// the derivation at the same time. It is also why this file must not hide anything by OMISSION:
// M7.3's first implementation masked the contour by SKIPPING `drawContour`, and `drawContour` begins
// with `clearRect`, so the previous frame's contour stayed on the ink layer — the ledger hidden, the
// value hidden, and the answer still drawn. A mask that can be bought by leaving a call out is not a
// mask.
//
// **The grading lives in the SESSION, and is never copied here.** M7.4 found `drillGraded` outliving
// its rung: the derivation unmasks once rung ii has been checked (it is then the answer sheet), and a
// state restored while graded showed the whole argument at rung iii, where the argument is exactly
// what is masked. `resetTransient` clears it on every `applyState` now, so the one thing this file
// must not do is keep its own copy — it reads `session.drillGraded` and writes it in place.
import type { FamilyRun } from "../families/runFamily.js";
import {
  LAST_STAGE,
  readProgress,
  stageFor,
  withCleared,
  writeProgress,
  type KeyStore,
} from "./drillProgress.js";
import {
  DISPOSALS,
  DISPOSAL_LABEL,
  DRILL_TASKS,
  VERIFIED_ROLE_TEMPLATES,
  allCorrect,
  checkDrawing,
  gradePieces,
  menuVerdict,
  pickState,
  pieceQuestions,
  runTask,
  taskById,
  taskState,
  type Disposal,
  type DrawResult,
  type DrillStage,
  type DrillTask,
  type WindingRow,
} from "./drill.js";
import { TEMPLATES, type TemplateId } from "./templates.js";
import { h, type Child, type Desc } from "./dom.js";
import { mathPlain, mathText } from "./math.js";
import type { Session } from "./session.js";
import { card, type CardContext } from "./cards/card.js";

/** What the drill masks, derived from the state — the shell asks this to decide what to render. */
export type DrillMask = "none" | "kill" | "argument";

/**
 * Everything {@link drillMask} reads, and nothing else.
 *
 * Narrower than `CardContext` on purpose: the STAGE is one of the three readers and a `StageDraw`
 * carries no actions, so a mask that demanded a card's context would have made the stage derive the
 * answer a second way — which is the defect this function exists to prevent, the old shell having
 * spread the question over three readers that each grew a clause of their own.
 */
export interface MaskInput {
  readonly state: CardContext["state"];
  readonly session: CardContext["session"];
}

/**
 * What the drill is hiding right now.
 *
 * The old shell's `mask()`, with the clause its three readers each carried folded in:
 *
 *  - **rung ii masks the ledger's KILL column** (its questions replace it) and the derivation with
 *    it, because the derivation's KILL stage says which lemma discharges which piece — masking one
 *    and leaving the other would be masking nothing;
 *  - **until it has been CHECKED**, at which point the ledger is the answer sheet and everything
 *    comes back. That is the `drillGraded === null` guard the old `renderLedger` and
 *    `renderDerivation` each spelled out separately, and the whole reason it belongs here instead;
 *  - **rung iii masks the argument, the value AND the contour** — at the rung whose question is
 *    "which contour?", the record's own contour is the answer, drawn;
 *  - **and only in GALLERY mode.** A pick puts an ordinary sandbox state on screen, and from that
 *    moment the ledger is judging the READER's contour rather than giving the record's away. There
 *    is nothing left to mask, and masking it would hide the reply to the reader's own move.
 *
 * Rung iii deliberately does NOT consult the grading. A grading cannot survive a rung change —
 * `resetTransient` clears it on every `applyState`, and every rung change is one — so the case is
 * unreachable; were it reachable, unmasking there is M7.4's defect exactly.
 */
export function drillMask(ctx: MaskInput): DrillMask {
  const rung = ctx.state.drill;
  if (rung === null) return "none";
  if (rung.stage === 2) return ctx.session.drillGraded ? "none" : "kill";
  if (rung.stage === 3 && ctx.state.mode === "gallery") return "argument";
  return "none";
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The rung's scratch — an answer sheet and a check, neither of which is a permalink's business.
//
// **Both live in the SESSION, and this file owns neither their lifetime nor their reset.** The first
// draft kept them in a `WeakMap<Session, …>` keyed internally by `task/stage`, so a sheet could not
// outlive its rung; that was correct and is still the wrong shape, for `session.ts`'s own reason —
// the old shell kept ~60 `let`s inside `mountApp`'s closure and three of M7.4's defects were exactly
// a value the door could not see and so did not clear. `resetTransient` clears these by
// construction, and every rung change is an `applyState`, so the derived key is not merely
// redundant: it would be a second place to get the same rule right.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The reader's answer sheet at rung ii.
 *
 * **Narrowed here, at its only reader.** `session.ts` types it as plain strings and keeps
 * {@link Session.drillDrawn} as `unknown` because it may not import `shell/drill.ts`: that module
 * pulls `analyse`, `FAMILIES` and the contrast grid behind it, and the one file whose job is to say
 * what a permalink must NOT carry should not depend on the engine to say it. Anything in the sheet
 * that is not a `Disposal` grades as WRONG, which is what an unanswered question does too — so the
 * assertion cannot launder a bad value into a right answer, which is the only thing it could cost.
 */
const sheetOf = (session: Session): Readonly<Record<string, Disposal | undefined>> =>
  session.drillAnswers as Readonly<Record<string, Disposal | undefined>>;

/** Rung iv's last enclosure check, narrowed for {@link sheetOf}'s reason. A value that is not a
 *  `DrawResult` would render as one — which is why nothing but this file ever writes the field. */
const lastCheckOf = (session: Session): DrawResult | null =>
  (session.drillDrawn as DrawResult | null | undefined) ?? null;

/**
 * The task's solved record, memoised by task id.
 *
 * A MEMO rather than state: `runTask` is a pure function of the task (its family at its own
 * bindings), so the cache can only ever hold what a second call would return. It matters because
 * rung iv re-solves the record on every enclosure check, and rung ii on every keystroke's re-render.
 */
const RUNS = new Map<string, FamilyRun | null>();

function runOf(task: DrillTask): FamilyRun | null {
  const hit = RUNS.get(task.id);
  if (hit !== undefined) return hit;
  const run = runTask(task);
  RUNS.set(task.id, run);
  return run;
}

/** `localStorage`, or null where reaching for it THROWS — a private window, blocked site data. */
function store(): KeyStore | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Record a cleared rung.
 *
 * Read-then-write rather than a module-level copy of the progress: `withCleared` is monotone, so a
 * re-read cannot lose a rung, and a card with no lifecycle has nowhere honest to keep one. **This
 * may never change a number** (`drillProgress.ts` rule 3) — it decides which rung a task OPENS at
 * and nothing else.
 */
function clearRung(task: DrillTask, stage: DrillStage): void {
  const s = store();
  writeProgress(s, withCleared(readProgress(s), task.id, stage));
}

/** The windings of the contour ON SCREEN — what rung iv's drawing is judged by. */
function windingsNow(ctx: CardContext): readonly WindingRow[] {
  const r = ctx.resolution;
  if (r.kind === "plain" || r.kind === "declared") return r.analysis.integral.windings;
  if (r.kind === "gallery") return r.run?.integral.windings ?? [];
  return [];
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The card.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The drill's card for the right rail's top slot, or null when no rung is open.
 *
 * Through `card()` like every other card, on `vocabulary.ts`'s `drill` id — which is deliberately
 * NOT in `RIGHT_CARDS`, because this is the top slot and exists only while a rung is open, so the
 * rail's `map` never has to tolerate a `null` where a card should be.
 */
export function drillPanel(ctx: CardContext): Desc | null {
  const rung = ctx.state.drill;
  // The chooser, when the reader has pressed Drill and no rung is open. It is the drill's only door:
  // before it existed `DRILL_TASKS` was reachable from a permalink and from nothing a reader could
  // press, while the bar's own refusal named a panel nothing built.
  if (rung === null) return ctx.session.drillPicker ? taskList(ctx) : null;
  const task = taskById(rung.task);
  // A link naming a task this build does not have. No card rather than an empty one: there is no
  // rung open, and a heading over nothing claims otherwise.
  if (task === null) return null;

  const stage = rung.stage;
  const body: Child[] = [
    h(
      "p",
      { key: "head", class: "pickRow" },
      h("span", { key: "n", class: "num" }, ...mathText(task.label, "tl")),
      h("span", { key: "r", class: "tag" }, `rung ${stage} of ${LAST_STAGE}`),
    ),
    ...rungBody(ctx, task, stage),
    footer(ctx, task, stage),
  ];
  return card("drill", ...body);
}

/**
 * The four tasks, each at the rung it has REACHED.
 *
 * The rung comes from `stageFor`, which reads the store — so a reader who cleared rung ii yesterday
 * is offered rung iii today, and a store that is absent, blocked or garbage reads as no progress
 * rather than throwing (`drillProgress.ts`'s own rule). The store is read ONCE here rather than per
 * task, so the four rows cannot describe different moments.
 */
function taskList(ctx: CardContext): Desc {
  const progress = readProgress(store());
  return card(
    "drill",
    h(
      "p",
      { key: "ask", class: "muted small" },
      "Four arguments, each faded a little further: the worked example, then the boundary terms " +
        "masked, then the contour as well, then a blank plane and the pen.",
    ),
    h(
      "ul",
      { key: "tasks", class: "pieces2" },
      ...DRILL_TASKS.map((task) => {
        const stage = stageFor(progress, task.id);
        return h(
          "li",
          { key: task.id, class: "pickRow" },
          h("span", { key: "n", class: "pieceName" }, ...mathText(task.label, `tl${task.id}`)),
          h("span", { key: "r", class: "tag" }, `rung ${stage} of ${LAST_STAGE}`),
          h(
            "button",
            {
              key: "go",
              // `mathPlain`, for the reason the rung-ii selects give: the label is `∫ cos x/(x²+1) dx`
              // in the `$…$` convention, and an accessible name carrying raw LaTeX is read aloud in
              // the app's own source syntax.
              "aria-label": `open ${mathPlain(task.label)} at rung ${stage}`,
              onClick: () => ctx.actions.applyState(taskState(task, stage)),
            },
            "Open",
          ),
        );
      }),
    ),
  );
}

/** The rung's own question and controls. Exactly one of the four, by construction. */
function rungBody(ctx: CardContext, task: DrillTask, stage: DrillStage): readonly Child[] {
  if (stage === 1) {
    return [
      h(
        "p",
        { key: "ask", class: "muted small" },
        "The worked argument, as the gallery gives it: the contour, the ledger and the value.",
      ),
    ];
  }
  if (stage === 2) return rungKill(ctx, task);
  if (stage === 3) return rungMenu(ctx, task);
  return rungDraw(ctx, task);
}

/**
 * Rung ii — the KILL column, one question per piece.
 *
 * **Not "assert each ledger row".** A faded worked example is faded from a CORRECT argument, so over
 * these four tasks every row is satisfied — 30 rows, 30 satisfied — and ticking "satisfied" scores
 * 30/30 without reading any mathematics. What each PIECE is FOR is not free: target ×5, vanishes ×4,
 * a known limit ×1, so a constant answer scores exactly 5/10.
 */
function rungKill(ctx: CardContext, task: DrillTask): readonly Child[] {
  const run = runOf(task);
  if (run === null) {
    return [h("p", { key: "ask", class: "placeholder" }, "This record did not solve, so there is nothing to mask.")];
  }
  const questions = pieceQuestions(run);
  const answers = sheetOf(ctx.session);
  // **The grading is never STORED** — it is recomputed from the sheet whenever `session.drillGraded`
  // says it was asked for, so a sheet and a grade of it cannot come to disagree. `drillGraded` is the
  // session's, read here and written in place: M7.4's rule for this exact flag.
  const graded = ctx.session.drillGraded ? gradePieces(questions, answers) : null;
  const out: Child[] = [
    h(
      "p",
      { key: "ask", class: "muted small" },
      "The contour is given. Say what each piece is FOR — the pieces you cannot compute must either " +
        "vanish or give you back the target times a constant.",
    ),
  ];

  for (const q of questions) {
    const mark = graded?.find((g) => g.question.pieceId === q.pieceId);
    out.push(
      h(
        "label",
        { key: `q:${q.pieceId}`, class: "pickRow" },
        // **The piece's own NAME, typeset.** It is literally `the circle $|z - a| = R$`, so setting
        // it as plain text puts raw dollars on screen — step 0.5's convention, and the one place a
        // rail card can break it without any test noticing the sentence still reads.
        h("span", { key: "n", class: "pieceName" }, ...mathText(q.name, `p${q.pieceId}`)),
        h(
          "select",
          {
            key: "s",
            // **`mathPlain`, not the name.** The name is `the $R \to \infty$ semicircle`, and an
            // accessible name carrying raw LaTeX is read out as "dollar R backslash to" — the one
            // sentence a screen-reader user gets for this control, in the app's own source syntax.
            "aria-label": `what ${mathPlain(q.name)} is for`,
            value: answers[q.pieceId] ?? "",
            disabled: graded !== null,
            onChange: (e: Event) => {
              const v = (e.target as HTMLSelectElement).value;
              ctx.session.drillAnswers = { ...ctx.session.drillAnswers, [q.pieceId]: v === "" ? undefined : v };
            },
          },
          h("option", { key: "blank", value: "" }, "—"),
          ...DISPOSALS.map((d) => h("option", { key: d, value: d }, DISPOSAL_LABEL[d])),
        ),
        // A WORD rather than a glyph: `✓`/`✗` needs a screen-reader-only sibling to mean anything,
        // and a tag that says "correct" needs neither.
        mark === undefined ? null : h("span", { key: "m", class: mark.ok ? "tag" : "tag warn" }, mark.ok ? "correct" : "wrong"),
      ),
    );
    // **THE LEDGER'S OWN ROW IS THE FEEDBACK**, on a wrong answer and only then. This file never
    // writes a sentence about why a piece does what it does, and a reader who was right does not
    // need the claim spelled out before they move on.
    if (mark !== undefined && !mark.ok) {
      out.push(
        h(
          "p",
          // Addressed by `data-feedback` rather than by a class, which is `data-card`'s idiom: the
          // class says how it LOOKS and would match the card's own prose, and a test counting rows
          // of feedback must count the ledger's rows and nothing else.
          { key: `why:${q.pieceId}`, "data-feedback": q.pieceId, class: "muted small" },
          ...mathText(q.row.claim, `w${q.pieceId}`),
        ),
      );
    }
  }

  if (graded === null) {
    out.push(
      h(
        "div",
        { key: "check", class: "btnRow" },
        h(
          "button",
          {
            key: "go",
            "aria-label": "check the boundary terms against the ledger",
            onClick: () => {
              ctx.session.drillGraded = true;
              if (allCorrect(gradePieces(questions, sheetOf(ctx.session)))) clearRung(task, 2);
              // **A REPAINT, not a notice.** `session.notice` renders under a `badge` carrying the
              // honest-labelling level, and stamping `=` on "you got them right" spends the
              // certificate vocabulary on the reader's answers. The card says the whole outcome —
              // the mark on each question and the verdict under them — so there is nothing left for
              // a sentence to add.
              ctx.actions.redraw();
            },
          },
          "Check",
        ),
      ),
    );
    return out;
  }

  const ok = allCorrect(graded);
  out.push(
    h(
      "p",
      { key: "verdict", class: "verdict" },
      h("span", { key: "t", class: ok ? "tag" : "tag warn" }, ok ? "every piece" : "not every piece"),
      ok ? " as the ledger has it." : " — the ledger's own claim is under each one.",
    ),
    h(
      "div",
      { key: "again", class: "btnRow" },
      h(
        "button",
        {
          key: "go",
          "aria-label": "clear the answer sheet and try again",
          onClick: () => {
            ctx.session.drillAnswers = {};
            ctx.session.drillGraded = false;
            ctx.actions.redraw();
          },
        },
        "Try again",
      ),
    ),
  );
  return out;
}

/**
 * Rung iii — a menu of contours, judged by the ledger.
 *
 * **The menu may only offer templates whose every role the ledger ESTABLISHES.** Measured over the
 * record's own integrand, four templates (strip, wedge, keyhole, dogbone) close for B1 and report a
 * target — because each carries a `reproduces` piece and the ledger takes that role on faith:
 * nothing checks `f(ωz) = μ f(z)`, which for a record is the record's declaration and for a template
 * under an arbitrary integrand is simply unverified. Offering one would mark a false friend correct,
 * so the declared menu is intersected with {@link VERIFIED_ROLE_TEMPLATES} here rather than trusted.
 */
function rungMenu(ctx: CardContext, task: DrillTask): readonly Child[] {
  const run = runOf(task);
  const picked =
    ctx.state.mode === "sandbox" ? (task.menu.find((m) => m === ctx.state.contourSource?.template) ?? null) : null;
  const offered = task.menu.filter((m) => VERIFIED_ROLE_TEMPLATES.includes(m));
  const out: Child[] = [
    h(
      "p",
      { key: "ask", class: "muted small" },
      "Only the integral is given — the contour is not drawn. Pick one to close over; the ledger will " +
        "say whether the argument closes and whether the target is on it.",
    ),
    h(
      "div",
      { key: "menu", class: "segmented" },
      ...offered.map((option) => {
        const spec = TEMPLATES.find((t) => t.id === option);
        return h(
          "button",
          {
            key: option,
            "aria-label": `close over the ${spec?.label ?? option}`,
            "aria-pressed": picked === option,
            onClick: () => {
              if (run !== null && menuVerdict(run, option).answers) clearRung(task, 3);
              ctx.actions.applyState(pickState(task, option));
            },
          },
          spec?.label ?? option,
        );
      }),
    ),
  ];
  // Once a pick is on screen the ledger is unmasked and says everything; the drill adds only the one
  // thing the ledger cannot know — whether this contour answers the integral that was ASKED.
  if (picked !== null && run !== null) {
    const v = menuVerdict(run, picked);
    out.push(
      h(
        "p",
        { key: "verdict", class: "verdict" },
        h("span", { key: "t", class: v.answers ? "tag" : "tag warn" }, v.answers ? "answers" : "does not answer"),
        ...verdictWords(v, picked),
      ),
    );
    // **A second RIGHT answer, declared by the record.** At `a = 0` the rational case closes in
    // either half-plane and both report π — nothing forces the side without a kernel — so a reader
    // who picked the other one is told the ledger agrees rather than left to think they guessed.
    if (v.answers && task.alsoAnswers.includes(picked)) {
      out.push(
        h(
          "p",
          { key: "also", class: "muted small" },
          "This is not the only contour that answers it: with no kernel there is nothing to force the half-plane.",
        ),
      );
    }
  }
  return out;
}

/** The ledger's own words for a pick, or the one sentence the ledger has no row for. */
function verdictWords(v: ReturnType<typeof menuVerdict>, picked: TemplateId): readonly Child[] {
  if (v.answers) return [" — the argument closes and the target is a piece of it."];
  if (!v.hasTarget) {
    // COVER, not KILL: the circle CLOSES. Saying "it does not close" would teach the wrong lesson
    // about the one option that fails for a different reason from all the others.
    return [" — the argument closes, but no piece of this contour is the target."];
  }
  return [` — ${v.failedAt ?? "?"}: `, ...mathText(v.why ?? "the argument does not close", `mv${picked}`)];
}

/**
 * Rung iv — draw one, and check the one thing a drawn contour can decide.
 *
 * **Not the value.** A drawn contour is a FIXED curve and the argument is about a limit (`R → ∞`),
 * so the whole KILL apparatus is written on limit parameters a drawn piece does not have; comparing
 * `∮` against the answer would pass a small circle round the pole, which is the misconception the
 * app exists to prevent. What a fixed curve CAN decide exactly is the enclosure — which
 * singularities it winds about, and with what sign.
 */
function rungDraw(ctx: CardContext, task: DrillTask): readonly Child[] {
  const goal = typeof task.drawCheck === "object" ? null : task.drawCheck;
  const out: Child[] = [
    h(
      "p",
      { key: "ask", class: "muted small" },
      goal === "one-pole"
        ? "Draw a closed contour that encloses exactly ONE of the singularities — either one, either way round."
        : goal === "as-recorded"
          ? "Draw a closed contour that winds about the singularities exactly as the worked one does."
          : "Draw a closed contour. There is nothing here to check about the enclosure:",
    ),
  ];
  if (goal === null && typeof task.drawCheck === "object") {
    out.push(h("p", { key: "none", class: "muted small" }, ...mathText(task.drawCheck.none, "dc")));
  }
  // **WHAT A DRAWN CONTOUR CANNOT CARRY, said once.** Saying so is the alternative to implying it.
  out.push(
    h(
      "p",
      { key: "caveat", class: "muted small" },
      "A drawn contour is a fixed curve, so the ledger certifies ∮ over it — not the limit the target " +
        "integral is defined by.",
    ),
  );
  if (goal !== null) {
    out.push(
      h(
        "div",
        { key: "check", class: "btnRow" },
        h(
          "button",
          {
            key: "go",
            "aria-label": "check what this contour encloses against the worked argument",
            onClick: () => {
              const run = runOf(task);
              const result = checkDrawing(goal, run?.integral.windings ?? [], windingsNow(ctx));
              ctx.session.drillDrawn = result;
              if (result.ok) clearRung(task, 4);
              // The card prints the check's own sentence; a notice would print it twice, under a
              // level the check does not claim. See the Check button at rung ii.
              ctx.actions.redraw();
            },
          },
          "Check the enclosure",
        ),
      ),
    );
  }
  const drawn = lastCheckOf(ctx.session);
  if (drawn !== null) {
    out.push(
      h(
        "p",
        { key: "verdict", class: "verdict" },
        h("span", { key: "t", class: drawn.ok ? "tag" : "tag warn" }, drawn.ok ? "as recorded" : "not yet"),
        " ",
        ...mathText(
          drawn.ok ? "Exactly that, and the winding numbers are decided exactly." : (drawn.why ?? "not yet"),
          "dr",
        ),
      ),
    );
  }
  return out;
}

/** Where the rung goes next, and the way out. Both are ordinary states — a rung is a permalink. */
function footer(ctx: CardContext, task: DrillTask, stage: DrillStage): Desc {
  const onward: DrillStage = stage === 4 ? 1 : ((stage + 1) as DrillStage);
  return h(
    "div",
    { key: "nav", class: "btnRow" },
    h(
      "button",
      {
        key: "next",
        "aria-label": stage === 4 ? "start this task again at the worked argument" : `open rung ${onward}`,
        onClick: () => {
          // **Reading the worked argument IS rung i's task**, so moving off it clears it. Every
          // other rung is cleared by its own check, and never by leaving it.
          if (stage === 1) clearRung(task, 1);
          ctx.actions.applyState(taskState(task, onward));
        },
      },
      stage === 4 ? "Start again" : "Next rung",
    ),
    h(
      "button",
      {
        key: "leave",
        "aria-label": "leave the drill and keep this state",
        // `setMode("explore")` clears `drill`, which unmasks everything by the one decision above —
        // rather than a second exit that would have to remember to.
        onClick: () => ctx.actions.setMode("explore"),
      },
      "Leave the drill",
    ),
  );
}
