// =============================================================================
// qd-varscheme.js -- the ONE canonical decoder for QD CONJUGATE-MODEL variable names.
//
// A generated conjugate-model variable is a family letter (A / C / z / a) or w0, an optional
// bar 'b' (the reality-slice conjugate partner), and one or two indices:
//   A{i}_{j} / Ab{i}_{j}   C{i}_{j} / Cb{i}_{j}   z{i} / zb{i}   a{i} / ab{i}   w0 / wb0
// parseVar decodes one to a descriptor { family, i, j, bar }; conjVar (the conjugate partner)
// and latexVar (its LaTeX) are then DERIVED from that single parse. So the naming convention
// lives in one place instead of being re-decoded by anchored regex in every consumer — it was
// duplicated across conjVarName (qd-equations + qd-constraints) and latexOfConjugate. Adding a
// family means adding one entry here, not editing each consumer (and a divergence between them
// silently miscompiled conjugates / mislabeled LaTeX).
//
// Scope: the CONJUGATE model only. The reim-model names (p/q/x/y/Cx/Cy/ax/ay/wx0/wy0) are an
// IRREGULAR separate scheme — p/q/x/y render as literal letters while ax/Cx/wx render as
// base^{re/im} — so they are intentionally NOT folded in here (see qd-equations' latexOfReim).
// Pure string logic: no dependencies, no DOM, no QD namespace.
// =============================================================================

// A parsed conjugate-model variable, or null if `name` is outside the scheme (a reim-model name,
// a boundary/aux variable like Z / cosL, or anything else — callers pass those through unchanged).
// family ∈ 'A' | 'C' | 'z' | 'a' | 'w'; i is the first index; j is the second (A/C) or null.
export function parseVar(name) {
  let m;
  if ((m = /^([AC])(b?)(\d+)_(\d+)$/.exec(name))) return { family: m[1], bar: !!m[2], i: +m[3], j: +m[4] };
  if ((m = /^([za])(b?)(\d+)$/.exec(name)))       return { family: m[1], bar: !!m[2], i: +m[3], j: null };
  if (name === 'w0')  return { family: 'w', bar: false, i: 0, j: null };
  if (name === 'wb0') return { family: 'w', bar: true,  i: 0, j: null };
  return null;
}

// Inverse of parseVar: descriptor → its variable name.
export function encodeVar(d) {
  if (d.family === 'w') return d.bar ? 'wb0' : 'w0';
  return d.family + (d.bar ? 'b' : '') + d.i + (d.j != null ? '_' + d.j : '');
}

// The conjugate partner (the reality-slice bar toggle). Self-inverse. A name outside the
// conjugate-model scheme is returned UNCHANGED (conjugation is a conjugate-model operation;
// reim vars, boundary/aux vars, and unknowns have no bar partner here).
export function conjVar(name) {
  const d = parseVar(name);
  return d ? encodeVar({ family: d.family, bar: !d.bar, i: d.i, j: d.j }) : name;
}

// LaTeX for a conjugate-model variable (bar → \bar{·}); a non-scheme name is returned unchanged.
export function latexVar(name) {
  const d = parseVar(name);
  if (!d) return name;
  if (d.family === 'w') return d.bar ? '\\bar{w}_0' : 'w_0';
  const sub = d.j != null ? '{' + d.i + ',' + d.j + '}' : '{' + d.i + '}';
  return (d.bar ? '\\bar{' + d.family + '}' : d.family) + '_' + sub;
}

// PLAIN-Unicode render of a conjugate-model variable for terse UI labels (bar → the combining-
// macron form; indices joined by ','). Returns null for a non-scheme name so the caller can add
// its own cases (e.g. the constraint ζ vars) + fallback. Kept in sync with latexVar by sharing
// the one parse. E.g. A1_2 → 'A1,2', Ab1_2 → 'Ā1,2', zb1 → 'z̄1', wb0 → 'w̄₀'.
const _PLAIN_BAR = { A: 'Ā', C: 'C̄', z: 'z̄', a: 'ā' };
export function plainVar(name) {
  const d = parseVar(name);
  if (!d) return null;
  if (d.family === 'w') return d.bar ? 'w̄₀' : 'w0';
  const base = d.bar ? _PLAIN_BAR[d.family] : d.family;
  return base + d.i + (d.j != null ? ',' + d.j : '');
}
