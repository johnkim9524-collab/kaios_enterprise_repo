import importlib.util
from pathlib import Path
import subprocess
import unittest
spec = importlib.util.spec_from_file_location('probe', Path(__file__).with_name('staging_postgres_readonly_probe_v1.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class ProbeTests(unittest.TestCase):
    def call(self, run, **kwargs):
        return m.probe(run=run, which=lambda _: '/usr/bin/tool', hostname=lambda: 'ih-staging-01',
                       env={'USER':'kidults-staging','PGHOST':'secret-host','PGPASSWORD':'secret','PGOPTIONS':'unsafe'}, **kwargs)
    def test_readonly_and_secret_free(self):
        def run(args, **kw):
            self.assertIn('BEGIN READ ONLY', args[-1])
            self.assertIn('--no-password', args)
            self.assertIn('--host=/var/run/postgresql', args)
            self.assertNotIn('PGPASSWORD', kw['env'])
            self.assertNotIn('PGOPTIONS', kw['env'])
            self.assertEqual(kw['timeout'],10)
            return subprocess.CompletedProcess(args,0,'on\n','secret-error')
        r=self.call(run)
        self.assertEqual(r['state'],'LOCAL_READ_ONLY_VERIFIED')
        self.assertFalse(r['managed_postgres_connection_verified'])
        self.assertNotIn('secret',str(r))
    def test_failure_is_not_pass_and_outputs_are_discarded(self):
        r=self.call(lambda *a,**k: subprocess.CompletedProcess(a,2,'secret','postgresql://secret'))
        self.assertEqual(r['state'],'LOCAL_CONNECTION_NOT_VERIFIED')
        self.assertNotIn('secret',str(r))
    def test_timeout(self):
        def run(*a,**k): raise subprocess.TimeoutExpired('psql',10)
        self.assertEqual(self.call(run)['state'],'LOCAL_CONNECTION_TIMEOUT')
    def test_identity_rejects_before_connection(self):
        r=m.probe(run=lambda *a,**k:self.fail('connection attempted'),which=lambda _:True,
                  hostname=lambda:'wrong',env={'USER':'kidults-staging'})
        self.assertEqual(r['state'],'IDENTITY_REJECTED')
    def test_success_requires_readonly_response(self):
        r=self.call(lambda *a,**k:subprocess.CompletedProcess(a,0,'off\n',''))
        self.assertEqual(r['state'],'LOCAL_CONNECTION_NOT_VERIFIED')

if __name__=='__main__': unittest.main()
