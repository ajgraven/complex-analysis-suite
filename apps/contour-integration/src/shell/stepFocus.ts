// What the stage draws when the reader is stepping — M8 step 3.1c.
//
// A `DerivationStep` says what it is ABOUT (`StepFocus`: a piece id, a pole index, a parameter
// name); this turns that into things on the plane — which pieces to emphasise, which pole to ring,
// which handle to pulse, and what to put on a chip beside each. It is a pure function of the draw,
// so the stage computes nothing about the argument: every number and every sentence on a callout is
// one the ledger already minted.
//
// **Three things were measured over the corpus before this was written**, and each changed it:
//
//  1. **A step can be about TWO pieces.** `focus.pieceId` is one id, and `buildSteps` fills the
//     target step's with `[...targetIds][0]` — but C1 and C3 split the real axis at the indentation
//     and both halves are the target. Emphasising `left` and dimming `right` would say the argument
//     is about half of its own target. So the set is `focus.pieceId` together with every piece the
//     step's own LINES name, which is read from the data rather than re-derived: measured over 237
//     steps in 28 records, that widens exactly 2 of them, and both are that one shape.
//  2. **A limit parameter need not have a handle.** `handlesOf` makes one for a parameter-bound ARC
//     radius and for nothing else, so E1/E2/E3's `R` (a rectangle's width) and G1/G2/G3's `N` (a
//     square's half-width) have none — 6 limit steps with nothing on the plane to pulse. There is no
//     chip there rather than a chip at an invented place.
//  3. **Three boundary steps carry no bound**, because their piece REPRODUCES the target rather
//     than vanishing (*the lower edge of the cut: a constant multiple of the target*, D1/D3/D6).
//     The callout is the first `$…$` of the line, so those get none — 54 of 57 boundary steps have
//     one, and in the other three there is no number to show.
import type { Derivation, PoleRow } from "../engine/derivation.js";
import type { DerivationStep } from "../engine/steps.js";
import type { Handle } from "../engine/contour/edit.js";
import type { Piece } from "../engine/contour/model.js";
import type { Cx, Resolved } from "../kernel/geom.js";
import { pointAt } from "../kernel/geom.js";
import type { Level } from "@cas/rigor";

/** A chip on the plane: a point, a sentence, and the level the sentence was established at. */
export interface Callout {
  /** Stable across draws of the same step, so `patch` keeps the node — and the pulse fires once. */
  readonly key: string;
  readonly at: Cx;
  /** A `$…$` sentence in this app's convention, or plain text where the value is not LaTeX. */
  readonly text: string;
  /** The badge, where the claim has one. A residue row carries no level and says so by carrying none. */
  readonly level: Level | null;
  /** The limit step's chip, which announces itself once — see `shell.css`'s `stepPulse`. */
  readonly pulse?: boolean;
}

/** Everything the step in hand puts on the plane. */
export interface StageFocus {
  /** Indices into the DRAWN piece list. Empty means no focus, and nothing is dimmed. */
  readonly pieces: readonly number[];
  /** The pole this step is about, to be ringed. */
  readonly pole: Cx | null;
  readonly callouts: readonly Callout[];
}

export const NO_FOCUS: StageFocus = { pieces: [], pole: null, callouts: [] };

/** The derivation's pole rows. Only CATCH has any, which is what makes one flat list the right one. */
const poleRows = (derivation: Derivation): readonly PoleRow[] =>
  derivation.stages.flatMap((s) => s.poles);

/**
 * The first formula in a sentence — the claim's own number, without the sentence around it.
 *
 * The KILL line reads *"the arc: $\left|\int f\,dz\right| \le 4.928e-2$ at $R = 4$, and $\to 0$ as
 * $R \to \infty$, since …"*, which is a paragraph and not a chip. The plan's example is
 * `$|\int_{\Gamma_R} f\,dz| \le 0.0493$` — the first formula and nothing else — and measured over
 * the corpus that fragment is the right one in every case: a vanishing piece gives its bound, a
 * reproducing piece gives its relation (`$\arg z = 2\pi^-$`, `$\log z = \log x + 2\pi i$`), an
 * indentation gives its known limit (`$i\alpha\operatorname{Res} = \pi(-i)$`).
 */
