import { validateSoldFixture, stableJson, sha256 } from './claim-suitable-adapter-sdk-v1.mjs';

const terminalMarkers = new Set(['SOLD','SOLD_FOR','PRICE_REALIZED','SOLD_PRICE','SALE_COMPLETE_SOLD']);
const allowedCurrencies = new Set(['USD','GBP','EUR','CHF','HKD','JPY','KRW']);
const symbolMap = new Map([['$', 'USD'],['£','GBP'],['€','EUR'],['CHF','CHF'],['HK$','HKD'],['¥','JPY'],['₩','KRW']]);
const ensure=(condition,code)=>{if(!condition)throw new Error(code)};
const nonEmpty=value=>typeof value==='string'&&value.trim().length>0;
const first=(record,fields)=>{for(const field of fields||[]){const value=record?.[field];if(value!==undefined&&value!==null&&String(value).trim()!=='')return{field,value};}return null;};
const normalizeStatus=value=>String(value||'').trim().toUpperCase().replace(/[\s-]+/g,'_');
const parseTime=value=>{ensure(nonEmpty(String(value||''))&&Number.isFinite(Date.parse(value)),'SOURCE_MAPPING_EVENT_TIME_INVALID');return new Date(value).toISOString();};

function parseMoney(value, explicitCurrency){
  ensure(value!==undefined&&value!==null,'SOURCE_MAPPING_REALIZED_PRICE_MISSING');
  const raw=String(value).trim();
  ensure(raw.length>0,'SOURCE_MAPPING_REALIZED_PRICE_MISSING');
  ensure(!/estimate|est\.?|guide|range/i.test(raw),'SOURCE_MAPPING_ESTIMATE_AS_REALIZED_FORBIDDEN');
  ensure(!/\d\s*[-–—]\s*\d/.test(raw),'SOURCE_MAPPING_PRICE_RANGE_FORBIDDEN');
  let currency=String(explicitCurrency||'').trim().toUpperCase();
  for(const [symbol,code] of [...symbolMap.entries()].sort((a,b)=>b[0].length-a[0].length)){
    if(raw.includes(symbol)){
      if(!currency)currency=code;
      else ensure(currency===code,'SOURCE_MAPPING_CURRENCY_CONFLICT');
      break;
    }
  }
  ensure(allowedCurrencies.has(currency),'SOURCE_MAPPING_CURRENCY_REQUIRED');
  if(raw.includes('$')&&!raw.includes('HK$')&&!explicitCurrency)throw new Error('SOURCE_MAPPING_AMBIGUOUS_DOLLAR');
  const numeric=Number(raw.replace(/[^0-9.,-]/g,'').replace(/,/g,''));
  ensure(Number.isFinite(numeric)&&numeric>0,'SOURCE_MAPPING_REALIZED_PRICE_INVALID');
  return{realized_price:numeric,currency};
}

export function mapAuctionResultFixture(profile,envelope,{ordinal=1}={}){
  ensure(profile&&nonEmpty(profile.profile_id),'SOURCE_MAPPING_PROFILE_INVALID');
  ensure(envelope&&typeof envelope==='object','SOURCE_MAPPING_ENVELOPE_INVALID');
  const status=first(envelope,profile.terminal_status_fields);
  ensure(status,'SOURCE_MAPPING_TERMINAL_STATUS_MISSING');
  const normalizedStatus=normalizeStatus(status.value);
  ensure(terminalMarkers.has(normalizedStatus),'SOURCE_MAPPING_TERMINAL_SOLD_REQUIRED');
  const price=first(envelope,profile.realized_price_fields);
  const money=parseMoney(price?.value,envelope.currency||envelope.currency_code||profile.fixture_currency);
  const eventTime=first(envelope,profile.event_time_fields);
  const recordId=first(envelope,profile.record_id_fields);
  const title=first(envelope,profile.title_fields);
  ensure(recordId&&nonEmpty(String(recordId.value)),'SOURCE_MAPPING_RECORD_ID_MISSING');
  ensure(title&&nonEmpty(String(title.value)),'SOURCE_MAPPING_TITLE_MISSING');
  const observedAt=parseTime(envelope.source_observed_at||'2026-08-24T00:00:00.000Z');
  const eventOccurredAt=parseTime(eventTime?.value);
  ensure(Date.parse(observedAt)>=Date.parse(eventOccurredAt),'SOURCE_MAPPING_OBSERVATION_BEFORE_EVENT');
  const event={
    schema_version:'kidults-claim-suitable-adapter-event-v1',
    source_profile_id:profile.profile_id,
    source_record_id:String(recordId.value),
    source_record_locator:`fixture://${profile.profile_id}/${encodeURIComponent(String(recordId.value))}`,
    object_identity:`${profile.domain}::${String(title.value).trim()}::${String(recordId.value).trim()}`,
    source_owner:`fixture-owner::${profile.profile_id}`,
    factual_origin:`fixture-origin::${profile.profile_id}`,
    rights:{collect:'ALLOW',store:'ALLOW',derive:'ALLOW',display:'HOLD',redistribute:'HOLD'},
    provider_direct_to_truth:false,
    provider_direct_to_projection:false,
    fixture_only:true,
    empirical:false,
    promotable:false,
    source_observed_at:observedAt,
    event_type:'TERMINAL_SOLD_TRANSACTION',
    terminal_state:'SOLD',
    realized_price:money.realized_price,
    currency:money.currency,
    event_occurred_at:eventOccurredAt,
    condition_or_comparability:String(envelope.condition_or_comparability||'SOURCE_PROFILE_FIXTURE_CONDITION'),
    listing_only:false,
    bid_only:false,
    ask_only:false,
    offer_only:false,
    reserve_only:false,
    mapping_receipt:{
      profile_id:profile.profile_id,
      status_field:status.field,
      price_field:price.field,
      event_time_field:eventTime.field,
      record_id_field:recordId.field,
      title_field:title.field,
      envelope_digest:sha256(stableJson(envelope)),
      ordinal
    }
  };
  const validation=validateSoldFixture(event);
  return{event,validation};
}

export function buildProfileFixture(profile,ordinal=1){
  const statusField=profile.terminal_status_fields[0];
  const priceField=profile.realized_price_fields[0];
  const timeField=profile.event_time_fields[0];
  const recordField=profile.record_id_fields[0];
  const titleField=profile.title_fields[0];
  return{
    [statusField]:'SOLD',
    [priceField]:100000+ordinal,
    [timeField]:'2026-08-22T00:00:00.000Z',
    [recordField]:`${profile.profile_id}-LOT-${ordinal}`,
    [titleField]:`${profile.display_name} Fixture Object ${ordinal}`,
    currency:'USD',
    source_observed_at:'2026-08-23T00:00:00.000Z',
    condition_or_comparability:'FIXTURE_CONDITION_SEGMENT'
  };
}

export const adapterModuleMetadata=Object.freeze({
  id:'kidults-initial-auction-results-adapters-v1',
  version:'1.0.0',
  mapping_count:6,
  evidence_class:'CURRENT_SOLD_TRANSACTION',
  fixture_only:true,
  live_extraction_verified:false,
  empirical:false,
  promotable:false
});
