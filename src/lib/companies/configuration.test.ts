import { describe, expect, it } from "vitest";
import {
  createDefaultCompanyConfiguration,
  normalizeCompanyConfiguration,
  parseCompanyConfigurationForm,
} from "./configuration";

describe("company configuration", () => {
  it("creates Estonia defaults for accounting setup", () => {
    expect(createDefaultCompanyConfiguration()).toMatchObject({
      fixedAssetThreshold: 2000,
      carVatPolicy: "mixed-use",
      inventory: {
        usesMeritInventory: false,
        defaultUnit: "tk",
      },
    });
  });

  it("normalizes partial and invalid persisted configuration", () => {
    expect(
      normalizeCompanyConfiguration({
        fixedAssetThreshold: "-1",
        carVatPolicy: "invalid",
        inventory: {
          usesMeritInventory: "true",
          newArticlePolicy: "auto",
          defaultUnit: "",
        },
        vendorExceptions: {
          retail: "  Selver -> office cost  ",
        },
        projects: [
          {
            name: " Project A ",
            code: " PRJ ",
            invoiceKeywords: " site ",
            relatedVendors: " vendor ",
            driveFolderHints: " folder ",
            providerDimensionCode: " OBJ ",
          },
          {},
        ],
      }),
    ).toMatchObject({
      fixedAssetThreshold: 2000,
      carVatPolicy: "mixed-use",
      inventory: {
        usesMeritInventory: true,
        newArticlePolicy: "confirm",
        defaultUnit: "tk",
      },
      vendorExceptions: {
        retail: "Selver -> office cost",
      },
      projects: [
        {
          name: "Project A",
          code: "PRJ",
          invoiceKeywords: "site",
          relatedVendors: "vendor",
          driveFolderHints: "folder",
          providerDimensionCode: "OBJ",
        },
      ],
    });
  });

  it("drops persisted project rules that are not arrays", () => {
    expect(
      normalizeCompanyConfiguration({
        projects: "Office build",
      }).projects,
    ).toEqual([]);
  });
});

describe("company configuration form parsing", () => {
  it("parses rule forms into the persisted configuration shape", () => {
    const formData = new FormData();
    formData.set("fixedAssetThreshold", "3000");
    formData.set("carVatPolicy", "business-only");
    formData.set("costPreference", "Ask on food purchases");
    formData.set("representationRules", "Flowers are representation");
    formData.set("uncertainExpensePolicy", "Always ask");
    formData.set("usesMeritInventory", "on");
    formData.set("defaultUnit", "kg");
    formData.set("retailExceptions", "Retail rule");
    formData.set("ecommerceExceptions", "E-commerce rule");
    formData.set("projectName0", "Office build");
    formData.set("projectCode0", "PRJ-1");
    formData.set("projectKeywords0", "Lillekula");
    formData.set("projectVendors0", "Vendor OU");
    formData.set("projectDriveHints0", "Drive folder");
    formData.set("projectDimensionCode0", "OBJ-1");

    expect(parseCompanyConfigurationForm(formData)).toMatchObject({
      fixedAssetThreshold: 3000,
      carVatPolicy: "business-only",
      costPreference: "Ask on food purchases",
      inventory: {
        usesMeritInventory: true,
        newArticlePolicy: "confirm",
        defaultUnit: "kg",
      },
      projects: [
        {
          name: "Office build",
          code: "PRJ-1",
          providerDimensionCode: "OBJ-1",
        },
      ],
    });
  });

  it("parses only submitted dynamic project rows", () => {
    const formData = new FormData();
    formData.set("projectRowIndex", "3");
    formData.append("projectRowIndex", "invalid");
    formData.append("projectRowIndex", "8");
    formData.set("projectId3", "stored-project");
    formData.set("projectName3", "Office build");
    formData.set("projectName8", "Warehouse");

    expect(parseCompanyConfigurationForm(formData).projects).toEqual([
      expect.objectContaining({
        id: "stored-project",
        name: "Office build",
      }),
      expect.objectContaining({
        id: "project-2",
        name: "Warehouse",
      }),
    ]);
  });
});
