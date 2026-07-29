export type GovernanceRole = "viewer" | "operator" | "admin";
export type GovernanceAction = "read" | "list" | "export";

const PERMISSIONS: Readonly<Record<GovernanceRole, readonly GovernanceAction[]>> = {
  viewer: ["read", "list"],
  operator: ["read", "list", "export"],
  admin: ["read", "list", "export"],
};

export function canAccessGovernance(
  role: GovernanceRole,
  action: GovernanceAction,
): boolean {
  return PERMISSIONS[role].includes(action);
}

export function assertGovernanceAccess(
  role: GovernanceRole | null,
  action: GovernanceAction,
): void {
  if (!role) {
    throw new Error("UNAUTHENTICATED");
  }
  if (!canAccessGovernance(role, action)) {
    throw new Error("FORBIDDEN");
  }
}
