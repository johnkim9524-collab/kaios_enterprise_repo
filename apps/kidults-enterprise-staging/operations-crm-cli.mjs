import { runCrmCommand } from "./operations-crm.mjs";

try {
  runCrmCommand(process.argv[2] || "build", process.env, process.argv.slice(3));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
