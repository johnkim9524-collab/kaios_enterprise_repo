import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {verifyPrivateAcquisitionReceipt,privateReceiptSigningText} from '../../../scripts/kidults/source-intelligence/lib/verify-private-acquisition-receipt-v1.mjs';
function fixture(){
 const key=randomBytes(32),now=new Date('2026-10-08T00:00:00.000Z');
 const receipt={receipt_id:'unit-only',provider_id:'synthetic',claim_class:'STRUCTURE_ONLY',rights_decision_ref:'unit-rights',source_reference_hash:'sha256:'+'a'.repeat(64),payload_sha256:'sha256:'+'b'.repeat(64),private_object_ref_hash:'sha256:'+'c'.repeat(64),acquired_at:now.toISOString(),expires_at:'2026-10-09T00:00:00.000Z'};
 receipt.tamper_hmac_sha256=createHmac('sha256',key).update(privateReceiptSigningText(receipt)).digest('hex');
 return {receipt,key,now,expected:{...receipt}};
}
test('valid fixture verifies integrity without conferring native acquisition authority',()=>{
 const r=verifyPrivateAcquisitionReceipt(fixture());assert.equal(r.state,'INTEGRITY_AND_BINDING_VERIFIED');
 assert.equal(r.authority_authenticated,false);assert.equal(r.provider_runtime_verified,false);assert.equal(r.promotion_eligible,false);
});
for(const [name,mutate] of [
 ['wrong key',f=>f.key=randomBytes(32)],['short key',f=>f.key=Buffer.alloc(16)],
 ['expired',f=>f.now=new Date('2026-10-09T00:00:00.000Z')],['future acquisition',f=>f.now=new Date('2026-10-07T00:00:00.000Z')],
 ['missing expectation',f=>delete f.expected],['rights reference substitution',f=>f.expected.rights_decision_ref='other'],
 ['foreign provider',f=>f.expected.provider_id='other'],['payload substitution',f=>f.receipt.payload_sha256='sha256:'+'d'.repeat(64)],
 ['private locator exposure',f=>f.receipt.full_private_object_locator='secret'],['malformed MAC',f=>f.receipt.tamper_hmac_sha256='x'],
 ['long retention even with valid signature',f=>{f.receipt.expires_at='2026-11-09T00:00:00.000Z';f.receipt.tamper_hmac_sha256=createHmac('sha256',f.key).update(privateReceiptSigningText(f.receipt)).digest('hex');}]
])test(`rejects ${name}`,()=>{const f=fixture();mutate(f);assert.throws(()=>verifyPrivateAcquisitionReceipt(f));});
