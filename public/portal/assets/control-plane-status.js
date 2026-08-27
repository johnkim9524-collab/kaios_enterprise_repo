(() => {
  const badge = document.getElementById('controlPlaneOverall');
  const evidence = document.getElementById('controlPlaneEvidence');
  if (!badge || !evidence) return;
  badge.textContent = 'LOCAL PASS / REMOTE HOLD';
  badge.classList.remove('status-loading');
  badge.classList.add('status-degraded');
  evidence.textContent = 'Local contract: VERIFIED_PASS · remote PostgreSQL/projector/rollback: NOT_VERIFIED · Production/Public/G5: HOLD';
})();
