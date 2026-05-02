// One-shot script: render the Clear crystal SVG (extracted from ide.html
// toolbar) to a 256x256 PNG suitable for wrapping into a Windows ICO. Uses
// the playwright dep already in package.json; no new install needed.
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PNG = join(__dirname, '..', 'clear-icon-256.png');

const html = `<!doctype html>
<html><head><style>
  html,body { margin:0; padding:0; background: transparent; }
  body { width:256px; height:256px; display:flex; align-items:center; justify-content:center; }
</style></head><body>
<svg width="256" height="256" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="clr-lg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#4ab8d8"/>
      <stop offset="100%" stop-color="#1a6a85"/>
    </linearGradient>
  </defs>
  <path d="M16 2L4 10v12l12 8 12-8V10L16 2z" fill="url(#clr-lg)" opacity="0.9"/>
  <path d="M16 2L4 10l12 8 12-8L16 2z" fill="white" opacity="0.25"/>
  <path d="M4 10l12 8v12L4 22V10z" fill="#000" opacity="0.1"/>
</svg>
</body></html>`;

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(html);
  const buf = await page.screenshot({ omitBackground: true, type: 'png', clip: { x: 0, y: 0, width: 256, height: 256 } });
  writeFileSync(OUT_PNG, buf);
  console.log('PNG written: ' + OUT_PNG + ' (' + buf.length + ' bytes)');
} finally {
  await browser.close();
}
