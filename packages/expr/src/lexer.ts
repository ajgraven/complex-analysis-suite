/**
 * Tokenizer for the expression language. Distinguishes the constant `e` from the
 * exponent marker in scientific notation (`1e-3`): an `e`/`E` is part of a number
 * only when it directly follows the digits of a number and is itself followed by
 * an optional sign and a digit.
 *
 * Also inserts an implicit `*` after a number literal that is immediately followed
 * by an identifier or `(`, so `2z`, `3+4i`, `2pi` and `2(z+1)` read as written —
 * see {@link tokenize}'s `maybeImplicitMultiply` for why it is narrow, and why
 * whitespace and a bare `e`/`E` deliberately suppress it.
 */

import { ExprError } from "./ast";

export type TokenType =
  | "number"
  | "ident"
  | "op" // + - * / ^
  | "cmp" // > < ==
  | "lparen"
  | "rparen"
  | "comma"
  | "semi"
  | "assign" // =
  | "eof";

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

const isDigit = (ch: string): boolean => ch >= "0" && ch <= "9";
const isIdentStart = (ch: string): boolean =>
  (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
const isIdentPart = (ch: string): boolean => isIdentStart(ch) || isDigit(ch);

/** Tokenize `src`, throwing {@link ExprError} on an unexpected character. */
export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const push = (type: TokenType, value: string, pos: number): void => {
    tokens.push({ type, value, pos });
  };

  /**
   * Emit an implicit `*` after a number literal, so `2z`, `2i`, `2pi` and `2(z+1)` mean what they
   * look like. `3+4i` therefore parses as `3+4*i` with `i` the existing constant — no new token
   * type and no new AST node, so every downstream consumer (derivative, LaTeX, GLSL, the rational
   * extractor) sees an ordinary multiply and needs no change.
   *
   * **Strictly additive:** it fires only where the number is *immediately* followed by an
   * identifier or `(`, and every such input previously threw at `parseProgram`'s statement
   * separator check. No program that parsed before parses differently now.
   *
   * **Two deliberate non-cases**, both protecting guards that already exist:
   *
   * - Whitespace suppresses it. `2 3`, `z c` and `1 e` keep throwing, which is the whole point of
   *   the separator guard — a typo should be an error, not a silently different result.
   * - A bare `e`/`E` after a number never gets one. The lexer already reserves that position for a
   *   scientific exponent, and a truncated `1e5` typed as `1e` is far likelier than someone meaning
   *   `1·e`; turning it into 2.718 would be exactly the silent-wrong-answer class the separator
   *   guard was added to close. Write `2*e`.
   */
  const maybeImplicitMultiply = (at: number): void => {
    const next = src[at];
    if (next === undefined) return;
    if (next === "(") {
      push("op", "*", at);
      return;
    }
    if (!isIdentStart(next)) return;
    let j = at;
    while (j < src.length && isIdentPart(src[j])) j++;
    const ident = src.slice(at, j);
    if (ident === "e" || ident === "E") return; // reserved for the exponent marker — see above
    push("op", "*", at);
  };

  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    const start = i;

    if (isDigit(ch) || (ch === "." && isDigit(src[i + 1] ?? ""))) {
      i++;
      while (i < src.length && isDigit(src[i])) i++;
      if (src[i] === ".") {
        i++;
        while (i < src.length && isDigit(src[i])) i++;
      }
      // Scientific exponent: e/E, an optional sign, then at least one digit. The digit that
      // validates the exponent is at i+1 (unsigned) or i+2 (signed) — checking a fixed offset
      // first would reject unsigned literals like `1e5+2` (the char after the digit is `+`).
      if (src[i] === "e" || src[i] === "E") {
        const signed = src[i + 1] === "+" || src[i + 1] === "-";
        if (isDigit(src[i + 1] ?? "") || (signed && isDigit(src[i + 2] ?? ""))) {
          i += signed ? 2 : 1;
          while (i < src.length && isDigit(src[i])) i++;
        }
      }
      push("number", src.slice(start, i), start);
      maybeImplicitMultiply(i);
      continue;
    }

    if (isIdentStart(ch)) {
      i++;
      while (i < src.length && isIdentPart(src[i])) i++;
      push("ident", src.slice(start, i), start);
      continue;
    }

    switch (ch) {
      case "+":
      case "-":
      case "*":
      case "/":
      case "^":
        push("op", ch, start);
        i++;
        break;
      case ">":
      case "<":
        push("cmp", ch, start);
        i++;
        break;
      case "=":
        if (src[i + 1] === "=") {
          push("cmp", "==", start);
          i += 2;
        } else {
          push("assign", "=", start);
          i++;
        }
        break;
      case "(":
        push("lparen", ch, start);
        i++;
        break;
      case ")":
        push("rparen", ch, start);
        i++;
        break;
      case ",":
        push("comma", ch, start);
        i++;
        break;
      case ";":
        push("semi", ch, start);
        i++;
        break;
      default:
        throw new ExprError(`Unexpected character '${ch}'`, start);
    }
  }

  push("eof", "", src.length);
  return tokens;
}
