import { pathToFileURL } from 'node:url';

const sha40 = /^[0-9a-f]{40}$/;

export function buildReceipt(input) {
  const expectedRepository = String(input.expected_repository || '').trim();
  const upstreamRepository = String(input.upstream_repository || '').trim();
  const upstreamBranch = String(input.upstream_branch || '').trim();
  const upstreamSha = String(input.upstream_sha || '').trim().toLowerCase();
  const liveMainSha = String(input.live_main_sha || '').trim().toLowerCase();
  const upstreamConclusion = String(input.upstream_conclusion || '').trim().toLowerCase();
  const upstreamRunId = String(input.upstream_run_id || '').trim();
  const upstreamRunAttempt = Number(input.upstream_run_attempt || 0);

  const findings = [];
  if (!expectedRepository || upstreamRepository !== expectedRepository) findings.push('UPSTREAM_REPOSITORY_MISMATCH');
  if (upstreamBranch !== 'main') findings.push('UPSTREAM_BRANCH_NOT_MAIN');
  if (!sha40.test(upstreamSha)) findings.push('UPSTREAM_SHA_MALFORMED');
  if (!sha40.test(liveMainSha)) findings.push('LIVE_MAIN_SHA_MALFORMED');
  if (sha40.test(upstreamSha) && sha40.test(liveMainSha) && upstreamSha !== liveMainSha) findings.push('UPSTREAM_NOT_CURRENT_PROTECTED_MAIN');
  if (!upstreamRunId || !/^\d+$/.test(upstreamRunId)) findings.push('UPSTREAM_RUN_ID_MALFORMED');
  if (!Number.isInteger(upstreamRunAttempt) || upstreamRunAttempt < 1) findings.push('UPSTREAM_RUN_ATTEMPT_MALFORMED');
  if (upstreamConclusion !== 'success') findings.push(`UPSTREAM_CONCLUSION_${(upstreamConclusion || 'MISSING').toUpperCase()}`);

  const terminalState = findings.length === 0 ? 'VERIFIED_PASS' : 'VERIFIED_FAIL';
  return {
    id: 'kidults-asi-self-driving-terminal-receipt-v1',
    version: '1.0.0',
    control: 'SELF_DRIVING_TERMINALIZATION',
    scope: 'INTERNAL_CONTROL_ONLY_NOT_EMPIRICAL_PROOF',
    terminal_state: terminalState,
    findings,
    upstream: {
      workflow: 'KIDULTS ASI Self-Driving Control Loop v1',
      repository: upstreamRepository || null,
      branch: upstreamBranch || null,
      run_id: upstreamRunId || null,
      run_attempt: upstreamRunAttempt || null,
      conclusion: upstreamConclusion || null,
      head_sha: upstreamSha || null
    },
    protected_main: {
      expected_repository: expectedRepository || null,
      live_sha: liveMainSha || null,
      exact_upstream_binding: Boolean(sha40.test(upstreamSha) && sha40.test(liveMainSha) && upstreamSha === liveMainSha)
    },
    promotion_eligible: false,
    empirical_authority: false,
    content_acquisition_authorized: false,
    provider_activation_authorized: false,
    credential_mutation_authorized: false,
    external_spend_authorized: false,
    database_write_authorized: false,
    cloudflare_mutation_authorized: false,
    public_release: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD'
  };
}

function parseCli(argv) {
  if (argv.length !== 8) throw new Error('USAGE: expected_repository upstream_repository upstream_branch upstream_sha live_main_sha upstream_conclusion upstream_run_id upstream_run_attempt');
  const [expected_repository, upstream_repository, upstream_branch, upstream_sha, live_main_sha, upstream_conclusion, upstream_run_id, upstream_run_attempt] = argv;
  return { expected_repository, upstream_repository, upstream_branch, upstream_sha, live_main_sha, upstream_conclusion, upstream_run_id, upstream_run_attempt };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const receipt = buildReceipt(parseCli(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
