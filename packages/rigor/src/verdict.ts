import type { Certificate } from "./certificate.js";
import { type Level, meetAll } from "./level.js";

/**
 * Brand, as on {@link Certificate}: a `Verdict` may only come from {@link assembleVerdict}, so no
 * code path can hand-assert a level for a reported quantity.
 */
export declare const VERDICT_BRAND: unique symbol;

export interface Verdict {
  readonly [VERDICT_BRAND]: true;
  readonly level: Level;
  readonly certificates: readonly Certificate[];
  /**
   * Every restriction any contributing certificate carried, deduplicated and in first-seen order.
   * Renderers must show these wherever the value is shown — see `CertificateOptions.restriction`.
   */
  readonly restrictions: readonly string[];
}

/**
 * Assemble the verdict for a quantity from the evidence for it. **The only producer of a `Verdict`
 * in the codebase**, and therefore the only place a `=` can reach a reader.
 *
 * The level is the meet over the certificates, so it is computed from what was actually
 * established rather than asserted by whoever wrote the call site. An empty list is `"?"`: a claim
 * supported by no evidence is unknown, not exact.
 */
export function assembleVerdict(certificates: readonly Certificate[]): Verdict {
  const level = meetAll(certificates.map((c) => c.level));

  const restrictions: string[] = [];
  for (const c of certificates) {
    if (c.restriction !== undefined && !restrictions.includes(c.restriction)) {
      restrictions.push(c.restriction);
    }
  }

  const verdict = { level, certificates: [...certificates], restrictions };
  return verdict as unknown as Verdict;
}

/**
 * Whether a verdict permits a value to be shown at all. `⚠` means a hypothesis failed or the
 * question is ill-posed, and the app's answer is then silence plus a reason — never a number with
 * a caveat beside it.
 */
export function mayReportValue(v: Verdict): boolean {
  return v.level !== "⚠";
}

/** The failed steps across all certificates, for the "why not?" disclosure. */
export function failures(v: Verdict): readonly string[] {
  return v.certificates.flatMap((c) => c.provenance.filter((s) => !s.ok).map((s) => s.text));
}
