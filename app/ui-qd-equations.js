// =============================================================================
// ui-qd-equations.js — Quadrature ↔ Riemann-map equation-system card (classical
// BOUNDED QD).
//
// Installs via QD_UI.installQdEquations(uiCtx). For a classical bounded QD it
// generates the explicit algebraic system relating the quadrature-function
// coefficients {a_j, C_{j,s}, w₀} to the Riemann-map coefficients {z_j, A_{j,k}}
// (QD.QDEquations.generateClassicalBounded), in either the conjugate-variable
// model over ℚ(i) or the real/imaginary split (QD.QDEquations.reimSplit), renders
// each equation with KaTeX, self-verifies the system against the numeric solution
// (max |eqn| must be ≈0), and exports it as copy-able LaTeX or a CAS-agnostic JSON
// term list. A default-on "Fix φ(0) = w₀" checkbox bakes the solve's selected
// Riemann-map center (centroid of the poles by default) into the equations as an
// exact rational. The "Open in Algebra workspace ↗" button hands the same system
// to the in-browser elimination/Gröbner reducer (the Algebra tab).
//
// The card is hidden for any unbounded or weighted solve (UQD / PQD / LQD) — the
// inverse-system blocks here are specifically the bounded classical ansatz. UI
// only; every bit of math lives in QD.QDEquations / QD.Sym.
// =============================================================================

