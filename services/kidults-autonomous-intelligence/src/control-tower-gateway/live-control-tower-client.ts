/**
 * A31 — Executive Control Tower Live Integration & Governed Action Gateway
 * Module: live-control-tower-client.ts
 *
 * UI-side client for the live evidence adapter.
 * Does not perform governance calculations — display only.
 */

import type {
  LiveSnapshotResponse,
  DecisionDetailResponse,
  DataMode,
} from './gateway-types.js';

// ---------------------------------------------------------------------------
// Client Configuration
// ---------------------------------------------------------------------------

export interface ControlTowerClientConfig {
  readonly baseUrl: string;
  readonly dataMode: DataMode;
}

// ---------------------------------------------------------------------------
// Snapshot Fetch
// ---------------------------------------------------------------------------

export interface SnapshotResult {
  readonly ok: boolean;
  readonly snapshot: LiveSnapshotResponse | null;
  readonly errorMessage: string | null;
  readonly receivedAt: string;
}

export async function fetchSnapshot(config: ControlTowerClientConfig): Promise<SnapshotResult> {
  const receivedAt = new Date().toISOString();
  try {
    const res = await fetch(
      `${config.baseUrl}/control-tower/snapshot?mode=${encodeURIComponent(config.dataMode.toLowerCase())}`,
      { headers: { accept: 'application/json' } },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { message?: string };
      return { ok: false, snapshot: null, errorMessage: body.message ?? `Gateway error (${res.status})`, receivedAt };
    }
    const snapshot = await res.json() as LiveSnapshotResponse;
    return { ok: true, snapshot, errorMessage: null, receivedAt };
  } catch {
    return { ok: false, snapshot: null, errorMessage: 'The governance service is temporarily unavailable.', receivedAt };
  }
}

// ---------------------------------------------------------------------------
// Decision Detail Fetch
// ---------------------------------------------------------------------------

export interface DecisionDetailResult {
  readonly ok: boolean;
  readonly detail: DecisionDetailResponse | null;
  readonly errorMessage: string | null;
}

export async function fetchDecisionDetail(
  config: ControlTowerClientConfig,
  decisionId: string,
): Promise<DecisionDetailResult> {
  try {
    const res = await fetch(
      `${config.baseUrl}/control-tower/decisions/${encodeURIComponent(decisionId)}?mode=${encodeURIComponent(config.dataMode.toLowerCase())}`,
      { headers: { accept: 'application/json' } },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { message?: string };
      return { ok: false, detail: null, errorMessage: body.message ?? `Error loading decision.` };
    }
    const detail = await res.json() as DecisionDetailResponse;
    return { ok: true, detail, errorMessage: null };
  } catch {
    return { ok: false, detail: null, errorMessage: 'Unable to load decision details.' };
  }
}
