// The Drill card (PRA-10): the faded drill over the ladder. The question and its choices are here; the
// answer, the grade and every word's run come from `drillAnswer`, which runs the ladder — the card
// holds no key of its own. Until the reader answers a masked stage, nothing on the page says which
// word rules the formula out: the Ladder card is masked with it, and no word has been run.
import { h, type Child, type Desc } from "@cas/ui";
import { DRILL } from "../engine/vocabulary.js";
import { level } from "./level.js";
import {
  DRILL_TASKS,
  LAST_STAGE,
  drillAnswer,
  taskById,
  type DrillProgress,
  type DrillStage,
} from "./drill.js";

export interface DrillModel {
  readonly task: string;
  readonly stage: DrillStage;
  /** Whether the ladder still shows this task's rung and formula. */
  readonly onTask: boolean;
  /** The reader's answer at this stage this session: a word id, "none", or null. */
  readonly chosen: string | null;
  readonly progress: DrillProgress;
}

export interface DrillHandlers {
  readonly onTask: (id: string) => void;
  /** Back to this task at the stage the reader was on. */
  readonly onReturn: () => void;
  readonly onStage: (stage: DrillStage) => void;
  readonly onChoose: (choice: string) => void;
  readonly onStudied: () => void;
  readonly onLeave: () => void;
}

export function drillCard(m: DrillModel, on: DrillHandlers): Desc {
  const t = taskById(m.task);
  const rows: Child[] = [
    h("p", { key: "what", class: "legend" }, DRILL.what),
    h(
      "ul",
      { key: "tasks", class: "preset-chips", "aria-label": DRILL.tasks },
      ...DRILL_TASKS.map((x) =>
        h(
          "li",
          { key: x.id },
          h(
            "button",
            {
              key: "b",
              type: "button",
              class: "chip",
              "aria-pressed": x.id === m.task ? "true" : "false",
              onclick: () => on.onTask(x.id),
            },
            `${x.label} (${m.progress[x.id] ?? 0}/3)`,
          ),
        ),
      ),
    ),
  ];
  if (!t) return card(...rows);
  const answer = drillAnswer(t);
  rows.push(
    h("h3", { key: "task" }, t.label),
    h(
      "p",
      { key: "cleared", class: "legend" },
      DRILL.cleared(m.progress[t.id] ?? 0, LAST_STAGE + 1),
    ),
    h(
      "div",
      { key: "stages", class: "toolbar", role: "group", "aria-label": "Stage" },
      ...DRILL.stage.map((name, i) =>
        h(
          "button",
          {
            key: `s${i}`,
            type: "button",
            "aria-pressed": m.stage === i ? "true" : "false",
            onclick: () => on.onStage(i as DrillStage),
          },
          name,
        ),
      ),
    ),
    h("p", { key: "why", class: "summary" }, DRILL.stageWhy[m.stage]),
  );

  if (!m.onTask) {
    rows.push(
      h("p", { key: "off", class: "legend" }, DRILL.offTask),
      h(
        "button",
        { key: "return", type: "button", onclick: on.onReturn },
        DRILL.returnTo,
      ),
    );
  } else if (m.stage === 0) {
    rows.push(
      h("p", { key: "worked", class: "claim" }, DRILL.worked(answer.word)),
      runs(answer),
      h(
        "button",
        { key: "studied", type: "button", onclick: on.onStudied },
        DRILL.studied,
      ),
    );
  } else {
    const right = answer.word ?? "none";
    rows.push(
      h(
        "fieldset",
        { key: "ask", class: "predict" },
        h("legend", { key: "lg" }, DRILL.answer),
        ...answer.rows.map((r) =>
          choice(
            r.id,
            m.stage === 1 ? `depth ${r.depth}: ${r.word} = ${r.perm}` : r.word,
            m,
            on,
          ),
        ),
        choice("none", DRILL.none, m, on),
      ),
    );
    if (m.chosen !== null) {
      const ok = m.chosen === right;
      rows.push(
        h(
          "p",
          { key: "grade", class: "grade", role: "status" },
          ok ? DRILL.right : DRILL.wrong,
        ),
        h("p", { key: "worked", class: "claim" }, DRILL.worked(answer.word)),
        runs(answer),
      );
      if (ok && m.stage < LAST_STAGE)
        rows.push(
          h(
            "button",
            {
              key: "next",
              type: "button",
              onclick: () => on.onStage((m.stage + 1) as DrillStage),
            },
            DRILL.nextStage,
          ),
        );
    }
  }
  rows.push(
    h(
      "div",
      { key: "tools", class: "toolbar" },
      h("button", { key: "leave", type: "button", onclick: on.onLeave }, DRILL.leave),
    ),
  );
  return card(...rows);
}

function choice(id: string, text: string, m: DrillModel, on: DrillHandlers): Desc {
  return h(
    "label",
    { key: `c-${id}`, class: "ring-choice" },
    h("input", {
      key: "i",
      type: "radio",
      name: `drill-${m.task}-${m.stage}`,
      value: id,
      checked: m.chosen === id,
      onChange: () => on.onChoose(id),
    }),
    h("span", { key: "s" }, ` ${text}`),
  );
}

function runs(a: ReturnType<typeof drillAnswer>): Desc {
  return h(
    "div",
    { key: "runs" },
    h("h3", { key: "h" }, DRILL.runs),
    h(
      "ul",
      { key: "l", class: "claims" },
      ...a.rows.map((r) =>
        h(
          "li",
          { key: r.id, class: r.id === a.word ? "claim answer" : "claim" },
          r.verdict ? level(r.verdict, "lv") : null,
          ` depth ${r.depth}, ${r.perm}: `,
          r.verdict
            ? r.verdict.level === "⚠"
              ? `${r.verdict.method}.`
              : `${r.verdict.claim}.`
            : "not run.",
        ),
      ),
    ),
  );
}

function card(...body: Child[]): Desc {
  return h(
    "section",
    { key: "drill", class: "card drill", "aria-labelledby": "card-drill" },
    h("h2", { key: "t", id: "card-drill" }, DRILL.heading),
    ...body,
  );
}
