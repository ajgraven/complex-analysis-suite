import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const shots = [['G',1440,900]];
for (const [n,w,h] of shots) { const page = await browser.newPage({ viewport: { width: w, height: h } }); await page.goto(`http://localhost:5178/${n}.html`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200); await page.screenshot({ path: `../mock/L-${n}-${w}.png` }); await page.close(); }
await browser.close();
