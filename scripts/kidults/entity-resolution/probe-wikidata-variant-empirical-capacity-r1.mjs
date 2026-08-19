const query = `SELECT ?item ?modelNumber ?gtin ?manufacturer WHERE {
  ?item wdt:P13351 ?modelNumber ; wdt:P3962 ?gtin ; wdt:P176 ?manufacturer .
} ORDER BY STR(?item) LIMIT 400`;
const url=`https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;
const response=await fetch(url,{headers:{accept:'application/sparql-results+json','user-agent':'KIDULTS-ER-EMPIRICAL-CAPACITY-DEV-SHADOW/1.0'}});
if(!response.ok) throw new Error(`WIKIDATA_QUERY_HTTP_${response.status}`);
const json=await response.json();
const rows=json?.results?.bindings||[];
const unique=new Map();
for(const r of rows){
  const qid=String(r?.item?.value||'').match(/\/entity\/(Q\d+)$/)?.[1];
  const model=String(r?.modelNumber?.value||'').trim();
  const gtin=String(r?.gtin?.value||'').trim();
  const maker=String(r?.manufacturer?.value||'').match(/\/entity\/(Q\d+)$/)?.[1];
  if(qid&&model&&gtin&&maker) unique.set(`${qid}\0${model}\0${gtin}\0${maker}`,{qid,model,gtin,maker});
}
const count=unique.size;
const result={status:count>=120?'PASS_CAPACITY':'FAIL_CAPACITY',source:'WIKIDATA_CC0',required_unique_records:120,observed_unique_records:count,fields:['P13351_MODEL_NUMBER','P3962_GTIN','P176_MANUFACTURER'],labels_created:0,reviewers_assigned:0,production:'HOLD'};
console.log(JSON.stringify(result,null,2));
if(count<120) process.exit(1);
