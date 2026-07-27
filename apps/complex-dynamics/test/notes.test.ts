import { describe, it, expect } from "vitest";
import { decodeNotes, encodeNotes, MAX_NOTES, MAX_NOTE_TEXT, type Note } from "../src/state/notes";

const pin = (over: Partial<Note> = {}): Note => ({ plane: "param", x: -0.75, y: 0.1, text: "here", ...over });

describe("pinned-annotation codec", () => {
  it("round-trips a list of pins", () => {
    const notes = [pin(), pin({ plane: "dyn", x: 0, y: 1, text: "Misiurewicz" })];
    expect(decodeNotes(encodeNotes(notes))).toEqual(notes);
  });

  it("round-trips an EMPTY list as a real answer, not as absence", () => {
    // The distinction the whole module exists for: "[]" means "no pins", which undo and saved views
    // must be able to restore, so encodeNotes emits it rather than omitting the field.
    expect(encodeNotes([])).toBe("[]");
    expect(decodeNotes("[]")).toEqual([]);
  });

  describe("present-only rule (cd-shell-05)", () => {
    // A state that does not MENTION notes returns null, and the caller leaves the current pins alone.
    // Pre-fix, main.ts cleared `notes` unconditionally and only refilled from a present `_notes`, so
    // selecting a "Place" — a curated PARTIAL state with no `_notes` — deleted every pin silently.
    it("returns null when the state does not specify notes", () => {
      expect(decodeNotes(undefined)).toBeNull();
      expect(decodeNotes(null)).toBeNull();
    });

    it("returns null for a non-string field rather than treating it as empty", () => {
      // A wrong-typed value is still "unspecified" — it must not read as "clear them".
      expect(decodeNotes(42)).toBeNull();
      expect(decodeNotes([pin()])).toBeNull(); // an ARRAY, not the serialized string
      expect(decodeNotes({ notes: [] })).toBeNull();
    });

    it("distinguishes an absent field from an empty list", () => {
      expect(decodeNotes(undefined)).toBeNull(); // leave the pins alone
      expect(decodeNotes("[]")).toEqual([]); // clear the pins
    });
  });

  describe("untrusted input", () => {
    it("decodes malformed JSON to an empty board instead of throwing", () => {
      // The state DID specify notes; it is just unusable. Honour the intent with an empty board.
      expect(decodeNotes("{not json")).toEqual([]);
      expect(decodeNotes("")).toEqual([]);
    });

    it("decodes a non-array payload to an empty board", () => {
      expect(decodeNotes('{"x":1}')).toEqual([]);
      expect(decodeNotes("42")).toEqual([]);
      expect(decodeNotes("null")).toEqual([]);
    });

    it("rejects non-finite coordinates", () => {
      // JSON has no NaN/Infinity literal, but null/strings parse to NaN under arithmetic and
      // `typeof NaN === "number"` would let a bare typeof check through into the label geometry.
      const hostile = '[{"plane":"param","x":null,"y":0,"text":"a"},' +
        '{"plane":"param","x":0,"y":"1e999","text":"b"},' +
        '{"plane":"dyn","x":0,"y":0,"text":"ok"}]';
      expect(decodeNotes(hostile)).toEqual([pin({ plane: "dyn", x: 0, y: 0, text: "ok" })]);
    });

    it("rejects unknown planes and non-string text", () => {
      const mixed = JSON.stringify([
        { plane: "sphere", x: 0, y: 0, text: "a" },
        { plane: "param", x: 0, y: 0, text: 5 },
        { plane: "param", x: 0, y: 0 },
        pin(),
      ]);
      expect(decodeNotes(mixed)).toEqual([pin()]);
    });

    it("survives null / primitive entries in the array", () => {
      expect(decodeNotes(JSON.stringify([null, 1, "x", pin()]))).toEqual([pin()]);
    });

    it("caps the note count and the per-note text length", () => {
      const many = JSON.stringify(Array.from({ length: MAX_NOTES + 50 }, () => pin()));
      expect(decodeNotes(many)).toHaveLength(MAX_NOTES);
      const long = JSON.stringify([pin({ text: "x".repeat(MAX_NOTE_TEXT + 1) }), pin()]);
      expect(decodeNotes(long)).toEqual([pin()]); // over-long dropped, the valid one kept
      const atCap = JSON.stringify([pin({ text: "x".repeat(MAX_NOTE_TEXT) })]);
      expect(decodeNotes(atCap)).toHaveLength(1); // the cap is inclusive
    });
  });
});
