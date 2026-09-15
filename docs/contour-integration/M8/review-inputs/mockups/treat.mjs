import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1248, height: 664 } });
for (const rec of ['semicircle-quartic', 'mellin-keyhole']) for (const t of ['current','quiet','iso','local','white','light']) {
  await page.goto(`http://localhost:5178/treat.html?rec=${rec}&t=${t}`); await page.waitForTimeout(1500);
  await page.locator('#c').screenshot({ path: `../mock/T-${rec}-${t}.jpg`, type: 'jpeg', quality: 88 });
}
await browser.close();
