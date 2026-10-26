// Renders the YouTube thumbnails (1280x720 PNG) from thumbnail.html.
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
for (const [lang, name] of [["en", "thumbnail.png"], ["hi", "thumbnail-hi.png"]]) {
  await page.goto(`file://${path.join(here, "thumbnail.html")}?lang=${lang}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(here, "out", name) });
}
await browser.close();
