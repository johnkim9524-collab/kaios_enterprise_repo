import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const DAY_MS = 86_400_000;
const digest = value => `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
export const PSA_ALLOWED_PAYLOAD_FIELDS = Object.freeze(['Brand','CardGrade','CardNumber','Category','CertNumber','GradeDescription','IsDualCert','IsPSADNA','LabelType','PopulationHigher','SpecID','SpecNumber','Subject','TotalPopulation','TotalPopulationWithQualifier','Variety','Year']);
const ALLOWED = new Set(PSA_ALLOWED_PAYLOAD_FIELDS);
function validatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length !== 1 || !payload.PSACert || typeof payload.PSACert !== 'object' || Array.isArray(payload.PSACert)) throw new Error('PSA_CERT_PAYLOAD_REQUIRED');
  const bad = Object.keys(payload.PSACert).filter(k => !ALLOWED.has(k)).sort();
  if (bad.length) throw new Error(`PSA_PAYLOAD_FIELD_NOT_ALLOWED:${bad[0]}`);
}
function metadata(certReferenceDigest, observedAt, deleteAt) { return {record_version:'1.1.0',provider_id:'psa-public-api',classification:'PRIVATE_ONLY',cert_reference_digest:certReferenceDigest,observed_at:observedAt,delete_at:deleteAt,encryption:'AES-256-GCM',plaintext_persisted:false,public_release:'BLOCK',production:'HOLD'}; }
function recordDigest(record) { const {record_digest:_,...bound}=record; return digest(stable(bound)); }
export function buildPrivatePsaRecord({certNumber,payload,key,observedAt=new Date()}) {
  const cert=String(certNumber??'').trim(); if(!/^\d{4,16}$/.test(cert)) throw new Error('PSA_CERT_NUMBER_INVALID'); validatePayload(payload); if(!Buffer.isBuffer(key)||key.length!==32) throw new Error('PSA_AES_256_KEY_REQUIRED');
  const observed=new Date(observedAt); if(Number.isNaN(observed.valueOf())) throw new Error('PSA_OBSERVED_AT_INVALID'); const deleteAt=new Date(observed.valueOf()+30*DAY_MS).toISOString(); const m=metadata(digest(cert),observed.toISOString(),deleteAt); const aad=Buffer.from(stable(m)); const iv=randomBytes(12); const cipher=createCipheriv('aes-256-gcm',key,iv); cipher.setAAD(aad); const ciphertext=Buffer.concat([cipher.update(Buffer.from(JSON.stringify(payload))),cipher.final()]); const record={...m,aad_digest:digest(aad),iv_b64:iv.toString('base64'),tag_b64:cipher.getAuthTag().toString('base64'),ciphertext_b64:ciphertext.toString('base64')}; return {...record,record_digest:recordDigest(record)};
}
export function decryptPrivatePsaRecord(record,key) {
  if(!record||record.classification!=='PRIVATE_ONLY') throw new Error('PSA_PRIVATE_RECORD_REQUIRED'); if(record.record_version!=='1.1.0'||record.provider_id!=='psa-public-api'||record.encryption!=='AES-256-GCM') throw new Error('PSA_PRIVATE_RECORD_METADATA_INVALID'); if(!Buffer.isBuffer(key)||key.length!==32) throw new Error('PSA_AES_256_KEY_REQUIRED'); if(!/^sha256:[0-9a-f]{64}$/.test(record.record_digest??'')||recordDigest(record)!==record.record_digest) throw new Error('PSA_RECORD_DIGEST_INVALID'); const m=metadata(record.cert_reference_digest,record.observed_at,record.delete_at); const aad=Buffer.from(stable(m)); if(digest(aad)!==record.aad_digest) throw new Error('PSA_RECORD_AAD_INVALID'); const d=createDecipheriv('aes-256-gcm',key,Buffer.from(record.iv_b64,'base64')); d.setAAD(aad); d.setAuthTag(Buffer.from(record.tag_b64,'base64')); const payload=JSON.parse(Buffer.concat([d.update(Buffer.from(record.ciphertext_b64,'base64')),d.final()]).toString('utf8')); validatePayload(payload); return payload;
}
export function buildDeletionReceipt(record,{deletedAt=new Date(),deletionSucceeded}) {
  if(!/^sha256:[0-9a-f]{64}$/.test(record?.record_digest??'')||recordDigest(record)!==record.record_digest) throw new Error('PSA_RECORD_DIGEST_REQUIRED'); if(deletionSucceeded!==true) throw new Error('PSA_DELETION_NOT_VERIFIED'); const at=new Date(deletedAt), observed=new Date(record.observed_at), deadline=new Date(record.delete_at); if([at,observed,deadline].some(d=>Number.isNaN(d.valueOf()))) throw new Error('PSA_RETENTION_WINDOW_INVALID'); if(at<observed) throw new Error('PSA_DELETION_BEFORE_OBSERVATION'); if(at>deadline) throw new Error('PSA_DELETION_AFTER_RETENTION_DEADLINE'); return {receipt_id:'KIDULTS_PSA_PRIVATE_DATA_DELETION_RECEIPT_V1',provider_id:'psa-public-api',record_digest:record.record_digest,cert_reference_digest:record.cert_reference_digest,deleted_at:at.toISOString(),delete_at:record.delete_at,deletion_verified:true,raw_payload_retained:false,promotion_authority:'NONE',production:'HOLD'};
}
