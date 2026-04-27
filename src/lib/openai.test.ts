import { afterEach, describe, expect, it, vi } from "vitest";
import { extractInvoiceWithOpenAI } from "./openai";

type OpenAIRequestBody = {
  model?: string;
  instructions?: unknown;
  input: Array<{
    role: string;
    content: unknown;
  }>;
  text?: {
    format?: unknown;
  };
  prompt_cache_key?: string;
  prompt_cache_retention?: string;
  reasoning?: {
    effort?: string;
  };
  store?: boolean;
};

function buildBaseExtraction() {
  return {
    vendor: {
      name: "Kilo Code",
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
      invoiceNumber: "5WJDXKJF-0001",
      referenceNumber: null,
      currency: "eur",
      issueDate: "2026-01-04",
      dueDate: "2026-01-04",
      entryDate: null,
      amountExcludingVat: 8.63,
      vatAmount: 0,
      totalAmount: 8.63,
      notes: null,
    },
    payment: {
      isPaid: true,
      paymentDate: "2026-01-04",
      paymentAmount: 8.63,
      paymentChannelHint: "BANK",
      reason: "Invoice shows Tasutud.",
    },
    rows: [
      {
        description: "KILO-TOP-UP - Kilo Balance Top Up",
        quantity: 1,
        unit: null,
        price: 8.63,
        sum: 8.63,
        vatRate: 0,
        vatPc: null,
        accountPurchase: "4000",
        accountSelectionReason: "Matched the only purchase expense account.",
      },
    ],
    warnings: [],
  };
}

function buildResponse(
  content: unknown = JSON.stringify(buildBaseExtraction()),
) {
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

function mockOpenAIResponse(
  payload: unknown,
  init?: ResponseInit,
): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
      ...init,
    }),
  );
}

function setupEnv() {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("OPENAI_MODEL", "test-model");
}

function buildImportParams(overrides?: {
  provider?: "smartaccounts" | "merit";
  filename?: string;
  mimeType?: string;
  fileDataUrl?: string;
  accounts?: Array<{ code: string; type?: string; label: string }>;
  taxCodes?: Array<{ code: string; rate?: number }>;
}) {
  return {
    provider: overrides?.provider ?? "smartaccounts",
    filename: overrides?.filename ?? "invoice.pdf",
    mimeType: overrides?.mimeType ?? "application/pdf",
    fileDataUrl:
      overrides?.fileDataUrl ?? "data:application/pdf;base64,ZmFrZQ==",
    accounts: overrides?.accounts ?? [],
    taxCodes: overrides?.taxCodes ?? [],
  } as Parameters<typeof extractInvoiceWithOpenAI>[0];
}

async function expectVendorPromptAndRawPdfUpload() {
  setupEnv();

  const fetchMock = mockOpenAIResponse(buildResponse());

  const extraction = await extractInvoiceWithOpenAI(
    buildImportParams({
      accounts: [{ code: "4000", type: "EXPENSE", label: "4000 - Services" }],
    }),
  );

  const [, requestInit] = fetchMock.mock.calls[0] ?? [];
  const body = JSON.parse(
    String(requestInit?.body ?? "{}"),
  ) as OpenAIRequestBody;
  const systemPrompt = body.instructions;
  const userContent = body.input.find((message) => message.role === "user")
    ?.content as Array<{ type: string }>;

  expect(fetchMock.mock.calls[0]?.[0]).toBe(
    "https://api.openai.com/v1/responses",
  );
  expect(body.model).toBe("test-model");
  expect(body.reasoning).toEqual({ effort: "low" });
  expect(body.prompt_cache_key).toBe("invoice-extraction");
  expect(body.prompt_cache_retention).toBe("24h");
  expect(body.store).toBe(false);
  expect(typeof systemPrompt).toBe("string");
  expect(systemPrompt).toContain("Arve saaja");
  expect(systemPrompt).toContain("Makse saaja");
  expect(systemPrompt).toContain(
    "same visual group, column, or side of the page",
  );
  expect(systemPrompt).toContain("flattened reading order");
  expect(systemPrompt).toContain("photographed receipts or invoices");
  expect(systemPrompt).toContain("branding as the vendor by default");
  expect(systemPrompt).toContain(
    "Do not add a warning when the vendor is confidently resolved",
  );
  expect(userContent.some((item) => item.type === "input_file")).toBe(true);
  expect(JSON.stringify(userContent)).toContain("cash-register slips");
  expect(JSON.stringify(userContent)).toContain("needsManualReview");
  expect(JSON.stringify(body.text?.format)).toContain("manualReviewReason");
  expect(userContent.some((item) => item.type === "input_image")).toBe(false);
  expect(extraction.vendor.name).toBe("Kilo Code");
  expect(extraction.vendor.countryCode).toBe("EE");
  expect(extraction.invoice.currency).toBe("EUR");
}

