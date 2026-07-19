import { describe, expect, it } from "vitest";
import { canAutoEnterDashboard, canOfferOfflineAccess } from "./authAccess";

describe("auth access decisions", () => {
  it("automatically enters for an existing online session", () => {
    expect(canAutoEnterDashboard({ hasSession: true, canUseOffline: true, serverReachable: true })).toBe(true);
  });

  it("offers offline access only to a previously registered device", () => {
    expect(canOfferOfflineAccess({ hasSession: true, canUseOffline: true, serverReachable: false })).toBe(true);
    expect(canOfferOfflineAccess({ hasSession: false, canUseOffline: false, serverReachable: false })).toBe(false);
  });
});
