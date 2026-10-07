// Canonicalize the protected required-status alias for Draft pull requests.
// The live ruleset names the status Scope-Aware, while Draft PRs receive the
// non-promotable Draft Development status. The alias is safe only when the
// current PR is actually Draft; a Draft-only envelope on a ready PR is drift.
export const SCOPE_AWARE_CONTEXT = 'KIDULTS Scope-Aware Authoritative Status V1';
export const DRAFT_DEVELOPMENT_CONTEXT = 'KIDULTS Draft Development Validation V1';

export function normalizeRequiredGateContexts(values, {draftDevelopment = false} = {}) {
  const draft = draftDevelopment === true;
  const normalized = values.map(value => {
    const context = typeof value === 'string' ? value : String(value?.context ?? '');
    const integration_id = typeof value === 'string'
      ? 0
      : Number(value?.integration_id ?? value?.app_id ?? 0);
    if (!context || !Number.isInteger(integration_id) || integration_id < 0) {
      throw new Error('AUTONOMOUS_REQUIRED_CONTEXT_INVALID');
    }
    return {
      context: draft && context === SCOPE_AWARE_CONTEXT ? DRAFT_DEVELOPMENT_CONTEXT : context,
      integration_id,
      draft_alias: context === DRAFT_DEVELOPMENT_CONTEXT,
    };
  }).sort((a,b) => a.context.localeCompare(b.context) || a.integration_id - b.integration_id);
  return {
    values: normalized.map(({draft_alias: _draft_alias, ...value}) => value),
    invalidDraftAlias: !draft && normalized.some(value => value.draft_alias),
  };
}
