import {createHash} from 'node:crypto';
const hash=s=>'sha256:'+createHash('sha256').update(s).digest('hex');
// An exact reviewed transition, never an exemption for arbitrary guard edits.
export const IMMUTABLE_TRANSPORT_REPAIR=Object.freeze({
  path:'scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs',
  before:'sha256:6d4d6413261ca595969a010256506a9e921c8564a5420678762e5bc32be88924',
  after:'sha256:db9a4bfbcaeeb5110636cc3bb0fc16ba4785014a03b4327c73c0f5fa390fcf01'
});
export function matchesReviewedImmutableTransportRepair(file){
  return file?.filename===IMMUTABLE_TRANSPORT_REPAIR.path
    &&typeof file.base_content==='string'&&typeof file.head_content==='string'
    &&hash(file.base_content)===IMMUTABLE_TRANSPORT_REPAIR.before
    &&hash(file.head_content)===IMMUTABLE_TRANSPORT_REPAIR.after;
}
