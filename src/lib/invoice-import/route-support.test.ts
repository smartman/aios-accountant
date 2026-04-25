import { describe, expect, it } from "vitest";
import {
  getSafeInvoiceFilename,
  getInvoiceImportResponseStatus,
  getMimeType,
  parseImportCompanyId,
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
    expect(
      getInvoiceImportResponseStatus(
        new Error("Company access was not found."),
      ),
    ).toBe(403);
    expect(getInvoiceImportResponseStatus(new Error("Provider offline"))).toBe(
      500,
    );
  });

  it("parses required company ids", () => {
    expect(parseImportCompanyId(" company-1 ")).toBe("company-1");
    expect(() => parseImportCompanyId(null)).toThrow(
      "Choose a company before importing.",
    );
  });

  it("validates invoice files and sanitizes filenames", () => {
    const pdf = new File(["invoice"], "invoice one?.pdf", {
      type: "application/pdf",
    });
    const unnamedPdf = new File(["invoice"], "placeholder.pdf", {
      type: "application/pdf",
    });
    const cameraPhoto = new File(["invoice"], "receipt photo.JPG", {
      type: "application/octet-stream",
    });
    Object.defineProperty(unnamedPdf, "name", {
      value: "",
      configurable: true,
    });

    expect(getMimeType(pdf)).toBe("application/pdf");
    expect(getMimeType(cameraPhoto)).toBe("image/jpeg");
    expect(validateInvoiceFile(pdf)).toBe(pdf);
    expect(validateInvoiceFile(cameraPhoto)).toBe(cameraPhoto);
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
        invoice: {
          invoiceNumber: "INV-1",
          amountExcludingVat: 1.239,
          vatAmount: 0.441,
          totalAmount: 1.68,
        },
        payment: { paymentAmount: 1.239 },
        actions: {},
        rows: [{ price: 1.239, sum: 1.239 }],
        warnings: [],
        duplicateInvoice: null,
      }),
    );

    expect(draft).toMatchObject({
      provider: "merit",
      invoice: {
        invoiceNumber: "INV-1",
        amountExcludingVat: 1.239,
        vatAmount: 0.441,
      },
      payment: { paymentAmount: 1.239 },
      rows: [{ price: 1.239, sum: 1.239 }],
    });
    expect(() => parseInvoiceImportDraft(null)).toThrow(
      "Missing reviewed import draft.",
    );
    expect(() => parseInvoiceImportDraft("{")).toThrow(
      "Reviewed import draft is invalid.",
    );
  });
});
