import { createHmac, randomUUID } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync
} from "node:fs";
import http from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_PUBLIC_DIR = resolve(APP_DIR, "public");
const MAX_BODY_BYTES = 16 * 1024;
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_REQUESTS = 5;
const CONSENT_VERSION = "2026-08";
const TYPES = new Set(["newsletter", "waitlist", "inquiry"]);
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};

function required(value, name) {
  if (!value) throw new Error(`Missing required configuration: ${name}`);
  return value;
}

function readSecret(path) {
  return readFileSync(required(path, "KIDULTS_CONVERSION_HASH_SECRET_FILE"), "utf8").trim();
}

function normalizeText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeEmail(value) {
  return normalizeText(value, 254).toLowerCase();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function secureHeaders(contentType) {
  return {
    "cache-control": contentType.startsWith("text/html") ? "no-store" : "public, max-age=300",
    "content-security-policy": "default-src 'self'; base-uri 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
    "content-type": contentType,
    "cross-origin-opener-policy": "same-origin",
    "permissions-policy": "camera=(), geolocation=(), microphone=(), payment=()",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY"
  };
}

function ensureStorage(dataDir) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  chmodSync(dataDir, 0o700);
  return {
    auditPath: resolve(dataDir, "conversion-audit.jsonl"),
    submissionsPath: resolve(dataDir, "conversion-submissions.jsonl")
  };
}

