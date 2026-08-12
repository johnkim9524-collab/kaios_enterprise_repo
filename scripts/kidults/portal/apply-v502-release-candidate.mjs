import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";

const root = process.cwd();
const chunkRoot = path.join(root, "scripts", "kidults", "portal", "v502-bundle");
const chunkNames = [
  "part-001.txt",
  "part-002.txt",
  "part-003.txt",
  "part-004.txt",
  "part-005.txt",
  "part-006.txt"
];

const encoded = chunkNames
  .map(name => fs.readFileSync(path.join(chunkRoot, name), "utf8").trim())
  .join("");

const actualHash = crypto.createHash("sha256").update(encoded).digest("hex");
const expectedHash = "02f48fa633662b3594a0ca5145a7a68897ee11a9724cb1e07bce8714eb215df1";
if (actualHash !== expectedHash) {
  throw new Error(`V502 bundle checksum mismatch: ${actualHash}`);
}

const files = JSON.parse(
  zlib.gunzipSync(Buffer.from(encoded, "base64")).toString("utf8")
);

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
  if (fs.existsSync(absolute)) fs.rmSync(absolute, { force: true });
}

if (fs.existsSync(chunkRoot)) {
  fs.rmSync(chunkRoot, { recursive: true, force: true });
}

console.log(`Applied ${Object.keys(files).length} V502 files and removed bootstrap artifacts.`);
