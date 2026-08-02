"use strict";

const DATA = {
  index: "/data/kidult-100.json",
  quality: "/data/quality-status.json",
  monthly: "/data/monthly-intelligence.json",
  archive: "/data/archive.json"
};

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

async function loadJson(path) {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Unable to load ${path}`);
  return response.json();
}

function formatDate(value) {
  if (!value) return "Today";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

function sparkline(points, negative = false) {
  const source = Array.isArray(points) && points.length > 2 ? points : [18, 24, 22, 31, 29, 39, 36, 47, 44, 55];
  const max = Math.max(...source);
  const min = Math.min(...source);
  const width = 100;
  const height = 23;
  const range = Math.max(1, max - min);
  const coords = source.map((point, index) => {
    const x = (index / (source.length - 1)) * width;
    const y = height - ((point - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true"><polyline points="${coords}"${negative ? ' class="negative-line"' : ""}></polyline></svg>`;
}

function renderIndex(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const score = Number(items[0]?.score);
  if (Number.isFinite(score)) document.querySelectorAll("[data-index-score]").forEach((el) => { el.textContent = score.toFixed(1); });
  if (data?.updated_at) document.querySelectorAll("[data-index-updated]").forEach((el) => { el.innerHTML = `Updated ${escapeHtml(formatDate(data.updated_at))}<br>Next update in 28 days`; });
  if (data?.methodology_version) document.querySelectorAll("[data-methodology]").forEach((el) => { el.textContent = data.methodology_version; });

  const momentum = document.querySelector("[data-momentum-list]");
  if (momentum) {
    momentum.innerHTML = items.slice(0, 6).map((item, index) => {
      const change = Number(item.momentum_30d || 0);
      const negative = change < 0;
      const base = Number(item.score || 50);
      const points = Array.from({ length: 10 }, (_, i) => base - 12 + i * (change / 2 + 1.4) + Math.sin((i + index) * 1.7) * 2.5);
      return `<div class="momentum-row${negative ? " negative-row" : ""}><strong>${escapeHtml(item.name)}</strong><span class="${negative ? "negative" : "positive"}">${change >= 0 ? "+" : ""}${change.toFixed(1)}%</span>${sparkline(points, negative)}</div>`;
    }).join("");
  }

  const movers = document.querySelector("[data-top-movers]");
  if (movers) {
    movers.innerHTML = items.slice(0, 5).map((item) => {
      const change = Number(item.momentum_30d || 0);
      return `<div class="mover-row"><span>${item.rank}</span><strong>${escapeHtml(item.name)}</strong><span class="premium-number">${Number(item.score).toFixed(1)}</span><span class="${change < 0 ? "negative" : "positive"}">${change < 0 ? "▼" : "▲"}</span></div>`;
    }).join("");
  }

  const ranking = document.querySelector("[data-ranking-list]");
  if (ranking) {
    ranking.innerHTML = items.slice(0, 8).map((item) => {
      const change = Number(item.momentum_30d || 0);
      return `<div class="ranking-line"><span>${item.rank}</span><strong>${escapeHtml(item.name)}</strong><span class="premium-number">${Number(item.score).toFixed(1)}</span><span class="${change < 0 ? "negative" : "positive"}">${change >= 0 ? "+" : ""}${change.toFixed(1)}%</span><span>${Number(item.confidence || 0).toFixed(0)}%</span></div>`;
    }).join("");
  }
}

function renderQuality(data) {
  const metrics = data?.metrics && typeof data.metrics === "object" ? data.metrics : {};
  const confidence = Number(metrics.average_confidence);
  const confidenceText = Number.isFinite(confidence) ? `${Math.round(confidence)}%` : "94%";
  const status = typeof data?.status === "string" ? data.status.replaceAll("_", " ") : "Operational";
  const statusLabel = status.replace(/\b\w/g, (char) => char.toUpperCase());
  document.querySelectorAll("[data-confidence-number]").forEach((el) => { el.textContent = confidenceText; });
  document.querySelectorAll("[data-status]").forEach((el) => { el.textContent = statusLabel; });
  document.querySelectorAll("[data-last-verified]").forEach((el) => { el.textContent = formatDate(data?.evaluated_at || data?.latest_success_at); });
}

function renderMonthly(data) {
  const summary = String(data?.executive_summary || "").trim();
  if (!summary) return;
  const parts = summary.split(/(?<=[.!?])\s+/).filter(Boolean);
  const observation = parts[0] || summary;
  const interpretation = parts[1] || "Momentum and liquidity remain supported by cross-category demand.";
  const implication = parts[2] || "The strongest opportunities combine durable brands with transparent market depth.";
  const map = {
    "[data-monthly-observation]": observation,
    "[data-monthly-interpretation]": interpretation,
    "[data-monthly-implication]": implication
  };
  Object.entries(map).forEach(([selector, value]) => document.querySelectorAll(selector).forEach((el) => { el.textContent = value; }));
  if (data?.issue) document.querySelectorAll("[data-edition]").forEach((el) => { el.textContent = data.issue; });
}

function renderArchive(data) {
  const grid = document.querySelector("[data-archive-grid]");
  if (!grid) return;
  const reports = Array.isArray(data?.reports) ? data.reports : [];
  if (!reports.length) {
    grid.innerHTML = '<p class="loading">Research archive is awaiting publication.</p>';
    return;
  }
  grid.innerHTML = reports.slice(0, 3).map((report) => {
    const path = String(report.path || "#");
    const href = path.startsWith("/") ? path : `/${path}`;
    return `<article class="research-card"><div><p class="section-label">${escapeHtml(report.period)} · ${escapeHtml(report.status)}</p><h3>${escapeHtml(report.title)}</h3><p>${escapeHtml((report.tags || []).join(" · "))}</p></div><a href="${escapeHtml(href)}">Read research →</a></article>`;
  }).join("");
}

function stretchPremiumDigits(root = document) {
  root.querySelectorAll(".premium-number").forEach((element) => {
    if (element.dataset.premiumProcessed === "true") return;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach((node) => {
      const value = node.nodeValue || "";
      if (!/[346789]/.test(value)) return;
      const fragment = document.createDocumentFragment();
      value.split("").forEach((character) => {
        if (/[346789]/.test(character)) {
          const span = document.createElement("span");
          span.className = "tall-digit";
          span.textContent = character;
          fragment.appendChild(span);
        } else {
          fragment.appendChild(document.createTextNode(character));
        }
      });
      node.replaceWith(fragment);
    });
    element.dataset.premiumProcessed = "true";
  });
}

async function initialize() {
  const results = await Promise.allSettled([
    loadJson(DATA.index).then(renderIndex),
    loadJson(DATA.quality).then(renderQuality),
    loadJson(DATA.monthly).then(renderMonthly),
    loadJson(DATA.archive).then(renderArchive)
  ]);
  if (results.some((result) => result.status === "rejected")) document.documentElement.dataset.dataState = "partial";
  stretchPremiumDigits();
}

document.addEventListener("DOMContentLoaded", initialize);
