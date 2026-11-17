const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const dir = __dirname;
let html = fs.readFileSync(path.join(dir, "manual.html"), "utf8");
const interB64 = fs.readFileSync(path.join(dir, "fonts", "inter.b64.txt"), "utf8").trim();
const jbmB64 = fs.readFileSync(path.join(dir, "fonts", "jbm.b64.txt"), "utf8").trim();
html = html.replace("__INTER_B64__", interB64).replace("__JBM_B64__", jbmB64);
const outHtml = path.join(dir, "manual.embedded.html");
fs.writeFileSync(outHtml, html);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("file://" + outHtml.replace(/\\/g, "/"), { waitUntil: "networkidle" });
  await page.evaluate(async () => { await document.fonts.ready; });

  // PDF final
  await page.pdf({
    path: path.join(dir, "NEO-Workflows-Manual.pdf"),
    format: "A4",
    margin: { top: "0", bottom: "0", left: "0", right: "0" },
    printBackground: true,
  });

  // Verificacion visual: screenshot de cada .page tal como se ve en el navegador
  await page.setViewportSize({ width: 794, height: 1123 });
  const count = await page.locator(".page").count();
  fs.mkdirSync(path.join(dir, "verify"), { recursive: true });
  for (let i = 0; i < count; i++) {
    await page.locator(".page").nth(i).screenshot({ path: path.join(dir, "verify", `page-${i + 1}.png`) });
  }
  console.log("OK paginas:", count);
  await browser.close();
})();
