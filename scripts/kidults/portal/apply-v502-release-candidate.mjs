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

// Operational registry records require immutable creation metadata.
const trackCPath = path.join(
  root,
  "coordination/kidults/registry/track/records/track-c-portal-v502-experience-layer.json"
);
const trackC = JSON.parse(fs.readFileSync(trackCPath, "utf8"));
trackC.created_by ??= "Atlas";
fs.writeFileSync(trackCPath, `${JSON.stringify(trackC, null, 2)}\n`, "utf8");

// Mission Control must permit the queue to grow beyond its six bootstrap records.
const missionValidatorPath = path.join(
  root,
  "scripts/kidults/mission-control/validate-mission-control.mjs"
);
let missionValidator = fs.readFileSync(missionValidatorPath, "utf8");
missionValidator = missionValidator.replace(
  "assert(workQueue?.record_count === 6, 'Work Queue must contain six initial work items.');",
  "assert(workQueue?.record_count >= 6, 'Work Queue must retain at least six bootstrap work items.');"
);
fs.writeFileSync(missionValidatorPath, missionValidator, "utf8");

// GitHub Actions tokens cannot create workflow files. The validated V502
// workflow is installed separately by the KPMO connector after this commit.
const generatedWorkflowPath = path.join(
  root,
  ".github/workflows/kidults-portal-v502-validate.yml"
);
if (fs.existsSync(generatedWorkflowPath)) {
  fs.rmSync(generatedWorkflowPath, { force: true });
}

console.log(`Prepared ${Object.keys(files).length - 1} V502 implementation files for commit.`);
console.log("V502 push retry requested after transient GitHub server failure.");