export function firstFormula(sentence: string): string | null {
  const m = /\$([^$]+)\$/.exec(sentence);
  return m === null ? null : `$${m[1]}$`;
}

/** The midpoint of a piece by parameter — where a chip about the whole piece belongs. */
const midpoint = (g: Resolved | undefined): Cx | null => (g === undefined ? null : pointAt(g, 0.5));

export interface FocusInput {
  readonly step: DerivationStep;
  readonly derivation: Derivation;
  /** The piece list as DRAWN, in the order the stage draws it — the indices are into this. */
  readonly pieces: readonly Piece[];
  readonly resolved: readonly Resolved[];
  readonly handles: readonly Handle[];
}

/**
 * The step, as things on the plane.
 *
 * Nothing here decides a level or composes a claim: a callout's badge is the line's own `level`, and
 * the target's is the conclusion's, which is the badge the Result card and the Derivation card's
 * own footer already show. A chip that minted one would be PLAN §9's R2 on the stage.
 */
export function stageFocus(input: FocusInput): StageFocus {
  const { step, derivation, pieces, resolved, handles } = input;

  // **The union, not the single id** — finding 1 in the header. `focus.pieceId` first, so the
  // step's own subject leads; a line naming a piece the spec does not carry names nothing.
  //
  // **One guard, not two.** The first draft also asked `pieces.some(p => p.id === id)` here; the
  // sweep found that mutant alive, and the reason is that the `findIndex` below already returns
  // −1 for an id the drawn list does not carry and the filter already drops it. Two spellings of
  // one rule is what this project removes, so the membership test is the one that produces the
  // index rather than a second one beside it.
  const ids: string[] = [];
  const add = (id: string | undefined): void => {
    if (id !== undefined && !ids.includes(id)) ids.push(id);
  };
  add(step.focus.pieceId);
  for (const line of step.lines) add(line.pieceId);
  const indices = ids.map((id) => pieces.findIndex((p) => p.id === id)).filter((i) => i >= 0);

  const row = step.focus.poleIndex === undefined ? undefined : poleRows(derivation)[step.focus.poleIndex];
  const pole = row?.at ?? null;

  const callouts: Callout[] = [];
  if (step.kind === "boundary") {
    // One line per piece (`boundarySteps`'s own measurement), so the first is the piece's claim.
    const line = step.lines[0];
    const at = midpoint(resolved[indices[0] ?? -1]);
    const text = line === undefined ? null : firstFormula(line.text);
    if (line !== undefined && at !== null && text !== null) {
      callouts.push({ key: `b:${step.id}`, at, text, level: line.level });
    }
  } else if (step.kind === "residues" && row !== undefined && pole !== null) {
    // **The residue as the pole table prints it**, which is plain text rather than LaTeX: it comes
    // out of `fmt`/the exact formatter as `−√2/8 − i√2/8`, and typesetting that would mean parsing
    // the app's own output back into mathematics. No level, because a pole row carries none — the
    // levelled claim about the residues is the CATCH line, on the same step.
    if (row.residue !== undefined) {
      callouts.push({ key: `r:${step.id}`, at: pole, text: `Res = ${row.residue}`, level: null });
    }
  } else if (step.kind === "limit" && step.focus.param !== undefined) {
    // Finding 2: where the parameter has no handle there is nothing on the plane to point at.
    const handle = handles.find((hd) => hd.param === step.focus.param);
    const said = step.statements[0]?.text;
    if (handle !== undefined && said !== undefined) {
      callouts.push({ key: `l:${step.id}`, at: handle.at, text: said, level: null, pulse: true });
    }
  } else if (step.kind === "target") {
    // The value the target piece carries, badged from the CONCLUSION's own evidence — the same
    // pair the card's footer shows, so the chip and the footer cannot come to disagree.
    const at = midpoint(resolved[indices[0] ?? -1]);
    const conclusion = derivation.conclusion;
    if (at !== null && conclusion !== undefined) {
      callouts.push({
        key: `t:${step.id}`,
        at,
        text: `${conclusion.label} = ${conclusion.text}`,
        level: conclusion.level,
      });
    }
  }

  return { pieces: indices, pole, callouts };
}
