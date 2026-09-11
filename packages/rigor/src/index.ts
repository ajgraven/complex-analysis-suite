// @cas/rigor — the verdict algebra behind the suite's honest-labelling guardrail.
//
// CLAUDE.md calls honest labelling non-negotiable ("`=` exact, `≤` rigorous bound, `≈` estimate"),
// and until now the suite had **no shared code for it**: the vocabulary and the assembly logic lived
// only inside the Quadrature app's `.mjs`, and each new app reimplemented them. This package is that
// logic, written once, as types rather than as a convention.
//
// The design goal is narrow and worth stating plainly: **make `=` impossible to write by hand.**
// A Certificate can only come from the constructors here; a Verdict can only come from
// assembleVerdict; and the verdict's level is the *meet* over its evidence, so it is computed from
// what was established rather than chosen by the caller.
//
// Convention-neutral (ADR-0006): nothing here knows what is being measured.
export { describeLevel, LEVELS, meet, meetAll, type Level } from "./level.js";
export {
  bound,
  estimate,
  exact,
  refuse,
  unknown,
  type Certificate,
  type CertificateOptions,
  type Step,
} from "./certificate.js";
export { assembleVerdict, failures, mayReportValue, type Verdict } from "./verdict.js";
