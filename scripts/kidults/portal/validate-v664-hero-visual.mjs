import process from "node:process";

// V666 is the active presentation layer and must preserve every V664 visual
// invariant while adding the one-surface, rhythm and density closure gates.
// Keep the legacy workflow/artifact contract alive, but execute the stronger
// V666 browser validation instead of asserting obsolete version strings.
if (!process.env.KIDULTS_V666_OUTPUT && process.env.KIDULTS_V664_OUTPUT) {
  process.env.KIDULTS_V666_OUTPUT = process.env.KIDULTS_V664_OUTPUT;
}

await import("./validate-v666-experience-closure.mjs");
