const LOCAL = {
  summary: "data/portal-summary.json?v=500",
  k100: "data/kidult100.json?v=500",
  signals: "data/market-signals.json?v=500",
  research: "data/research.json?v=500",
  archive: "data/archive.json?v=500",
  provenance: "data/provenance.json?v=500"
};

const UPSTREAM = {
  quality: "../data/quality-status.json?v=500",
  monthly: "../data/monthly-intelligence.json?v=500"
};

const isNumber = value =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isFinite(Number(value));

async function getJson(path) {
  const response = await fetch(path, {
    cache: "no-store",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`${response.status} ${path}`);
  return response.json();
}

function findMetric(summary, id) {
  return summary.metrics.find(metric => metric.id === id);
}

function overlayVerified(summary, quality, monthly) {
  let verified = 0;

  if (quality?.metrics) {
    const metrics = quality.metrics;
    const evidence = summary.operations.find(item => item.label === "EVIDENCE OBJECTS");
    const sources = summary.operations.find(item => item.label === "SOURCE FAMILIES");
    const confidence = summary.operations.find(item => item.label === "MODEL CONFIDENCE");

    if (evidence && isNumber(metrics.records)) {
      evidence.value = Number(metrics.records).toLocaleString();
      evidence.state = "VERIFIED";
      evidence.tone = "controlled";
      evidence.detail = "Verified quality feed";
      verified += 1;
    }
    if (sources && isNumber(metrics.sources)) {
      sources.value = Number(metrics.sources).toLocaleString();
      sources.state = "VERIFIED";
      sources.tone = "controlled";
      sources.detail = "Verified source registry";
      verified += 1;
    }
    if (confidence && isNumber(metrics.average_confidence)) {
      confidence.value = `${Math.round(Number(metrics.average_confidence))}%`;
      confidence.state = "VERIFIED";
      confidence.tone = "controlled";
      confidence.detail = "Verified quality feed";
      verified += 1;
    }
  }

  if (monthly) {
    const signals = findMetric(summary, "qualifiedSignals");
    const countries = findMetric(summary, "countries");
    const markets = findMetric(summary, "markets");

    if (signals && monthly.signals_ingested) {
      signals.value = String(monthly.signals_ingested);
      signals.state = "Verified monthly feed";
      verified += 1;
    }
    if (countries && isNumber(monthly?.coverage?.countries)) {
      countries.value = String(monthly.coverage.countries);
      summary.coverage.countries = Number(monthly.coverage.countries);
      countries.state = "Verified coverage feed";
      verified += 1;
    }
    if (markets && isNumber(monthly?.coverage?.markets)) {
      markets.value = String(monthly.coverage.markets);
      summary.coverage.markets = Number(monthly.coverage.markets);
      markets.state = "Verified coverage feed";
      verified += 1;
    }
    if (isNumber(monthly?.coverage?.languages)) {
      summary.coverage.languages = Number(monthly.coverage.languages);
      verified += 1;
    }
  }

  return verified;
}

export async function loadPortalData() {
  const required = await Promise.all([
    getJson(LOCAL.summary),
    getJson(LOCAL.k100),
    getJson(LOCAL.signals),
    getJson(LOCAL.research),
    getJson(LOCAL.archive),
    getJson(LOCAL.provenance)
  ]);

  const [summary, k100, signals, research, archive, provenance] = required;
  const [qualityResult, monthlyResult] = await Promise.allSettled([
    getJson(UPSTREAM.quality),
    getJson(UPSTREAM.monthly)
  ]);

  const verifiedFields = overlayVerified(
    summary,
    qualityResult.status === "fulfilled" ? qualityResult.value : null,
    monthlyResult.status === "fulfilled" ? monthlyResult.value : null
  );

  return {
    summary,
    k100,
    signals,
    research,
    archive,
    provenance,
    meta: {
      verifiedFields,
      qualityConnected: qualityResult.status === "fulfilled",
      monthlyConnected: monthlyResult.status === "fulfilled"
    }
  };
}
