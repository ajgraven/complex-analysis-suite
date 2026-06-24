'use strict';
// =============================================================================
// expr-parser tests — QD.ExprParser.parse, the typed-expression → exact ℚ(i)
// MPoly parser that drives the Algebra workspace's "Define substitution" feature.
// Checks the grammar (+,−,*,/,^, parens, unary minus, the imaginary unit i),
// exact numeric parsing (integers + decimals, no float drift), longest-match
// variable identification, and the error paths (unknown var, bad exponent,
// unmatched paren, non-constant division). Equality is exact via MPoly.equals.
// =============================================================================
require('./bootstrap');
loadInCtx('sym-core.js');
loadInCtx('algebra/expr-parser.js');

module.exports = async function run() {
  section('expr-parser — typed expression → exact ℚ(i) MPoly');
  const S = QD.Sym, P = QD.ExprParser;
  ok('QD.ExprParser exposed', !!P && typeof P.parse === 'function');

  const known = ['z1', 'zb1', 'w1', 'A1_1', 'A1_2'];
  const mv = S.mpolyVar, mi = S.mpolyInt;
  const parse = (s) => P.parse(s, known, S);
  const threw = (s) => { try { parse(s); return null; } catch (e) { return e.message || String(e); } };

  // ---- core grammar ----
  ok('sum z1 + zb1', parse('z1 + zb1').equals(mv('z1').add(mv('zb1'))));
  ok('power w1^2', parse('w1^2').equals(mv('w1').pow(2)));
  ok('product z1*zb1', parse('z1*zb1').equals(mv('z1').mul(mv('zb1'))));
  ok('difference of squares (z1+i)*(z1-i) = z1^2 + 1',
     parse('(z1 + i)*(z1 - i)').equals(mv('z1').pow(2).add(mi(1))));
  ok('i*i = -1', parse('i*i').equals(mi(-1)));
  ok('unary minus  -z1', parse('-z1').equals(mv('z1').neg()));
  // precedence: a leading unary minus binds LOOSER than ^, so −z1^2 = −(z1^2), not (−z1)^2
  ok('unary minus vs ^: -z1^2 = −(z1^2)', parse('-z1^2').equals(mv('z1').pow(2).neg()));
  ok('unary minus vs ^: -2^2 = −4', parse('-2^2').equals(mi(-4)));
  ok('unary minus after *: 3*-z1^2 = −3 z1^2', parse('3*-z1^2').equals(mv('z1').pow(2).scale(S.gaussInt(-3))));
  ok('double unary: --z1 = z1', parse('--z1').equals(mv('z1')));
  ok('nested parens (z1 + 1)^2 = z1^2 + 2 z1 + 1',
     parse('(z1 + 1)^2').equals(mv('z1').pow(2).add(mv('z1').scale(S.gaussInt(2))).add(mi(1))));
  ok('mixed 2*A1_1*A1_2 - 1',
     parse('2*A1_1*A1_2 - 1').equals(mv('A1_1').mul(mv('A1_2')).scale(S.gaussInt(2)).sub(mi(1))));

  // ---- exact numbers ----
  ok('integer/integer 1/2 is exact', parse('1/2').equals(S.mpolyConst(S.gauss(S.rat(1n, 2n)))));
  ok('decimal 0.2 → exactly 1/5', parse('0.2').equals(S.mpolyConst(S.gauss(S.rat(1n, 5n)))));
  ok('decimal 1.25 → exactly 5/4', parse('1.25').equals(S.mpolyConst(S.gauss(S.rat(5n, 4n)))));
  ok('trailing-dot 5. → exactly 5 (not 50)', parse('5.').equals(mi(5)));
  ok('trailing-dot 10. → exactly 10', parse('10.').equals(mi(10)));
  ok('division by a constant  (z1 + zb1)/2',
     parse('(z1 + zb1)/2').equals(mv('z1').add(mv('zb1')).scale(S.gaussInt(1).div(S.gaussInt(2)))));

  // ---- longest-match identification ----
  ok('longest-match: zb1 is one variable (not z·b1)', parse('zb1').equals(mv('zb1')));
  ok('A1_1 keeps its underscore subscript', parse('A1_1').equals(mv('A1_1')));

  // ---- error paths ----
  ok('unknown variable rejected', /unknown variable 'q'/.test(threw('q + 1') || ''));
  ok('b1 (a non-variable fragment of zb1) rejected', !!threw('z*b1'));
  ok('negative exponent rejected', /exponent must be a non-negative integer/.test(threw('z1^-1') || ''));
  ok('non-integer exponent rejected', /exponent must be a non-negative integer/.test(threw('z1^1.5') || ''));
  ok('unmatched paren rejected', /unmatched/.test(threw('(z1 + 1') || ''));
  ok('non-constant division rejected', /division is only allowed by a nonzero constant/.test(threw('z1/zb1') || ''));
  ok('division by zero rejected', /division by zero/.test(threw('z1/0') || ''));
  ok('empty expression rejected', /empty expression/.test(threw('   ') || ''));
  ok('trailing garbage rejected', !!threw('z1 zb1'));
  ok('unexpected character rejected', /unexpected character/.test(threw('z1 & zb1') || ''));
};
