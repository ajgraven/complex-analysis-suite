import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = '../layers';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
await page.goto('http://localhost:5177/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.locator('button', { hasText: 'Gallery' }).first().click({ force: true });
await page.waitForTimeout(800);
const meta = {};
for (const rec of ['semicircle-quartic', 'jordan-cosine-kernel', 'mellin-keyhole', 'indented-sinc']) {
  await page.getByLabel('gallery record').selectOption(rec);
  await page.waitForTimeout(1800);
  const info = await page.evaluate(() => {
    const stage = document.querySelector('.stage');
    const canvases = Array.from(stage.querySelectorAll('canvas')).map(c => ({ cls: c.className, w: c.width, h: c.height, data: c.toDataURL('image/png') }));
    const rect = stage.getBoundingClientRect();
    const poles = Array.from(document.querySelectorAll('.pole')).map(p => { const r = p.getBoundingClientRect(); return { x: r.left + r.width/2 - rect.left, y: r.top + r.height/2 - rect.top, text: p.textContent, title: p.getAttribute('title') || p.getAttribute('aria-label') }; });
    const handles = Array.from(document.querySelectorAll('.overlay *')).slice(0,0);
    return { rect: { w: rect.width, h: rect.height }, canvases: canvases.map(c => ({cls: c.cls, w: c.w, h: c.h})), poles, hash: location.hash, data: canvases.map(c => c.data) };
  });
  info.data.forEach((d, i) => fs.writeFileSync(`${OUT}/${rec}-${info.canvases[i].cls.replace(/\s+/g,'_') || i}.png`, Buffer.from(d.split(',')[1], 'base64')));
  delete info.data;
  meta[rec] = info;
  await page.screenshot({ path: `${OUT}/${rec}-full.png` });
}
fs.writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 1));
console.log(JSON.stringify(meta, null, 1));
await browser.close();
