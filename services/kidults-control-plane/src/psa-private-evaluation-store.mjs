import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { access, appendFile, mkdir, open, readdir, readFile, realpath, stat, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, sep } from 'node:path';

const DAY_MS = 86_400_000;
const digest = value => `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

export const PSA_ALLOWED_PAYLOAD_FIELDS = Object.freeze([
  'Brand','CardGrade','CardNumber','Category','CertNumber','GradeDescription','IsDualCert','IsPSADNA','LabelType',
  'PopulationHigher','SpecID','SpecNumber','Subject','TotalPopulation','TotalPopulationWithQualifier','Variety','Year'
]);
const PSA_ALLOWED_FIELD_SET = new Set(PSA_ALLOWED_PAYLOAD_FIELDS);

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('PSA_PAYLOAD_OBJECT_REQUIRED');
  const topLevel = Object.keys(payload);
  if (topLevel.length !== 1 || topLevel[0] !== 'PSACert') throw new Error('PSA_CERT_PAYLOAD_REQUIRED');
  const psaCert = payload.PSACert;
  if (!psaCert || typeof psaCert !== 'object' || Array.isArray(psaCert)) throw new Error('PSA_CERT_PAYLOAD_REQUIRED');
  const disallowed = Object.keys(psaCert).filter(field => !PSA_ALLOWED_FIELD_SET.has(field)).sort();
  if (disallowed.length) throw new Error(`PSA_PAYLOAD_FIELD_NOT_ALLOWED:${disallowed[0]}`);
}

export function assertPsaPayloadCertificateBinding(payload, certReferenceDigest) {
  validatePayload(payload);
  const value = payload.PSACert.CertNumber;
  if ((typeof value !== 'string' && typeof value !== 'number')
    || (typeof value === 'number' && !Number.isSafeInteger(value))) {
    throw new Error('PSA_PAYLOAD_CERT_NUMBER_INVALID');
  }
  const cert = String(value).trim();
  if (!/^\d{4,16}$/.test(cert)) throw new Error('PSA_PAYLOAD_CERT_NUMBER_INVALID');
  if (digest(cert) !== certReferenceDigest) throw new Error('PSA_PAYLOAD_CERT_IDENTITY_MISMATCH');
}

function authenticatedMetadata({ certReferenceDigest, observedAt, deleteAt }) {
  return {
    record_version: '1.1.0', provider_id: 'psa-public-api', classification: 'PRIVATE_ONLY',
    cert_reference_digest: certReferenceDigest, observed_at: observedAt, delete_at: deleteAt,
    encryption: 'AES-256-GCM', plaintext_persisted: false, public_release: 'BLOCK', production: 'HOLD'
  };
}

function recordDigest(record) {
  const { record_digest: _omitted, ...bound } = record;
  return digest(stable(bound));
}

function encryptRecord({ certReferenceDigest, payload, key, observedAt, deleteAt }) {
  if (!/^sha256:[0-9a-f]{64}$/.test(String(certReferenceDigest || ''))) throw new Error('PSA_CERT_REFERENCE_DIGEST_INVALID');
  validatePayload(payload);
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('PSA_AES_256_KEY_REQUIRED');
  assertPsaPayloadCertificateBinding(payload, certReferenceDigest);
  const observed = new Date(observedAt);
  const deletion = new Date(deleteAt);
  if (Number.isNaN(observed.valueOf())) throw new Error('PSA_OBSERVED_AT_INVALID');
  if (Number.isNaN(deletion.valueOf()) || deletion <= observed || deletion > new Date(observed.valueOf() + 30 * DAY_MS)) {
    throw new Error('PSA_DELETE_AT_OUT_OF_BOUNDS');
  }
  const metadata = authenticatedMetadata({
    certReferenceDigest, observedAt: observed.toISOString(), deleteAt: deletion.toISOString()
  });
  const aad = Buffer.from(stable(metadata));
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const plaintext = Buffer.from(JSON.stringify(payload));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const record = {
    ...metadata, aad_digest: digest(aad), iv_b64: iv.toString('base64'),
    tag_b64: cipher.getAuthTag().toString('base64'), ciphertext_b64: ciphertext.toString('base64')
  };
  return { ...record, record_digest: recordDigest(record) };
}

export function buildPrivatePsaRecord({ certNumber, payload, key, observedAt = new Date() }) {
  const cert = String(certNumber ?? '').trim();
  if (!/^\d{4,16}$/.test(cert)) throw new Error('PSA_CERT_NUMBER_INVALID');
  const observed = new Date(observedAt);
  if (Number.isNaN(observed.valueOf())) throw new Error('PSA_OBSERVED_AT_INVALID');
  return encryptRecord({
    certReferenceDigest: digest(cert), payload, key, observedAt: observed,
    deleteAt: new Date(observed.valueOf() + 30 * DAY_MS)
  });
}

export function buildPrivatePsaRecordFromDigest({ certReferenceDigest, payload, key, observedAt = new Date(), deleteAt }) {
  return encryptRecord({ certReferenceDigest, payload, key, observedAt, deleteAt });
}

export function decryptPrivatePsaRecord(record, key) {
  if (!record || record.classification !== 'PRIVATE_ONLY') throw new Error('PSA_PRIVATE_RECORD_REQUIRED');
  if (record.record_version !== '1.1.0' || record.provider_id !== 'psa-public-api' || record.encryption !== 'AES-256-GCM') throw new Error('PSA_PRIVATE_RECORD_METADATA_INVALID');
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('PSA_AES_256_KEY_REQUIRED');
  if (!/^sha256:[0-9a-f]{64}$/.test(record.record_digest ?? '') || recordDigest(record) !== record.record_digest) throw new Error('PSA_RECORD_DIGEST_INVALID');
  const observed = new Date(record.observed_at), deletion = new Date(record.delete_at);
  if (!Number.isFinite(observed.valueOf()) || !Number.isFinite(deletion.valueOf())
    || deletion <= observed || deletion.valueOf() > observed.valueOf() + 30 * DAY_MS) {
    throw new Error('PSA_RETENTION_WINDOW_INVALID');
  }
  const metadata = authenticatedMetadata({
    certReferenceDigest: record.cert_reference_digest, observedAt: record.observed_at, deleteAt: record.delete_at
  });
  const aad = Buffer.from(stable(metadata));
  if (digest(aad) !== record.aad_digest) throw new Error('PSA_RECORD_AAD_INVALID');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(record.iv_b64, 'base64'));
  decipher.setAAD(aad);
  decipher.setAuthTag(Buffer.from(record.tag_b64, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(record.ciphertext_b64, 'base64')), decipher.final()]);
  const payload = JSON.parse(plaintext.toString('utf8'));
  assertPsaPayloadCertificateBinding(payload, record.cert_reference_digest);
  return payload;
}

export function buildDeletionReceipt(record, { deletedAt = new Date(), deletionSucceeded }) {
  if (!/^sha256:[0-9a-f]{64}$/.test(record?.record_digest ?? '') || recordDigest(record) !== record.record_digest) throw new Error('PSA_RECORD_DIGEST_REQUIRED');
  if (!/^sha256:[0-9a-f]{64}$/.test(record?.cert_reference_digest ?? '')) throw new Error('PSA_CERT_REFERENCE_DIGEST_REQUIRED');
  if (deletionSucceeded !== true) throw new Error('PSA_DELETION_NOT_VERIFIED');
  const at = new Date(deletedAt);
  const observedAt = new Date(record.observed_at);
  const deleteAt = new Date(record.delete_at);
  if (Number.isNaN(at.valueOf())) throw new Error('PSA_DELETED_AT_INVALID');
  if (Number.isNaN(observedAt.valueOf()) || Number.isNaN(deleteAt.valueOf())) throw new Error('PSA_RETENTION_WINDOW_INVALID');
  if (at.valueOf() < observedAt.valueOf()) throw new Error('PSA_DELETION_BEFORE_OBSERVATION');
  const deadlineMet = at.valueOf() <= deleteAt.valueOf();
  return {
    receipt_id: 'KIDULTS_PSA_PRIVATE_DATA_DELETION_RECEIPT_V1',
    state: deadlineMet ? 'VERIFIED_PASS' : 'VERIFIED_RETENTION_BREACH_DELETED',
    provider_id: 'psa-public-api', record_digest: record.record_digest,
    cert_reference_digest: record.cert_reference_digest, deleted_at: at.toISOString(), delete_at: record.delete_at,
    deletion_verified: true, retention_deadline_met: deadlineMet, raw_payload_retained: false,
    promotion_authority: 'NONE', production: 'HOLD'
  };
}

function assertRoot(rootDir) {
  if (typeof rootDir !== 'string' || !rootDir.trim()) throw new Error('PSA_PRIVATE_STORE_ROOT_REQUIRED');
  return resolve(rootDir);
}

export async function resolvePsaPrivateStoreRoot({ rootDir, forbiddenRoot }) {
  const root = assertRoot(rootDir);
  const forbidden = assertRoot(forbiddenRoot);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const [rootReal, forbiddenReal] = await Promise.all([realpath(root), realpath(forbidden)]);
  const rootStat = await stat(rootReal);
  if (!rootStat.isDirectory()) throw new Error('PSA_PRIVATE_STORE_ROOT_NOT_DIRECTORY');
  if (rootReal === forbiddenReal || rootReal.startsWith(`${forbiddenReal}${sep}`) || forbiddenReal.startsWith(`${rootReal}${sep}`)) {
    throw new Error('PSA_PRIVATE_STORE_ROOT_OVERLAP_FORBIDDEN');
  }
  return rootReal;
}

function recordPath(root, handle) {
  if (!/^psa-private-file:(?:[0-9a-f-]{36}|[0-9a-f]{64})\.json$/.test(String(handle || ''))) throw new Error('PSA_PRIVATE_HANDLE_INVALID');
  const path = resolve(root, handle.slice('psa-private-file:'.length));
  if (!path.startsWith(`${root}${sep}`)) throw new Error('PSA_PRIVATE_HANDLE_OUTSIDE_ROOT');
  return path;
}

export function createPsaPrivateFileStore({ rootDir, key, now = () => new Date() }) {
  const root = assertRoot(rootDir);
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('PSA_AES_256_KEY_REQUIRED');
  const auditPath = resolve(root, 'audit.jsonl');
  const operationMac = value => `hmac-sha256:${createHmac('sha256', key).update(stable(value)).digest('hex')}`;
  const ensureRoot = () => mkdir(root, { recursive: true, mode: 0o700 });
  const audit = async event => {
    await ensureRoot();
    await appendFile(auditPath, `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600 });
  };
  const operationPath = (operationId, suffix = '') => {
    if (!/^sha256:[0-9a-f]{64}$/.test(operationId || '')) throw new Error('PSA_EVALUATION_OPERATION_ID_REQUIRED');
    return resolve(root, `evaluation-${operationId.slice(7)}${suffix}.json`);
  };
  const readProtectedJson = async path => {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const metadata = await file.stat();
      if (!metadata.isFile() || metadata.size > 2_000_000) throw new Error('PSA_PRIVATE_RECORD_TYPE_INVALID');
      return JSON.parse(await file.readFile('utf8'));
    } finally { await file.close(); }
  };
  const writeExclusive = async (path, value) => {
    const file = await open(path, 'wx', 0o600);
    try { await file.writeFile(`${JSON.stringify(value)}\n`, 'utf8'); await file.sync(); }
    finally { await file.close(); }
  };
  const verifyClaim = (claim, operationId, bindingDigest) => {
    if (claim?.id !== 'KIDULTS_PSA_EVALUATION_OPERATION_V1' || claim.operation_id !== operationId
      || claim.binding_digest !== bindingDigest || claim.claim_mac !== operationMac({
        id:claim.id,operation_id:operationId,binding_digest:bindingDigest,
        started_at:claim.started_at,lease_until:claim.lease_until})) throw new Error('PSA_EVALUATION_OPERATION_BINDING_MISMATCH');
    if (!Number.isFinite(Date.parse(claim.started_at))
      || Date.parse(claim.lease_until)-Date.parse(claim.started_at)!==300_000) throw new Error('PSA_EVALUATION_LEASE_INVALID');
  };
  const assertLiveOperation = async (operationId, bindingDigest) => {
    const claim=await readProtectedJson(operationPath(operationId));
    verifyClaim(claim,operationId,bindingDigest ?? claim.binding_digest);
    const instant=new Date(now()).valueOf();
    if (!Number.isFinite(instant) || instant<Date.parse(claim.started_at)
      || instant>=Date.parse(claim.lease_until)) throw new Error('PSA_EVALUATION_LEASE_EXPIRED_OR_CLOCK_INVALID');
    try {await access(operationPath(operationId,'.recovery'));}
    catch(error) {if(error?.code==='ENOENT')return claim;throw error;}
    throw new Error('PSA_EVALUATION_RECOVERY_FENCED');
  };
  const verifyTerminal = (terminal, operationId, bindingDigest) => {
    const {terminal_mac,...body}=terminal;
    if (terminal_mac !== operationMac(body) || terminal.operation_id !== operationId
      || terminal.binding_digest !== bindingDigest || terminal.receipt?.operation_id !== operationId
      || terminal.receipt?.state !== 'VERIFIED_PASS' || terminal.receipt.raw_payload_retained !== false
      || terminal.receipt_digest !== digest(stable(terminal.receipt))) throw new Error('PSA_EVALUATION_TERMINAL_BINDING_INVALID');
  };
  return {
    capabilities: ['ENCRYPTION_AT_REST', 'ACCESS_AUDIT', 'DELETE_BY_ENFORCEMENT'],
    async beginEvaluation({ operationId, bindingDigest }) {
      if (!/^sha256:[0-9a-f]{64}$/.test(bindingDigest || '')) throw new Error('PSA_EVALUATION_BINDING_INVALID');
      await ensureRoot();
      const started=new Date(now());
      if (!Number.isFinite(started.valueOf())) throw new Error('PSA_EVALUATION_CLOCK_INVALID');
      const body = { id:'KIDULTS_PSA_EVALUATION_OPERATION_V1',operation_id:operationId,binding_digest:bindingDigest,
        started_at:started.toISOString(),lease_until:new Date(started.valueOf()+300_000).toISOString() };
      try {
        await writeExclusive(operationPath(operationId), {...body,claim_mac:operationMac(body)});
        return {state:'CLAIMED'};
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
      }
      verifyClaim(await readProtectedJson(operationPath(operationId)),operationId,bindingDigest);
      try {
        const terminal = await readProtectedJson(operationPath(operationId,'.terminal'));
        verifyTerminal(terminal,operationId,bindingDigest);
        return {state:'COMPLETED',receipt:terminal.receipt};
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        return {state:'RECONCILIATION_REQUIRED'};
      }
    },
    async completeEvaluation({ operationId, bindingDigest, receipt }) {
      await assertLiveOperation(operationId,bindingDigest);
      if (receipt?.state !== 'VERIFIED_PASS' || receipt.operation_id !== operationId || receipt.raw_payload_retained !== false) throw new Error('PSA_EVALUATION_TERMINAL_INVALID');
      const body = {
        operation_id:operationId,binding_digest:bindingDigest,receipt,receipt_digest:digest(stable(receipt)),
      };
      await writeExclusive(operationPath(operationId,'.terminal'), {...body,terminal_mac:operationMac(body)});
    },
    async recoverPendingEvaluations({ deletedAt }) {
      await ensureRoot();
      const recovered = [];
      const failures=[];
      let activeCount=0,breaches=0;
      const instant=new Date(deletedAt).valueOf();
      if (!Number.isFinite(instant)) throw new Error('PSA_DELETED_AT_INVALID');
      const observedNow=new Date(now()).valueOf();
      if(!Number.isFinite(observedNow)||instant>observedNow)throw new Error('PSA_RECOVERY_CLOCK_FUTURE');
      for (const entry of await readdir(root,{withFileTypes:true})) {
        if (!/^evaluation-[0-9a-f]{64}\.json$/.test(entry.name)) continue;
        try {
        const claim = await readProtectedJson(resolve(root,entry.name));
        verifyClaim(claim,claim.operation_id,claim.binding_digest);
        try {
          verifyTerminal(await readProtectedJson(operationPath(claim.operation_id,'.terminal')),claim.operation_id,claim.binding_digest);
          continue;
        }
        catch(error) { if(error?.code!=='ENOENT') throw error; }
        if(instant<Date.parse(claim.lease_until)){activeCount++;continue;}
        const recoveryBody={operation_id:claim.operation_id,binding_digest:claim.binding_digest,lease_until:claim.lease_until};
        try {
          await writeExclusive(operationPath(claim.operation_id,'.recovery'),{
            ...recoveryBody,recovery_mac:operationMac(recoveryBody)});
        } catch(error) {
          if(error?.code!=='EEXIST')throw error;
          const existing=await readProtectedJson(operationPath(claim.operation_id,'.recovery'));
          if(existing.recovery_mac!==operationMac(recoveryBody))throw new Error('PSA_RECOVERY_FENCE_INVALID');
        }
        const path=recordPath(root,`psa-private-file:${claim.operation_id.slice(7)}.json`);
        try {
          const record=await readProtectedJson(path);
          decryptPrivatePsaRecord(record,key);
          const receipt=buildDeletionReceipt(record,{deletedAt,deletionSucceeded:true});
          await unlink(path);
          try {await access(path);throw new Error('PSA_DELETION_NOT_VERIFIED');}
          catch(error) {if(error?.code!=='ENOENT')throw error;}
          recovered.push(digest(stable(receipt)));
          if(!receipt.retention_deadline_met)breaches++;
        } catch(error) {if(error?.code!=='ENOENT')throw error;}
        } catch {
          failures.push(digest(entry.name));
        }
      }
      return {state:failures.length||breaches?'VERIFIED_FAIL_PENDING_RAW_RECOVERY':'VERIFIED_PENDING_RAW_CLEANUP_ONLY',deleted_count:recovered.length,
        deletion_receipt_digests:recovered.sort(),failed_operation_digests:failures.sort(),
        failed_operation_count:failures.length,retention_breach_count:breaches,active_operation_count:activeCount,
        admission_retry_authority:false};
    },
    async put({ providerId, certReferenceDigest, payload, acquiredAt, deleteBy, rawDigest, evaluationOperationId }) {
      if (providerId !== 'psa-public-api') throw new Error('PSA_PROVIDER_ID_INVALID');
      if (!/^sha256:[0-9a-f]{64}$/.test(String(rawDigest || ''))) throw new Error('PSA_RAW_DIGEST_INVALID');
      const record = buildPrivatePsaRecordFromDigest({ certReferenceDigest, payload, key, observedAt: acquiredAt, deleteAt: deleteBy });
      await ensureRoot();
      if (evaluationOperationId !== undefined) {
        await assertLiveOperation(evaluationOperationId);
      }
      const filename = `${evaluationOperationId ? evaluationOperationId.slice(7) : randomUUID()}.json`;
      const path = resolve(root, filename);
      const file = await open(path, 'wx', 0o600);
      const handle = `psa-private-file:${filename}`;
      try {
        try { await file.writeFile(`${JSON.stringify(record)}\n`, 'utf8'); } finally { await file.close(); }
        if(evaluationOperationId!==undefined)await assertLiveOperation(evaluationOperationId);
        await audit({ operation: 'PUT', provider_id: providerId, handle_digest: digest(handle), cert_reference_digest: certReferenceDigest, raw_digest: rawDigest, at: new Date(now()).toISOString(), delete_at: record.delete_at });
      } catch {
        try { await unlink(path); }
        catch { throw new Error('PSA_PRIVATE_PUT_FAILED_CLEANUP_UNVERIFIED'); }
        throw new Error('PSA_PRIVATE_PUT_FAILED_RAW_DELETED');
      }
      return handle;
    },
    async listExpired({ providerId, beforeOrAt }) {
      if (providerId !== 'psa-public-api') throw new Error('PSA_PROVIDER_ID_INVALID');
      const cutoff = new Date(beforeOrAt);
      if (Number.isNaN(cutoff.valueOf())) throw new Error('PSA_EXPIRY_CUTOFF_INVALID');
      await ensureRoot();
      const entries = await readdir(root, { withFileTypes: true });
      const expired = [];
      const invalidRecords = [];
      for (const entry of entries) {
        if (!/^(?:[0-9a-f-]{36}|[0-9a-f]{64})\.json$/.test(entry.name)) continue;
        const path = resolve(root, entry.name);
        try {
          if (!entry.isFile()) throw new Error('PSA_PRIVATE_RECORD_TYPE_INVALID');
          const record = await readProtectedJson(path);
          if (record.provider_id !== 'psa-public-api' || record.classification !== 'PRIVATE_ONLY') throw new Error('PSA_PRIVATE_RECORD_INVALID');
          // One corrupt record must not prevent deletion of healthy records.
          decryptPrivatePsaRecord(record, key);
          if (Date.parse(record.delete_at) <= cutoff.valueOf()) expired.push({ handle: `psa-private-file:${entry.name}` });
        } catch {
          invalidRecords.push(digest(`psa-private-file:${entry.name}`));
        }
      }
      expired.invalid_record_digests = invalidRecords.sort();
      await audit({ operation: 'LIST_EXPIRED', provider_id: providerId, at: new Date(now()).toISOString(), cutoff: cutoff.toISOString(), count: expired.length });
      return expired;
    },
    async delete({ handle, reason, deletedAt }) {
      if (!['RETENTION_EXPIRED', 'EVALUATION_TERMINAL'].includes(reason)) throw new Error('PSA_DELETION_REASON_INVALID');
      const path = recordPath(root, handle);
      const record = await readProtectedJson(path);
      decryptPrivatePsaRecord(record, key);
      // Validate the clock before the irreversible delete, not afterwards.
      buildDeletionReceipt(record, { deletedAt, deletionSucceeded: true });
      await unlink(path);
      let deletionVerified = false;
      try { await access(path); } catch (error) { if (error?.code === 'ENOENT') deletionVerified = true; else throw error; }
      if (!deletionVerified) throw new Error('PSA_DELETION_NOT_VERIFIED');
      const receipt = buildDeletionReceipt(record, { deletedAt, deletionSucceeded: true });
      await audit({ operation: 'DELETE', reason, provider_id: 'psa-public-api', handle_digest: digest(handle), cert_reference_digest: record.cert_reference_digest, at: receipt.deleted_at, deletion_verified: true, retention_deadline_met: receipt.retention_deadline_met });
      return receipt;
    }
  };
}
