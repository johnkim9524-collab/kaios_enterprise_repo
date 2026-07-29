import { describe, expect, it } from "vitest";
import { InMemoryGovernanceRepository } from "./repository.js";
import { assertGovernanceAccess, canAccessGovernance } from "./rbac.js";
import { failureStatus } from "./failure-state.js";

describe("governance read-only contracts", () => {
  it("filters and paginates records deterministically", async () => {
    const repo = new InMemoryGovernanceRepository([
      { id:"s1", kind:"source", vertical:"kidults", status:"active", version:"1", updatedAt:"2026-07-29T00:00:00Z", payload:{} },
      { id:"s2", kind:"source", vertical:"artfund", status:"active", version:"1", updatedAt:"2026-07-29T00:00:00Z", payload:{} },
    ]);
    const page = await repo.list({ kind:"source", vertical:"kidults", limit:1 });
    expect(page.items.map((item) => item.id)).toEqual(["s1"]);
    expect(page.nextCursor).toBeNull();
  });

  it("enforces read-only role permissions", () => {
    expect(canAccessGovernance("viewer", "read")).toBe(true);
    expect(canAccessGovernance("viewer", "export")).toBe(false);
    expect(() => assertGovernanceAccess(null, "read")).toThrow("UNAUTHENTICATED");
    expect(() => assertGovernanceAccess("viewer", "export")).toThrow("FORBIDDEN");
  });

  it("maps stable failure codes to HTTP status", () => {
    expect(failureStatus("UNAUTHENTICATED")).toBe(401);
    expect(failureStatus("FORBIDDEN")).toBe(403);
    expect(failureStatus("RIGHTS_RESTRICTED")).toBe(409);
    expect(failureStatus("DATABASE_UNAVAILABLE")).toBe(503);
  });
});
