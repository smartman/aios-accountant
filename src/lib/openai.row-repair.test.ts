import { afterEach, describe, expect, it, vi } from "vitest";
import { extractInvoiceWithOpenAI } from "./openai";

type OpenAIRequestBody = {
  input: Array<{
    role: string;
    content: unknown;
  }>;
  text?: {
    format?: {
      name?: string;
    };
  };
  prompt_cache_key?: string;
  reasoning?: {
    effort?: string;
  };
};

function buildMergedExtraction() {
  return {
    vendor: {
      name: "Elektrivork AS",
      regCode: null,
      vatNumber: null,
      bankAccount: null,
      email: null,
      phone: null,
      countryCode: "ee",
      city: null,
      postalCode: null,
      addressLine1: null,
      addressLine2: null,
    },
    invoice: {
      documentType: "invoice",
      invoiceNumber: "ELEK-1",
      referenceNumber: null,
      currency: "eur",
      issueDate: "2026-02-10",
      dueDate: "2026-02-10",
      entryDate: null,
      amountExcludingVat: 62.92,
      vatAmount: 13.84,
      totalAmount: 76.76,
      notes: null,
    },
    payment: {
      isPaid: false,
      paymentDate: null,
      paymentAmount: null,
      paymentChannelHint: null,
      reason: null,
    },
    rows: [
      {
        sourceArticleCode: null,
        description:
          "Elekter oine jaanuar 2025; Elekter paevane jaanuar 2025; Uldelekter oine jaanuar 2025; Vesi jaanuar 2025; Lume lukkamine jaanuar 2025",
        quantity: 1,
        unit: null,
        price: 62.92,
        sum: 62.92,
        vatRate: 22,
        vatPc: "VAT22",
        accountPurchase: "4030",
        accountSelectionReason: "Matched utility expense account.",
        needsManualReview: false,
        manualReviewReason: null,
      },
    ],
    warnings: ["Row summary may contain multiple source lines."],
  };
}

function buildSeparatedRows() {
  return [
    {
      sourceArticleCode: null,
      description: "Elekter oine jaanuar 2025",
      quantity: 37,
      unit: "kWh",
      price: 0.16,
      sum: 6,
      vatRate: 22,
      vatPc: "VAT22",
      accountPurchase: "4030",
      accountSelectionReason: "Matched utility expense account.",
    },
    {
      sourceArticleCode: null,
      description: "Elekter paevane jaanuar 2025",
      quantity: 36,
      unit: "kWh",
      price: 0.18,
      sum: 6.49,
      vatRate: 22,
      vatPc: "VAT22",
      accountPurchase: "4030",
      accountSelectionReason: "Matched utility expense account.",
    },
    {
      sourceArticleCode: null,
      description: "Uldelekter oine jaanuar 2025",
      quantity: 183.1,
      unit: "kWh",
      price: 0.16,
      sum: 30.02,
      vatRate: 22,
      vatPc: "VAT22",
      accountPurchase: "4030",
      accountSelectionReason: "Matched utility expense account.",
    },
    {
      sourceArticleCode: null,
      description: "Vesi jaanuar 2025",
      quantity: 0.6,
      unit: "m3",
      price: 2.08,
      sum: 1.25,
      vatRate: 22,
      vatPc: "VAT22",
      accountPurchase: "4030",
      accountSelectionReason: "Matched utility expense account.",
    },
    {
      sourceArticleCode: null,
      description: "Lume lukkamine jaanuar 2025",
      quantity: 1,
      unit: null,
      price: 19.16,
      sum: 19.16,
      vatRate: 22,
      vatPc: "VAT22",
      accountPurchase: "4030",
      accountSelectionReason: "Matched utility expense account.",
    },
  ];
}

function buildResponse(content: unknown) {
  return {
    output: [
      {
        type: "message",
        content:
          typeof content === "string"
            ? [{ type: "output_text", text: content }]
            : content,
      },
    ],
  };
}

function mockOpenAIResponses(...payloads: unknown[]) {
  const fetchMock = vi.spyOn(globalThis, "fetch");

  for (const payload of payloads) {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );
  }

  return fetchMock;
}

