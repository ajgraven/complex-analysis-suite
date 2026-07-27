/**
 * The pinned-annotation codec — the `_notes` half of a full app state.
 *
 * Split out of `main.ts` so two things can be tested: the caps that bound a hostile link, and the
 * present-only rule. That rule is the whole point of the module: a state object that does not
 * MENTION notes must leave them alone, because not every caller builds a full state. The "Places"
 * dropdown passes a curated partial state (see {@link ../state/places}); reading a missing key as
 * "clear them" silently deleted every pin the moment a user flew somewhere to compare (cd-shell-05).
 */
import type { FractType } from "../render/glPlot";

/** A user annotation (gold pin), tagged by the plane it belongs to. */
export interface Note {
  plane: FractType;
  x: number;
  y: number;
  text: string;
}

/** Hard caps on a decoded list — a shared link is untrusted input. */
export const MAX_NOTES = 256;
export const MAX_NOTE_TEXT = 2000;

/**
 * Decode the `_notes` field of a serialized state.
 *
 * Returns `null` when the state does not specify notes (key absent / not a string) — the caller
 * must then leave the current pins untouched. An empty array is a real answer meaning "no pins",
 * which is why {@link encodeNotes} emits `_notes` even when there are none: absence has to stay
 * unambiguous for undo and saved views to be able to restore an empty board.
 *
 * A malformed or hostile payload decodes to `[]` rather than throwing: non-finite coordinates are
 * rejected (`typeof NaN === "number"` would otherwise admit them straight into the label geometry),
 * over-long text and unknown planes are dropped, and the list is capped.
 */
export function decodeNotes(raw: unknown): Note[] | null {
  if (typeof raw !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return []; // malformed JSON — the state DID specify notes, so honour that with an empty board
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (n): n is Note =>
        !!n &&
        typeof n === "object" &&
        Number.isFinite((n as Note).x) &&
        Number.isFinite((n as Note).y) &&
        typeof (n as Note).text === "string" &&
        (n as Note).text.length <= MAX_NOTE_TEXT &&
        ((n as Note).plane === "param" || (n as Note).plane === "dyn"),
    )
    .slice(0, MAX_NOTES);
}

/** Encode the current pins for a serialized state. Always emits — see {@link decodeNotes}. */
export function encodeNotes(notes: readonly Note[]): string {
  return JSON.stringify(notes);
}
