// Test transport only: no driver, network, credentials, or database connection.
// This exercises writer control flow, not PostgreSQL isolation/SQL semantics.
export class KirMemoryLedgerClient {
  constructor({failAt = null, failOccurrence = 1} = {}) {
    this.events = new Map();
    this.evidence = new Map();
    this.receipts = new Map();
    this.calls = [];
    this.snapshot = null;
    this.sequence = 0;
    this.failAt = failAt;
    this.failOccurrence = failOccurrence;
    this.failureHits = 0;
  }

  state() {
    return structuredClone({events: this.events, evidence: this.evidence, receipts: this.receipts, sequence: this.sequence});
  }

  async query(sql, params = []) {
    if (typeof sql !== 'string') throw new Error('KIR_TEST_SQL_TEXT_REQUIRED');
    const operation = ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)
      ? sql : /\/\* current-sold:([a-z-]+-v1) \*\//.exec(sql)?.[1];
    if (!operation) throw new Error('KIR_TEST_SQL_OPERATION_UNKNOWN');
    this.calls.push(operation); // Do not retain payloads or raw SQL in diagnostic receipts.
    if (operation === this.failAt && ++this.failureHits === this.failOccurrence) {
      throw new Error(`KIR_TEST_INJECTED_FAILURE:${operation}`);
    }
    const result = (rows = [], rowCount = rows.length) => ({rows: structuredClone(rows), rowCount});
    if (operation === 'BEGIN') {
      if (this.snapshot) throw new Error('KIR_TEST_NESTED_TRANSACTION');
      this.snapshot = this.state();
      return result();
    }
    if (!this.snapshot) throw new Error('KIR_TEST_QUERY_OUTSIDE_TRANSACTION');
    if (operation === 'COMMIT') { this.snapshot = null; return result(); }
    if (operation === 'ROLLBACK') {
      Object.assign(this, this.snapshot);
      this.snapshot = null;
      return result();
    }
    if (operation === 'advisory-lock-v1') return result([{pg_advisory_xact_lock: null}]);
    if (operation === 'event-history-v1') return result(this.events.get(params[0]) || []);
    if (operation === 'event-insert-v1') {
      const event = JSON.parse(params[11]);
      const history = this.events.get(params[0]) || [];
      if (history.some(row => row.content_digest === params[1])) throw new Error('KIR_TEST_DUPLICATE_EVENT');
      history.push({ledger_id: ++this.sequence, event_id: params[0], content_digest: params[1],
        canonical_object_id: params[2], source_id: params[3], source_event_id: params[4],
        source_sha: params[5], canonical_run_id: params[6], correction_state: params[7],
        supersedes_content_digest: params[8], sold_at: params[9], observed_at: params[10],
        event_payload: event, batch_receipt_id: params[12]});
      this.events.set(params[0], history);
      return result([], 1);
    }
    if (operation === 'evidence-by-id-v1') return result(this.evidence.has(params[0]) ? [this.evidence.get(params[0])] : []);
    if (operation === 'evidence-insert-v1') {
      if (this.evidence.has(params[0])) throw new Error('KIR_TEST_DUPLICATE_EVIDENCE');
      this.evidence.set(params[0], {evidence_id: params[0], fact_id: params[1], evidence_digest: params[2],
        current_sold_event_id: params[3], current_sold_content_digest: params[4], canonical_object_id: params[5],
        source_sha: params[6], canonical_run_id: params[7], evidence_payload: JSON.parse(params[8]), batch_receipt_id: params[9]});
      return result([], 1);
    }
    if (operation === 'receipt-by-id-v1') return result(this.receipts.has(params[0]) ? [this.receipts.get(params[0])] : []);
    if (operation === 'receipt-insert-v1') {
      if (this.receipts.has(params[0])) throw new Error('KIR_TEST_DUPLICATE_RECEIPT');
      this.receipts.set(params[0], {receipt_id: params[0], receipt_digest: params[1], batch_id: params[2],
        status: params[3], source_sha: params[4], canonical_run_id: params[5], envelope_digest: params[6],
        event_versions_digest: params[7], evidence_digest: params[8], receipt_payload: JSON.parse(params[9])});
      return result([], 1);
    }
    throw new Error(`KIR_TEST_SQL_OPERATION_UNHANDLED:${operation}`);
  }
}