function setupEnv() {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("OPENAI_MODEL", "test-model");
}

function buildImportParams() {
  return {
    provider: "merit",
    filename: "invoice.pdf",
    mimeType: "application/pdf",
    fileDataUrl: "data:application/pdf;base64,ZmFrZQ==",
    accounts: [{ code: "4030", type: "EXPENSE", label: "4030 - Elekter" }],
    taxCodes: [{ code: "VAT22", rate: 22 }],
  } as Parameters<typeof extractInvoiceWithOpenAI>[0];
}

async function expectRepairPassToSeparateRows() {
  setupEnv();

  const fetchMock = mockOpenAIResponses(
    buildResponse(JSON.stringify(buildMergedExtraction())),
    buildResponse(JSON.stringify({ rows: buildSeparatedRows() })),
  );

  const extraction = await extractInvoiceWithOpenAI(buildImportParams());

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(extraction.rows).toHaveLength(5);
  expect(extraction.rows.map((row) => row.description)).toEqual(
    buildSeparatedRows().map((row) => row.description),
  );

  const [, secondRequestInit] = fetchMock.mock.calls[1] ?? [];
  const secondBody = JSON.parse(
    String(secondRequestInit?.body ?? "{}"),
  ) as OpenAIRequestBody;
  const secondUserContent = (secondBody.input.find(
    (message) => message.role === "user",
  )?.content ?? []) as Array<{ text?: string }>;

  expect(secondBody.text?.format?.name).toBe("invoice_import_rows_payload");
  expect(secondBody.reasoning).toEqual({ effort: "low" });
  expect(secondBody.prompt_cache_key).toBe("invoice-row-repair");
  expect(secondUserContent[0]?.text).toContain(
    "previous extraction likely summarized several visible invoice rows",
  );
}

async function expectRepairPassToKeepOriginalWhenRowsMissing() {
  setupEnv();

  mockOpenAIResponses(
    buildResponse(JSON.stringify(buildMergedExtraction())),
    buildResponse(JSON.stringify({})),
  );

  const extraction = await extractInvoiceWithOpenAI(buildImportParams());

  expect(extraction.rows).toEqual(buildMergedExtraction().rows);
}

async function expectNoRepairForNormalSingleRowInvoice() {
  setupEnv();

  const fetchMock = mockOpenAIResponses(
    buildResponse(
      JSON.stringify({
        ...buildMergedExtraction(),
        invoice: {
          ...buildMergedExtraction().invoice,
          amountExcludingVat: 10,
          totalAmount: 12.2,
        },
        rows: [
          {
            ...buildMergedExtraction().rows[0],
            description: "Monthly accounting service",
            price: 10,
            sum: 10,
          },
        ],
      }),
    ),
  );

  const extraction = await extractInvoiceWithOpenAI(buildImportParams());

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(extraction.rows[0]?.description).toBe("Monthly accounting service");
}

async function expectFailedRepairToFallback() {
  setupEnv();

  const fetchMock = vi.spyOn(globalThis, "fetch");
  fetchMock
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify(buildResponse(JSON.stringify(buildMergedExtraction()))),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    )
    .mockResolvedValueOnce(
      new Response("repair failed", {
        status: 502,
        statusText: "Bad Gateway",
      }),
    );

  const extraction = await extractInvoiceWithOpenAI(buildImportParams());

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(extraction.rows).toEqual(buildMergedExtraction().rows);
}

describe("extractInvoiceWithOpenAI row repair", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it(
    "re-runs extraction for rows when the first pass collapses visible lines",
    expectRepairPassToSeparateRows,
  );
  it(
    "keeps the original extraction when the repair pass omits rows",
    expectRepairPassToKeepOriginalWhenRowsMissing,
  );
  it(
    "does not trigger a repair pass for a normal single-row invoice",
    expectNoRepairForNormalSingleRowInvoice,
  );
  it(
    "keeps the first extraction when the repair request fails",
    expectFailedRepairToFallback,
  );
});
