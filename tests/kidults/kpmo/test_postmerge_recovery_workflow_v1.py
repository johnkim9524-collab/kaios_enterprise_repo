"""Protected runtime boundaries; no GitHub/AWS execution."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[3]
FILES = ['track', 'kpmo', 'independent-verification']
class RecoveryWorkflowTests(unittest.TestCase):
    def workflow(self, name):
        return yaml.load((ROOT / f'.github/workflows/kidults-autonomous-{name}-authorization-v1.yml').read_text(), Loader=yaml.BaseLoader)

    def gate_workflow(self):
        return yaml.load((ROOT / '.github/workflows/kpmo-continuous-assurance-success-authority-gate-v1.yml').read_text(), Loader=yaml.BaseLoader)

    def gate_recovery_workflow(self):
        return yaml.load((ROOT / '.github/workflows/kpmo-continuous-assurance-terminal-recovery-v1.yml').read_text(), Loader=yaml.BaseLoader)

    def test_gate_success_and_assurance_failure_routes_are_single_delivery(self):
        for name in FILES:
            trigger = self.workflow(name)['on']['workflow_run']
            expected = ['KIDULTS Platform Continuous Assurance V1'] if name == 'kpmo' else [
                'KPMO Continuous Assurance Success Authority Gate V1', 'KIDULTS Platform Continuous Assurance V1']
            self.assertEqual(trigger, {'workflows': expected,
                                      'types': ['completed'], 'branches': ['main']})
        self.assertEqual(self.gate_recovery_workflow()['on']['workflow_run']['workflows'],
                         ['KPMO Continuous Assurance Success Authority Gate V1'])
        self.assertNotIn('interrupted-recovery-finalizer', self.workflow('track')['jobs'])
        for name in FILES:
            workflow = self.workflow(name)
            job_if = workflow['jobs']['terminal-recovery-admission']['if']
            self.assertIn("workflow_run.name == 'KIDULTS Platform Continuous Assurance V1'", job_if)
            self.assertIn("workflow_run.conclusion == 'failure'", job_if)
            self.assertIn("github.event_name == 'repository_dispatch'", workflow['jobs']['record-role-approval']['if'])
            self.assertIn("github.event.action == 'kidults.authorization.generation.v1'", workflow['jobs']['record-role-approval']['if'])

    def test_cheap_admission_precedes_all_credentialled_role_jobs(self):
        for name in FILES:
            workflow = self.workflow(name)
            admission = workflow['jobs']['terminal-recovery-admission']
            recovery = workflow['jobs']['terminal-recovery-approval']
            self.assertEqual(recovery['needs'], 'terminal-recovery-admission')
            self.assertIn("github.ref == 'refs/heads/main' && github.run_attempt == 1", recovery['if'])
            self.assertIn("workflow_run.name == 'KPMO Continuous Assurance Success Authority Gate V1'", recovery['if'])
            self.assertIn("workflow_run.name == 'KIDULTS Platform Continuous Assurance V1'", recovery['if'])
            self.assertEqual(admission['permissions'], {'contents': 'read'})
            self.assertNotIn('outputs', admission)
            self.assertNotIn('environment', admission)
            self.assertEqual(admission['timeout-minutes'], '1')
            admission_step = next(step for step in admission['steps'] if step.get('name') == 'Admit only an eligible actual recovery workload')
            admission_script = '\n'.join(step.get('run', '') for step in admission['steps'])
            self.assertEqual(admission_step['run'].strip(), 'set -euo pipefail\nnode scripts/kidults/kpmo/run-recovery-execution-admission-v1.mjs')
            self.assertNotIn('AWS_ROLE_ARN', admission_script)
            self.assertNotIn('assume-role-with-web-identity', admission_script)
            self.assertNotIn('KIDULTS_GITHUB_READ_BUDGET_MODE', admission_script)
            recovery_step = next(step for step in recovery['steps'] if 'run-postmerge-terminal-recovery-v1.mjs' in step.get('run', ''))
            self.assertEqual(recovery_step['env']['KIDULTS_GITHUB_READ_BUDGET_MODE'], 'SHARED_REQUIRED')
            self.assertEqual(recovery_step['env']['KIDULTS_GITHUB_READ_QUOTA_OWNER_ID'], 'gha-repo-${{ github.repository_id }}')

    def test_original_live_candidate_path_remains_dispatch_only(self):
        for name in ('kpmo', 'independent-verification'):
            workflow = self.workflow(name)
            self.assertEqual(workflow['on']['repository_dispatch']['types'], ['kidults.authorization.generation.v1'])
            self.assertIn("github.event_name == 'repository_dispatch'", workflow['jobs']['record-role-approval']['if'])
            self.assertIn("github.event.action == 'kidults.authorization.generation.v1'", workflow['jobs']['record-role-approval']['if'])
            self.assertNotIn('workflow_dispatch', workflow['on'])
            recovery_if = workflow['jobs']['terminal-recovery-admission']['if']
            self.assertNotIn("github.event_name == 'workflow_dispatch'", recovery_if)
        track = self.workflow('track')
        self.assertNotIn('repository_dispatch', track['on'])

    def test_kpmo_approval_is_automatically_bound_and_recorded(self):
        workflow = self.workflow('kpmo')
        job = workflow['jobs']['record-role-approval']
        self.assertIn("github.event_name == 'repository_dispatch'", job['if'])
        self.assertIn("github.event.action == 'kidults.authorization.generation.v1'", job['if'])
        self.assertIn("github.ref == 'refs/heads/main'", job['if'])
        self.assertEqual(job['environment'], 'KIDULTS-AUTONOMOUS-KPMO')
        self.assertEqual(job['permissions']['id-token'], 'write')
        self.assertEqual(job['permissions']['pull-requests'], 'read')
        steps = job['steps']
        self.assertTrue(any(step.get('run') == 'node scripts/kidults/kpmo/validate-autonomous-internal-landing-v1.mjs'
                            for step in steps))
        approval = next(step for step in steps if step.get('name') == 'Record role-scoped approval only')
        self.assertEqual(approval['env']['KIDULTS_AUTONOMOUS_MODE'], 'APPROVAL')
        self.assertEqual(approval['env']['KIDULTS_AUTONOMOUS_APPROVAL_ROLE'], 'KPMO')
        self.assertIn('node scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs', approval['run'])
        receipt = next(step for step in steps if step.get('name') == 'Upload role approval receipt')
        self.assertIn('approval-receipt.json', receipt['with']['path'])
        finalizer = workflow['jobs']['finalize-if-quorum']
        self.assertEqual(finalizer['needs'], 'record-role-approval')
        self.assertIn("needs.record-role-approval.result == 'success'", finalizer['if'])
        self.assertIn('KIDULTS-AUTONOMOUS-FINALIZER', finalizer['environment'])

    def test_gate_recovery_uses_native_completion_without_write_or_fanout(self):
        workflow = self.gate_recovery_workflow()
        self.assertEqual(workflow['permissions'], {})
        self.assertIn('KPMO Continuous Assurance Success Authority Gate V1', workflow['on']['workflow_run']['workflows'])
        gate = workflow['jobs']['terminal-recovery-approval']
        self.assertEqual(gate['needs'], 'terminal-recovery-admission')
        script = '\n'.join(step.get('run', '') for step in gate['steps'])
        self.assertNotIn('/dispatches', script)
        self.assertNotIn('terminal-recovery-dispatch.json', script)
        for role in FILES:
            role_workflow = self.workflow(role)
            if role == 'kpmo':
                self.assertNotIn('KPMO Continuous Assurance Success Authority Gate V1',
                                 role_workflow['on']['workflow_run']['workflows'])
            else:
                self.assertIn('KPMO Continuous Assurance Success Authority Gate V1',
                              role_workflow['on']['workflow_run']['workflows'])
            self.assertIn('KIDULTS Platform Continuous Assurance V1',
                          role_workflow['on']['workflow_run']['workflows'])
            admission_if = role_workflow['jobs']['terminal-recovery-admission']['if']
            self.assertIn("github.event.workflow_run.event == 'workflow_run'", admission_if)
            self.assertIn("github.event.workflow_run.event == 'repository_dispatch'", admission_if)
            self.assertIn("github.event.workflow_run.event == 'workflow_dispatch'", admission_if)
            self.assertIn("github.event.workflow_run.actor.login == 'github-actions[bot]'", admission_if)
            self.assertNotIn("github.event.workflow_run.event == 'schedule'", admission_if)

    def test_kpmo_terminal_recovery_requires_verified_handoff_before_credentials(self):
        workflow = self.gate_recovery_workflow()
        admission = workflow['jobs']['terminal-recovery-admission']
        self.assertEqual(admission['permissions'], {'actions': 'read', 'contents': 'read'})
        self.assertNotIn('environment', admission)
        steps = admission['steps']
        proof = next(step for step in steps if step.get('name') == 'Verify exact proof handoff before credentialed recovery')
        self.assertEqual(proof['run'], 'node scripts/kidults/kpmo/verify-terminal-recovery-proof-admission-v1.mjs')
        self.assertEqual(proof['env']['GH_TOKEN'], '${{ github.token }}')
        verifier = (ROOT / 'scripts/kidults/kpmo/verify-terminal-recovery-proof-admission-v1.mjs').read_text()
        self.assertIn('/actions/artifacts/${artifact.id}/zip', verifier)
        self.assertIn('read-sentinel-artifact-v1.py', verifier)
        self.assertIn('PROOF_RECEIPT_SCHEMA_OR_BINDING', (ROOT / 'scripts/kidults/kpmo/lib/terminal-recovery-proof-admission-v1.mjs').read_text())
        self.assertLess([step.get('name') for step in steps].index(proof['name']),
                        [step.get('name') for step in steps].index('Preserve admission evidence'))
        recovery = workflow['jobs']['terminal-recovery-approval']
        self.assertEqual(recovery['needs'], 'terminal-recovery-admission')

    def test_non_authorizing_gate_completion_is_terminal_failure(self):
        workflow = self.gate_workflow()
        gate = workflow['jobs']['deferred-runtime-proof-handoff-gate']
        self.assertIn("github.event.workflow_run.path == '.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml'", gate['if'])
        terminal = '\n'.join(step.get('name', '') + '\n' + step.get('run', '') for step in gate['steps'])
        self.assertIn('Require exact autonomous Assurance proof closure', terminal)
        self.assertIn('state=="VERIFIED_PASS" or .state=="NOT_APPLICABLE"', terminal)
        self.assertIn('.production=="HOLD" and .public=="HOLD" and .g5=="HOLD"', terminal)

    def test_recovery_jobs_cannot_write_repository_or_merge(self):
        for name in FILES:
            for key, job in self.workflow(name)['jobs'].items():
                if key == 'terminal-recovery-admission':
                    self.assertEqual(job['permissions'], {'contents': 'read'})
                    self.assertNotIn('environment', job)
                    script = '\n'.join(step.get('run', '') for step in job['steps'])
                    for forbidden in ['gh pr merge', 'gh workflow run', 'repository_dispatch', 'update-function-code', 'cloudformation deploy']:
                        self.assertNotIn(forbidden, script)
                    continue
                if not key.startswith(('terminal-recovery-', 'interrupted-recovery-')):
                    continue
                self.assertEqual(job['permissions'], {'actions': 'read', 'contents': 'read', 'id-token': 'write', 'pull-requests': 'read'})
                script = '\n'.join(step.get('run', '') for step in job['steps'])
                for forbidden in ['gh pr merge', 'gh workflow run', 'repository_dispatch', 'update-function-code', 'cloudformation deploy']:
                    self.assertNotIn(forbidden, script)

    def test_failure_assurance_terminal_route_is_distinct_and_tracks_parent_lineage(self):
        runner = (ROOT / 'scripts/kidults/kpmo/run-interrupted-terminal-recovery-v1.mjs').read_text()
        workload = (ROOT / 'scripts/kidults/kpmo/lib/interrupted-recovery-workload-v1.mjs').read_text()
        verifier = (ROOT / 'scripts/kidults/kpmo/lib/interrupted-recovery-native-trigger-v1.mjs').read_text()
        for name in FILES:
            workflow = self.workflow(name)
            names = workflow['on']['workflow_run']['workflows']
            self.assertIn('KIDULTS Platform Continuous Assurance V1', names)
            recovery_if = workflow['jobs']['terminal-recovery-admission']['if']
            self.assertIn("workflow_run.conclusion == 'failure'", recovery_if)
            self.assertNotIn("github.event_name == 'workflow_run'", workflow['jobs']['record-role-approval']['if'])
        self.assertIn('result.recovery_parent=failureParent', runner)
        self.assertIn('ledger.createFailureApproval', workload)
        self.assertIn('recoverFailureAssuranceTerminal', workload)
        self.assertIn('TERMINAL_NULL_ASSURANCE_FAILURE_V1', verifier)
        self.assertIn("terminalCheck?.id==='FINALIZER_RESERVATION_AND_IMMUTABLE_TERMINAL'", verifier)

    def test_track_finalizer_runs_once_after_same_run_quorum(self):
        job = self.workflow('track')['jobs']['terminal-recovery-finalizer']
        self.assertEqual(job['needs'], 'terminal-recovery-approval')
        self.assertIn("outputs.recovery_needed == 'true'", job['if'])
        recovery_step = next(step for step in job['steps'] if 'run-postmerge-terminal-recovery-v1.mjs' in step.get('run', ''))
        self.assertNotIn('KIDULTS_GITHUB_READ_BUDGET_MODE', recovery_step.get('env', {}))
        for name in FILES[1:]:
            self.assertNotIn('terminal-recovery-finalizer', self.workflow(name)['jobs'])

    def run_entrypoint(self, overrides, event=None):
        env = {k: v for k, v in os.environ.items() if not k.startswith(('GITHUB_', 'AWS_', 'GH_', 'KIDULTS_'))}
        env.update(overrides)
        with tempfile.TemporaryDirectory() as directory:
            event_path = Path(directory) / 'event.json'
            event_path.write_text(json.dumps(event or {}))
            env['GITHUB_EVENT_PATH'] = str(event_path)
            return subprocess.run(['node', 'scripts/kidults/kpmo/run-postmerge-terminal-recovery-v1.mjs'],
                                  cwd=ROOT, env=env, text=True, capture_output=True, timeout=10)

    def test_local_execution_cannot_reach_credentials(self):
        result = self.run_entrypoint({})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('RECOVERY_RUNTIME_EVENT', result.stderr)

    def test_manual_dispatch_and_attempt_replay_cannot_reach_credentials(self):
        for event_name, attempt in [('repository_dispatch', '1'), ('workflow_run', '2')]:
            result = self.run_entrypoint({'GITHUB_ACTIONS': 'true', 'GITHUB_EVENT_NAME': event_name, 'GITHUB_RUN_ATTEMPT': attempt})
            self.assertIn('RECOVERY_RUNTIME_EVENT', result.stderr)

        result = self.run_entrypoint({'GITHUB_ACTIONS': 'true', 'GITHUB_EVENT_NAME': 'workflow_dispatch',
                                      'GITHUB_RUN_ATTEMPT': '1', 'GITHUB_SHA': 'a' * 40},
                                     {'inputs': {}})
        self.assertIn('RECOVERY_RUNTIME_DISPATCH', result.stderr)

    def test_untrusted_upstream_cannot_reach_credentials(self):
        result = self.run_entrypoint({'GITHUB_ACTIONS': 'true', 'GITHUB_EVENT_NAME': 'workflow_run', 'GITHUB_RUN_ATTEMPT': '1'},
                                    {'action': 'completed', 'workflow_run': {'name': 'untrusted', 'conclusion': 'success'}})
        self.assertIn('RECOVERY_RUNTIME_UPSTREAM', result.stderr)

if __name__ == '__main__':
    unittest.main()
