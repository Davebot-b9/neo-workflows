const fs = require("fs");
const path = require("path");
const css = fs.readFileSync(path.join(__dirname, "fonts", "fonts.css"), "utf8");
const blocks = css.split("@font-face").slice(1);
for (const b of blocks) {
  const family = (b.match(/font-family:\s*'([^']+)'/) || [])[1];
  const weight = (b.match(/font-weight:\s*(\d+)/) || [])[1];
  const range = (b.match(/unicode-range:\s*([^;]+);/) || [])[1];
  const url = (b.match(/url\(([^)]+)\)/) || [])[1];
  console.log(family, weight, "|", range ? range.slice(0, 50) : "NO-RANGE", "|", url);
}
