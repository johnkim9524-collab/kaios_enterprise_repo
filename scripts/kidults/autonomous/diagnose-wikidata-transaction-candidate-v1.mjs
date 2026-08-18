import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";

const output = path.resolve(process.argv[2] ?? "artifacts/wikidata-transaction-candidate-v1");
const query = `SELECT ?item ?statement ?amount ?unit ?date ?referenceUrl WHERE {
  ?item p:P2284 ?statement .
  ?statement psv:P2284 ?valueNode .
  ?valueNode wikibase:quantityAmount ?amount ; wikibase:quantityUnit ?unit .
  OPTIONAL { ?statement pq:P585 ?date }
  ?statement prov:wasDerivedFrom ?reference .
  ?reference pr:P854 ?referenceUrl .
} LIMIT 100`;

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 30000);
let response;
try {
  response = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, {
    headers: { Accept: "application/sparql-results+json", "User-Agent": "KIDULTS-PoC/1.0 (bounded rights diagnostic)" },
    signal: controller.signal
  });
} finally { clearTimeout(timer); }
if (!response.ok) throw new Error(`WDQS ${response.status}`);
const payload = await response.json();
const records = payload.results.bindings.map(row => ({
  item: row.item?.value ?? null,
  statement: row.statement?.value ?? null,
  amount: row.amount?.value ?? null,
  unit: row.unit?.value ?? null,
  point_in_time: row.date?.value ?? null,
  reference_url: row.referenceUrl?.value ?? null,
  property: "P2284",
  property_semantics: "PUBLISHED_PRICE_LISTED_OR_PAID_AMBIGUOUS",
  admitted_transaction_event: false,
  rejection_reason: "P2284_DOES_NOT_DISTINGUISH_LIST_PRICE_FROM_PAID_SALE_WITHOUT_SEPARATE_TERMINAL_SALE_EVIDENCE"
}));
const digest = value => `sha256:${crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const report = {
  id: "wikidata-transaction-candidate-diagnostic-v1",
  status: "DIAGNOSTIC_COMPLETE_FAIL_CLOSED",
  source_family: "wikidata-structured-data-cc0",
  rights: { state: "CC0_STRUCTURED_DATA", source: "https://www.wikidata.org/wiki/Wikidata:Licensing" },
  endpoint: "https://query.wikidata.org/sparql",
  property: { id: "P2284", meaning: "published price listed or paid for a product", terminal_sale_unambiguous: false },
  observed_records: records.length,
  records_with_reference_url: records.filter(record => record.reference_url).length,
  admitted_verified_sales: 0,
  source_removal_independent_transaction_family_added: false,
  decision: "NOT_ADMITTED_AS_TRANSACTION_FAMILY",
  next_requirement: "A separate terminal SOLD assertion with event date, amount/currency, item identity, venue and immutable reference is required.",
  records_digest: digest(records),
  production: "HOLD"
};
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "records.json"), `${JSON.stringify(records, null, 2)}\n`);
fs.writeFileSync(path.join(output, "diagnostic-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
