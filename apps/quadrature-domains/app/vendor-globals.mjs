// vendor-globals.mjs — self-hosted mathjs + KaTeX, exposed as the window globals the
// page modules already use (`window.math` / `window.katex`). This replaces the former
// CDN <script>/<link> tags in index.html: bundling removes the third-party runtime
// dependency (availability, privacy, offline) and lets the service worker precache both.
//
// Imported FIRST in main.mjs so the globals exist before any page module executes —
// matching the old head-loaded-script ordering. `create(all)` reproduces the CDN build's
// preconfigured instance (math.parse / math.complex / math.evaluate). CD self-hosts KaTeX
// the same way (apps/complex-dynamics/src/main.ts).
import { create, all } from 'mathjs';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const math = create(all);

if (typeof window !== 'undefined') {
  window.math = math;
  window.katex = katex;
}
