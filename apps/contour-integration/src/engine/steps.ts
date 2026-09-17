// **The argument in the order a lecturer gives it** — M8 step 3.1.
//
// `buildDerivation` groups its lines by the LEDGER's four passes, because that is the order they
// were established in and the order the evidence has to be read in to be checked. It is not the
// order an argument is told in. A lecturer says what is being integrated, then that the contour is
// legal, then what is caught, then — one at a time — what each of the other pieces does, then takes
// the limit, then solves for the target, then says what has been shown.
//
// This module is that regrouping and nothing else. **It computes nothing**: every line, statement,
// pole row and level is the one `buildDerivation` produced, moved into a different bucket. That is
// what makes the invariant in `test/steps.test.ts` meaningful — *every derivation line appears in
// exactly one step* — and it is why a step carries no verdict of its own: a step that could assemble
// one would be a second place the app decides what `=` means.
//
// **Two shapes were measured rather than assumed**, over all 28 records and all 94 fixtures:
//
//   1. **The residues.** 24 of the 28 have every enclosed pole's residue individually expressible at
//      every fixture, so each pole gets its own step. The other case is REAL and is the corpus's
//      own: D3 at `n = 5` and `n = 7` encloses five and seven poles of which ONE has an exact
//      residue, because `ℚ(ζ₁₀)` has degree 4 over `ℚ` and no root fits one quadratic extension —
//      the cyclotomic route computes the SUM without naming a root. F1 at the same `n` is the same
//      fact on a wedge. Those get ONE step, for the sum, which is exactly what the argument does.
//   2. **The limits.** A record has 0, 1 or 2 limit parameters — never more — and where there are
//      two they are a keyhole's `R → ∞` and `ε → 0⁺`, which a lecturer takes as two separate limits
//      with two separate bounds. So there is one limit step PER limit parameter, in parameter
//      order, and a record with none (the four unit-circle records) has no limit step at all, which
//      is right: nothing is being taken to a limit there.
import type { Params, Piece } from "./contour/model.js";
import {
  DERIVATION_STAGES,
  type Derivation,
  type DerivationLine,
  type DerivationStage,
  type PoleRow,
  type StageId,
  type Statement,
} from "./derivation.js";
import { limitArrow, stageTitle } from "./vocabulary.js";

/** What a step is about, for the stage to emphasise. Every field names something the app can find. */
export interface StepFocus {
  /** A piece of the contour, by `Piece.id` — the key the piece list, the stage and the strip share. */
  readonly pieceId?: string;
  /** An index into the step's own `poles`, which is also an index into `Derivation`'s pole rows. */
  readonly poleIndex?: number;
  readonly cutId?: string;
  /** A contour parameter, by name — the one the limit step takes to its limit. */
  readonly param?: string;
}

export type StepKind =
  | "problem"
  | "hypotheses"
  | "residues"
  | "boundary"
  | "limit"
  | "target"
  | "conclusion";

export interface DerivationStep {
  /** Stable across recomputes of the same argument, so a stepper can hold its place. */
  readonly id: string;
  readonly kind: StepKind;
  readonly title: string;
  /** Why this step is in the argument at all — the STAGE's standing rationale, never invented here. */
  readonly why: string;
  readonly statements: readonly Statement[];
  readonly lines: readonly DerivationLine[];
  readonly poles: readonly PoleRow[];
  readonly focus: StepFocus;
  /** `"limit"` marks the step step 3.2 gives a play control to. */
  readonly action?: "limit";
  /** True when any line in this step failed — what a stepper opens on. */
  readonly failed: boolean;
}

export interface StepsInput {
  /** The same piece list `buildDerivation` was given, so `pieceId` resolves the same way. */
  readonly spec: readonly Piece[];
  /** The same contour's parameters — where the limits are declared. */
  readonly params: Params;
}

const stageOf = (d: Derivation, id: StageId): DerivationStage | undefined =>
  d.stages.find((s) => s.id === id);

