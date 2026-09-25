import fs from 'node:fs';
import path from 'node:path';
import {
  currentGitHead,
  DEFAULT_PATHS,
  loadTrackZInputs,
  runTrackZControlCycle
} from './lib/track-z-control-engine-v1.mjs';

function parseArgs(argv) {
  const options = { output: null, observedAt: null, sourceRef: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') options.output = argv[++index];
    else if (arg === '--observed-at') options.observedAt = argv[++index];
    else if (arg === '--source-ref') options.sourceRef = argv[++index];
    else throw new Error(`UNKNOWN_ARGUMENT:${arg}`);
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const { inputs, inputDigests } = loadTrackZInputs(DEFAULT_PATHS);
const receipt = runTrackZControlCycle({
  ...inputs,
  inputDigests,
  observedAt: options.observedAt ?? new Date().toISOString(),
  sourceRef: options.sourceRef ?? process.env.GITHUB_SHA ?? currentGitHead()
});

const rendered = `${JSON.stringify(receipt, null, 2)}\n`;
if (options.output) {
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, rendered, { flag: 'wx' });
}
process.stdout.write(rendered);
