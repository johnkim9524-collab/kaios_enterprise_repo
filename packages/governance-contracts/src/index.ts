export type Vertical = "shared" | "kidults" | "artfund";
export type DomainVertical = Exclude<Vertical, "shared">;
export type SourceTier = "tier_1" | "tier_2" | "tier_3" | "experimental";
export type SourceStatus = "candidate" | "approved" | "active" | "degraded" | "quarantined" | "retired";
export type RightsStatus = "unknown" | "restricted" | "approved" | "expired" | "disputed";
export type MethodologyStatus = "draft" | "approved" | "active" | "deprecated" | "retired";
export type ConfidenceGrade = "A" | "B" | "C" | "D" | "U";

export interface SourceRegistryRecord { sourceId:string; vertical:Vertical; sourceName:string; sourceType:string; sourceTier:SourceTier; baseUrl?:string; ownerName?:string; jurisdiction?:string; collectionMethod:string; status:SourceStatus; qualityScore:number; lastReviewedAt?:string; createdAt:string; updatedAt:string; }
export interface RightsRegistryRecord { rightsId:string; sourceId:string; collectAllowed:boolean; storeAllowed:boolean; transformAllowed:boolean; displayAllowed:boolean; redistributeAllowed:boolean; sellAllowed:boolean; attributionRequired:boolean; retentionRule?:string; licenseType?:string; legalBasis?:string; status:RightsStatus; effectiveAt?:string; expiresAt?:string; reviewedAt?:string; createdAt:string; updatedAt:string; }
export interface EvidenceLedgerRecord { evidenceId:string; vertical:DomainVertical; sourceId:string; canonicalUri?:string; sourceDocumentId?:string; contentHash:string; observedAt:string; collectedAt:string; evidenceType:string; rightsId?:string; confidenceGrade:ConfidenceGrade; payload:unknown; createdAt:string; }
export interface MethodologyRegistryRecord { methodologyId:string; vertical:Vertical; methodologyName:string; methodologyType:string; version:string; status:MethodologyStatus; effectiveAt?:string; supersedesMethodologyId?:string; inputContract:Record<string,unknown>; calculationContract:Record<string,unknown>; restatementPolicy:string; checksum:string; createdAt:string; updatedAt:string; }
export interface ConfidenceAssessment { assessmentId:string; vertical:DomainVertical; subjectType:string; subjectId:string; grade:ConfidenceGrade; score:number; sourceCoverage:number; evidenceCount:number; rationale:string; methodologyId?:string; assessedAt:string; createdAt:string; }
export interface CommercialEligibility { collect:boolean; store:boolean; transform:boolean; display:boolean; redistribute:boolean; sell:boolean; eligibleForPortal:boolean; eligibleForIndex:boolean; eligibleForReport:boolean; eligibleForApi:boolean; reasons:string[]; }

export * from "./eligibility.js";
export * from "./repository.js";
export * from "./rbac.js";
export * from "./failure-state.js";
