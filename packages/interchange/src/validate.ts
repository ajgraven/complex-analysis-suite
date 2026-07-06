// =============================================================================
// validate.ts -- the runtime seatbelt (INTERCHANGE.md section 8).
//
// A payload can arrive from an old deep link or a hand-edited JSON, so the static types are not
// enough: validateEnvelope checks an untrusted value at the boundary and throws a clear
// InterchangeError rather than letting a subtly-wrong payload produce a subtly-wrong picture.
// It rejects a mismatched schema id and an unknown MAJOR version; it accepts unknown OPTIONAL
// fields silently (forward-compat).
// =============================================================================

import { SCHEMA_ID, VERSION, type Complex, type Conventions, type Envelope, type MapSpec, type PayloadKind } from "./schema.js";

/** Thrown by the validator + codec when a payload is malformed or incompatible. */
export class InterchangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InterchangeError";
  }
}

const KNOWN_KINDS: readonly string[] = ["map", "quadrature-domain", "schwarz-reflection", "view"];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function isComplex(v: unknown): v is Complex {
  return isObject(v) && isFiniteNum(v.re) && isFiniteNum(v.im);
}
function isComplexArray(v: unknown): v is Complex[] {
  return Array.isArray(v) && v.every(isComplex);
}

export function isConventions(v: unknown): v is Conventions {
  return (
    isObject(v) &&
    (v.area === "standard" || v.area === "normalized") &&
    (v.contour === "standard" || v.contour === "suppressed-2pii")
  );
}

export function isMapSpec(v: unknown): v is MapSpec {
  if (!isObject(v)) return false;
  switch (v.form) {
    case "rational":
      return isComplexArray(v.num) && isComplexArray(v.den);
    case "laurent":
      return isComplex(v.c) && isComplexArray(v.F);
    case "expr":
      return typeof v.expr === "string" && Array.isArray(v.vars);
    default:
      return false;
  }
}

function majorOf(version: string): number {
  const m = /^(\d+)\./.exec(version);
  return m ? Number(m[1]) : NaN;
}
const CURRENT_MAJOR = majorOf(VERSION);

function validateProvenance(p: unknown): void {
  if (!isObject(p) || typeof p.app !== "string" || typeof p.appVersion !== "string" || typeof p.createdAt !== "string") {
    throw new InterchangeError("interchange: provenance must have string app / appVersion / createdAt");
  }
}

function validatePayload(kind: PayloadKind, payload: unknown): void {
  if (!isObject(payload)) throw new InterchangeError(`interchange: payload for kind "${kind}" must be an object`);
  switch (kind) {
    case "schwarz-reflection":
      if (!isMapSpec(payload.sigma)) throw new InterchangeError("interchange: schwarz-reflection.sigma is not a valid MapSpec");
      if (!isConventions(payload.conventions)) throw new InterchangeError("interchange: schwarz-reflection.conventions is missing or invalid");
      break;
    case "quadrature-domain":
      if (!isMapSpec(payload.phi)) throw new InterchangeError("interchange: quadrature-domain.phi is not a valid MapSpec");
      if (!isConventions(payload.conventions)) throw new InterchangeError("interchange: quadrature-domain.conventions is missing or invalid");
      break;
    case "map":
      if (!isMapSpec(payload)) throw new InterchangeError("interchange: map payload is not a valid MapSpec");
      break;
    case "view":
      if (!isMapSpec(payload.map)) throw new InterchangeError("interchange: view.map is not a valid MapSpec");
      break;
  }
}

/**
 * Validate an untrusted value as an interchange Envelope, or throw InterchangeError. Rejects a
 * wrong schema id and an unknown MAJOR version; accepts unknown optional fields (forward-compat).
 */
export function validateEnvelope(value: unknown): Envelope {
  if (!isObject(value)) throw new InterchangeError("interchange: envelope must be an object");
  if (value.schema !== SCHEMA_ID) {
    throw new InterchangeError(`interchange: wrong schema "${String(value.schema)}" (expected "${SCHEMA_ID}")`);
  }
  if (typeof value.version !== "string") throw new InterchangeError("interchange: envelope.version must be a string");
  const major = majorOf(value.version);
  if (!Number.isInteger(major)) throw new InterchangeError(`interchange: unparseable version "${value.version}"`);
  if (major !== CURRENT_MAJOR) {
    throw new InterchangeError(`interchange: incompatible major version ${major} (this build speaks ${CURRENT_MAJOR}.x)`);
  }
  if (typeof value.kind !== "string" || !KNOWN_KINDS.includes(value.kind)) {
    throw new InterchangeError(`interchange: unknown payload kind "${String(value.kind)}"`);
  }
  validateProvenance(value.provenance);
  validatePayload(value.kind as PayloadKind, value.payload);
  return value as unknown as Envelope;
}

/** Narrow a validated envelope to a specific kind. */
export function isEnvelopeOfKind<K extends PayloadKind>(env: Envelope, kind: K): env is Envelope<K> {
  return env.kind === kind;
}