async function expectImageUploadNormalization() {
  setupEnv();

  const fetchMock = mockOpenAIResponse(
    buildResponse([
      { text: 7 },
      "",
      {
        text: JSON.stringify({
          ...buildBaseExtraction(),
          vendor: {
            name: null,
            regCode: null,
            vatNumber: null,
            bankAccount: null,
            email: null,
            phone: null,
            countryCode: null,
            city: null,
            postalCode: null,
            addressLine1: null,
            addressLine2: null,
          },
          invoice: {
            ...buildBaseExtraction().invoice,
            currency: null,
            issueDate: "2026-02-03",
            entryDate: null,
            notes: null,
          },
          payment: {
            isPaid: false,
            paymentDate: null,
            paymentAmount: null,
            paymentChannelHint: null,
            reason: null,
          },
          rows: [],
          warnings: ["", "Recipient details ignored for vendor extraction"],
        }),
      },
      { type: "output_text", value: "ignored trailing item" },
    ]),
  );

  const extraction = await extractInvoiceWithOpenAI(
    buildImportParams({
      provider: "merit",
      filename: "invoice.png",
      mimeType: "image/png",
      fileDataUrl: "data:image/png;base64,ZmFrZQ==",
      accounts: [{ code: "5000", label: "5000 - Expenses" }],
      taxCodes: [{ code: "VAT0", rate: 0 }],
    }),
  );

  const [, requestInit] = fetchMock.mock.calls[0] ?? [];
  const body = JSON.parse(
    String(requestInit?.body ?? "{}"),
  ) as OpenAIRequestBody;
  const userContent = body.input.find((message) => message.role === "user")
    ?.content as Array<{ type: string }>;

  expect(userContent.some((item) => item.type === "input_image")).toBe(true);
  expect(userContent.some((item) => item.type === "input_file")).toBe(false);
  expect(extraction.vendor.name).toBeNull();
  expect(extraction.invoice.currency).toBe("EUR");
  expect(extraction.invoice.entryDate).toBe("2026-02-03");
  expect(extraction.payment.isPaid).toBe(false);
  expect(extraction.warnings).toEqual([]);
}

async function expectExactAmountExtractionAndWarningFiltering() {
  setupEnv();

  mockOpenAIResponse(
    buildResponse(
      JSON.stringify({
        ...buildBaseExtraction(),
        invoice: {
          ...buildBaseExtraction().invoice,
          amountExcludingVat: 181.294,
          vatAmount: 39.884,
          totalAmount: 221.178,
          roundingAmount: 0.01,
          notes: "Ümardus: 0,01",
        },
        payment: {
          ...buildBaseExtraction().payment,
          paymentAmount: 221.178,
        },
        rows: [
          {
            ...buildBaseExtraction().rows[0],
            price: 36.2097,
            sum: 181.294,
          },
        ],
        warnings: [
          "Buyer block at top left is labeled 'Maksja', vendor was taken from the separately grouped supplier block.",
          "Line totals were rounded from the source document.",
        ],
      }),
    ),
  );

  const extraction = await extractInvoiceWithOpenAI(buildImportParams());

  expect(extraction.invoice.amountExcludingVat).toBe(181.294);
  expect(extraction.invoice.vatAmount).toBe(39.884);
  expect(extraction.invoice.totalAmount).toBe(221.178);
  expect(extraction.invoice.roundingAmount).toBe(0.01);
  expect(extraction.invoice.notes).toBeNull();
  expect(extraction.payment.paymentAmount).toBe(221.178);
  expect(extraction.rows[0]).toMatchObject({
    price: 36.2097,
    sum: 181.294,
  });
  expect(extraction.warnings).toEqual([
    "Line totals were rounded from the source document.",
  ]);
}

