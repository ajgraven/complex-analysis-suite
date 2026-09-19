// The Result card — the answer, and what is holding it up.
//
// M8 step 1.5. The old shell split this across two cards: the `∮ f(z) dz` card carried the value and
// the quadrature, the "Does the argument close?" card carried the headline and the hypothesis rows.
// A reader had to look in two places to learn whether the number above was one they could use. Here
// it is one card, and the order is the reading order: **the badge and the value, the headline, then
// the hypotheses, then the numerics.**
//
// Three disclosures whose DEFAULT is computed rather than fixed:
//
//  - the hypothesis table opens when a row has failed, because a refused argument is one whose
//    reason a reader is now looking for;
//  - the numerics open when there is no exact value to lead with, or when the value was refused —
//    the cases where the approximate number IS the answer rather than the corroboration;
//  - and in both, an explicit click WINS and survives every recompute, which is what `session.open`
//    is for: `undefined` means "never touched", not "closed".
import { fmtCx } from "../../kernel/decimal.js";
import { integralRefusal, ledgerHeadline, type LedgerResult } from "../../engine/ledger.js";
import { RESIDUE_THEOREM_IDENTITY } from "../../engine/residueTheorem.js";
import type { ContourIntegral } from "../../engine/contour/integrate.js";
import type { ResidueTheoremResult } from "../../engine/residueTheorem.js";
import type { Piece } from "../../engine/contour/model.js";
import type { PoleReport } from "../../kernel/poles.js";
import { constraintLabel } from "../../engine/vocabulary.js";
import { rowKeys } from "../../engine/contrast.js";
import { drillMask } from "../drillPanel.js";
import { fmtApprox, fmtNum } from "../format.js";
import { h, type Child, type Desc } from "../dom.js";
import { math, mathText } from "../math.js";
import { card, disclosure, nothing, type Card, type CardContext } from "./card.js";

/** `=` / `≤` / `≈` / `⚠` as the square stamp `theme.css` draws. */
const badge = (level: string, key = "b"): Desc =>
  h("span", { key, class: "badge", "data-level": level }, level);


/** Everything the card reads, gathered once — a record's from its run, the sandbox's from `analyse`. */
interface Facts {
  readonly ledger: LedgerResult | null;
  readonly integral: ContourIntegral | null;
  readonly theorem: ResidueTheoremResult | null;
  readonly poles: PoleReport | null;
  /** Pass 5's answer to what the RECORD asked, which is not `∮` (C1: `∮ = 0` and the integral is π/2). */
  readonly solved: { readonly value: number; readonly text?: string; readonly latex?: string } | null;
  /**
   * The pieces the ledger's rows name — for `rowKeys`, and for nothing else here.
   *
   * A contrast rung declares which rows it moves as `(constraint, role, ordinal)` keys, because the
   * two arguments being compared do not have the same rows in the same order (`engine/contrast.ts`
   * is entirely about that), and turning one of those keys back into a row of THIS ledger needs the
   * role of each row's piece.
   */
  readonly pieces: readonly { readonly id: string; readonly role: Piece["role"] }[];
}

function factsOf(ctx: CardContext): Facts {
  const { resolution } = ctx;
  if (resolution.kind === "gallery") {
    const run = resolution.run;
    return {
      ledger: run?.ledger ?? null,
      integral: run?.integral ?? null,
      theorem: run?.theorem ?? null,
      poles: run?.poles ?? null,
      solved: resolution.solved,
      pieces: run?.contour.pieces ?? [],
    };
  }
  if (resolution.kind === "plain" || resolution.kind === "declared") {
    const a = resolution.analysis;
    return {
      ledger: a.ledger,
      integral: a.integral,
      theorem: a.theorem,
      poles: ctx.poles,
      solved: null,
      pieces: ctx.state.contour.pieces,
    };
  }
  return { ledger: null, integral: null, theorem: null, poles: null, solved: null, pieces: [] };
}

