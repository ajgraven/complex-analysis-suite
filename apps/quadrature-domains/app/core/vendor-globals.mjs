// vendor-globals.mjs — self-hosted KaTeX (eager) + mathjs (lazy), replacing the former CDN tags.
//
// KaTeX is used for equation rendering across many tabs, so it is bundled eagerly and exposed as
// window.katex. mathjs is large (~260 kB gzip) and only needed for EXPRESSION PARSING — the h-text
// parser (parse-h.mjs) and the Direct/Numerical mode — which most sessions never touch. So it is
// split into its own chunk via a dynamic import() and loaded OFF the initial critical path:
//   • window.ensureMath() imports it on demand and caches the instance as window.math.
//   • an idle prefetch warms that chunk shortly after boot, so it's ready by the time the user
//     reaches an expression field, without bloating/blocking the initial main-bundle parse.
// Consumers still read window.math; the h-text parser awaits window.ensureMath() when it isn't
// ready yet (e.g. a zero-click share-link `h` restore that fires before the prefetch lands).
// CD self-hosts KaTeX the same way (apps/complex-dynamics/src/main.ts).
import katex from 'katex';
import 'katex/dist/katex.min.css';

if (typeof window !== 'undefined') window.katex = katex;

let _mathPromise = null;
function ensureMath() {
  if (typeof window !== 'undefined' && window.math) return Promise.resolve(window.math);
  if (!_mathPromise) {
    _mathPromise = import('mathjs').then(({ create, all }) => {
      const math = create(all);       // reproduces the old CDN build's preconfigured instance
      if (typeof window !== 'undefined') window.math = math;
      return math;
    });
  }
  return _mathPromise;
}

if (typeof window !== 'undefined') {
  window.ensureMath = ensureMath;
  // Warm the mathjs chunk after boot (idle) so expression fields respond instantly, without
  // putting mathjs on the initial parse path.
  const warm = () => { ensureMath().catch(() => {}); };
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(warm, { timeout: 3000 });
  else setTimeout(warm, 1500);
}
