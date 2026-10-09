const EXPECTED_SKIP_DISPOSITION = 'EXPECTED_GATED_WORKFLOW_RUN_SKIP';
const SUCCESS_DISPOSITION = 'UPSTREAM_SUCCESS';
const FAILURE_DISPOSITION = 'UPSTREAM_CONTROL_FAILURE';

export function classifyUpstreamAuditHealth({ workflowPath, workflowEvent, conclusion }, contract) {
  if (conclusion === 'success') {
    return { acceptable: true, disposition: SUCCESS_DISPOSITION };
  }
  const expectedSkipPaths = contract?.expected_workflow_run_skip_paths;
  if (conclusion === 'skipped' && workflowEvent === 'workflow_run' &&
      Array.isArray(expectedSkipPaths) && expectedSkipPaths.includes(workflowPath)) {
    return { acceptable: true, disposition: EXPECTED_SKIP_DISPOSITION };
  }
  return { acceptable: false, disposition: FAILURE_DISPOSITION };
}

export {
  EXPECTED_SKIP_DISPOSITION,
  FAILURE_DISPOSITION,
  SUCCESS_DISPOSITION,
};
