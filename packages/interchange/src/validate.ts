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

// --- untrusted-input bounds (a share link / hand-edited JSON is adversarial) -------------------
/** Max length of a coefficient array (rational num/den, laurent F): bounds a crafted mega-array that
 *  would validate and then build a multi-MB expression string in a consumer (main-thread DoS). */
const MAX_COEFF_LEN = 4096;
/** Max length of an `expr`-form source string. */
const MAX_EXPR_LEN = 8192;
/** Max number of declared variables in an `expr` map. */
const MAX_VARS_LEN = 16;
/** Keys that, as OWN properties from JSON.parse, enable prototype pollution the moment a consumer spreads
 *  or Object.assign-s the object. Rejected anywhere in the decoded tree so the boundary owns the guarantee. */
const FORBIDDEN_KEYS: readonly string[] = ["__proto__", "constructor", "prototype"];
/** Inverse-branch methods a `schwarz` map (schema.ts) may declare for φ⁻¹. A new method is a vocabulary
 *  addition: extend this AND bump the schema version, never silently accept an unknown one on the wire. */
const KNOWN_INVERSES: readonly string[] = ["newton-dk"];

function isVarName(v: unknown): v is "z" | "c" | "a" {
  return v === "z" || v === "c" || v === "a";
}

/** True if any object anywhere in the tree carries an own key that could pollute Object.prototype.
 *  ITERATIVE (explicit stack): the previous recursive `depth > 8` cutoff silently returned false for a
 *  `__proto__` nested ≥ 9 levels deep, voiding the "rejected ANYWHERE" contract this boundary advertises.
 *  A node-count budget fails CLOSED (returns true) rather than skipping — the payload is size-capped
 *  upstream (MAX_BASE64URL_LEN ⇒ ~48 KB decoded), so a legitimate tree never approaches the budget. */
export function hasForbiddenKey(value: unknown): boolean {
  const MAX_NODES = 1_000_000; // far above any real ~48 KB payload's node count; a runaway tree fails closed
  const stack: unknown[] = [value];
  let visited = 0;
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === null || typeof node !== "object") continue;
    if (++visited > MAX_NODES) return true; // fail closed: an implausibly huge tree is rejected, not skipped
    for (const k of Object.keys(node)) {
      if (FORBIDDEN_KEYS.includes(k)) return true; // reject BEFORE reading node[k] (never touch __proto__)
      stack.push((node as Record<string, unknown>)[k]);
    }
  }
  return false;
}

export function isComplex(v: unknown): v is Complex {
  return isObject(v) && isFiniteNum(v.re) && isFiniteNum(v.im);
}
function isComplexArray(v: unknown): v is Complex[] {
  return Array.isArray(v) && v.length <= MAX_COEFF_LEN && v.every(isComplex);
}

export function isConventions(v: unknown): v is Conventions {
  return (
    isObject(v) &&
    (v.area === "standard" || v.area === "normalized") &&
    (v.contour === "standard" || v.contour === "suppressed-2pii")
  );
}

/** The interchange wire is CANONICAL by contract (schema.ts: "canonical on the wire; producer converts
 *  TO, consumer converts FROM"). Per ADR-0006 the convention tag exists so a mis-conversion fails LOUDLY
 *  instead of silently rendering a domain scaled by a stray factor of π / 2πi. `isConventions` above only
 *  checks well-formedness (the type can EXPRESS a non-canonical tag precisely so we can detect one); a
 *  well-formed-but-non-canonical tag means a producer failed to convert to canonical before export.
 *  Reject it here, because the consumer reads the payload AS canonical without inspecting the tag — so an
 *  un-caught non-canonical payload becomes a mis-scaled picture with no other guardrail in the path. */
function assertCanonicalWire(c: Conventions, kind: string): void {
  if (c.area !== "standard" || c.contour !== "standard") {
    throw new InterchangeError(
      `interchange: ${kind}.conventions is non-canonical (area="${c.area}", contour="${c.contour}"); ` +
        `the wire format is canonical (area & contour "standard") — the producer must convert before export`,
    );
  }
}