function appendJsonLine(path, value) {
  appendFileSync(path, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(path, 0o600);
}

function existingSubmissions(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

function fingerprint(secret, email) {
  return createHmac("sha256", secret).update(email).digest("hex");
}

function publicClientIp(request) {
  return request.socket.remoteAddress || "unknown";
}

function parseRequestBody(request) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("request_too_large"), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolveBody(text ? JSON.parse(text) : {});
      } catch {
        reject(Object.assign(new Error("invalid_json"), { status: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function validateSubmission(body) {
  const type = normalizeText(body.type, 32);
  const email = normalizeEmail(body.email);
  const organization = normalizeText(body.organization, 160);
  const interest = normalizeText(body.interest, 2000);
  const website = normalizeText(body.website, 200);

  if (!TYPES.has(type)) return { error: "invalid_type" };
  if (!validEmail(email)) return { error: "invalid_email" };
  if (body.consent !== true || body.consent_version !== CONSENT_VERSION) {
    return { error: "consent_required" };
  }
  if (type === "waitlist" && organization.length < 2) {
    return { error: "organization_required" };
  }
  if (type === "inquiry" && interest.length < 10) {
    return { error: "interest_required" };
  }
  return { email, interest, organization, type, website };
}

export function createKidultsServer(options) {
  const publicDir = resolve(options.publicDir || DEFAULT_PUBLIC_DIR);
  const dataDir = resolve(required(options.dataDir, "dataDir"));
  const secret = required(options.secret, "secret");
  const now = options.now || (() => new Date());
  const rateMax = options.rateMax || RATE_MAX_REQUESTS;
  const storage = ensureStorage(dataDir);
  const rateState = new Map();

  const audit = (event, detail = {}) => {
    appendJsonLine(storage.auditPath, {
      event,
      occurred_at: now().toISOString(),
      environment: "staging",
      ...detail
    });
  };

  const json = (response, status, body, extraHeaders = {}) => {
    response.writeHead(status, {
      ...secureHeaders("application/json; charset=utf-8"),
      "cache-control": "no-store",
      ...extraHeaders
    });
    response.end(JSON.stringify(body));
  };

  const acceptConversion = async (request, response) => {
    const ip = publicClientIp(request);
    const timestamp = now().getTime();
    const recent = (rateState.get(ip) || []).filter((value) => timestamp - value < RATE_WINDOW_MS);
    if (recent.length >= rateMax) {
      audit("conversion_rejected", { reason: "rate_limited" });
      return json(response, 429, {
        ok: false,
        error: "rate_limited",
        message: "Too many requests. Please try again later."
      }, { "retry-after": "900" });
    }
    recent.push(timestamp);
    rateState.set(ip, recent);

    let body;
    try {
      body = await parseRequestBody(request);
    } catch (error) {
      const status = error.status || 400;
      audit("conversion_rejected", { reason: error.message });
      return json(response, status, {
        ok: false,
        error: error.message,
        message: "The request could not be processed."
      });
    }

    const result = validateSubmission(body);
    if (result.error) {
      audit("conversion_rejected", { reason: result.error });
      return json(response, 400, {
        ok: false,
        error: result.error,
        message: "Please review the required fields and consent."
      });
    }

    if (result.website) {
      audit("conversion_filtered", { reason: "honeypot", type: result.type });
      return json(response, 201, {
        ok: true,
        status: "accepted",
        message: "Thank you. Your request has been recorded."
      });
    }

    const emailFingerprint = fingerprint(secret, result.email);
    const duplicate = existingSubmissions(storage.submissionsPath).find((item) => (
      item.type === result.type &&
      item.email_fingerprint === emailFingerprint &&
      timestamp - new Date(item.created_at).getTime() < DEDUPE_WINDOW_MS
    ));

    if (duplicate) {
      audit("conversion_duplicate", {
        submission_id: duplicate.id,
        type: result.type
      });
      return json(response, 200, {
        ok: true,
        status: "duplicate",
        submission_id: duplicate.id,
        message: "Your request is already recorded for review."
      });
    }

    const submission = {
      id: randomUUID(),
      type: result.type,
      email: result.email,
      email_fingerprint: emailFingerprint,
      organization: result.organization,
      interest: result.interest,
      consent: true,
      consent_version: CONSENT_VERSION,
      created_at: now().toISOString(),
      environment: "staging"
    };
    appendJsonLine(storage.submissionsPath, submission);
    audit("conversion_accepted", {
      submission_id: submission.id,
      type: submission.type
    });

    return json(response, 201, {
      ok: true,
      status: "accepted",
      submission_id: submission.id,
      message: "Thank you. Your request has been recorded for staging review."
    });
  };

  const serveStatic = (request, response, pathname) => {
    const requestedPath = pathname === "/" ? "/index.html" : pathname;
    let decoded;
    try {
      decoded = decodeURIComponent(requestedPath);
    } catch {
      return json(response, 400, { ok: false, error: "invalid_path" });
    }
    const filePath = resolve(publicDir, `.${decoded}`);
    if (filePath !== publicDir && !filePath.startsWith(`${publicDir}${sep}`)) {
      return json(response, 403, { ok: false, error: "forbidden" });
    }
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      return json(response, 404, { ok: false, error: "not_found" });
    }
    const contentType = MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream";
    response.writeHead(200, secureHeaders(contentType));
    if (request.method === "HEAD") return response.end();
    response.end(readFileSync(filePath));
  };

  return http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");

    if (url.pathname === "/health" && request.method === "GET") {
      return json(response, 200, {
        ok: true,
        environment: "staging",
        service: "kidults-editorial-conversion",
        persistence: "append-only",
        production_promotion_authorized: false
      });
    }
    if (url.pathname === "/api/conversions" && request.method === "POST") {
      return acceptConversion(request, response);
    }
    if (url.pathname === "/api/conversions" && request.method === "OPTIONS") {
      response.writeHead(204, {
        allow: "POST, OPTIONS",
        ...secureHeaders("text/plain; charset=utf-8")
      });
      return response.end();
    }
    if (request.method === "GET" || request.method === "HEAD") {
      return serveStatic(request, response, url.pathname);
    }
    return json(response, 405, { ok: false, error: "method_not_allowed" }, {
      allow: "GET, HEAD, POST, OPTIONS"
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.env.KAIOS_ENVIRONMENT !== "staging") {
    throw new Error("KAIOS_ENVIRONMENT must be staging");
  }
  if (process.env.KAIOS_PRODUCTION_PROMOTION_AUTHORIZED !== "false") {
    throw new Error("Production promotion must remain false");
  }
  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || "4173");
  const server = createKidultsServer({
    publicDir: process.env.KIDULTS_PUBLIC_DIR || DEFAULT_PUBLIC_DIR,
    dataDir: required(process.env.KIDULTS_CONVERSION_DATA_DIR, "KIDULTS_CONVERSION_DATA_DIR"),
    secret: readSecret(process.env.KIDULTS_CONVERSION_HASH_SECRET_FILE)
  });
  server.listen(port, host, () => {
    console.log(`Kidults staging conversion runtime listening on http://${host}:${port}`);
  });
}
