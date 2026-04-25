import type { CompanyConfiguration, CompanyProjectRule } from "./types";

const DEFAULT_FIXED_ASSET_THRESHOLD = 2000;

export function createDefaultCompanyConfiguration(): CompanyConfiguration {
  return {
    fixedAssetThreshold: DEFAULT_FIXED_ASSET_THRESHOLD,
    costPreference: "",
    carVatPolicy: "mixed-use",
    representationRules: "",
    uncertainExpensePolicy:
      "Ask for confirmation when the accounting treatment is uncertain.",
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
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function optionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseNumber(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseBoolean(value: unknown): boolean {
  return value === true || value === "on" || value === "true";
}

function parseCarVatPolicy(
  value: unknown,
): CompanyConfiguration["carVatPolicy"] {
  return value === "business-only" || value === "none" ? value : "mixed-use";
}

function normalizeProjectRule(
  value: unknown,
  index: number,
): CompanyProjectRule {
  const record = asRecord(value);
  return {
    id: optionalString(record.id) || `project-${index + 1}`,
    name: optionalString(record.name),
    code: optionalString(record.code),
    invoiceKeywords: optionalString(record.invoiceKeywords),
    relatedVendors: optionalString(record.relatedVendors),
    driveFolderHints: optionalString(record.driveFolderHints),
    providerDimensionCode: optionalString(record.providerDimensionCode),
  };
}

function normalizeProjectRules(value: unknown): CompanyProjectRule[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeProjectRule)
    .filter(
      (rule) =>
        rule.name ||
        rule.code ||
        rule.invoiceKeywords ||
        rule.relatedVendors ||
        rule.providerDimensionCode,
    );
}

export function normalizeCompanyConfiguration(
  value: unknown,
): CompanyConfiguration {
  const defaults = createDefaultCompanyConfiguration();
  const record = asRecord(value);
  const inventory = asRecord(record.inventory);
  const vendorExceptions = asRecord(record.vendorExceptions);

  return {
    fixedAssetThreshold: parseNumber(
      record.fixedAssetThreshold,
      defaults.fixedAssetThreshold,
    ),
    costPreference: optionalString(record.costPreference),
    carVatPolicy: parseCarVatPolicy(record.carVatPolicy),
    representationRules: optionalString(record.representationRules),
    uncertainExpensePolicy:
      optionalString(record.uncertainExpensePolicy) ||
      defaults.uncertainExpensePolicy,
    inventory: {
      usesMeritInventory: parseBoolean(inventory.usesMeritInventory),
      inventoryKeywords: optionalString(inventory.inventoryKeywords),
      newArticlePolicy: "confirm",
      defaultUnit: optionalString(inventory.defaultUnit) || "tk",
    },
    vendorExceptions: {
      retail: optionalString(vendorExceptions.retail),
      ecommerce: optionalString(vendorExceptions.ecommerce),
    },
    projects: normalizeProjectRules(record.projects),
  };
}

export function parseProjectRulesFromForm(formData: FormData) {
  const rowIndexes = formData
    .getAll("projectRowIndex")
    .map((value) => Number(String(value)))
    .filter((value) => Number.isInteger(value) && value >= 0);
  const indexes = rowIndexes.length ? rowIndexes : [0, 1, 2, 3, 4];

  return indexes.map((index, position) =>
    normalizeProjectRule(
      {
        id: formData.get(`projectId${index}`) ?? `project-${position + 1}`,
        name: formData.get(`projectName${index}`),
        code: formData.get(`projectCode${index}`),
        invoiceKeywords: formData.get(`projectKeywords${index}`),
        relatedVendors: formData.get(`projectVendors${index}`),
        driveFolderHints: formData.get(`projectDriveHints${index}`),
        providerDimensionCode: formData.get(`projectDimensionCode${index}`),
      },
      position,
    ),
  );
}

export function parseCompanyConfigurationForm(
  formData: FormData,
): CompanyConfiguration {
  return normalizeCompanyConfiguration({
    fixedAssetThreshold: formData.get("fixedAssetThreshold"),
    costPreference: formData.get("costPreference"),
    carVatPolicy: formData.get("carVatPolicy"),
    representationRules: formData.get("representationRules"),
    uncertainExpensePolicy: formData.get("uncertainExpensePolicy"),
    inventory: {
      usesMeritInventory: formData.get("usesMeritInventory"),
      inventoryKeywords: formData.get("inventoryKeywords"),
      newArticlePolicy: "confirm",
      defaultUnit: formData.get("defaultUnit"),
    },
    vendorExceptions: {
      retail: formData.get("retailExceptions"),
      ecommerce: formData.get("ecommerceExceptions"),
    },
    projects: parseProjectRulesFromForm(formData),
  });
}
