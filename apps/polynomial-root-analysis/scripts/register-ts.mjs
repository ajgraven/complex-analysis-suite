// `node --experimental-strip-types --import ./scripts/register-ts.mjs <script.ts>`: run a generator
// script against the app's TypeScript sources (see ts-resolve.mjs).
import { register } from "node:module";
register(new URL("./ts-resolve.mjs", import.meta.url));
