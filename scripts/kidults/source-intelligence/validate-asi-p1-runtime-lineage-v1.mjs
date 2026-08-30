#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const SHA_RE = /^[0-9a-f]{40}$/;
const P1_WORKFLOW_NAME = 'KIDULTS ASI P1 Source Preflight v1';
const P1_WORKFLOW_PATH = '.github/workflows/kidults-asi-p1-source-preflight-v1.yml';
const P1_RECEIPT_NAME = 'kidults-asi-p1-source-preflight-receipt-v1.json';

export class P1RuntimeLineageValidationError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'P1RuntimeLineageValidationError';
    this.code = code;
  }
}

function fail(code, detail = '') {
  throw new P1RuntimeLineageValidationError(code, detail);
}

function requireCondition(condition, code, detail = '') {
  if (!condition) fail(code, detail);
}

function positiveInteger(value, code) {
  const parsed = Number(value);
  requireCondition(Number.isSafeInteger(parsed) && parsed > 0, code);
  return parsed;
}

export function validateP1RuntimeLineageSnapshot({
  eventName,
  eventPayload,
  receipt,
  expectedSourceSha
}) {
  requireCondition(eventName === 'workflow_run', 'ARL_EVENT_NOT_WORKFLOW_RUN');
  requireCondition(SHA_RE.test(String(expectedSourceSha || '')), 'ARL_EXPECTED_SOURCE_SHA_INVALID');
  requireCondition(eventPayload && typeof eventPayload === 'object', 'ARL_EVENT_PAYLOAD_REQUIRED');
  const upstream = eventPayload.workflow_run;
  requireCondition(upstream && typeof upstream === 'object', 'ARL_UPSTREAM_WORKFLOW_RUN_REQUIRED');
  const p1RunId = positiveInteger(upstream.id, 'ARL_P1_RUN_ID_INVALID');
  requireCondition(upstream.event === 'workflow_run', 'ARL_P1_UPSTREAM_EVENT_NOT_WORKFLOW_RUN');
  requireCondition(upstream.name === P1_WORKFLOW_NAME, 'ARL_P1_WORKFLOW_NAME_MISMATCH');
  requireCondition(upstream.path === P1_WORKFLOW_PATH, 'ARL_P1_WORKFLOW_PATH_MISMATCH');
  requireCondition(upstream.head_branch === 'main', 'ARL_P1_HEAD_BRANCH_NOT_MAIN');
  requireCondition(upstream.head_sha === expectedSourceSha, 'ARL_P1_HEAD_SHA_MISMATCH');
  requireCondition(upstream.status === 'completed', 'ARL_P1_STATUS_NOT_COMPLETED');
  requireCondition(upstream.conclusion === 'success', 'ARL_P1_CONCLUSION_NOT_SUCCESS');

  requireCondition(receipt && typeof receipt === 'object' && !Array.isArray(receipt), 'ARL_P1_RECEIPT_REQUIRED');
  requireCondition(receipt.id === 'kidults-asi-p1-source-preflight-receipt-v1', 'ARL_P1_RECEIPT_ID_MISMATCH');
  requireCondition(receipt.state === 'VERIFIED_PASS', 'ARL_P1_RECEIPT_STATE_NOT_VERIFIED_PASS');
  requireCondition(receipt.source_sha === expectedSourceSha, 'ARL_P1_RECEIPT_SOURCE_SHA_MISMATCH');
  requireCondition(receipt.trigger_event === 'workflow_run', 'ARL_P1_RECEIPT_TRIGGER_NOT_WORKFLOW_RUN');
  requireCondition(receipt.p0b_input_mode === 'EXACT_TRIGGERING_WORKFLOW_RUN', 'ARL_P0B_INPUT_MODE_NOT_EXACT');
  const p0bRunId = positiveInteger(receipt.p0b_origin_run_id, 'ARL_P0B_ORIGIN_RUN_ID_INVALID');
  requireCondition(p0bRunId !== p1RunId, 'ARL_P0B_ORIGIN_SELF_REFERENCE');
  requireCondition(receipt.p0b_origin_source_sha === expectedSourceSha, 'ARL_P0B_ORIGIN_SOURCE_SHA_MISMATCH');
  requireCondition(receipt.public_release === 'HOLD', 'ARL_P1_PUBLIC_RELEASE_NOT_HOLD');
  requireCondition(receipt.production === 'HOLD', 'ARL_P1_PRODUCTION_NOT_HOLD');

  const authorityFields = [
    receipt.artifact_role,
    receipt.authoritative_producer,
    receipt.downstream_consumable
  ];
  if (authorityFields.some((value) => value !== undefined)) {
    requireCondition(receipt.artifact_role === 'AUTHORITATIVE_P1_PRODUCER', 'ARL_P1_ARTIFACT_ROLE_NOT_AUTHORITATIVE');
    requireCondition(receipt.authoritative_producer === true, 'ARL_P1_AUTHORITATIVE_PRODUCER_FALSE');
    requireCondition(receipt.downstream_consumable === true, 'ARL_P1_DOWNSTREAM_CONSUMABLE_FALSE');
  }

  return {
    id: 'kidults-asi-p1-runtime-lineage-validation-v1',
    state: 'COMPLETE_VERIFIED',
    p1_workflow_run_id: p1RunId,
    p1_source_sha: expectedSourceSha,
    p1_upstream_event: upstream.event,
    p0b_origin_run_id: p0bRunId,
    p0b_origin_source_sha: receipt.p0b_origin_source_sha,
    p0b_input_mode: receipt.p0b_input_mode,
    artifact_role: 'AUTHORITATIVE_ARL_INPUT',
    authoritative_producer: true,
    downstream_consumable: true,
    candidate_created: false,
    evidence_created: false,
    public_release: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD'
  };
}

function findNamedFiles(root, targetName) {
  const matches = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name === targetName) matches.push(full);
    }
  }
  return matches.sort();
}

export function validateP1RuntimeLineageFromEnvironment({
  eventName = process.env.GITHUB_EVENT_NAME,
  eventPath = process.env.GITHUB_EVENT_PATH,
  expandedRoot = '/tmp/p1-expanded',
  expectedSourceSha = process.env.GITHUB_SHA
} = {}) {
  requireCondition(Boolean(eventPath) && fs.existsSync(eventPath), 'ARL_EVENT_PATH_MISSING');
  requireCondition(fs.existsSync(expandedRoot) && fs.statSync(expandedRoot).isDirectory(), 'ARL_P1_EXPANDED_ROOT_MISSING');
  const receiptPaths = findNamedFiles(expandedRoot, P1_RECEIPT_NAME);
  requireCondition(receiptPaths.length === 1, 'ARL_P1_RECEIPT_CARDINALITY_NOT_ONE', String(receiptPaths.length));
  const eventPayload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  const receipt = JSON.parse(fs.readFileSync(receiptPaths[0], 'utf8'));
  return validateP1RuntimeLineageSnapshot({ eventName, eventPayload, receipt, expectedSourceSha });
}
