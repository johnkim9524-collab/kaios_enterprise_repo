import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeJsonDirectory(directory, outputs) {
  fs.mkdirSync(directory, { recursive: true });
  for (const [name, value] of Object.entries(outputs)) {
    fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function fingerprint(value) {
  return `sha256:${crypto.createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

export function hashId(prefix, value) {
  return `${prefix}-${crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 24)}`;
}

export function unique(values) {
  return [...new Set(values.filter(value => value !== null && value !== undefined && value !== ""))].sort();
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function normalizeUrl(input) {
  try {
    const url = new URL(input);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|source$|campaign$|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    const params = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    url.search = "";
    for (const [key, value] of params) url.searchParams.append(key, value);
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export async function fetchJson(url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return { data: await response.json(), response };
      const body = await response.text();
      const error = new Error(`${response.status} ${response.statusText}: ${body.slice(0, 300)}`);
      error.response = response;
      throw error;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const reset = Number(error.response?.headers?.get("x-ratelimit-reset") ?? 0) * 1000;
      const wait = reset > Date.now()
        ? Math.min(reset - Date.now() + 1000, 120000)
        : Math.min(1500 * (2 ** (attempt - 1)), 10000);
      await sleep(wait);
    }
  }
  throw lastError;
}
