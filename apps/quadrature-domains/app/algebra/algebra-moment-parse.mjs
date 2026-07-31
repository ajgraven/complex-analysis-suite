// algebra-moment-parse.mjs -- the complex-moment input parser, carved out of installAlgebra (algebra-ui.mjs)
// — refactor D, installAlgebra carve-out 5.
//
// "Shape from moments" (roadmap #18) lets the user type a comma-separated list of complex moments to
// reconstruct a quadrature domain's data. `_parseMomentToken` turns ONE token — `a`, `a+bi`, `a-bi`, `bi`,
// `i`, `-i`, with each real part an exact rational `n/d` or a decimal — into `{re, im}`, and throws a
// descriptive Error on anything malformed (empty, a stray `i` not at the end, a bad rational, a non-number).
// `_parseMomentNum` is its per-component helper (a real number → JS number). Both are PURE with ZERO external
// dependencies (only String/Number/isFinite + each other) — a pure leaf, carved VERBATIM. The one consumer
// (doShapeFromMoments) maps `_parseMomentToken` over the split input; it keeps its own DOM/error handling.
// Pinned by vitest/algebra-moment-parse.test.ts.

// A real number "a", exact rational "n/d", or decimal.
export function _parseMomentNum(s) {
  s = s.trim();
  if (s === '' || s === '+') return 1;
  if (s === '-') return -1;
  if (s.indexOf('/') >= 0) { const p = s.split('/'); const n = Number(p[0]), d = Number(p[1]); if (!isFinite(n) || !isFinite(d) || d === 0) throw new Error('bad rational "' + s + '"'); return n / d; }
  const v = Number(s);
  if (!isFinite(v)) throw new Error('bad number "' + s + '"');
  return v;
}

// One complex moment token: a, a+bi, a-bi, bi, i, -i (a,b real / rational / decimal).
export function _parseMomentToken(t) {
  t = t.replace(/\s+/g, '');
  if (t === '') throw new Error('empty moment');
  if (t.indexOf('i') < 0) return { re: _parseMomentNum(t), im: 0 };
  if (t[t.length - 1] !== 'i') throw new Error('malformed complex "' + t + '" (i must be last)');
  const noI = t.slice(0, -1); // drop the trailing 'i'
  let splitAt = -1;
  for (let k = noI.length - 1; k > 0; k--) { if (noI[k] === '+' || noI[k] === '-') { splitAt = k; break; } }
  const reStr = splitAt < 0 ? '0' : noI.slice(0, splitAt);
  const imStr = splitAt < 0 ? noI : noI.slice(splitAt);
  return { re: reStr === '' ? 0 : _parseMomentNum(reStr), im: _parseMomentNum(imStr === '' ? '1' : imStr) };
}
