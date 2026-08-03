// ui-domain-mode.mjs -- the pure "domain-mode" algebra, extracted from ui.mjs (refactor D — ui.mjs seam).
//
// The 10 UI modes factor as {weight} × {bounded|unbounded} × {singular}. Classical has no singular
// variant. `composeMode` maps the three domain-type controls → a MODES key; `decomposeMode` is the
// inverse; `modeSummary` renders the plain-language description shown in #dm-summary. All three are PURE
// (no DOM / state / QD) — the DOM reflectors that call them (syncDomainModeControl / applyDomainModeControl)
// stay in ui.mjs. Extracted verbatim; behavior-preserving (pinned by vitest/ui-domain-mode.test.ts).

// Item 5: plain-language description of the active mode, for #dm-summary.
export function modeSummary(mode) {
  const d = decomposeMode(mode);
  const weight = d.weight === 'classical' ? 'classical (unweighted)'
    : d.weight === 'pqd' ? 'power-weighted (|w|^(2(α−1)))'
    : 'log-weighted (1/|w|²)';
  const extent = d.domain === 'bounded' ? 'bounded' : 'unbounded (reaches ∞)';
  const sing = d.singular ? ', with the origin inside Ω' : '';
  return `Solving for a ${extent} ${weight} quadrature domain Ω from your h(w)${sing}.`;
}

// composeMode maps the three controls → a MODES key; decomposeMode is the inverse.
export function composeMode(weight, domain, singular) {
  if (weight === 'classical') return domain;            // 'bounded' | 'unbounded'
  return `${weight}-${domain}${singular ? '-singular' : ''}`;
}
export function decomposeMode(mode) {
  if (mode === 'bounded' || mode === 'unbounded') {
    return { weight: 'classical', domain: mode, singular: false };
  }
  const m = /^(pqd|lqd)-(bounded|unbounded)(-singular)?$/.exec(mode);
  if (!m) return { weight: 'classical', domain: 'bounded', singular: false };
  return { weight: m[1], domain: m[2], singular: !!m[3] };
}
