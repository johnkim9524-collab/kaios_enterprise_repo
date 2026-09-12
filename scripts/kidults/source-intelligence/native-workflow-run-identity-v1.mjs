// Native run.name may be the configured workflow name or its dynamic run-name.
// This validates only name/path consistency; callers must still verify repository,
// run/attempt, event, lifecycle, source SHA and producer receipt/contents.
export function nativeWorkflowRunNameMatches(run, workflowName, workflowPath) {
  if (!run || typeof run !== 'object' || Array.isArray(run) || run.path !== workflowPath) return false;
  if (run.name === workflowName) return true;
  if (typeof run.display_title !== 'string' || run.name !== run.display_title) return false;
  if (workflowPath === '.github/workflows/kidults-asi-autonomous-resolution-layer-v1.yml' &&
      workflowName === 'KIDULTS ASI Autonomous Resolution Layer v1') {
    const match = /^KIDULTS ARL \/ p1-([1-9][0-9]*)$/.exec(run.display_title);
    return !!match && match[0] === run.display_title && Number.isSafeInteger(Number(match[1]));
  }
  if (workflowPath === '.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml' &&
      workflowName === 'KIDULTS ASI Requirement-to-Adapter Coverage v1') {
    return typeof run.head_sha === 'string' && run.head_sha.length === 40 && /^[a-f0-9]{40}$/.test(run.head_sha) &&
      run.display_title === `KIDULTS Coverage / source-${run.head_sha}`;
  }
  return false;
}
