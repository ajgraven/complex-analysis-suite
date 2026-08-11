// @cas/export — shared figure-export primitives for the suite (extracted per ADR-0007 once three
// apps — Complex Dynamics, Complex-Function Plotter, Riemann Map — each carried their own copy of the
// same PNG `tEXt` metadata code). Convention-neutral (ADR-0006): this is byte manipulation, no maths.
//
// Contents:
//   - png.ts : embed / read PNG `tEXt` metadata (crc32, pngChunk, injectPngText, readPngText,
//              PNG_SIGNATURE) — the "a figure carries its own recipe" mechanism (permalink + params
//              spliced before IEND, image pixels untouched).
export { PNG_SIGNATURE, crc32, pngChunk, injectPngText, readPngText } from "./png.js";
