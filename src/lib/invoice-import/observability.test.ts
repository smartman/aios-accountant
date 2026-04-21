import { describe, expect, it, vi } from "vitest";
import {
  logInvoiceImportEvent,
  measureInvoiceImportPhase,
} from "./observability";

describe("invoice import observability", () => {
  it("logs structured success events", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    await expect(
      measureInvoiceImportPhase({
        workflow: "preview",
        provider: "smartaccounts",
        phase: "loadContext",
        metadata: { accountCount: 3 },
        run: async () => "ok",
      }),
    ).resolves.toBe("ok");

    expect(infoSpy).toHaveBeenCalledOnce();
    expect(JSON.parse(infoSpy.mock.calls[0][0] as string)).toMatchObject({
      category: "invoice-import",
      workflow: "preview",
      provider: "smartaccounts",
      phase: "loadContext",
      status: "success",
      metadata: {
        accountCount: 3,
      },
    });
  });

  it("logs structured error events", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      measureInvoiceImportPhase({
        workflow: "confirm",
        provider: "merit",
        phase: "createPurchaseInvoice",
        run: async () => {
          throw new Error("Provider offline");
        },
      }),
    ).rejects.toThrow("Provider offline");

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(JSON.parse(errorSpy.mock.calls[0][0] as string)).toMatchObject({
      category: "invoice-import",
      workflow: "confirm",
      provider: "merit",
      phase: "createPurchaseInvoice",
      status: "error",
      errorMessage: "Provider offline",
    });
  });

  it("omits undefined metadata fields", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    logInvoiceImportEvent({
      workflow: "preview",
      provider: "smartaccounts",
      phase: "extractInvoice.summary",
      status: "success",
      metadata: {
        usedFallbackInvoiceNumber: true,
        warningCount: 1,
        skipped: undefined,
      },
    });

    expect(JSON.parse(infoSpy.mock.calls.at(-1)?.[0] as string)).toMatchObject({
      metadata: {
        usedFallbackInvoiceNumber: true,
        warningCount: 1,
      },
    });
  });
});
