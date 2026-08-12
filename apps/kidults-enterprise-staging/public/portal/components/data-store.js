const LOCAL = {
  manifest: "data/v502-manifest.json?v=502",
  registry: "data/registry-view.json?v=502",
  release: "data/portal-release-manifest-v502.json?v=502",
  pulse: "data/living-pulse-contract.json?v=600",
  why: "data/why-engine-contract.json?v=610",
  copilot: "data/copilot-contract.json?v=620",
  compare: "data/compare-engine-contract.json?v=630",
  decision: "data/decision-engine-contract.json?v=640",
  verticals: "data/verticals.json?v=502",
  summary: "data/portal-summary.json?v=502",
  k100: "data/kidult100.json?v=502",
  signals: "data/market-signals.json?v=502",
  research: "data/research.json?v=502",
  archive: "data/archive.json?v=502",
  provenance: "data/provenance.json?v=502"
};

const UPSTREAM = {
  quality: "../data/quality-status.json?v=502",
  monthly: "../data/monthly-intelligence.json?v=502"
};

const isNumber = value =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isFinite(Number(value));

async function getJson(path, { optional = false } = {}) {
  try {
    const response = await fetch(path, {
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`${response.status} ${path}`);
    return await response.json();
  } catch (error) {
    if (optional) return null;
    throw error;
  }
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

function buildSearchIndex({ verticals, k100, research, archive }) {
  const records = [];

  for (const vertical of verticals.verticals) {
    records.push({
      type: "Vertical",
      title: vertical.name,
      description: `${vertical.summary} ${vertical.representative_scope.join(" ")}`,
      href: `vertical.html?id=${encodeURIComponent(vertical.id)}`,
      keywords: [vertical.short_name, vertical.slug, ...vertical.representative_scope]
    });
  }

  for (const item of k100.items) {
    records.push({
      type: "Object",
      title: item.title,
      description: `${item.category}. ${item.status}. ${item.provenance}`,
      href: `object.html?id=${encodeURIComponent(item.id)}`,
      keywords: [item.category, item.vertical_id, item.status]
    });
  }

  records.push({
    type: "Research",
    title: research.title,
    description: `${research.subtitle}. ${research.summary}`,
    href: "#research",
    keywords: research.sections.flatMap(section => [section.title, section.summary])
  });

  for (const edition of archive.editions) {
    records.push({
      type: "Archive",
      title: edition.title,
      description: `${edition.edition}. ${edition.subtitle}. ${edition.status}`,
      href: "#archive",
      keywords: [edition.edition, edition.status]
    });
  }

  return records.map(record => ({
    ...record,
    searchText: [record.title, record.description, ...(record.keywords || [])]
      .join(" ")
      .toLocaleLowerCase()
  }));
}

export async function loadPortalData() {
  const required = await Promise.all([
    getJson(LOCAL.manifest),
    getJson(LOCAL.registry),
    getJson(LOCAL.release),
    getJson(LOCAL.pulse),
    getJson(LOCAL.why),
    getJson(LOCAL.copilot),
    getJson(LOCAL.compare),
    getJson(LOCAL.decision),
    getJson(LOCAL.verticals),
    getJson(LOCAL.summary),
    getJson(LOCAL.k100),
    getJson(LOCAL.signals),
    getJson(LOCAL.research),
    getJson(LOCAL.archive),
    getJson(LOCAL.provenance)
  ]);

  const [
    manifest,
    registry,
    release,
    pulse,
    why,
    copilot,
    compare,
    decision,
    verticals,
    summary,
    k100,
    signals,
    research,
    archive,
    provenance
  ] = required;

  const [quality, monthly] = await Promise.all([
    getJson(UPSTREAM.quality, { optional: true }),
    getJson(UPSTREAM.monthly, { optional: true })
  ]);

  const verifiedFields = overlayVerified(summary, quality, monthly);
  const searchIndex = buildSearchIndex({ verticals, k100, research, archive });

  return {
    manifest,
    registry,
    release,
    pulse,
    why,
    copilot,
    compare,
    decision,
    verticals,
    summary,
    k100,
    signals,
    research,
    archive,
    provenance,
    searchIndex,
    meta: {
      verifiedFields,
      qualityConnected: Boolean(quality),
      monthlyConnected: Boolean(monthly),
      registryProjectionConnected: Boolean(registry),
      releaseCandidate: manifest.status === "RELEASE_CANDIDATE"
    }
  };
}
