import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DashboardWorkspaceMenu from "./DashboardWorkspaceMenu";
import {
  createWorkspaceMenuActions,
  getWorkspaceSectionLabel,
  getWorkspaceStatusLabel,
} from "./workspace-menu";
import { findButton, hostProps } from "./InvoiceImportRowEditorTestUtils";

describe("workspace-menu", () => {
  it("builds import and provider actions for connected workspaces", () => {
    const actions = createWorkspaceMenuActions({
      activeProvider: "merit",
      activeTab: "import",
      hasConnection: true,
    });

    expect(actions).toEqual([
      {
        current: true,
        disabled: false,
        id: "import",
        label: "Import invoices",
      },
      {
        current: false,
        disabled: false,
        id: "provider",
        label: "Accounting provider",
      },
    ]);
  });

  it("keeps import disabled until a provider is configured", () => {
    const actions = createWorkspaceMenuActions({
      activeProvider: null,
      activeTab: "provider",
      hasConnection: false,
    });

    expect(actions).toEqual([
      {
        current: false,
        disabled: true,
        id: "import",
        label: "Import invoices",
      },
      {
        current: true,
        disabled: false,
        id: "provider",
        label: "Set up provider",
      },
    ]);
  });

  it("builds visible section and status labels", () => {
    expect(getWorkspaceSectionLabel("provider")).toBe("Accounting provider");
    expect(getWorkspaceSectionLabel("import")).toBe("Import invoices");
    expect(getWorkspaceStatusLabel(false, null)).toBe(
      "Set up a provider to start importing invoices.",
    );
    expect(getWorkspaceStatusLabel(true, "merit")).toBe("Merit is connected.");
  });

  it("renders both actions in the visible main menu", () => {
    const actions = createWorkspaceMenuActions({
      activeProvider: "merit",
      activeTab: "import",
      hasConnection: true,
    });
    const markup = renderToStaticMarkup(
      <DashboardWorkspaceMenu
        actions={actions}
        onSelectAction={() => undefined}
      />,
    );

    expect(markup).toContain("Workspace sections");
    expect(markup).toContain("Import invoices");
    expect(markup).toContain("Accounting provider");
    expect(markup).not.toContain("Main menu");
  });

  it("fires enabled actions and ignores disabled ones", () => {
    const actionIds: string[] = [];
    const enabledTree = (
      <DashboardWorkspaceMenu
        actions={createWorkspaceMenuActions({
          activeProvider: "merit",
          activeTab: "import",
          hasConnection: true,
        })}
        onSelectAction={(actionId) => actionIds.push(actionId)}
      />
    );

    hostProps(findButton(enabledTree, "Accounting provider")!).onClick?.();
    expect(actionIds).toEqual(["provider"]);

    const disabledTree = (
      <DashboardWorkspaceMenu
        actions={createWorkspaceMenuActions({
          activeProvider: null,
          activeTab: "provider",
          hasConnection: false,
        })}
        onSelectAction={(actionId) => actionIds.push(actionId)}
      />
    );

    expect(
      hostProps(findButton(disabledTree, "Import invoices")!).disabled,
    ).toBe(true);
    hostProps(findButton(disabledTree, "Import invoices")!).onClick?.();
    expect(actionIds).toEqual(["provider"]);
  });
});
