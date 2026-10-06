import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(process.argv[2] ?? "artifacts/agci-os/candidate-r2-preflight-r1");

function runGate(scriptName) {
  const script = path.join(here, scriptName);
  const result = spawnSync(process.execPath, [script, output], { stdio: "inherit" });
  if (result.error) {
    console.error(`Failed to execute ${scriptName}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

runGate("validate-candidate-r2-preflight-structure.mjs");
runGate("validate-candidate-r2-advancement.mjs");
