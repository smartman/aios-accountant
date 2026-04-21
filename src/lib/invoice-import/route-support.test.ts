import { describe, expect, it } from "vitest";
import {
  getSafeInvoiceFilename,
  getInvoiceImportResponseStatus,
  getMimeType,
  parseInvoiceImportDraft,
  sanitizeFilename,
  toErrorMessage,
  validateInvoiceFile,
} from "./route-support";

describe("invoice import route support", () => {
  it("normalizes route errors and statuses", () => {
    expect(toErrorMessage(new Error("boom"))).toBe("boom");
    expect(toErrorMessage("boom")).toBe("Unknown error");
    expect(
      getInvoiceImportResponseStatus(new Error("Missing invoice file.")),
    ).toBe(400);
    expect(
      getInvoiceImportResponseStatus(
        new Error("Connect Merit or SmartAccounts before importing."),
      ),
    ).toBe(409);
    expect(getInvoiceImportResponseStatus(new Error("Provider offline"))).toBe(
      500,
    );
  });

  it("validates invoice files and sanitizes filenames", () => {
    const pdf = new File(["invoice"], "invoice one?.pdf", {
      type: "application/pdf",
    });
    const unnamedPdf = new File(["invoice"], "placeholder.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(unnamedPdf, "name", {
      value: "",
      configurable: true,
    });

    expect(getMimeType(pdf)).toBe("application/pdf");
    expect(validateInvoiceFile(pdf)).toBe(pdf);
    expect(sanitizeFilename(pdf.name)).toBe("invoice_one_.pdf");
    expect(getSafeInvoiceFilename(unnamedPdf)).toBe("invoice");

    expect(() => validateInvoiceFile(null)).toThrow("Missing invoice file.");
    expect(() =>
      validateInvoiceFile(
        new File(["invoice"], "invoice.txt", {
          type: "text/plain",
        }),
      ),
    ).toThrow("Only PDF and image invoices are supported right now.");
  });

  it("parses reviewed drafts and rejects invalid payloads", () => {
    const draft = parseInvoiceImportDraft(
      JSON.stringify({
        provider: "merit",
        vendor: { name: "Vendor" },
        invoice: { invoiceNumber: "INV-1" },
        payment: {},
        actions: {},
        rows: [],
        warnings: [],
        duplicateInvoiceId: null,
      }),
    );

    expect(draft).toMatchObject({
      provider: "merit",
      invoice: { invoiceNumber: "INV-1" },
    });
    expect(() => parseInvoiceImportDraft(null)).toThrow(
      "Missing reviewed import draft.",
    );
    expect(() => parseInvoiceImportDraft("{")).toThrow(
      "Reviewed import draft is invalid.",
    );
  });
});
