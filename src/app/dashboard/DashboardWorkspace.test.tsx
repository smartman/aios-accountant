// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompanySummary } from "@/lib/companies/types";
import DashboardWorkspace from "./DashboardWorkspace";

vi.mock("./actions", () => ({
  createInitialCompany: vi.fn(),
  inviteCompanyMember: vi.fn(),
  removeCompanyInvitationFromForm: vi.fn(),
  removeCompanyMemberFromForm: vi.fn(),
  saveCompanyConfiguration: vi.fn(),
  saveCompanyProfile: vi.fn(),
}));

vi.mock("./ConnectionSettings", () => ({
  default: () => <div>Connection settings</div>,
}));

vi.mock("./CompanySettings", () => ({
  default: () => <div>Company settings view</div>,
}));

vi.mock("./CompanySetupWizard", () => ({
  default: ({
    mode,
    onCancel,
  }: {
    mode?: "first" | "additional";
    onCancel?: () => void;
  }) => (
    <div>
      <span>
        {mode === "additional" ? "Additional wizard" : "First wizard"}
      </span>
      {onCancel ? (
        <button type="button" onClick={onCancel}>
          Cancel wizard
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock("./InvoiceUpload", () => ({
  default: ({ canImport }: { canImport: boolean }) => (
    <div>
      {canImport ? "Invoice upload enabled" : "Invoice upload disabled"}
    </div>
  ),
}));

function buildCompany(overrides?: Partial<CompanySummary>): CompanySummary {
  return {
    id: "company-1",
    name: "Acme",
    countryCode: "EE",
    accountingProvider: "smartaccounts",
    configuration: {
      fixedAssetThreshold: 2000,
      costPreference: "",
      carVatPolicy: "mixed-use",
      representationRules: "",
      uncertainExpensePolicy: "Ask when uncertain.",
      inventory: {
        usesMeritInventory: false,
        inventoryKeywords: "",
        newArticlePolicy: "confirm",
        defaultUnit: "tk",
      },
      vendorExceptions: {
        retail: "",
        ecommerce: "",
      },
      projects: [],
    },
    connectionSummary: null,
    members: [
      {
        id: "membership-1",
        workosUserId: "user-1",
        email: "dev@example.com",
      },
    ],
    invitations: [],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("DashboardWorkspace", () => {
  it("requires first company setup when no active company exists", () => {
    render(
      <DashboardWorkspace
        activeCompany={null}
        companies={[]}
        userEmail="dev@example.com"
      />,
    );

    expect(screen.getByText("First wizard")).not.toBeNull();
  });

  it("opens and cancels the additional company setup flow", () => {
    const company = buildCompany();
    render(
      <DashboardWorkspace
        activeCompany={company}
        companies={[company]}
        userEmail="dev@example.com"
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Company" }), {
      target: { value: "__new_company__" },
    });

    expect(screen.getByText("Additional wizard")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cancel wizard" }));

    expect(screen.queryByText("Additional wizard")).toBeNull();
    expect(screen.getByText("Company settings view")).not.toBeNull();
  });

  it("leaves additional setup when a workspace section is selected", () => {
    const company = buildCompany();
    render(
      <DashboardWorkspace
        activeCompany={company}
        companies={[company]}
        userEmail="dev@example.com"
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Company" }), {
      target: { value: "__new_company__" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Company settings" }));

    expect(screen.queryByText("Additional wizard")).toBeNull();
    expect(screen.getByText("Company settings view")).not.toBeNull();
  });

  it("navigates when a different company is selected", () => {
    const company = buildCompany();
    const otherCompany = buildCompany({
      id: "company-2",
      name: "Other",
    });
    const navigateToCompany = vi.fn();

    render(
      <DashboardWorkspace
        activeCompany={company}
        companies={[company, otherCompany]}
        navigateToCompany={navigateToCompany}
        userEmail="dev@example.com"
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Company" }), {
      target: { value: "company-2" },
    });

    expect(navigateToCompany).toHaveBeenCalledWith("company-2");
  });
});

describe("DashboardWorkspace connected companies", () => {
  it("shows import first for connected companies and can switch sections", () => {
    const company = buildCompany({
      connectionSummary: {
        provider: "smartaccounts",
        label: "SmartAccounts",
        detail: "Verified connection",
        verifiedAt: "2026-04-01T00:00:00.000Z",
      },
    });

    render(
      <DashboardWorkspace
        activeCompany={company}
        companies={[company]}
        userEmail="dev@example.com"
      />,
    );

    expect(screen.getByText("Invoice upload enabled")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Company settings" }));
    expect(screen.getByText("Company settings view")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Import invoices" }));
    expect(screen.getByText("Invoice upload enabled")).not.toBeNull();
  });

  it("falls back to settings when a connected company loses its connection", () => {
    const connectedCompany = buildCompany({
      connectionSummary: {
        provider: "smartaccounts",
        label: "SmartAccounts",
        detail: "Verified connection",
        verifiedAt: "2026-04-01T00:00:00.000Z",
      },
    });
    const { rerender } = render(
      <DashboardWorkspace
        activeCompany={connectedCompany}
        companies={[connectedCompany]}
        userEmail="dev@example.com"
      />,
    );

    expect(screen.getByText("Invoice upload enabled")).not.toBeNull();

    const disconnectedCompany = buildCompany();
    rerender(
      <DashboardWorkspace
        activeCompany={disconnectedCompany}
        companies={[disconnectedCompany]}
        userEmail="dev@example.com"
      />,
    );

    expect(screen.getByText("Company settings view")).not.toBeNull();
  });
});
