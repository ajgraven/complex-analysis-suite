(() => {
const TEX = {
 target: String.raw`\int_{-\infty}^{\infty}\frac{dx}{1+x^{4}}`,
 f: String.raw`f(z)=\frac{1}{1+z^{4}}`,
 answer: String.raw`\frac{\pi}{\sqrt2}`,
 res: String.raw`\oint_{\gamma} f\,dz = 2\pi i\sum_{k}\operatorname{Ind}_{\gamma}(a_k)\operatorname{Res}(f,a_k)`,
};
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; };
const tex = (s, disp=false, cls='') => `<span class="tex ${cls}" data-tex="${s.replace(/"/g,'&quot;')}" data-disp="${disp}"></span>`;
const T = (s, cls='') => `<span class="tex ${cls}" data-tex="${s.replace(/"/g,'&quot;')}"></span>`;

const P = {
 target: () => `<div class="card"><h2>Target integral <span class="r">gallery · rational on ℝ</span></h2>${tex(TEX.target, true, 'c')}<div class="preview">Closed by an upper semicircle. Ahlfors §4.5.3 · Stein–Shakarchi Ch. 3 Ex. 2</div></div>`,
 integrand: () => `<div class="card"><h2>Integrand</h2><div class="input"><span class="k">f(z) =</span><span>1/(1+z^4)</span></div><div class="preview">${T(String.raw`f(z)=\dfrac{1}{1+z^{4}}`)}<span style="margin-left:auto;color:var(--ok)">✓ parsed</span></div></div>`,
 params: () => `<div class="card"><h2>Parameters</h2><div class="slider"><span class="lab">R = 4</span><div class="track"><i></i></div></div><div class="preview">Drag the handle on the arc, or the slider, or the number in the derivation. One value.</div></div>`,
 pieces: () => `<div class="card"><h2>Contour <span class="r">closed · counter-clockwise</span></h2>
  <div class="row"><span class="grip">⋮⋮</span><span class="chip" style="background:var(--c1)"></span><span class="name">${T(String.raw`[-R,\,R]`)} <span style="color:var(--mut);font-size:11.5px">real segment</span></span><span class="tag t">target</span><span class="val num">2.2214</span></div>
  <div class="row"><span class="grip">⋮⋮</span><span class="chip" style="background:var(--c2)"></span><span class="name">${T(String.raw`\Gamma_R`)} <span style="color:var(--mut);font-size:11.5px">upper semicircle, |z| = R</span></span><span class="tag v">vanishes</span><span class="val num">−0.0002</span></div>
  <div class="tools"><span class="btn">＋ piece</span><span class="btn">Template ▾</span><span class="btn">Draw</span><span class="btn">Reverse</span></div></div>`,
 cuts: () => `<div class="card"><h2>Branch cuts</h2><div class="preview">None. The integrand is single-valued.</div><div class="tools"><span class="btn">＋ branch point</span></div></div>`,
 poles: () => `<div class="card"><h2>Singularities <span class="r">exact over ℚ(i)(√2)</span></h2><table class="t"><tr><th>point</th><th>order</th><th>Res</th><th>Ind</th></tr>
  <tr><td>${T(String.raw`e^{i\pi/4}`)}</td><td class="n">1</td><td>${T(String.raw`-\tfrac{1}{4}e^{i\pi/4}`)}</td><td class="n">1</td></tr>
  <tr><td>${T(String.raw`e^{3i\pi/4}`)}</td><td class="n">1</td><td>${T(String.raw`-\tfrac{1}{4}e^{3i\pi/4}`)}</td><td class="n">1</td></tr>
  <tr><td>${T(String.raw`e^{5i\pi/4}`)}</td><td class="n">1</td><td>${T(String.raw`-\tfrac{1}{4}e^{5i\pi/4}`)}</td><td class="n">0</td></tr>
  <tr><td>${T(String.raw`e^{7i\pi/4}`)}</td><td class="n">1</td><td>${T(String.raw`-\tfrac{1}{4}e^{7i\pi/4}`)}</td><td class="n">0</td></tr></table></div>`,
 verdict: (open=false) => `<div class="card"><h2>Result</h2><div class="verdict"><span class="badge eq">=</span><span class="big">${T(String.raw`\int_{-\infty}^{\infty}\frac{dx}{1+x^{4}}=\frac{\pi}{\sqrt2}`)}</span></div>
  <div class="hyp">✓ Hypotheses verified <span class="chev">${open?'▾':'▸'}</span></div>
  ${open?`<div class="hyptab"><b>Hypotheses</b><span><span class="ok">✓</span> closed, oriented, no singularity on γ, no cuts</span><b>Residues</b><span><span class="ok">✓</span> 2 poles enclosed, Ind = 1, residues exact</span><b>Boundary terms</b><span><span class="ok">✓</span> ${T(String.raw`\Gamma_R`)} vanishes: ${T(String.raw`\le \pi R/(R^{4}-1)`)}</span><b>Target</b><span><span class="ok">✓</span> ${T(String.raw`[-R,R]`)} is the target as R → ∞</span></div>`:''}
  <div class="line" style="margin-top:8px"><span class="badge le" style="width:20px;height:20px;font-size:12px">≤</span><span class="mut">quadrature agrees to 2.0e-15</span></div>
  <details class="disc"><summary>Numerics</summary></details></div>`,
 derivation: (stepIdx=3) => `<div class="card"><h2>Derivation <span class="r">user-driven · step ${stepIdx} of 7</span></h2>
  <div class="stepper"><span class="btn">‹ Prev</span><span class="btn pri">Next ›</span><span class="pos">3 / 7</span><span class="dots"><i class="done"></i><i class="done"></i><i class="cur"></i><i></i><i></i><i></i><i></i></span><span class="btn" style="margin-left:6px">All</span></div>
  <div class="step"><h3>3. Bound the integral over ${T(String.raw`\Gamma_R`)}</h3>
  ${tex(String.raw`\Bigl|\int_{\Gamma_R} f(z)\,dz\Bigr| \le \pi R\cdot\max_{\Gamma_R}|f| \le \frac{\pi R}{R^{4}-1}`, true, 'c')}
  <div class="just">On ${T(String.raw`|z|=R`)}, ${T(String.raw`|1+z^{4}|\ge R^{4}-1`)}; the arc has length ${T(String.raw`\pi R`)}. Let R = <span class="scrub">4</span>: the bound is <b class="num">0.0493</b>, and → 0 as R → ∞ since it is ${T(String.raw`O(R^{-3})`)}.</div>
  <div class="why">Certified in exact ℚ; π enters only through a rational upper bracket.</div></div></div>`,
 share: () => `<div class="card"><h2>Share</h2><div class="tools"><span class="btn">Copy link</span><span class="btn">Save figure ▾</span><span class="btn">Copy figure</span></div><div class="preview">Figure: dark · light · print</div></div>`,
};
const readout = () => `<div class="readout"><span class="k">z =</span> 1.500 + 0.800i<br><span class="k">f(z) =</span> 0.121 − 0.187i<br><span class="k">|f| =</span> 0.223 &nbsp; <span class="k">arg f =</span> −57.1°</div>`;
const strip = () => `<div class="acc"><svg viewBox="0 0 900 200" preserveAspectRatio="xMidYMid meet"><line x1="0" y1="150" x2="900" y2="150" stroke="#2a3140"/><line x1="120" y1="0" x2="120" y2="200" stroke="#2a3140"/>
 <path d="M120 150 L 760 150" stroke="#7cb4ff" stroke-width="2.5" fill="none"/><path d="M760 150 c 30 -40, 40 -50, 30 -60 c -8 -6, -18 -2, -20 10" stroke="#f2a65a" stroke-width="2.5" fill="none"/>
 <circle cx="560" cy="150" r="5" fill="#fff"/><text x="560" y="140" fill="#9aa3b2" font-size="11" text-anchor="middle" font-family="monospace">Σ so far</text>
 <text x="120" y="170" fill="#9aa3b2" font-size="11" font-family="monospace">0</text><text x="770" y="80" fill="#9aa3b2" font-size="11" font-family="monospace">π/√2</text></svg></div>
 <div class="accside"><h2>Partial sum <span style="text-transform:none;letter-spacing:0">Σ f(zₖ)·Δzₖ</span></h2><div class="mono">1.6312 + 0.0000i</div><div class="sub">step 620 of 1000 · on ${T(String.raw`[-R,R]`)}</div>
 <div class="sc"><span class="btn" style="padding:1px 6px">▶</span><div class="track"><i></i></div></div>
 <div class="sub" style="margin-top:10px">At this step</div><div class="mono">Δz = 0.0080 &nbsp;&nbsp; f(z)·Δz = 0.0017 + 0.0000i</div><div class="sub">|f| = 0.213 scales, arg f = 0° rotates. <span style="color:var(--mut)">compare: Σz · Σf(z) · ΣΔz</span></div></div>`;
P.derivation4 = () => `<div class="card"><h2>Derivation <span class="r">worked example · step 4 of 7</span></h2>
  <div class="stepper"><span class="btn">‹ Prev</span><span class="btn pri">Next ›</span><span class="pos">4 / 7</span><span class="dots"><i class="done"></i><i class="done"></i><i class="done"></i><i class="cur"></i><i></i><i></i><i></i></span><span class="btn" style="margin-left:6px">All</span></div>
  <div class="step"><h3>4. Let R → ∞</h3>
  ${tex(String.raw`\int_{-R}^{R}\frac{dx}{1+x^{4}} + \int_{\Gamma_R} f\,dz = 2\pi i\sum_{\operatorname{Im}a_k>0}\operatorname{Res}(f,a_k)`, true, 'c')}
  <div class="just">The right side does not depend on R once R > 1. The arc term is bounded by ${T(String.raw`\pi R/(R^{4}-1)`)}, so the segment term tends to the target.</div>
  <div class="slider" style="margin-top:10px"><span class="lab">R = 12.0</span><div class="track"><i style="left:58%"></i></div><span class="btn" style="padding:1px 6px">▶</span></div>
  <table class="t"><tr><th>R</th><th>segment</th><th>arc bound</th><th>arc (measured)</th></tr><tr><td class="n">2</td><td class="n">2.0134</td><td class="n">0.4189</td><td class="n">−0.2081</td></tr><tr><td class="n">4</td><td class="n">2.2151</td><td class="n">0.0493</td><td class="n">−0.0063</td></tr><tr><td class="n">12</td><td class="n">2.2212</td><td class="n">0.0018</td><td class="n">−0.0002</td></tr><tr><td class="n">∞</td><td class="n">π/√2</td><td class="n">0</td><td class="n">0</td></tr></table>
  <div class="why">Rows are computed as you drag; the bound column is certified, the measured column is quadrature (≈).</div></div></div>`;
window.MOCK = { P, T, tex, readout, strip, el };
window.renderTex = () => document.querySelectorAll('.tex').forEach(n => { try { katex.render(n.dataset.tex, n, { displayMode: n.dataset.disp === 'true', throwOnError: false }); } catch (e) { n.textContent = n.dataset.tex; } });

})();
