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

    def test_gate_success_and_assurance_failure_routes_are_single_delivery(self):
        for name in FILES:
            trigger = self.workflow(name)['on']['workflow_run']
            expected = ['KPMO Continuous Assurance Success Authority Gate V1']
            expected.append('KIDULTS Platform Continuous Assurance V1')
            self.assertEqual(trigger, {'workflows': expected,
                                      'types': ['completed'], 'branches': ['main']})
        self.assertNotIn('interrupted-recovery-finalizer', self.workflow('track')['jobs'])
        for name in FILES:
            workflow = self.workflow(name)
            job_if = workflow['jobs']['terminal-recovery-approval']['if']
            self.assertIn("workflow_run.name == 'KIDULTS Platform Continuous Assurance V1'", job_if)
            self.assertIn("workflow_run.conclusion == 'failure'", job_if)
            self.assertIn("github.event_name == 'repository_dispatch'", workflow['jobs']['record-role-approval']['if'])
            self.assertIn("github.event.action == 'kidults.authorization.generation.v1'", workflow['jobs']['record-role-approval']['if'])
            self.assertIn("github.actor == 'github-actions[bot]'", job_if)
            self.assertIn("inputs.gate_run_attempt == '1'", job_if)

    def test_original_live_candidate_path_remains_dispatch_only(self):
        for name in FILES:
            workflow = self.workflow(name)
            self.assertEqual(workflow['on']['repository_dispatch']['types'], ['kidults.authorization.generation.v1'])
            self.assertIn("github.event_name == 'repository_dispatch'", workflow['jobs']['record-role-approval']['if'])
            self.assertIn("github.event.action == 'kidults.authorization.generation.v1'", workflow['jobs']['record-role-approval']['if'])
            self.assertEqual(list(workflow['on']['workflow_dispatch']['inputs']),
                             ['gate_run_id', 'gate_run_attempt', 'head_sha'])
            recovery_if = workflow['jobs']['terminal-recovery-approval']['if']
            self.assertIn("github.event_name == 'workflow_dispatch'", recovery_if)
            self.assertIn("inputs.gate_run_attempt == '1'", recovery_if)
            self.assertIn('inputs.head_sha == github.sha', recovery_if)

    def test_verified_gate_dispatches_only_exact_main_recovery_hint(self):
        gate = self.gate_workflow()['jobs']['success-authority-gate']
        self.assertEqual(gate['permissions'], {'actions': 'write', 'contents': 'read'})
        dispatch = next(step for step in gate['steps'] if step.get('name') == 'Dispatch exact-main terminal recovery roles')
        self.assertEqual(dispatch['if'], "github.event_name == 'workflow_run' && github.event.workflow_run.name == 'KIDULTS Platform Continuous Assurance V1'")
        script = dispatch['run']
        self.assertIn('CURRENT_MAIN_SHA', script)
        self.assertIn('test "$CURRENT_MAIN_SHA" = "$UPSTREAM_SHA"', script)
        self.assertIn('gate_run_id', script)
        self.assertIn('gate_run_attempt', script)
        self.assertIn('head_sha', script)
        self.assertIn('/actions/workflows/${workflow}/dispatches', script)
        for workflow in FILES:
            self.assertIn(f'kidults-autonomous-{workflow}-authorization-v1.yml', script)

    def test_recovery_jobs_cannot_write_repository_or_merge(self):
        for name in FILES:
            for key, job in self.workflow(name)['jobs'].items():
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
            recovery_if = workflow['jobs']['terminal-recovery-approval']['if']
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