export function isMapSpec(v: unknown): v is MapSpec {
  if (!isObject(v)) return false;
  switch (v.form) {
    case "rational":
      return isComplexArray(v.num) && isComplexArray(v.den);
    case "laurent":
      return isComplex(v.c) && isComplexArray(v.F);
    case "expr":
      return typeof v.expr === "string" && v.expr.length <= MAX_EXPR_LEN &&
        Array.isArray(v.vars) && v.vars.length <= MAX_VARS_LEN && v.vars.every(isVarName);
    case "schwarz":
      // A σ recipe (schema.ts SchwarzMap): a closed-form φ — laurent | rational ONLY, since the engine
      // reads its coefficients (an `expr` or nested `schwarz` φ has none) — the disk φ uniformizes, a
      // known inverse method, and the definitional anti-holomorphic flag. The `phi` recursion inherits
      // the coefficient-length caps (MAX_COEFF_LEN), so `schwarz` adds no uncapped field of its own.
      return (
        isObject(v.phi) &&
        (v.phi.form === "laurent" || v.phi.form === "rational") &&
        isMapSpec(v.phi) &&
        (v.disk === "D" || v.disk === "D*") &&
        typeof v.inverse === "string" && KNOWN_INVERSES.includes(v.inverse) &&
        v.antiholomorphic === true
      );
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

/** A Viewport (schema.ts): center is Complex, zoom a finite number; centerHiPrec optional (not checked). */
function isViewport(v: unknown): boolean {
  return isObject(v) && isComplex(v.center) && isFiniteNum(v.zoom);
}
/** A SchwarzReflection.escape spec: predicate ∈ the union; R (when present) a finite number. */
function isEscapeSpec(v: unknown): boolean {
  return (
    isObject(v) &&
    (v.predicate === "in-omega-complement" || v.predicate === "abs-gt") &&
    (v.R === undefined || isFiniteNum(v.R))
  );
}

function validatePayload(kind: PayloadKind, payload: unknown): void {
  if (!isObject(payload)) throw new InterchangeError(`interchange: payload for kind "${kind}" must be an object`);
  switch (kind) {
    case "schwarz-reflection":
      if (!isMapSpec(payload.sigma)) throw new InterchangeError("interchange: schwarz-reflection.sigma is not a valid MapSpec");
      if (!isConventions(payload.conventions)) throw new InterchangeError("interchange: schwarz-reflection.conventions is missing or invalid");
      assertCanonicalWire(payload.conventions, "schwarz-reflection");
      // escape is optional, but a present-yet-malformed escape (bad predicate / non-finite R) used to be
      // trusted — a consumer reading escape.R got NaN as its escape radius. Validate it when present.
      if (payload.escape !== undefined && !isEscapeSpec(payload.escape))
        throw new InterchangeError("interchange: schwarz-reflection.escape is invalid (predicate ∈ {in-omega-complement, abs-gt}; R finite)");
      break;
    case "quadrature-domain":
      if (!isMapSpec(payload.phi)) throw new InterchangeError("interchange: quadrature-domain.phi is not a valid MapSpec");
      if (!isConventions(payload.conventions)) throw new InterchangeError("interchange: quadrature-domain.conventions is missing or invalid");
      assertCanonicalWire(payload.conventions, "quadrature-domain");
      // boundarySamples is optional, but when present must be a bounded Complex[] (the MAX_COEFF_LEN cap the
      // other Complex[] fields carry — a crafted mega-array otherwise validated and slipped past the cap).
      if (payload.boundarySamples !== undefined && !isComplexArray(payload.boundarySamples))
        throw new InterchangeError("interchange: quadrature-domain.boundarySamples is not a bounded Complex[]");
      break;
    case "map":
      if (!isMapSpec(payload)) throw new InterchangeError("interchange: map payload is not a valid MapSpec");
      break;
    case "view":
      if (!isMapSpec(payload.map)) throw new InterchangeError("interchange: view.map is not a valid MapSpec");
      // viewport is NON-optional (schema.ts View.viewport: Viewport) but was never checked — a "validated"
      // view envelope could carry a missing/garbage viewport and a consumer read env.payload.viewport.center
      // as undefined/NaN. Enforce the structural contract the docs promise.
      if (!isViewport(payload.viewport))
        throw new InterchangeError("interchange: view.viewport is missing or invalid (needs center:Complex, zoom:number)");
      break;
  }
}

/**
 * Validate an untrusted value as an interchange Envelope, or throw InterchangeError. Rejects a
 * wrong schema id and an unknown MAJOR version; accepts unknown optional fields (forward-compat).
 */
export function validateEnvelope(value: unknown): Envelope {
  if (!isObject(value)) throw new InterchangeError("interchange: envelope must be an object");
  if (hasForbiddenKey(value)) {
    throw new InterchangeError("interchange: payload has a forbidden key (__proto__/constructor/prototype)");
  }
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
