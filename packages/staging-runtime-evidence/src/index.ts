export type Vertical = "kidults" | "artfund" | "governance";
export type EvidenceStatus = "pass" | "fail" | "not_run";

export interface ChecksumEvidence {
  algorithm: "sha256";
  before: string;
  after: string;
  matches: boolean;
}

export interface RuntimeProbeEvidence {
  id: string;
  vertical: Vertical;
  category:
    | "migration"
    | "api"
    | "portal_desktop"
    | "portal_mobile"
    | "backup_restore"
    | "failure_isolation";
  status: EvidenceStatus;
  observedAt: string;
  details: Record<string, string | number | boolean | null>;
  checksum?: ChecksumEvidence;
}

export interface RuntimeEvidencePackage {
  releaseCandidateId: string;
  environment: "staging";
  generatedAt: string;
  productionPromotionAuthorized: false;
  publicationEnabled: false;
  probes: RuntimeProbeEvidence[];
}

const requiredCategories: RuntimeProbeEvidence["category"][] = [
  "migration",
  "api",
  "portal_desktop",
  "portal_mobile",
  "backup_restore",
  "failure_isolation",
];

export function validateEvidencePackage(input: RuntimeEvidencePackage): string[] {
  const errors: string[] = [];
  if (input.environment !== "staging") errors.push("environment_must_be_staging");
  if (input.productionPromotionAuthorized) errors.push("production_promotion_must_be_false");
  if (input.publicationEnabled) errors.push("publication_must_be_disabled");

  for (const category of requiredCategories) {
    if (!input.probes.some((probe) => probe.category === category)) {
      errors.push(`missing_probe:${category}`);
    }
  }

  for (const probe of input.probes) {
    if (!probe.id.trim()) errors.push("probe_id_required");
    if (!Number.isFinite(Date.parse(probe.observedAt))) errors.push(`invalid_timestamp:${probe.id}`);
    if (probe.category === "backup_restore") {
      if (!probe.checksum) errors.push(`checksum_required:${probe.id}`);
      else if (!probe.checksum.matches) errors.push(`checksum_mismatch:${probe.id}`);
    }
  }

  return [...new Set(errors)].sort();
}

export function certifyEvidencePackage(input: RuntimeEvidencePackage) {
  const errors = validateEvidencePackage(input);
  const failed = input.probes.filter((probe) => probe.status !== "pass");
  return {
    releaseCandidateId: input.releaseCandidateId,
    status: errors.length === 0 && failed.length === 0 ? "pass" : "fail",
    errors,
    failedProbeIds: failed.map((probe) => probe.id).sort(),
  } as const;
}