async function expectArrayFallbackNormalization() {
  setupEnv();

  mockOpenAIResponse(
    buildResponse(
      JSON.stringify({
        ...buildBaseExtraction(),
        rows: null,
        warnings: null,
      }),
    ),
  );

  const extraction = await extractInvoiceWithOpenAI(buildImportParams());

  expect(extraction.rows).toEqual([]);
  expect(extraction.warnings).toEqual([]);
}

async function expectInvoiceNullFallbackNormalization() {
  setupEnv();

  mockOpenAIResponse(
    buildResponse(
      JSON.stringify({
        ...buildBaseExtraction(),
        invoice: {
          documentType: null,
          invoiceNumber: null,
          referenceNumber: null,
          currency: " n/a ",
          issueDate: null,
          dueDate: null,
          entryDate: null,
          amountExcludingVat: null,
          vatAmount: null,
          totalAmount: null,
          notes: null,
        },
      }),
    ),
  );

  const extraction = await extractInvoiceWithOpenAI(buildImportParams());

  expect(extraction.invoice).toMatchObject({
    documentType: null,
    invoiceNumber: null,
    referenceNumber: null,
    currency: "EUR",
    issueDate: null,
    dueDate: null,
    entryDate: null,
    amountExcludingVat: null,
    vatAmount: null,
    totalAmount: null,
    notes: null,
  });
}

async function expectMissingEnvFailure() {
  await expect(extractInvoiceWithOpenAI(buildImportParams())).rejects.toThrow(
    "Missing required environment variable",
  );
}

async function expectApiFailureMessage() {
  setupEnv();

  mockOpenAIResponse(
    { error: "gateway issue" },
    { status: 502, statusText: "Bad Gateway" },
  );

  await expect(extractInvoiceWithOpenAI(buildImportParams())).rejects.toThrow(
    "OpenAI 502",
  );
}

async function expectStatusTextFallback() {
  setupEnv();

  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("", {
      status: 503,
      statusText: "Service Unavailable",
    }),
  );

  await expect(extractInvoiceWithOpenAI(buildImportParams())).rejects.toThrow(
    "OpenAI 503: Service Unavailable",
  );
}

async function expectEmptyContentFailure() {
  setupEnv();

  mockOpenAIResponse(
    buildResponse([{ type: "output_text", value: "missing text field" }]),
  );

  await expect(extractInvoiceWithOpenAI(buildImportParams())).rejects.toThrow(
    "OpenAI returned an empty response.",
  );
}

async function expectNonTextObjectFailure() {
  setupEnv();

  mockOpenAIResponse({
    output: [
      {
        type: "message",
        content: { text: "not handled outside arrays" },
      },
    ],
  });

  await expect(extractInvoiceWithOpenAI(buildImportParams())).rejects.toThrow(
    "OpenAI returned an empty response.",
  );
}

async function expectInvalidJsonFailure() {
  setupEnv();

  mockOpenAIResponse(buildResponse("not json"));

  await expect(extractInvoiceWithOpenAI(buildImportParams())).rejects.toThrow(
    "OpenAI did not return valid JSON for the invoice extraction.",
  );
}

describe("extractInvoiceWithOpenAI", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it(
    "sends role and layout guidance while uploading PDFs as raw files",
    expectVendorPromptAndRawPdfUpload,
  );
  it(
    "supports image uploads and normalizes null-heavy array responses",
    expectImageUploadNormalization,
  );
  it(
    "preserves exact extracted amounts and removes non-actionable vendor warnings",
    expectExactAmountExtractionAndWarningFiltering,
  );
  it(
    "normalizes missing row and warning arrays to empty lists",
    expectArrayFallbackNormalization,
  );
  it(
    "normalizes null invoice fields and defaults currency to euro",
    expectInvoiceNullFallbackNormalization,
  );
  it(
    "throws when required environment variables are missing",
    expectMissingEnvFailure,
  );
  it(
    "throws the OpenAI status text when the API call fails",
    expectApiFailureMessage,
  );
  it(
    "falls back to the response status text when the error body is empty",
    expectStatusTextFallback,
  );
  it("throws when OpenAI returns empty content", expectEmptyContentFailure);
  it(
    "throws when OpenAI returns a non-text content object",
    expectNonTextObjectFailure,
  );
  it("throws when OpenAI returns invalid JSON", expectInvalidJsonFailure);
});
