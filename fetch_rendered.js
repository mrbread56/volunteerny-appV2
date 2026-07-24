import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto('https://volunteer-ny.web.app/', { waitUntil: 'networkidle0' });
  const html = await page.content();
  const fs = require('fs');
  fs.writeFileSync('rendered_live_site.html', html);
  await browser.close();
})();
