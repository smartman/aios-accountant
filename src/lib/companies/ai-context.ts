import type { CompanySummary } from "./types";

function nonEmptyLines(lines: Array<string | null | undefined>): string[] {
  return lines.filter((line): line is string => Boolean(line?.trim()));
}

function projectRuleLines(company: CompanySummary): string[] {
  return company.configuration.projects.map((project) =>
    [
      `- ${project.code || project.name || "Unnamed project"}`,
      project.name ? `name: ${project.name}` : null,
      project.invoiceKeywords
        ? `invoice keywords: ${project.invoiceKeywords}`
        : null,
      project.relatedVendors
        ? `related vendors: ${project.relatedVendors}`
        : null,
      project.driveFolderHints
        ? `drive/email hints: ${project.driveFolderHints}`
        : null,
      project.providerDimensionCode
        ? `provider dimension/object code: ${project.providerDimensionCode}`
        : null,
    ]
      .filter(Boolean)
      .join("; "),
  );
}

export function buildCompanyAiContext(company: CompanySummary): string {
  const config = company.configuration;
  const inventory = config.inventory;
  const vendorExceptions = config.vendorExceptions;
  const lines = nonEmptyLines([
    "Company accounting profile:",
    `Country: Estonia (${company.countryCode}). Apply Estonian accounting and VAT conventions.`,
    `Fixed asset threshold: ${config.fixedAssetThreshold} EUR.`,
    `Car VAT policy: ${config.carVatPolicy}.`,
    config.costPreference ? `Cost preference: ${config.costPreference}.` : null,
    config.representationRules
      ? `Representation/benefit rules: ${config.representationRules}.`
      : null,
    config.uncertainExpensePolicy
      ? `Uncertain expense policy: ${config.uncertainExpensePolicy}.`
      : null,
    inventory.usesMeritInventory
      ? `Inventory is used; inventory keywords: ${inventory.inventoryKeywords || "not specified"}.`
      : "Inventory is not enabled unless the invoice clearly requires stock handling.",
    `Do not create new accounting articles automatically. Default unit: ${inventory.defaultUnit}.`,
    vendorExceptions.retail
      ? `Retail vendor exceptions: ${vendorExceptions.retail}.`
      : null,
    vendorExceptions.ecommerce
      ? `E-commerce vendor exceptions: ${vendorExceptions.ecommerce}.`
      : null,
  ]);
  const projects = projectRuleLines(company);

  if (projects.length) {
    lines.push("Project/dimension rules:", ...projects);
  }

  return lines.join("\n");
}
