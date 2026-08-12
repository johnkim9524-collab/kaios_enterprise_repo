import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";

const root = process.cwd();
const bundle = "H4sIAFkUnWkC/+19bW/bNrL2VxD4d4N7b0V2FEdxL8NNm3R5e+12u7RMd2mRokhKSk6b5v77u5JUSZRiJa8eOQ9NmpQ0OUok5+OzQ4xVn7/d3p2dnYV/+L36dHp8/X51+vD4+vr9+/fXn+/Pr8fHLy/fHn79+vP757fff7n79+v3w+Pj5x8ePH7/++OnP77/++Pzj8+fHn//84+PXx+ePHx6fP/71x8fHr7/+8fHz4+PHH5/fPr76+ffPj48fH59//f7x8ePjzz8+fvr88fHHp7/+/PHzj48fH79//fHx48fHPz5+/Prg9fHr9/8B4l0Puq0BAAA=";
const files = JSON.parse(zlib.gunzipSync(Buffer.from(bundle, "base64")).toString("utf8"));

for (const [relative, content] of Object.entries(files)) {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content, "utf8");
  console.log(`WRITE ${relative}`);
}

for (const relative of [
  "scripts/kidults/portal/apply-v502-release-candidate.mjs",
  ".github/workflows/kidults-apply-v502.yml"
]) {
  const absolute = path.join(root, relative);
  if (fs.existsSync(absolute)) fs.rmSync(absolute);
}

console.log(`Applied ${Object.keys(files).length} V502 files and removed bootstrap files.`);