/**
 * A stage's standing rationale, from the METHOD rather than from this argument.
 *
 * **Read from `DERIVATION_STAGES`, not from the emitted stage**, because `buildDerivation` drops a
 * stage that came out empty — so `stageOf(d, "setup")?.why` is `""` for a caller that supplied no
 * problem statements, and a step would then carry a blank explanation of why it exists. The
 * rationale is a property of the method and exists whether or not this particular argument had
 * anything to put in that stage.
 */
const whyOf = (id: StageId): string => DERIVATION_STAGES.find((s) => s.id === id)?.why ?? "";

const failedIn = (lines: readonly DerivationLine[]): boolean =>
  lines.some((l) => l.status === "failed");

/** A pole the contour winds about. Undecided windings are not enclosed: they are not decided. */
const enclosed = (rows: readonly PoleRow[]): { readonly row: PoleRow; readonly index: number }[] =>
  rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.windingDecided && row.winding !== undefined && row.winding !== 0);

/**
 * The residue steps.
 *
 * The CATCH lines are about the singular set as a whole — how many are enclosed, whether every
 * residue is exact — so they ride on the FIRST residue step rather than being repeated on each.
 * With no enclosed pole there is still one step: *no singularity is enclosed* is a claim the
 * argument makes and E3 and F2 exist to make it.
 */
function residueSteps(catchStage: DerivationStage | undefined): DerivationStep[] {
  const lines = catchStage?.lines ?? [];
  const rows = catchStage?.poles ?? [];
  const why = whyOf("catch");
  const title = stageTitle("catch");
  const found = enclosed(rows);
  const individually = found.length > 0 && found.every(({ row }) => row.residue !== undefined);
  if (!individually) {
    return [
      {
        id: "residues",
        kind: "residues",
        title,
        why,
        statements: catchStage?.statements ?? [],
        lines,
        poles: rows,
        focus: {},
        failed: failedIn(lines),
      },
    ];
  }
  // **The poles the contour does NOT wind about ride on the first step**, with the lines that are
  // about the singular set as a whole. Dropping them was the first draft and the corpus caught it:
  // `1/(1+z⁴)` has four poles and encloses two, and A5's own prose is *the sum over all four
  // residues is 0* — an argument that never mentions the other two has lost the reason the
  // half-plane matters. Fifteen rows across seven records were reaching no step at all.
  const outside = rows.filter((row) => !found.some((f) => f.row === row));
  return found.map(({ row, index }, k) => ({
    id: `residues:${index}`,
    kind: "residues" as const,
    title,
    why,
    statements: k === 0 ? (catchStage?.statements ?? []) : [],
    lines: k === 0 ? lines : [],
    poles: k === 0 ? [row, ...outside] : [row],
    focus: { poleIndex: index },
    failed: k === 0 && failedIn(lines),
  }));
}

/**
 * One step per non-target piece, in contour order.
 *
 * Measured: the KILL pass emits exactly one line per piece, the target's included (*"the target
 * piece — declared by its role"*). That line is not a boundary term, so it travels with the target
 * step, which is where a reader meets the claim it supports.
 */
function boundarySteps(
  killStage: DerivationStage | undefined,
  spec: readonly Piece[],
): DerivationStep[] {
  const lines = killStage?.lines ?? [];
  const why = whyOf("kill");
  return spec
    .filter((p) => p.role !== "target")
    .map((piece) => {
      const mine = lines.filter((l) => l.pieceId === piece.id);
      return {
        id: `boundary:${piece.id}`,
        kind: "boundary" as const,
        title: `${stageTitle("kill")} · ${piece.name}`,
        why,
        statements: [],
        lines: mine,
        poles: [],
        focus: { pieceId: piece.id },
        failed: failedIn(mine),
      };
    });
}

/**
 * One step per limit parameter — see the header for why it is per parameter and not one step.
 *
 * It carries **no lines**: the bound and its limit are stated on the boundary step of the piece
 * they belong to, and a second levelled copy here would be the same claim twice with two chances to
 * drift. What it carries is the limit being taken, which is a statement about the argument's shape.
 */
