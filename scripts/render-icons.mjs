import { readFile, mkdir } from "node:fs/promises";
import { URL, fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const output = new URL("../apps/client/public/icons/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [name, size, maskable] of [
    ["apple-touch-icon", 180, false],
    ["icon-192", 192, false],
    ["icon-512", 512, false],
    ["icon-maskable-512", 512, true],
    ["favicon-32", 32, false],
  ]) {
    const source = await readFile(
      new URL(`../apps/client/icons/icon-e${maskable ? "-maskable" : ""}.svg`, import.meta.url),
      "utf8",
    );
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}body>svg{display:block;width:100%;height:100%}</style>${source}`,
    );
    await page
      .locator("svg")
      .first()
      .evaluate(async (svg) => {
        const images = [...svg.querySelectorAll("image")];
        await Promise.all(
          images.map(
            (image) =>
              new Promise((resolve, reject) => {
                const decoded = new Image();
                decoded.onload = resolve;
                decoded.onerror = reject;
                decoded.src = image.getAttribute("href");
              }),
          ),
        );
      });
    await page.screenshot({
      path: fileURLToPath(new URL(`${name}.png`, output)),
      omitBackground: false,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