(function () {
  'use strict';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // KaTeX render — delegate to the shared QD.RiemannLatex.render (loaded before this
  // file per the manifest), with the same plain-text fallback if it's somehow absent.
  function renderKatex(el, expr, display) {
    const RL = window.QD && window.QD.RiemannLatex;
    if (RL && RL.render) { RL.render(el, expr, display); return; }
    if (typeof katex === 'undefined') { el.textContent = expr; return; }
    try { katex.render(expr, el, { displayMode: !!display, throwOnError: false }); }
    catch (e) { el.textContent = expr; }
  }

  // Equations longer than this are elided in the display (KaTeX would be unreadable
  // and slow); the user gets a notice pointing to Export. Generation is unaffected.
  const DISPLAY_TERM_CAP = 120;

  // Robust clipboard write (secure-context API + textarea fallback), then a toast.
  function copyText(text, QD) {
    const done = (ok) => { if (QD.QoL && QD.QoL.toast) QD.QoL.toast(ok ? 'LaTeX copied' : 'Copy failed', ok ? {} : { kind: 'error' }); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => done(true), () => fallback());
    } else { fallback(); }
    function fallback() {
      let ok = false;
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        ok = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (e) { ok = false; }
      done(ok);
    }
  }

  // Strip an equation label down to ASCII for LaTeX \text{} (● / ★ aren't text-mode).
  function asciiLabel(label) {
    return String(label).replace(/●/g, 'locator').replace(/★/g, 'star')
      .replace(/[{}]/g, '').replace(/[^\x20-\x7E]/g, '').trim();
  }

  function installQdEquations(ctx) {
    const QD = window.QD;
    const $ = ctx.$;
    const QE = QD && QD.QDEquations;

    const card    = $('#qd-equations-card');
    const content = $('#qd-equations-content');
    if (!card || !content || !QE) return {};

    const repReim = $('#qdeq-rep-reim');
    const w0Fix   = $('#qdeq-w0-fix');
    const capInp  = $('#qdeq-cap');
    const genBtn  = $('#qdeq-generate');
    const copyBtn = $('#qdeq-copy-latex');
    const jsonBtn = $('#qdeq-download-json');
    const openBtn = $('#qdeq-open-algebra');

    let activeEnv = null;     // latest gated bounded solve envelope
    let lastSystem = null;    // generated system (MPoly eqs) for export
    let lastModel = 'conjugate';
    let debounceTimer = null;

    const STR = (QD.Strings && QD.Strings.qdEquations) || {};
    if (QD.QoL && QD.QoL.attachHelp && STR.help) {
      const h = card.querySelector('h2');
      if (h) QD.QoL.attachHelp(h, STR.help);
    }

    function clampInt(v, lo, hi, dflt) {
      let n = parseInt(v, 10);
      if (!isFinite(n)) n = dflt;
      return Math.max(lo, Math.min(hi, n));
    }
    function setExportEnabled(on) {
      if (copyBtn) copyBtn.disabled = !on;
      if (jsonBtn) jsonBtn.disabled = !on;
    }

    // Classical BOUNDED QD gate — the shared predicate (QD.QDEquations.isClassicalBounded).
    const isClassicalBounded = QE.isClassicalBounded;

    // Render the ansatz + variable-convention legend for the chosen model.
    function renderLegendInto(el, model) {
      el.innerHTML = '';
      const add = (tex) => {
        const d = document.createElement('div');
        d.className = 'qdeq-legend-line';
        el.appendChild(d);
        renderKatex(d, tex, true);
      };
      add('\\varphi(z) = w_0 + \\sum_j \\sum_{k=1}^{m_j} \\bar{A}_{j,k}\\, \\frac{z^{k}}{(1-\\bar{z}_j z)^{k}}');
      add('h(w) = \\sum_j \\sum_{s=1}^{m_j} \\frac{C_{j,s}}{(w-a_j)^{s}}');
      const note = document.createElement('div');
      note.className = 'hint';
      if (model === 'reim') {
        note.innerHTML =
          'Real split: z<sub>j</sub> = x<sub>j</sub> + i&#8201;y<sub>j</sub>, ' +
          'A<sub>j,k</sub> = p<sub>j,k</sub> + i&#8201;q<sub>j,k</sub>, ' +
          'a<sub>j</sub> = a<sub>j</sub><sup>re</sup> + i&#8201;a<sub>j</sub><sup>im</sup>, ' +
          'C<sub>j,s</sub> = C<sub>j,s</sub><sup>re</sup> + i&#8201;C<sub>j,s</sub><sup>im</sup>. ' +
          'Unknowns: x<sub>j</sub>, y<sub>j</sub>, p<sub>j,k</sub>, q<sub>j,k</sub>.';
      } else {
        note.innerHTML =
          'Conjugate model over &#8474;(i): z&#772;<sub>j</sub>, A&#772;<sub>j,k</sub>, … are ' +
          'independent indeterminates (the reality slice z&#772;=conj&#8201;z is applied only at ' +
          'evaluation). Unknowns: z<sub>j</sub>, A<sub>j,k</sub>; parameters: a<sub>j</sub>, ' +
          'C<sub>j,s</sub>, w<sub>0</sub>.';
      }
      el.appendChild(note);
    }

    const BLOCK_TITLES = {
      locator: 'Locator (●):  φ(z_j) = a_j',
      star: 'Principal-part match (★):  C_{j,s} ← A_{j,k}',
      gauge: 'Gauge normalization:  Σ Im A_{j,1} = 0',
    };

    function render(sys, res, model) {
      const lx = QE.systemToLatex(sys);
      const c = sys.counts;
      const nEq = lx.blocks.locator.length + lx.blocks.star.length + lx.blocks.gauge.length;

      content.innerHTML = '';
      const head = [];
      head.push('<div class="geom-row"><span class="key">structure:</span> ' +
        sys.n + ' pole' + (sys.n === 1 ? '' : 's') + ', total order ' + sys.d +
        ' <span class="hint">(' + (model === 'reim' ? 'real/imaginary split' : 'conjugate model over ℚ(i)') + ')</span></div>');
      const breakdown = lx.blocks.locator.length + ' locator + ' + lx.blocks.star.length +
        ' star + ' + lx.blocks.gauge.length + ' gauge';
      if (model === 'reim') {
        // Every equation is already a real-coefficient polynomial in real unknowns.
        head.push('<div class="geom-row"><span class="key">real equations / unknowns:</span> ' +
          nEq + ' / ' + c.realUnknowns + ' <span class="hint">(' + breakdown +
          '; the +1 gauge fixes the rotational freedom)</span></div>');
      } else {
        // Conjugate model: nEq is the count of equations over ℚ(i); the real
        // determinacy (what actually counts) is 2n+2d+1 real eqns over 2(n+d) reals.
        head.push('<div class="geom-row"><span class="key">equations over ℚ(i):</span> ' +
          nEq + ' <span class="hint">(' + breakdown + ')</span></div>');
        head.push('<div class="geom-row"><span class="key">real determinacy:</span> ' +
          c.realEquations + ' equations / ' + c.realUnknowns +
          ' unknowns <span class="hint">(= 2·(n+d) reals; the +1 gauge fixes the rotational freedom)</span></div>');
      }
      // φ(0) normalization line: fixed (the value is baked into the equations as an
      // exact rational — the variable inventory drops w₀/w̄₀) or symbolic.
      if (sys.w0Fixed) {
        const fr = (pair) => (pair[1] === '1' ? pair[0] : pair[0] + '/' + pair[1]);
        // exact a + b·i, sign-aware (b's sign is on its numerator string) so a negative
        // imaginary part reads "… − 2/7·i" rather than the doubled "… + -2/7·i".
        const exactStr = (() => {
          let s = 'exact ' + fr(sys.w0Fixed.re);
          if (sys.w0Fixed.im[0] !== '0') {
            const neg = sys.w0Fixed.im[0][0] === '-';
            s += (neg ? ' − ' : ' + ') + fr([sys.w0Fixed.im[0].replace('-', ''), sys.w0Fixed.im[1]]) + '·i';
          }
          return s;
        })();
        const ax = sys.w0Fixed.approx || { re: 0, im: 0 };
        // provenance is data-derived: the default φ(0) is the centroid of the poles
        let cRe = 0, cIm = 0;
        const ps = (activeEnv && activeEnv.hData && activeEnv.hData.poles) || [];
        for (const p of ps) { cRe += p.a.re; cIm += p.a.im; }
        if (ps.length) { cRe /= ps.length; cIm /= ps.length; }
        const isCentroid = ps.length && Math.hypot(ax.re - cRe, ax.im - cIm) < 1e-12;
        const mode = isCentroid ? 'centroid of the poles (default)' : 'manual selection';
        head.push('<div class="geom-row"><span class="key">φ(0) = w₀ fixed:</span> ' +
          esc(QD.Complex ? QD.Complex.toString(ax, 6) : (ax.re + (ax.im >= 0 ? '+' : '') + ax.im + 'i')) +
          ' <span class="hint">(' + esc(exactStr) +
          '; ' + esc(mode) + ' — change under Map parameters ▸ Riemann map center φ(0))</span></div>');
      } else {
        head.push('<div class="geom-row"><span class="key">φ(0) = w₀:</span> ' +
          '<span class="hint">symbolic parameter (tick “Fix φ(0)” to substitute the selected center)</span></div>');
      }
      const verified = res.max < 1e-6;
      head.push('<div class="geom-row"><span class="' + (verified ? 'ok' : 'warn') + '">' +
        (verified ? '✓' : '⚠') + '</span> <span class="key">self-check:</span> ' +
        'max |eqn| at the numeric solution = ' + res.max.toExponential(2) +
        (verified ? '' : ' <span class="hint">(expected ≈0 — solution may be inexact)</span>') + '</div>');
      content.insertAdjacentHTML('beforeend', head.join(''));

      const legend = document.createElement('div');
      legend.className = 'qdeq-legend';
      content.appendChild(legend);
      renderLegendInto(legend, model);

      for (const block of ['locator', 'star', 'gauge']) {
        const items = lx.blocks[block];
        if (!items.length) continue;
        const sec = document.createElement('div');
        sec.className = 'qdeq-block';
        const title = document.createElement('div');
        title.className = 'key qdeq-block-title';
        title.textContent = BLOCK_TITLES[block] || block;
        sec.appendChild(title);
        for (const it of items) {
          const row = document.createElement('div');
          row.className = 'qdeq-eq';
          const lab = document.createElement('div');
          lab.className = 'hint qdeq-eq-label';
          lab.textContent = it.label;
          row.appendChild(lab);
          const math = document.createElement('div');
          math.className = 'qdeq-eq-math';
          if (it.terms > DISPLAY_TERM_CAP) {
            math.innerHTML = '<span class="hint">[' + it.terms +
              ' terms — too large to display; use “Copy LaTeX” / “Download JSON”]</span>';
          } else {
            renderKatex(math, it.latex, true);
          }
          row.appendChild(math);
          sec.appendChild(row);
        }
        content.appendChild(sec);
      }
    }

    function generate() {
      if (!activeEnv) return;
      const phi = activeEnv.primary.phi;
      const hData = activeEnv.hData;
      const model = (repReim && repReim.checked) ? 'reim' : 'conjugate';
      lastModel = model;
      const cap = clampInt(capInp ? capInp.value : 6, 1, 12, 6);
      if (capInp && String(cap) !== capInp.value) capInp.value = String(cap);

      // Fix φ(0)=w₀ to the solve's selected center (the Map-parameters φ(0) control:
      // CENTROID OF THE POLES by default, or the user's manual value). Changing the
      // selection re-solves and republishes, which regenerates the system here.
      const w0Sel = (w0Fix && !w0Fix.checked) ? null : (activeEnv.w0Used || phi.w0);

      let displaySys, res;
      try {
        const sys = QE.generateClassicalBounded(hData, { maxPoleOrder: cap, w0: w0Sel || undefined });
        if (model === 'reim') {
          displaySys = QE.reimSplit(sys);
          res = QE.residualReimAtSolution(displaySys, phi, hData);
        } else {
          displaySys = sys;
          res = QE.residualAtSolution(displaySys, phi, hData);
        }
      } catch (e) {
        lastSystem = null;
        setExportEnabled(false);
        content.innerHTML = '<div class="warn">' +
          esc(STR.unavailablePrefix || 'Equation generation unavailable: ') +
          esc((e && e.message) || String(e)) + '</div>';
        return;
      }
      lastSystem = displaySys;
      render(displaySys, res, model);
      setExportEnabled(true);
    }

    function generateDebounced() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(generate, 150);
    }

    // Full-system LaTeX (a gathered list) for "Copy LaTeX".
    function fullLatex(sys) {
      const lx = QE.systemToLatex(sys);
      const lines = [];
      for (const block of ['locator', 'star', 'gauge']) {
        for (const it of lx.blocks[block]) {
          lines.push('\\text{[' + asciiLabel(it.label) + ']}\\quad ' + it.latex);
        }
      }
      return '\\begin{gathered}\n' + lines.join(' \\\\[4pt]\n') + '\n\\end{gathered}';
    }

    function downloadJson() {
      if (!lastSystem) return;
      const data = QE.systemToExport(lastSystem);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'qd-equations-' + lastModel + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 0);
      if (QD.QoL && QD.QoL.toast) QD.QoL.toast('Exported ' + data.equations.length + ' equations (JSON)');
    }

    // Controls.
    if (genBtn)  genBtn.addEventListener('click', generate);
    if (copyBtn) copyBtn.addEventListener('click', () => { if (lastSystem) copyText(fullLatex(lastSystem), QD); });
    if (jsonBtn) jsonBtn.addEventListener('click', downloadJson);
    // Hand off to the full Algebra workspace (tab installed separately; resolved at click time).
    if (openBtn) openBtn.addEventListener('click', () => { if (ctx.openAlgebra) ctx.openAlgebra(); });
    if (capInp)  capInp.addEventListener('input', generateDebounced);
    if (w0Fix)   w0Fix.addEventListener('change', generate);
    const repInputs = card.querySelectorAll('input[name="qdeq-rep"]');
    for (let i = 0; i < repInputs.length; i++) repInputs[i].addEventListener('change', generate);

    // A manual edit invalidates the current solution: grey the card until re-solve.
    document.addEventListener('qd-customized', () => {
      if (!activeEnv) return;
      lastSystem = null;
      setExportEnabled(false);
      content.innerHTML = '<div class="hint">' +
        esc(STR.pending || 'solving… equation system pending') + '</div>';
    });

    // Refresh on every fresh primary solution. Show only for classical bounded QD.
    if (QD.PrimarySolution && QD.PrimarySolution.subscribe) {
      QD.PrimarySolution.subscribe((env) => {
        const phi = env && env.success && env.primary && env.primary.phi;
        const hData = env && env.hData;
        if (!isClassicalBounded(phi, hData)) {
          activeEnv = null; lastSystem = null;
          setExportEnabled(false);
          card.classList.add('hidden');
          return;
        }
        activeEnv = env;
        card.classList.remove('hidden');
        generate();   // fast for typical bounded orders (≤ cap); on-demand for the rest
      });
    }

    return {};
  }

  window.QD_UI = window.QD_UI || {};
  window.QD_UI.installQdEquations = installQdEquations;
})();
