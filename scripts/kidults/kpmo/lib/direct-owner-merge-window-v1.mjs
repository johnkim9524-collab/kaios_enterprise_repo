// GitHub timestamps may expose only whole seconds. Treat missing subsecond
// precision as an interval, never as proof that a boundary was met exactly.
export function verifyDirectOwnerMergeWindow({mergedAt, openedAt, handoffWindowSeconds, approvalExpiresAt}) {
  const fail = (code, evidence) => {
    const error = new Error(code); error.code = code;
    if (evidence) error.merge_time_precision = evidence;
    throw error;
  };
  const exactUtc = (value, code) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) fail(code);
    const time = Date.parse(value);
    if (!Number.isFinite(time) || new Date(time).toISOString() !== value.replace(/(?:\.(\d{1,3}))?Z$/, (_, fraction) => `.${(fraction || '').padEnd(3, '0')}Z`)) fail(code);
    return time;
  };
  // Approval comments are owner-authored and commonly use their local UTC
  // offset (for example +09:00). Validate that timestamp as an instant while
  // keeping the merge/opening timestamps on the stricter UTC precision path.
  const exactOffsetInstant = (value, code) => {
    const match = typeof value === 'string'
      ? /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?(Z|[+-](\d{2}):(\d{2}))$/.exec(value)
      : null;
    if (!match) fail(code);
    if (match[4] !== undefined && (Number(match[4]) > 23 || Number(match[5]) > 59)) fail(code);
    const local = `${match[1]}.${(match[2] || '').padEnd(3, '0')}Z`;
    const localTime = Date.parse(local);
    if (!Number.isFinite(localTime) || new Date(localTime).toISOString() !== local) fail(code);
    const time = Date.parse(value);
    if (!Number.isFinite(time)) fail(code);
    return time;
  };
  const lower = exactUtc(mergedAt, 'DIRECT_OWNER_HANDOFF_MERGED_AT_INVALID');
  // The controller creates this boundary locally with Date.toISOString().
  // A coarse opening timestamp cannot establish when authority began.
  if (typeof openedAt !== 'string' || !/\.\d{3}Z$/.test(openedAt)) fail('DIRECT_OWNER_HANDOFF_OPENED_AT_PRECISION_REQUIRED');
  const opened = exactUtc(openedAt, 'DIRECT_OWNER_HANDOFF_OPENED_AT_INVALID');
  const expires = exactOffsetInstant(approvalExpiresAt, 'DIRECT_OWNER_HANDOFF_APPROVAL_EXPIRY_INVALID');
  if (!Number.isInteger(handoffWindowSeconds) || handoffWindowSeconds < 60 || handoffWindowSeconds > 900) fail('DIRECT_OWNER_HANDOFF_WINDOW_INVALID');
  const digits = /\.(\d+)Z$/.exec(mergedAt)?.[1].length || 0;
  const resolution = 10 ** (3 - digits);
  const upper = lower + resolution - 1;
  const closes = opened + handoffWindowSeconds * 1000;
  const evidence = {source_timestamp: mergedAt, resolution_ms: resolution,
    earliest_possible_ms: lower, latest_possible_ms: upper,
    opened_at_ms: opened, closes_at_ms: closes, approval_expires_at_ms: expires,
    boundary_policy: 'ENTIRE_SOURCE_INTERVAL_MUST_BE_WITHIN_AUTHORIZED_WINDOW', window_enlarged: false};
  if (upper < opened) fail('DIRECT_OWNER_HANDOFF_MERGE_BEFORE_WINDOW_OPEN', evidence);
  if (lower > closes) fail('DIRECT_OWNER_HANDOFF_MERGE_AFTER_WINDOW', evidence);
  if (lower > expires) fail('DIRECT_OWNER_HANDOFF_MERGE_AFTER_APPROVAL_EXPIRY', evidence);
  if (lower < opened || upper > closes || upper > expires) fail('DIRECT_OWNER_HANDOFF_TIMESTAMP_PRECISION_AMBIGUOUS', evidence);
  return {...evidence, state: 'MERGE_WINDOW_INTERVAL_VERIFIED'};
}