export const resultCard: Card = (ctx) => {
  const { ledger, integral, theorem, poles, solved, pieces } = factsOf(ctx);
  // **A worked example that could not RUN is not an app with no integrand** — M8 step 2.4. It has
  // one, and a reason it did not get an answer from it, and the reason was reachable only from the
  // Derivation card: this card said "There is no integrand", which is false in the one place a
  // reader is looking for an explanation.
  if (ctx.resolution.kind === "gallery" && ctx.resolution.fatal !== null) {
    return card("result", nothing(`This worked example could not be run: ${ctx.resolution.fatal}`));
  }
  if (ledger === null || integral === null) return card("result", nothing("There is no integrand."));

  // **The drill's mask, read here rather than re-derived.** `drillMask` is the one decision (its own
  // module records why); this card is one of its three readers, and the rung it hides most of is the
  // one whose question is "which contour?" — where the value and the whole ledger ARE the answer.
  const mask = drillMask(ctx);
  if (mask === "argument") {
    return card("result", nothing("Hidden until a contour is chosen."));
  }

  const failed = ledger.rows.some((r) => r.status === "failed");
  const refused = integralRefusal(integral, ledger);

  const head: Child[] = [
    // **The HEADLINE first**, because "does this argument close?" is the product. It is a `$…$`
    // sentence from `vocabulary.ts`, so it is typeset like everything else in the rail.
    h(
      "p",
      { key: "headline", class: ledger.closes ? "headline closes" : "headline open" },
      ...mathText(ledgerHeadline(ledger), "hl"),
    ),
  ];

  if (refused !== null) {
    // **No number. Not a greyed-out number, not a number with a warning beside it — none.**
    head.push(
      h("p", { key: "ref", class: "verdict" }, badge("⚠"), " Refused"),
      h("p", { key: "why", class: "muted small" }, refused.claim),
      refused.repair === undefined ? null : h("p", { key: "fix", class: "repair small" }, refused.repair),
    );
  } else {
    // **What the RECORD asked for leads, where there is one.** C1 makes this unavoidable: its
    // contour encloses nothing, so `∮ = 0` while the integral it determines is π/2.
    if (solved !== null && (solved.latex !== undefined || solved.text !== undefined)) {
      head.push(
        h(
          "div",
          { key: "solved", class: "resultValue" },
          badge(ctx.resolution.kind === "gallery" ? levelOfSolved(ctx) : "≈"),
          solved.latex === undefined
            ? h("span", { key: "t", class: "num" }, solved.text ?? "")
            : math(solved.latex, { key: "m", display: true, label: solved.text ?? "" }),
        ),
        h("p", { key: "solvedName", class: "muted small" }, "the integral this contour determines"),
      );
    }
    // The exact `∮`, when the residue theorem could supply one: it comes from a FORMULA rather than
    // from integrating, and the quadrature below is the corroboration rather than the source.
    if (theorem?.exactValue !== undefined) {
      const field =
        poles?.radicand === null || poles?.radicand === undefined ? "ℚ(i)" : `ℚ(i)(√${poles.radicand})`;
      head.push(
        h(
          "div",
          { key: "exact", class: "resultValue" },
          badge(theorem.verdict.level),
          math(theorem.exactValue.latex, { key: "m", display: true, label: theorem.exactValue.text }),
        ),
        // The IDENTITY, from the result rather than from a literal: a dogbone is solved by a
        // different equation, and printing the plain one above its answer states the very equation
        // D6 exists to show is inapplicable.
        h(
          "p",
          { key: "id", class: "muted small" },
          ...mathText(
            `${(theorem.identity ?? RESIDUE_THEOREM_IDENTITY).replace("∮ f dz = ", "")}, from exact residues over ${field}`,
            "idn",
          ),
        ),
      );
    } else if (integral.value !== undefined) {
      head.push(
        h(
          "div",
          { key: "approx", class: "resultValue" },
          badge(integral.verdict.level),
          h("span", { key: "v", class: "num" }, fmtApprox(integral.value, worstError(integral))),
        ),
        h("p", { key: "approxName", class: "muted small" }, "∮ f(z) dz, by quadrature"),
      );
    }
    for (const r of integral.verdict.restrictions) {
      head.push(h("p", { key: `r:${r}`, class: "restriction small" }, r));
    }
  }

  // ── the hypotheses ────────────────────────────────────────────────────────────────────────
  // At rung ii the KILL column is the reader's to supply, so its rows come off the table — which is
  // exactly what the drill's own questions ask for, one per piece. The rest of the ledger stays: the
  // rung is about what each piece is FOR, not about whether the hypotheses hold.
  // Carried WITH its index in the whole ledger, because the row's contrast key is computed over the
  // whole ledger and `indexOf` on a row object would be an identity lookup where two rows are equal.
  const shown = ledger.rows
    .map((row, at) => ({ row, at }))
    .filter(({ row }) => mask !== "kill" || row.constraint !== "KILL");
  // **The contrast's declared rows, marked where they land in THIS ledger** — M8 step 3.5. Keyed
  // over `ledger.rows` and not over `shown`, and the sweep's answer to that is worth writing down:
  // keying over `shown` is EQUIVALENT, provably rather than by luck. A `RowKey`'s ordinal counts
  // within its own `(constraint, role)` bucket, and the one filter this card applies — the drill's
  // rung ii — removes a whole CONSTRAINT, so no surviving bucket is renumbered. The whole ledger is
  // keyed anyway because that equivalence is a property of today's mask and not of the alignment: a
  // filter that dropped one KILL row would renumber the rest, and this would then be wrong in the
  // silent way `engine/contrast.ts` exists because of.
  const keys = rowKeys(ledger.rows, pieces);
  const declared = new Set(ctx.session.contrast?.rows ?? []);
  const rows = shown.map(({ row, at }, i) => {
    const marked = declared.has(keys[at]);
    return h(
      "li",
      {
        key: `row:${i}`,
        class: `checkRow ${row.status}`,
        ...(marked ? { "data-change": "declared" } : {}),
      },
      badge(row.status === "failed" ? "⚠" : row.evidence.level, "lv"),
      h("span", { key: "c", class: "tag" }, constraintLabel(row.constraint)),
      h("span", { key: "t", class: "claim" }, ...mathText(row.claim, `c${i}`)),
      // **Said in text, not drawn in an outline alone.** `data-change` carries the colour; this is
      // the sentence a reader who cannot see it gets, and it names the ladder so the mark is
      // attached to the thing that made it rather than being a highlight from nowhere.
      marked ? h("span", { key: "ch", class: "srOnly" }, " — this is the check the contrast changes") : null,
      row.repair === undefined ? null : h("p", { key: "fix", class: "repair small" }, row.repair),
    );
  });
  const hypotheses = disclosure(
    ctx,
    "result:hypotheses",
    failed,
    // The summary says how many and whether any failed, so a reader deciding whether to open it does
    // not have to open it to find out.
    //
    // **NOT "Hypotheses".** That is `vocabulary.ts`'s name for the LEGALITY group alone, and this
    // table is every row of the ledger — all four constraints. The first draft used it, and a
    // browser pass put `Hypotheses — 6 checked` here beside the Derivation card's `Hypotheses —
    // 2 steps` for the LEGALITY stage, two cards apart, inviting a reader to take one for a subset
    // of the other. Step 0.2's decision is that the reader's words are decided in one file; a card
    // that spends one of them on a wider set is the same drift from the other end.
    failed
      ? `What was checked — ${shown.filter(({ row }) => row.status === "failed").length} of ${shown.length} failed`
      : `What was checked — ${shown.length} rows`,
    h("ul", { key: "l", class: "checkList" }, ...rows),
  );

  // ── the numerics ──────────────────────────────────────────────────────────────────────────
  const numerics = disclosure(
    ctx,
    "result:numerics",
    refused !== null || theorem?.exactValue === undefined,
    "Numerics",
    ...numericBody(integral, theorem),
  );

  // **Why there is no target value, where there is a ledger and no answer** — M8 step 2.4. The solve
  // may refuse while the run itself is sound (a rank-deficient system, a route this example does not
  // carry), and `StateResolution.note` has held that sentence since step 1.1 with no reader at all:
  // the card showed `∮` and left the integral the example set out to determine unmentioned.
  const note =
    ctx.resolution.kind === "gallery" && ctx.resolution.note !== null && solved === null
      ? h("p", { key: "why", class: "muted small" }, ...mathText(`No value for the target: ${ctx.resolution.note}`, "rn"))
      : null;

  return card("result", ...head, hypotheses, numerics, note);
};