function limitSteps(params: Params): DerivationStep[] {
  return Object.values(params)
    .filter((p) => p.limit !== undefined)
    .map((p) => ({
      id: `limit:${p.name}`,
      kind: "limit" as const,
      title: `Let $${p.name} ${limitArrow(String(p.limit?.to ?? ""))}$`,
      why: "The bounds above hold at every finite value; the argument needs the limit.",
      statements: [
        {
          label: p.name,
          text: `$${p.name} ${limitArrow(String(p.limit?.to ?? ""))}$, from $${p.name} = ${p.value}$`,
        },
      ],
      lines: [],
      poles: [],
      focus: { param: p.name },
      action: "limit" as const,
      failed: false,
    }));
}

/**
 * The lecturer's order, as steps.
 *
 * Everything `buildDerivation` produced, regrouped — nothing computed, nothing dropped.
 */
export function buildSteps(derivation: Derivation, input: StepsInput): DerivationStep[] {
  const setup = stageOf(derivation, "setup");
  const legality = stageOf(derivation, "legality");
  const kill = stageOf(derivation, "kill");
  const cover = stageOf(derivation, "cover");
  const solve = stageOf(derivation, "solve");
  const verdict = stageOf(derivation, "verdict");

  // The target piece's KILL line, which is a claim ABOUT the target and travels with it.
  const targetIds = new Set(input.spec.filter((p) => p.role === "target").map((p) => p.id));
  const targetKill = (kill?.lines ?? []).filter((l) => l.pieceId !== undefined && targetIds.has(l.pieceId));
  // A KILL line naming no piece, or naming one the spec does not carry, would otherwise vanish.
  const orphanKill = (kill?.lines ?? []).filter(
    (l) => l.pieceId === undefined || !input.spec.some((p) => p.id === l.pieceId),
  );

  const targetLines = [...(cover?.lines ?? []), ...targetKill, ...orphanKill, ...(solve?.lines ?? [])];

  const steps: DerivationStep[] = [
    {
      id: "problem",
      kind: "problem",
      title: stageTitle("setup"),
      why: whyOf("setup"),
      statements: setup?.statements ?? [],
      lines: setup?.lines ?? [],
      poles: [],
      focus: {},
      failed: failedIn(setup?.lines ?? []),
    },
    {
      id: "hypotheses",
      kind: "hypotheses",
      title: stageTitle("legality"),
      why: whyOf("legality"),
      statements: legality?.statements ?? [],
      lines: legality?.lines ?? [],
      poles: [],
      focus: {},
      failed: failedIn(legality?.lines ?? []),
    },
    ...residueSteps(stageOf(derivation, "catch")),
    ...boundarySteps(kill, input.spec),
    ...limitSteps(input.params),
    {
      id: "target",
      kind: "target",
      title: stageTitle("solve"),
      why: whyOf("solve"),
      statements: [...(cover?.statements ?? []), ...(solve?.statements ?? [])],
      lines: targetLines,
      poles: [],
      // The target piece, when the target is on the contour at all: tier G's is a term of the
      // residue sum, and there is no piece to point at.
      focus: targetIds.size > 0 ? { pieceId: [...targetIds][0] } : {},
      failed: failedIn(targetLines),
    },
    {
      id: "conclusion",
      kind: "conclusion",
      title: stageTitle("verdict"),
      why: whyOf("verdict"),
      statements: verdict?.statements ?? [],
      lines: verdict?.lines ?? [],
      poles: [],
      focus: {},
      failed: failedIn(verdict?.lines ?? []),
    },
  ];
  // **A step with nothing in it is not a step.** It can only happen where a caller supplied no
  // problem statements — `buildDerivation` drops an empty stage, so there is nothing to show and a
  // stepper would offer a blank card with a title on it. The limit steps always carry their own
  // statement, so nothing that says something is ever dropped here.
  return steps.filter((s) => s.statements.length > 0 || s.lines.length > 0 || s.poles.length > 0);
}
