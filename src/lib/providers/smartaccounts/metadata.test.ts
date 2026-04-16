import { afterEach, describe, expect, it, vi } from "vitest";
import { formatAccountLabel, getAccounts, getVatPcs } from "./index";

describe("SmartAccounts metadata normalization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps Estonian and English account descriptions for labeling", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        accounts: [
          {
            code: "4004",
            descriptionEt: "Väheväärtuslik põhivara",
            descriptionEn: "Low-Value Fixed Assets",
            type: "EXPENSE",
          },
        ],
      }),
    } as Response);

    const [account] = await getAccounts({
      apiKey: "vitest-account-api",
      secretKey: "vitest-account-secret",
    });

    expect(account.descriptionEt).toBe("Väheväärtuslik põhivara");
    expect(account.descriptionEn).toBe("Low-Value Fixed Assets");
    expect(formatAccountLabel(account)).toContain("Väheväärtuslik põhivara");
    expect(formatAccountLabel(account)).toContain("Low-Value Fixed Assets");
  });

  it("uses localized VAT descriptions when the generic description is absent", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        vatPcs: [
          {
            vatPc: "24",
            pc: 24,
            descriptionEt: "24% käibemaks",
            descriptionEn: "24% VAT",
          },
        ],
      }),
    } as Response);

    const [vatCode] = await getVatPcs({
      apiKey: "vitest-vat-api",
      secretKey: "vitest-vat-secret",
    });

    expect(vatCode.percent).toBe(24);
    expect(vatCode.description).toBe("24% VAT");
    expect(vatCode.descriptionEt).toBe("24% käibemaks");
  });
});
