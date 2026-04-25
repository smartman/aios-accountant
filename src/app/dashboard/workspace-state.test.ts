import { describe, expect, it } from "vitest";
import { createInitialDashboardWorkspaceState } from "./workspace-state";

describe("workspace-state", () => {
  it("starts on settings when no verified connection exists", () => {
    expect(createInitialDashboardWorkspaceState(false)).toEqual({
      activeTab: "settings",
    });
  });

  it("starts on import when a verified connection exists", () => {
    expect(createInitialDashboardWorkspaceState(true)).toEqual({
      activeTab: "import",
    });
  });
});
