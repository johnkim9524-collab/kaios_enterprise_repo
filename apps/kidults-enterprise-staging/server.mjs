import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync
} from "node:fs";
import http from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {authorizeProjection,loadProjection,toPortalView} from "./projection-capability-v1.mjs";

const APP_DIR = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_PUBLIC_DIR = resolve(APP_DIR, "public", "portal-r001");
const MAX_BODY_BYTES = 16 * 1024;
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_REQUESTS = 5;
const CONSENT_VERSION = "2026-08";
const RETENTION_DAYS = 365;
const TYPES = new Set(["newsletter", "waitlist", "inquiry"]);
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
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
    "cross-origin-resource-policy": "same-origin",
    "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
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

function encryptPersonalData(secret, value) {
  const key = createHash("sha256").update(`kidults-conversion-vault-v1:${secret}`).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return {version:"AES-256-GCM-v1",iv:iv.toString("base64url"),tag:cipher.getAuthTag().toString("base64url"),ciphertext:ciphertext.toString("base64url")};
}

export function hydrateConversionRecord(record, secret) {
  if (!record?.personal_data) return record;
  if (!secret) throw new Error("CONVERSION_VAULT_SECRET_REQUIRED");
  const sealed=record.personal_data;
  if(sealed.version!=="AES-256-GCM-v1")throw new Error("CONVERSION_VAULT_VERSION_INVALID");
  const key=createHash("sha256").update(`kidults-conversion-vault-v1:${secret}`).digest();
  const decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(sealed.iv,"base64url"));
  decipher.setAuthTag(Buffer.from(sealed.tag,"base64url"));
  const clear=JSON.parse(Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext,"base64url")),decipher.final()]).toString("utf8"));
  return {...record,...clear,personal_data:undefined};
}

function publicClientIp(request) {
  return request.socket.remoteAddress || "unknown";
}

function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === request.headers.host; } catch { return false; }
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
  const secret = options.secret || null;
  const now = options.now || (() => new Date());
  const rateMax = options.rateMax || RATE_MAX_REQUESTS;
  const storage = ensureStorage(dataDir);
  const rateState = new Map();
  const projectionPath = options.projectionPath || null;
  const projectionSecret = options.projectionSecret || null;

  const audit = (event, detail = {}) => {
    appendJsonLine(storage.auditPath, {
      event,
      occurred_at: now().toISOString(),
      environment: "staging",
      ...detail
    });
  };
  const rateStatePath = resolve(dataDir, "conversion-rate-state.json");
  if (existsSync(rateStatePath)) {
    try {
      const stored = JSON.parse(readFileSync(rateStatePath, "utf8"));
      for (const [key, values] of Object.entries(stored)) if (Array.isArray(values)) rateState.set(key, values);
    } catch { audit("rate_state_recovery_failed"); }
  }
  const persistRateState = () => {
    const temporary = `${rateStatePath}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(Object.fromEntries(rateState)), {encoding:"utf8",mode:0o600});
    renameSync(temporary, rateStatePath);
    chmodSync(rateStatePath, 0o600);
  };

  const json = (response, status, body, extraHeaders = {}) => {
    response.writeHead(status, {
      ...secureHeaders("application/json; charset=utf-8"),
      "cache-control": "no-store",
      ...extraHeaders
    });
    response.end(JSON.stringify(body));
  };

  const projectionResponse = (response, surface) => {
    if (!projectionPath || !projectionSecret) {
      return json(response, 503, { ok: false, error: "approved_projection_unavailable", release: "HOLD" });
    }
    try {
      // Reload for every consumer request. Revocation, replacement, rights and
      // freshness changes therefore invalidate the previously issued view.
      const projection = loadProjection(projectionPath);
      const authorized = authorizeProjection({ projection, surface, secret: projectionSecret, now: now() });
      const common = {
        ok: true,
        capability_expires_at: authorized.claims.expires_at,
        revalidate_after_ms: 5000,
        consumption_receipt: authorized.admission.receipt
      };
      if (surface === "PORTAL_RENDER") {
        return json(response, 200, { ...common, portal_view: toPortalView(projection, authorized.admission.receipt) });
      }
      if (surface === "EXPORT") {
        return json(response, 200, { ...common, projection: authorized.admission.projection }, {
          "content-disposition": `attachment; filename="${projection.projection_id}.json"`
        });
      }
      return json(response, 200, { ...common, projection: authorized.admission.projection });
    } catch (error) {
      audit("projection_release_rejected", { surface, reason: error.message });
      return json(response, 409, { ok: false, error: "projection_release_rejected", reason: error.message, release: "HOLD" });
    }
  };

  const acceptConversion = async (request, response) => {
    if (!secret) {
      audit("conversion_rejected", { reason: "conversion_vault_unconfigured" });
      return json(response, 503, {ok:false,error:"conversion_unavailable",message:"Staging conversion vault is not configured."});
    }
    if (!sameOrigin(request)) {
      audit("conversion_rejected", { reason: "cross_origin" });
      return json(response, 403, {ok:false,error:"cross_origin",message:"The request origin is not allowed."});
    }
    const ip = fingerprint(secret, publicClientIp(request));
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
    for (const [key, values] of rateState) {
      const active = values.filter((value) => timestamp - value < RATE_WINDOW_MS);
      if (active.length) rateState.set(key, active);
      else rateState.delete(key);
    }
    persistRateState();

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
      email_fingerprint: emailFingerprint,
      personal_data: encryptPersonalData(secret, {email:result.email,organization:result.organization,interest:result.interest}),
      consent: true,
      consent_version: CONSENT_VERSION,
      created_at: now().toISOString(),
      expires_at: new Date(now().getTime()+RETENTION_DAYS*24*60*60*1000).toISOString(),
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
    if (url.pathname === "/api/v1/projection" && request.method === "GET") {
      return projectionResponse(response, "PORTAL_RENDER");
    }
    if (url.pathname === "/api/v1/projection/data" && request.method === "GET") {
      return projectionResponse(response, "PUBLIC_API_RESPONSE");
    }
    if (url.pathname === "/api/v1/projection/export" && request.method === "GET") {
      return projectionResponse(response, "EXPORT");
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
    secret: readSecret(process.env.KIDULTS_CONVERSION_HASH_SECRET_FILE),
    projectionPath: process.env.KIDULTS_APPROVED_PROJECTION_FILE || null,
    projectionSecret: process.env.KIDULTS_PROJECTION_CAPABILITY_SECRET_FILE ?
      readFileSync(process.env.KIDULTS_PROJECTION_CAPABILITY_SECRET_FILE, "utf8").trim() : null
  });
  server.listen(port, host, () => {
    console.log(`Kidults staging conversion runtime listening on http://${host}:${port}`);
  });
}
