/**
 * Tokenizer for the expression language. Distinguishes the constant `e` from the
 * exponent marker in scientific notation (`1e-3`): an `e`/`E` is part of a number
 * only when it directly follows the digits of a number and is itself followed by
 * an optional sign and a digit.
 */

import { ExprError } from "./ast";

export type TokenType =
  | "number"
  | "imag" // an imaginary literal: digits with a trailing `i` (2i, 3.5i, 1e3i). value = the numeric part.
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
  (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_" || ch === "γ"; // γ = Euler–Mascheroni (B5)
const isIdentPart = (ch: string): boolean => isIdentStart(ch) || isDigit(ch);

/** Tokenize `src`, throwing {@link ExprError} on an unexpected character. */
export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const push = (type: TokenType, value: string, pos: number): void => {
    tokens.push({ type, value, pos });
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
      const numStr = src.slice(start, i);
      // Imaginary literal (B5): a numeric literal immediately followed by a STANDALONE `i` — `2i`, `3.5i`,
      // `1e3i` — where the `i` isn't the start of a longer identifier (so `2im` stays `2` then `im`). The
      // parser desugars the `imag` token to `<num> * i`, so it binds as a single unit under `^`
      // (`2i^2 = (2i)^2`, matching Python's `2j**2`).
      if (src[i] === "i" && !isIdentPart(src[i + 1] ?? "")) {
        i++; // consume the `i`
        push("imag", numStr, start);
      } else {
        push("number", numStr, start);
      }
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
