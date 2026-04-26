import { describe, expect, it } from "vitest";
import { buildRowRepairPrompt, buildUserPrompt } from "./openai-prompts";
import type { InvoiceExtraction } from "./invoice-import-types";

const extraction: InvoiceExtraction = {
  vendor: {
    name: "Vendor",
    regCode: null,
    vatNumber: null,
    bankAccount: null,
    email: null,
    phone: null,
    countryCode: "EE",
    city: null,
    postalCode: null,
    addressLine1: null,
    addressLine2: null,
  },
  invoice: {
    documentType: "invoice",
    invoiceNumber: "INV-1",
    referenceNumber: null,
    currency: "EUR",
    issueDate: "2026-04-24",
    dueDate: null,
    entryDate: null,
    amountExcludingVat: 100,
    vatAmount: 22,
    totalAmount: 122,
    roundingAmount: null,
    notes: null,
  },
  payment: {
    isPaid: false,
    paymentDate: null,
    paymentAmount: null,
    paymentChannelHint: null,
    reason: null,
  },
  dimension: {
    code: null,
    name: null,
    reason: null,
  },
  rows: [],
  warnings: [],
};

describe("OpenAI company prompts", () => {
  it("includes company context and provider dimensions in extraction prompts", () => {
    const prompt = buildUserPrompt(
      "merit",
      [{ code: "4000", label: "Services" }],
      [{ code: "VAT22", description: "22%" }],
      [{ code: "OBJ-1", name: "Office build" }],
      "Company accounting profile",
    );

    expect(prompt).toContain("Company accounting profile");
    expect(prompt).toContain("Available dimensions/objects");
    expect(prompt).toContain("OBJ-1");
  });

  it("keeps row repair prompts valid without optional company context", () => {
    const prompt = buildRowRepairPrompt(
      "smartaccounts",
      extraction,
      [{ code: "4000", label: "Services" }],
      [{ code: "VAT22", description: "22%" }],
    );

    expect(prompt).toContain("Available dimensions/objects");
    expect(prompt).not.toContain("Company accounting profile");
  });
});
