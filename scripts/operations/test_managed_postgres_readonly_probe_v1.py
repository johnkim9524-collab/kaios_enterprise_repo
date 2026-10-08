import importlib.util
import subprocess
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('managed_probe', Path(__file__).with_name('managed_postgres_readonly_probe_v1.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class ManagedProbeTests(unittest.TestCase):
    def call(self, run, **extra):
        env = {'KAIOS_ENVIRONMENT': 'staging', 'KAIOS_PRODUCTION_PROMOTION_AUTHORIZED': 'false',
               'KAIOS_POSTGRES_DSN': "host='secret-host' password='secret-password'",
               'PGPASSWORD': 'inherited-secret', 'PGOPTIONS': 'unsafe'}
        env.update(extra)
        return m.probe(run=run, env=env)

    def test_verified_transaction_and_tls_keep_secrets_off_argv_and_receipt(self):
        def run(args, **kw):
            self.assertNotIn('secret', str(args))
            self.assertNotIn('PGPASSWORD', kw['env'])
            self.assertNotIn('KAIOS_POSTGRES_DSN', kw['env'])
            self.assertIn('BEGIN READ ONLY', args[-1])
            self.assertIn('ROLLBACK', args[-1])
            self.assertIn('--no-password', args)
            self.assertEqual(kw['timeout'], 15)
            self.assertIn('default_transaction_read_only=on', kw['env']['PGOPTIONS'])
            return subprocess.CompletedProcess(args, 0, '{"read_only":"on","tls":true}', 'secret-password')
        r = self.call(run)
        self.assertEqual(r['status'], 'PASS')
        self.assertTrue(r['managed_postgres_connection_verified'])
        self.assertFalse(r['mutation_performed'])
        self.assertNotIn('secret', str(r))

    def test_connection_error_discards_output(self):
        r = self.call(lambda *a, **kw: subprocess.CompletedProcess(a, 2, 'secret', 'postgresql://secret'))
        self.assertEqual(r['status'], 'FAIL')
        self.assertNotIn('secret', str(r))

    def test_readonly_and_tls_both_required(self):
        for value in ['{"read_only":"off","tls":true}', '{"read_only":"on","tls":false}', '{"read_only":"on","tls":"true"}']:
            r = self.call(lambda *a, **kw: subprocess.CompletedProcess(a, 0, value, ''))
            self.assertEqual(r['status'], 'FAIL')

    def test_invalid_or_non_object_output_fails_closed(self):
        for value in ['secret-output', '[]', 'null', '{}']:
            self.assertEqual(self.call(lambda *a, **kw: subprocess.CompletedProcess(a, 0, value, ''))['status'], 'FAIL')

    def test_timeout_retains_sanitized_failure(self):
        def run(*a, **kw):
            raise subprocess.TimeoutExpired('secret-command', 15, 'secret-output')
        r = self.call(run)
        self.assertEqual(r['state'], 'MANAGED_CONNECTION_TIMEOUT')
        self.assertNotIn('secret', str(r))

    def test_wrong_environment_or_missing_dsn_never_connects(self):
        for change in [{'KAIOS_ENVIRONMENT':'production'}, {'KAIOS_PRODUCTION_PROMOTION_AUTHORIZED':'true'}, {'KAIOS_POSTGRES_DSN':''}]:
            r = self.call(lambda *a, **kw: self.fail('connection attempted'), **change)
            self.assertEqual(r['state'], 'CONFIGURATION_REJECTED')

    def test_client_execution_failure(self):
        def run(*a, **kw):
            raise OSError('secret-path')
        self.assertEqual(self.call(run)['state'], 'CLIENT_EXECUTION_FAILED')


if __name__ == '__main__':
    unittest.main()
