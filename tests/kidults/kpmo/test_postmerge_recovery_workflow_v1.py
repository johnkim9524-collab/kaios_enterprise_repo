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

    def test_same_natural_gate_drives_all_roles_without_recursive_role_chain(self):
        for name in FILES:
            trigger = self.workflow(name)['on']['workflow_run']
            self.assertEqual(trigger, {'workflows': ['KPMO Continuous Assurance Success Authority Gate V1'],
                                      'types': ['completed'], 'branches': ['main']})

    def test_original_live_candidate_path_remains_dispatch_only(self):
        for name in FILES:
            workflow = self.workflow(name)
            self.assertEqual(workflow['on']['repository_dispatch']['types'], ['kidults.authorization.generation.v1'])
            self.assertIn("github.event_name == 'repository_dispatch'", workflow['jobs']['record-role-approval']['if'])

    def test_recovery_jobs_cannot_write_repository_or_merge(self):
        for name in FILES:
            for key, job in self.workflow(name)['jobs'].items():
                if not key.startswith('terminal-recovery-'):
                    continue
                self.assertEqual(job['permissions'], {'actions': 'read', 'contents': 'read', 'id-token': 'write', 'pull-requests': 'read'})
                script = '\n'.join(step.get('run', '') for step in job['steps'])
                for forbidden in ['gh pr merge', 'gh workflow run', 'repository_dispatch', 'update-function-code', 'cloudformation deploy']:
                    self.assertNotIn(forbidden, script)

    def test_finalizer_only_track_later_run_with_existing_approval(self):
        job = self.workflow('track')['jobs']['terminal-recovery-finalizer']
        self.assertEqual(job['needs'], 'terminal-recovery-approval')
        self.assertIn('outputs.approval_run_id != github.run_id', job['if'])
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
        for event_name, attempt in [('workflow_dispatch', '1'), ('workflow_run', '2')]:
            result = self.run_entrypoint({'GITHUB_ACTIONS': 'true', 'GITHUB_EVENT_NAME': event_name, 'GITHUB_RUN_ATTEMPT': attempt})
            self.assertIn('RECOVERY_RUNTIME_EVENT', result.stderr)

    def test_untrusted_upstream_cannot_reach_credentials(self):
        result = self.run_entrypoint({'GITHUB_ACTIONS': 'true', 'GITHUB_EVENT_NAME': 'workflow_run', 'GITHUB_RUN_ATTEMPT': '1'},
                                    {'action': 'completed', 'workflow_run': {'name': 'untrusted', 'conclusion': 'success'}})
        self.assertIn('RECOVERY_RUNTIME_UPSTREAM', result.stderr)

if __name__ == '__main__':
    unittest.main()
