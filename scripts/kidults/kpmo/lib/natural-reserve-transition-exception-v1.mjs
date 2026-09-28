// Narrow, data-driven exception for the already-reviewed natural Reserve
// liveness repair.  This is deliberately exact: a partial file set, a changed
// line, or unavailable immutable blobs remains Owner-reserved.

const normalizedLines = source => String(source ?? '')
  .split('\n')
  .map(line => line.trim())
  .filter(line => line && !line.startsWith('#'));

const multiset = lines => {
  const counts = new Map();
  for (const line of lines) counts.set(line, (counts.get(line) || 0) + 1);
  return counts;
};

const difference = (left, right) => {
  const leftCounts = multiset(left);
  const rightCounts = multiset(right);
  const result = [];
  for (const [line, count] of leftCounts) {
    const remaining = count - (rightCounts.get(line) || 0);
    for (let index = 0; index < remaining; index += 1) result.push(line);
  }
  return result.sort();
};

const sorted = value => [...value].sort();
const same = (left, right) => JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));

const configuredException = policy => {
  const values = policy?.delegated_internal_transition_exceptions;
  if (!Array.isArray(values)) return null;
  return values.find(value => value?.id === 'NATURAL_RESERVE_CHAIN_REPAIR_V1') || null;
};

export const matchesNaturalReserveTransition = ({files, policy}) => {
  const exception = configuredException(policy);
  if (!exception || !Array.isArray(files) || !files.length) return false;
  const expectedPaths = [...new Set(exception.paths || [])].sort();
  const actualPaths = files.map(file => file?.filename).filter(Boolean).sort();
  if (exception.require_complete_path_set !== false && !same(actualPaths, expectedPaths)) return false;
  if (!same(actualPaths, expectedPaths)) return false;

  const changes = new Map((exception.changes || []).map(value => [value.path, value]));
  for (const file of files) {
    if (typeof file?.base_content !== 'string' || typeof file?.head_content !== 'string') return false;
    const expected = changes.get(file.filename);
    if (!expected) return false;
    const before = normalizedLines(file.base_content);
    const after = normalizedLines(file.head_content);
    if (!same(difference(before, after), expected.removed || [])) return false;
    if (!same(difference(after, before), expected.added || [])) return false;
  }
  return true;
};

export const naturalReserveTransitionId = ({files, policy}) =>
  matchesNaturalReserveTransition({files, policy}) ? 'NATURAL_RESERVE_CHAIN_REPAIR_V1' : null;

