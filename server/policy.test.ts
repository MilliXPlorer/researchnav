import { describe, expect, it } from "vitest";
import { canProvisionExistingRole } from "./policy.js";

describe("account provisioning policy", () => {
  it("allows administrators to provision only researcher or coordinator records as coordinators", () => {
    expect(
      canProvisionExistingRole("researcher", "blocked", "coordinator", false),
    ).toBe(true);
    expect(
      canProvisionExistingRole("coordinator", "invited", "coordinator", false),
    ).toBe(true);
    expect(
      canProvisionExistingRole("instructor", "blocked", "coordinator", false),
    ).toBe(false);
  });

  it("allows coordinators to provision only researcher or instructor records as instructors", () => {
    expect(
      canProvisionExistingRole("researcher", "blocked", "instructor", false),
    ).toBe(true);
    expect(
      canProvisionExistingRole("instructor", "invited", "instructor", false),
    ).toBe(true);
    expect(
      canProvisionExistingRole("instructor", "active", "instructor", false),
    ).toBe(false);
    expect(
      canProvisionExistingRole("coordinator", "blocked", "instructor", false),
    ).toBe(false);
    expect(
      canProvisionExistingRole("admin", "blocked", "instructor", true),
    ).toBe(false);
  });
});
