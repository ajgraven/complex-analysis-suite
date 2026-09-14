// Aligning two ledgers, and saying exactly how they differ.
//
// **WHY THIS IS NOT `rows[i]` vs `rows[i]`.** M7.1's contrast grid shows five arguments side by side
// and claims that each differs from the one above it in a named set of rows. That claim is only
// meaningful if the rows are PAIRED correctly, and the pairing cannot be by index: C1 carries nine
// rows where B1 carries seven, so from its indentation onward every index is off by two and the one
// row the grid exists to point at is buried in the shift.
//
// **AND IT CANNOT BE BY `pieceId` EITHER, which measuring found rather than reasoning.** B1 names
// its target piece `realAxis`; the sandbox's semicircle template names the same row's piece
// `diameter`. They are the same row of the same argument — the real segment that is what the
// argument solves for — so an id-keyed alignment reports "one row removed, one row added" where one
// row's status changed, which is the opposite of what the grid is for. The two ids are both correct
// in their own file and neither is going to be renamed to suit this module.
//
// So the key is **(constraint, role, ordinal)**: which of the four Closing-Ledger constraints the row
// belongs to, what the piece it names is FOR, and which one it is among rows sharing both. The
// ordinal is needed because `(constraint, role)` is not unique inside one ledger — C1 has two
// KILL/target rows (the real axis either side of its indentation) and two KILL/vanish rows (the
// indentation and the big arc). It is stable because the ledger emits rows in piece order and a
// contour's piece order is part of the record.
//
// Pure, DOM-free, and it knows nothing about the shell: it takes two ledgers and their piece lists.

import type { Piece, PieceRole } from "./contour/model.js";
import type { ConstraintId, LedgerResult, LedgerRow } from "./ledger.js";

/**
 * A row's identity for the purpose of comparing two arguments.
 *
 * Serialised as `CONSTRAINT/role#n` so it can be declared in a datum, printed in a test failure and
 * used as an object key without a second representation.
 */
export type RowKey = string;

/** The role a keyless row (one naming no piece) is filed under — LEGALITY, CATCH and COVER rows. */
const WHOLE_ARGUMENT: PieceRole | "argument" = "argument";

/** `(constraint, role, ordinal)`, as a string. Ordinals count within the (constraint, role) bucket. */
export function rowKeys(
  rows: readonly LedgerRow[],
  pieces: readonly Pick<Piece, "id" | "role">[],
): readonly RowKey[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const role =
      row.pieceId === undefined
        ? WHOLE_ARGUMENT
        : (pieces.find((p) => p.id === row.pieceId)?.role ?? WHOLE_ARGUMENT);
    const bucket = `${row.constraint}/${role}`;
    const n = seen.get(bucket) ?? 0;
    seen.set(bucket, n + 1);
    return `${bucket}#${n}`;
  });
}

/** One side of a comparison: a ledger with the piece list its rows name. */
export interface ContrastSide {
  readonly ledger: LedgerResult;
  readonly pieces: readonly Pick<Piece, "id" | "role">[];
  /**
   * What the argument ESTABLISHES, which is not always `ledger.value`.
   *
   * C1's `∮` is exactly 0 while the integral it determines is `π/2` — the whole content of the
   * record — so a grid that showed `ledger.value` would print `0` under the cell that exists to
   * teach where `∮` stops being the answer. The caller supplies the solved answer when there is
   * one (gallery mode's Pass 5) and `ledger.value` otherwise.
   */
  readonly answer: string | null;
}

/** How one row differs between two aligned arguments. */
export interface RowDelta {
  readonly key: RowKey;
  /** `added` / `removed` are about the SECOND side: a row it has that the first does not, and so on. */
  readonly kind: "added" | "removed" | "status" | "claim";
  readonly from?: string;
  readonly to?: string;
}

export interface ContrastDiff {
  /** Every row that is not identical between the two, keyed and sorted for a stable declaration. */
  readonly rows: readonly RowDelta[];
  /** Just the keys, sorted — what a `contrasts` datum declares and a test compares against. */
  readonly keys: readonly RowKey[];
  /** Did the argument's own outcome move? Separate from the rows, because it is not one. */
  readonly closes: { readonly from: boolean; readonly to: boolean } | null;
  readonly failedAt: { readonly from: ConstraintId | null; readonly to: ConstraintId | null } | null;
  readonly answer: { readonly from: string | null; readonly to: string | null } | null;
  /**
   * Pieces carrying a non-vanishing known limit (`pieceLimits`), when the two sides disagree.
   *
   * This is a difference the ROWS do not carry: a `vanish` piece that contributes `iα·Res` has a
   * satisfied KILL row either way, and what changed is that Pass 5 now has a term to use.
   */
  readonly pieceLimits: { readonly from: readonly string[]; readonly to: readonly string[] } | null;
}

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * What changed between two arguments, row by row under {@link rowKeys}.
 *
 * A row present on both sides is compared on `status` first and `claim` second, and only one delta is
 * emitted for it: a row that both failed and changed its wording is reported as a status change,
 * because that is the stronger fact and reporting both would make a declaration ambiguous about
 * which it meant.
 */
export function diffLedgers(from: ContrastSide, to: ContrastSide): ContrastDiff {
  const keysFrom = rowKeys(from.ledger.rows, from.pieces);
  const keysTo = rowKeys(to.ledger.rows, to.pieces);
  const byKeyFrom = new Map(keysFrom.map((k, i) => [k, from.ledger.rows[i]]));
  const byKeyTo = new Map(keysTo.map((k, i) => [k, to.ledger.rows[i]]));

  const deltas: RowDelta[] = [];
  for (const [key, row] of byKeyFrom) {
    const other = byKeyTo.get(key);
    if (other === undefined) {
      deltas.push({ key, kind: "removed", from: row.claim });
      continue;
    }
    if (other.status !== row.status) {
      deltas.push({ key, kind: "status", from: row.status, to: other.status });
    } else if (other.claim !== row.claim) {
      deltas.push({ key, kind: "claim", from: row.claim, to: other.claim });
    }
  }
  for (const [key, row] of byKeyTo) {
    if (!byKeyFrom.has(key)) deltas.push({ key, kind: "added", to: row.claim });
  }
  deltas.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const limitsFrom = from.ledger.pieceLimits.map((p) => p.pieceId);
  const limitsTo = to.ledger.pieceLimits.map((p) => p.pieceId);

  return {
    rows: deltas,
    keys: deltas.map((d) => d.key),
    closes:
      from.ledger.closes === to.ledger.closes
        ? null
        : { from: from.ledger.closes, to: to.ledger.closes },
    failedAt:
      from.ledger.failedAt === to.ledger.failedAt
        ? null
        : { from: from.ledger.failedAt, to: to.ledger.failedAt },
    answer: from.answer === to.answer ? null : { from: from.answer, to: to.answer },
    pieceLimits: sameList(limitsFrom, limitsTo) ? null : { from: limitsFrom, to: limitsTo },
  };
}
