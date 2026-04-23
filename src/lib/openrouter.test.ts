import { afterEach, describe, expect, it, vi } from "vitest";
import { extractInvoiceWithOpenRouter } from "./openrouter";

type OpenRouterRequestBody = {
  messages: Array<{
    role: string;
    content: unknown;
  }>;
  plugins?: unknown[];
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
    choices: [
      {
        message: {
          content,
        },
      },
    ],
  };
}

function mockOpenRouterResponse(
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
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubEnv("OPENROUTER_MODEL", "test-model");
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
  } as Parameters<typeof extractInvoiceWithOpenRouter>[0];
}

async function expectVendorPromptAndRawPdfUpload() {
  setupEnv();

  const fetchMock = mockOpenRouterResponse(buildResponse());

  const extraction = await extractInvoiceWithOpenRouter(
    buildImportParams({
      accounts: [{ code: "4000", type: "EXPENSE", label: "4000 - Services" }],
    }),
  );

  const [, requestInit] = fetchMock.mock.calls[0] ?? [];
  const body = JSON.parse(
    String(requestInit?.body ?? "{}"),
  ) as OpenRouterRequestBody;
  const systemPrompt = body.messages.find(
    (message) => message.role === "system",
  )?.content;
  const userContent = body.messages.find((message) => message.role === "user")
    ?.content as Array<{ type: string }>;

  expect(typeof systemPrompt).toBe("string");
  expect(systemPrompt).toContain("Arve saaja");
  expect(systemPrompt).toContain("Makse saaja");
  expect(systemPrompt).toContain(
    "same visual group, column, or side of the page",
  );
  expect(systemPrompt).toContain("flattened reading order");
  expect(systemPrompt).toContain("branding as the vendor by default");
  expect(systemPrompt).toContain(
    "Do not add a warning when the vendor is confidently resolved",
  );
  expect(userContent.some((item) => item.type === "file")).toBe(true);
  expect(userContent.some((item) => item.type === "image_url")).toBe(false);
  expect(body.plugins).toBeUndefined();
  expect(extraction.vendor.name).toBe("Kilo Code");
  expect(extraction.vendor.countryCode).toBe("EE");
  expect(extraction.invoice.currency).toBe("EUR");
}

async function expectImageUploadNormalization() {
  setupEnv();

  const fetchMock = mockOpenRouterResponse(
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

  const extraction = await extractInvoiceWithOpenRouter(
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
  ) as OpenRouterRequestBody;
  const userContent = body.messages.find((message) => message.role === "user")
    ?.content as Array<{ type: string }>;

  expect(userContent.some((item) => item.type === "image_url")).toBe(true);
  expect(userContent.some((item) => item.type === "file")).toBe(false);
  expect(extraction.vendor.name).toBeNull();
  expect(extraction.invoice.currency).toBe("EUR");
  expect(extraction.invoice.entryDate).toBe("2026-02-03");
  expect(extraction.payment.isPaid).toBe(false);
  expect(extraction.warnings).toEqual([]);
}

async function expectExactAmountExtractionAndWarningFiltering() {
  setupEnv();

  mockOpenRouterResponse(
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

  const extraction = await extractInvoiceWithOpenRouter(buildImportParams());

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

  mockOpenRouterResponse(
    buildResponse(
      JSON.stringify({
        ...buildBaseExtraction(),
        rows: null,
        warnings: null,
      }),
    ),
  );

  const extraction = await extractInvoiceWithOpenRouter(buildImportParams());

  expect(extraction.rows).toEqual([]);
  expect(extraction.warnings).toEqual([]);
}

async function expectMissingEnvFailure() {
  await expect(
    extractInvoiceWithOpenRouter(buildImportParams()),
  ).rejects.toThrow("Missing required environment variable");
}

async function expectApiFailureMessage() {
  setupEnv();

  mockOpenRouterResponse(
    { error: "gateway issue" },
    { status: 502, statusText: "Bad Gateway" },
  );

  await expect(
    extractInvoiceWithOpenRouter(buildImportParams()),
  ).rejects.toThrow("OpenRouter 502");
}

async function expectStatusTextFallback() {
  setupEnv();

  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("", {
      status: 503,
      statusText: "Service Unavailable",
    }),
  );

  await expect(
    extractInvoiceWithOpenRouter(buildImportParams()),
  ).rejects.toThrow("OpenRouter 503: Service Unavailable");
}

async function expectEmptyContentFailure() {
  setupEnv();

  mockOpenRouterResponse(
    buildResponse([{ type: "output_text", value: "missing text field" }]),
  );

  await expect(
    extractInvoiceWithOpenRouter(buildImportParams()),
  ).rejects.toThrow("OpenRouter returned an empty response.");
}

async function expectNonTextObjectFailure() {
  setupEnv();

  mockOpenRouterResponse({
    choices: [
      {
        message: {
          content: { text: "not handled outside arrays" },
        },
      },
    ],
  });

  await expect(
    extractInvoiceWithOpenRouter(buildImportParams()),
  ).rejects.toThrow("OpenRouter returned an empty response.");
}

async function expectInvalidJsonFailure() {
  setupEnv();

  mockOpenRouterResponse(buildResponse("not json"));

  await expect(
    extractInvoiceWithOpenRouter(buildImportParams()),
  ).rejects.toThrow(
    "OpenRouter did not return valid JSON for the invoice extraction.",
  );
}

describe("extractInvoiceWithOpenRouter", () => {
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
    "throws when required environment variables are missing",
    expectMissingEnvFailure,
  );
  it(
    "throws the OpenRouter status text when the API call fails",
    expectApiFailureMessage,
  );
  it(
    "falls back to the response status text when the error body is empty",
    expectStatusTextFallback,
  );
  it("throws when OpenRouter returns empty content", expectEmptyContentFailure);
  it(
    "throws when OpenRouter returns a non-text content object",
    expectNonTextObjectFailure,
  );
  it("throws when OpenRouter returns invalid JSON", expectInvalidJsonFailure);
});
