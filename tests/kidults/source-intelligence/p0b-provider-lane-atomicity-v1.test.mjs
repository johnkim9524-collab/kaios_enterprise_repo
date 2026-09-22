import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const builder = path.resolve('scripts/kidults/source-intelligence/asi-openalex-gdelt-public-metadata-discovery-v1.mjs');
const validator = path.resolve('scripts/kidults/source-intelligence/validate-asi-openalex-gdelt-public-metadata-discovery-v1.mjs');

test('failed provider lane rolls back candidates observed before the failure', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p0b-lane-atomicity-'));
  const output = path.join(root, 'discovery.json');
  const circuit = path.join(root, 'circuit.json');
  const hook = path.join(root, 'fetch-hook.mjs');
  fs.writeFileSync(hook, `
let openAlexCalls = 0;
const headers = type => ({get: name => String(name).toLowerCase() === 'content-type' ? type : null});
globalThis.fetch = async url => {
  const text = String(url);
  if (text.startsWith('https://api.openalex.org/works')) {
    openAlexCalls += 1;
    if (openAlexCalls === 1) {
      return {
        ok: true, status: 200, headers: headers('application/json'),
        json: async () => ({results: [{
          id: 'https://openalex.org/W1',
          display_name: 'fixture work',
          primary_location: {
            landing_page_url: 'https://fixture.example/item/1',
            source: {display_name: 'Fixture Source', host_organization_name: 'Fixture Owner'}
          },
          locations: []
        }]})
      };
    }
    return {ok:false,status:400,headers:headers('application/json'),json:async()=>({})};
  }
  if (text.startsWith('https://api.gdeltproject.org/api/v2/doc/doc')) {
    return {ok:false,status:400,headers:headers('application/json'),json:async()=>({})};
  }
  throw new Error('UNEXPECTED_NETWORK:' + text);
};
`);
  const env = {
    ...process.env,
    ASI_SCOPE_ROTATION: '0',
    ASI_PROVIDER_CIRCUIT: circuit,
    GITHUB_WORKFLOW: 'KIDULTS ASI P0B Bounded Discovery Candidates v1',
  };
  try {
    const built = spawnSync(process.execPath, ['--import', pathToFileURL(hook).href, builder, output], {
      encoding: 'utf8', env, timeout: 15000,
    });
    assert.equal(built.status, 0, built.stderr);
    const payload = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(payload.healthy_lane_count, 0);
    assert.equal(payload.candidate_count, 0);
    assert.deepEqual(payload.candidates, []);
    assert.equal(payload.lane_health.find(row => row.lane_id.startsWith('OPENALEX_')).status, 'FAILED');
    assert.equal(payload.lane_health.find(row => row.lane_id.startsWith('GDELT_')).status, 'FAILED');
    assert.equal(payload.provider_circuit_writeback_applied, true);

    const checked = spawnSync(process.execPath, [validator, output, '--allow-provider-unavailability'], {
      encoding: 'utf8', env, timeout: 10000,
    });
    assert.equal(checked.status, 0, checked.stderr);
    const verdict = JSON.parse(checked.stdout.trim());
    assert.equal(verdict.status, 'PASS_STRUCTURAL_PROVIDER_UNAVAILABLE');
    assert.equal(verdict.promotion_eligible, false);
  } finally {
    fs.rmSync(root, {recursive:true, force:true});
  }
});