/** The badge Pass 5's own certificates carry — never a literal, never the ledger's meet. */
function levelOfSolved(ctx: CardContext): string {
  const r = ctx.resolution;
  if (r.kind !== "gallery" || r.run === null) return "≈";
  // The record's own verdict about the SOLVED value is the theorem's where there is one: the
  // ledger's meet carries the arc bound's `≤`, which is a true statement about the weakest step and
  // a false one about the answer (DESIGN §4 Pass 3).
  return r.run.theorem.exactValue !== undefined ? r.run.theorem.verdict.level : r.run.integral.verdict.level;
}

/** The worst per-piece convergence estimate — what limits how many digits the total may show. */
function worstError(integral: ContourIntegral): number {
  return Math.max(0, ...integral.pieces.map((p) => p.errorEstimate));
}

function numericBody(integral: ContourIntegral, theorem: ResidueTheoremResult | null): Child[] {
  // **Three states, not two: agreement, disagreement, and NOTHING TO COMPARE.** Folding the third
  // into the second announced a disagreement of exactly 0.00e+0 for a keyhole, which reads as a
  // contradiction where there was simply no second route.
  if (integral.quadratureSkipped !== undefined) {
    return [
      h("p", { key: "skip", class: "verdict" }, badge("?"), " no quadrature to compare against"),
      h("p", { key: "why", class: "muted small" }, integral.quadratureSkipped),
    ];
  }
  const err = worstError(integral);
  const out: Child[] = [];
  if (integral.value !== undefined) {
    out.push(
      h(
        "p",
        { key: "v", class: "verdict" },
        badge("≈", "vb"),
        h("span", { key: "n", class: "num" }, fmtApprox(integral.value, err)),
      ),
    );
  }
  if (theorem?.exactValue !== undefined) {
    out.push(
      h(
        "p",
        { key: "cc", class: "verdict" },
        badge(theorem.crossCheck?.level ?? "⚠", "cb"),
        theorem.crossCheck !== undefined
          ? ` quadrature agrees to ${(theorem.disagreement ?? 0).toExponential(2)}`
          : ` the quadrature disagrees by ${(theorem.disagreement ?? 0).toExponential(2)} — one of them is wrong`,
      ),
    );
  }
  out.push(
    h(
      "table",
      { key: "tbl", class: "numTable" },
      h(
        "thead",
        { key: "h" },
        h(
          "tr",
          { key: "r" },
          h("th", { key: "p", scope: "col" }, "piece"),
          h("th", { key: "v", scope: "col" }, "value"),
          h("th", { key: "n", scope: "col" }, "nodes"),
          h("th", { key: "e", scope: "col" }, "Δ refine"),
        ),
      ),
      h(
        "tbody",
        { key: "b" },
        ...integral.pieces.map((p) =>
          h(
            "tr",
            { key: `p:${p.pieceId}` },
            h("td", { key: "p" }, p.pieceId),
            h("td", { key: "v", class: "num" }, fmtCx(p.value)),
            h("td", { key: "n", class: "num" }, fmtNum(p.nodes, 0)),
            h("td", { key: "e", class: "num" }, p.errorEstimate.toExponential(1)),
            p.capped ? h("td", { key: "c" }, h("span", { key: "t", class: "tag warn" }, "capped")) : null,
          ),
        ),
      ),
    ),
    // **The honest label on the whole disclosure**, and the reason it is not a bound: `Δ refine` is
    // `|I_fine − I_coarse|`, which is how far the rule MOVED when it was refined, not how far it is
    // from the answer. A reader who reads it as an error bar is reading a bound the app never had.
    h(
      "p",
      { key: "note", class: "muted small" },
      "Δ refine is |I_fine − I_coarse| — a convergence estimate, not a proved error bound.",
    ),
  );
  return out;
}
