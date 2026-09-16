/**
 * Bounded read-only consistency retry. This is NOT a GitHub workflow rerun,
 * landing retry, authorization retry, or a fallback to an older green run.
 * The caller must recreate ALL per-read state and enforce exact main/SHA,
 * trigger, artifact, latest-generation and before/after identity checks on
 * every invocation. Semantic evaluation happens only after a stable read.
 */
import {setTimeout as delay} from 'node:timers/promises';

export const SENTINEL_MAX_SNAPSHOT_ATTEMPTS = 3;
const RETRYABLE = 'SENTINEL_GENERATION_CHANGED_DURING_READ';

/** @param {() => Promise<unknown>} readOnce - Complete fresh collection attempt. */
export async function readStableSentinelSnapshot(readOnce, {
  maxAttempts = SENTINEL_MAX_SNAPSHOT_ATTEMPTS,
  retryDelayMs = 100,
  onRetry = () => {},
  wait = delay,
} = {}) {
  if (typeof readOnce !== 'function' || typeof onRetry !== 'function' || typeof wait !== 'function') {
    throw new Error('SENTINEL_SNAPSHOT_CALLBACK_INVALID');
  }
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > SENTINEL_MAX_SNAPSHOT_ATTEMPTS) {
    throw new Error('SENTINEL_SNAPSHOT_ATTEMPT_BOUND');
  }
  if (!Number.isSafeInteger(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 1000) {
    throw new Error('SENTINEL_SNAPSHOT_DELAY_BOUND');
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      // No cached input or previous producer result is retained by this module.
      return await readOnce();
    } catch (error) {
      // Do not retry semantic FAIL/HOLD, API/auth errors, malformed indexes,
      // digest/alias errors, main drift, or a merely similar error string.
      if (!(error instanceof Error) || error.message !== RETRYABLE || attempt === maxAttempts) throw error;
      onRetry(Object.freeze({
        event: 'SENTINEL_SNAPSHOT_DISCARDED_READING_FRESH',
        failure_class: RETRYABLE,
        discarded_attempt: attempt,
        next_attempt: attempt + 1,
        max_attempts: maxAttempts,
        cached_snapshot_reused: false,
        mutation_performed: false,
      }));
      await wait(retryDelayMs);
    }
  }
  throw new Error('SENTINEL_SNAPSHOT_UNREACHABLE');
}
