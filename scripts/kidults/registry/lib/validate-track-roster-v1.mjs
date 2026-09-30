export const CORE_TRACK_IDS=Object.freeze(['track-a-120-intelligence-factory','track-b-rankability-validation-gate','track-c-portal-v502-experience-layer','track-d-data-platform-production-reliability','track-e-executive-operating-system']);
/** Exact approved roster comparison; this does not authorize a role or dispatch. */
export function validateTrackRoster(index, approvedIds) {
  const errors=[];
  if(!Array.isArray(approvedIds)||approvedIds.length===0||approvedIds.some(id=>typeof id!=='string'||!id)||new Set(approvedIds).size!==approvedIds.length)return ['APPROVED_TRACK_SCHEMA_INVALID'];
  for(const id of CORE_TRACK_IDS)if(!approvedIds.includes(id))errors.push('CORE_TRACK_SCHEMA_MISSING:'+id);
  if(!index||!Array.isArray(index.records))return [...errors,'TRACK_INDEX_INVALID'];
  const ids=index.records.map(record=>record?.id);
  if(new Set(ids).size!==ids.length)errors.push('TRACK_ID_DUPLICATE');
  if(index.record_count!==ids.length||ids.length!==approvedIds.length)errors.push('TRACK_RECORD_COUNT_MISMATCH');
  for(const id of approvedIds)if(!ids.includes(id))errors.push('APPROVED_TRACK_MISSING:'+id);
  for(const id of ids)if(!approvedIds.includes(id))errors.push('UNAPPROVED_TRACK:'+id);
  return errors;
}
