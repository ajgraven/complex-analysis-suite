/**
 * Validation of the control inputs before they are applied to the plots.
 *
 * Expressions are checked with the real {@link parse} (the single source of
 * truth — same parser the renderer uses), so a typo like `z^2++c` or an unknown
 * function is caught here instead of throwing uncaught out of `applyChanges` or
 * silently producing a blank plot. Numeric/complex fields are checked for finite,
 * in-range values (they otherwise parse to `NaN` silently).
 */

import { parseComplex } from "../complex";
import { ExprError } from "../expr/ast";
import { parse } from "../expr/parser";
import { INPUT_IDS } from "./controls";
import { valueOf } from "./dom";

/** A single invalid field: which input, and a human-readable reason. */
export interface FieldError {
  /** The id of the offending input (so the caller can mark it). */
  field: string;
  message: string;
}

function checkExpr(id: string, label: string, errors: FieldError[]): void {
  try {
    parse(valueOf(id));
  } catch (err) {
    const where = err instanceof ExprError ? ` (at position ${err.pos + 1})` : "";
    const why = err instanceof Error ? err.message : "invalid expression";
    errors.push({ field: id, message: `${label}: ${why}${where}` });
  }
}

function checkComplex(id: string, label: string, errors: FieldError[]): void {
  const [re, im] = parseComplex(valueOf(id));
  if (!Number.isFinite(re) || !Number.isFinite(im)) {
    errors.push({ field: id, message: `${label}: not a valid complex number, e.g. -.7-.4*i` });
  }
}

function checkCenter(id: string, label: string, errors: FieldError[]): void {
  const parts = valueOf(id)
    .split(",")
    .map((s) => Number.parseFloat(s.trim()));
  if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
    errors.push({ field: id, message: `${label}: enter as "x,y", e.g. -.75,0` });
  }
}

function checkPositive(id: string, label: string, errors: FieldError[], integer = false): void {
  const raw = valueOf(id).trim();
  const v = Number(raw);
  if (raw === "" || !Number.isFinite(v) || v <= 0 || (integer && !Number.isInteger(v))) {
    errors.push({
      field: id,
      message: `${label}: enter a positive ${integer ? "integer" : "number"}`,
    });
  }
}

/** Validate every control input. Returns all problems found (empty ⇒ valid). */
export function validateInputs(): { ok: boolean; errors: FieldError[] } {
  const errors: FieldError[] = [];

  checkExpr(INPUT_IDS.f, "f(z,c)", errors);
  checkExpr(INPUT_IDS.paramEscape, "escape (parameter space)", errors);
  checkExpr(INPUT_IDS.dynEscape, "escape (dynamical plane)", errors);

  checkComplex(INPUT_IDS.c, "c", errors);

  checkCenter(INPUT_IDS.paramCenter, "center (parameter space)", errors);
  checkCenter(INPUT_IDS.dynCenter, "center (dynamical plane)", errors);

  checkPositive(INPUT_IDS.paramZoom, "zoom (parameter space)", errors);
  checkPositive(INPUT_IDS.dynZoom, "zoom (dynamical plane)", errors);
  checkPositive(INPUT_IDS.paramN, "max iterations (parameter space)", errors, true);
  checkPositive(INPUT_IDS.dynN, "max iterations (dynamical plane)", errors, true);
  checkPositive(INPUT_IDS.paramRes, "canvas size (parameter space)", errors, true);
  checkPositive(INPUT_IDS.dynRes, "canvas size (dynamical plane)", errors, true);

  return { ok: errors.length === 0, errors };
}
