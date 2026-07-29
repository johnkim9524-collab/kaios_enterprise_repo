export type GovernanceFailureCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_QUERY"
  | "INVALID_CURSOR"
  | "RIGHTS_RESTRICTED"
  | "METHODOLOGY_NOT_APPROVED"
  | "CONFIDENCE_TOO_LOW"
  | "DATABASE_UNAVAILABLE"
  | "DEGRADED";

export type GovernanceFailure = {
  ok: false;
  error: {
    code: GovernanceFailureCode;
    message: string;
    retryable: boolean;
    requestId: string;
  };
};

export type GovernanceSuccess<T> = {
  ok: true;
  data: T;
  requestId: string;
};

export type GovernanceResponse<T> = GovernanceSuccess<T> | GovernanceFailure;

export function failureStatus(code: GovernanceFailureCode): number {
  switch (code) {
    case "UNAUTHENTICATED": return 401;
    case "FORBIDDEN": return 403;
    case "NOT_FOUND": return 404;
    case "INVALID_QUERY":
    case "INVALID_CURSOR": return 400;
    case "RIGHTS_RESTRICTED":
    case "METHODOLOGY_NOT_APPROVED":
    case "CONFIDENCE_TOO_LOW": return 409;
    case "DATABASE_UNAVAILABLE":
    case "DEGRADED": return 503;
  }
}
