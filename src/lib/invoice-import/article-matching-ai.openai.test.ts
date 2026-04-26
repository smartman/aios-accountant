import { afterEach, expect, it, vi } from "vitest";
import { __test__, matchArticlesWithOpenAI } from "./article-matching-ai";
import { InvoiceImportDraftRow } from "../invoice-import-types";

type OpenAIRequestBody = {
  model?: string;
  instructions?: unknown;
  input: Array<{
    role: string;
    content: unknown;
  }>;
  prompt_cache_key?: string;
  prompt_cache_retention?: string;
  reasoning?: unknown;
  store?: boolean;
};

function buildRow(
  overrides?: Partial<InvoiceImportDraftRow>,
): InvoiceImportDraftRow {
  return {
    id: "row-1",
    sourceArticleCode: null,
    description: "Elekter oine jaanuar 2025",
    quantity: 1,
    unit: null,
    price: 120,
    sum: 120,
    vatRate: 22,
    taxCode: "VAT22",
    accountCode: "4000",
    accountSelectionReason: "Matched utilities account.",
    reviewed: false,
    selectedArticleCode: null,
    selectedArticleDescription: null,
    articleCandidates: [],
    suggestionStatus: "ambiguous",
    ...overrides,
  };
}

function mockOpenAIResponse(payload: unknown): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("returns null in the test environment so preview tests stay offline", async () => {
  vi.stubEnv("NODE_ENV", "test");

  await expect(
    matchArticlesWithOpenAI({
      provider: "smartaccounts",
      rows: [buildRow()],
      catalog: [{ code: "el", description: "Elekter" }],
      history: [],
    }),
  ).resolves.toBeNull();
});

it("sends rows, catalog, and history summaries to OpenAI", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("OPENAI_ARTICLE_MATCH_MODEL", "test-article-model");

  const fetchMock = mockOpenAIResponse({
    choices: [
      {
        message: {
          content: [
            { text: 7 },
            "",
            {
              text: JSON.stringify({
                rows: [
                  {
                    rowId: "row-1",
                    status: "clear",
                    selectedArticleCode: "el",
                    alternativeArticleCodes: [],
                    reason: "The row clearly describes electricity.",
                  },
                ],
              }),
            },
          ],
        },
      },
    ],
  });

  const matches = await matchArticlesWithOpenAI({
    provider: "smartaccounts",
    rows: [buildRow()],
    catalog: [
      {
        code: "el",
        description: "Elekter",
        purchaseAccountCode: "4000",
        taxCode: "VAT22",
      },
    ],
    history: [
      {
        invoiceId: "hist-1",
        vendorId: "vendor-1",
        vendorName: "Utility OU",
        issueDate: "2026-04-01",
        description: "Elekter paev jaanuar 2025",
        articleCode: "el",
        articleDescription: "Elekter",
        purchaseAccountCode: "4000",
        taxCode: "VAT22",
      },
    ],
  });

  const [, requestInit] = fetchMock.mock.calls[0] ?? [];
  const body = JSON.parse(
    String(requestInit?.body ?? "{}"),
  ) as OpenAIRequestBody;
  const systemPrompt = body.instructions;
  const userContent = body.input.find((message) => message.role === "user")
    ?.content as Array<{ text?: string }>;
  const userPrompt = userContent[0]?.text ?? "";

  expect(fetchMock.mock.calls[0]?.[0]).toBe(
    "https://api.openai.com/v1/responses",
  );
  expect(typeof systemPrompt).toBe("string");
  expect(systemPrompt).toContain("best existing accounting article");
  expect(systemPrompt).toContain("Uldelekter oine jaanuar 2025");
  expect(body.model).toBe("test-article-model");
  expect(body.reasoning).toBeUndefined();
  expect(body.prompt_cache_key).toBe("invoice-article-matching");
  expect(body.prompt_cache_retention).toBe("24h");
  expect(body.store).toBe(false);
  expect(userPrompt).toContain('"description":"Elekter oine jaanuar 2025"');
  expect(userPrompt).toContain('"code":"el"');
  expect(userPrompt).toContain('"matches":1');
  expect(matches).toEqual([
    {
      rowId: "row-1",
      status: "clear",
      selectedArticleCode: "el",
      alternativeArticleCodes: [],
      reason: "The row clearly describes electricity.",
    },
  ]);
});

it("returns null when OpenAI credentials are missing outside tests", async () => {
  vi.stubEnv("NODE_ENV", "development");

  await expect(
    matchArticlesWithOpenAI({
      provider: "smartaccounts",
      rows: [buildRow()],
      catalog: [{ code: "el", description: "Elekter" }],
      history: [],
    }),
  ).resolves.toBeNull();
});

it("throws when OpenAI returns an error response", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("OPENAI_ARTICLE_MATCH_MODEL", "test-article-model");

  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("gateway issue", {
      status: 502,
      statusText: "Bad Gateway",
    }),
  );

  await expect(
    matchArticlesWithOpenAI({
      provider: "smartaccounts",
      rows: [buildRow()],
      catalog: [{ code: "el", description: "Elekter" }],
      history: [],
    }),
  ).rejects.toThrow("OpenAI 502");
});

it("falls back to the response status text when the error body is empty", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("OPENAI_ARTICLE_MATCH_MODEL", "test-article-model");

  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("", {
      status: 503,
      statusText: "Service Unavailable",
    }),
  );

  await expect(
    matchArticlesWithOpenAI({
      provider: "smartaccounts",
      rows: [buildRow()],
      catalog: [{ code: "el", description: "Elekter" }],
      history: [],
    }),
  ).rejects.toThrow("OpenAI 503: Service Unavailable");
});

it("throws when OpenAI returns empty content", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("OPENAI_ARTICLE_MATCH_MODEL", "test-article-model");

  mockOpenAIResponse({
    choices: [
      {
        message: {
          content: [{ type: "output_text", value: "missing text field" }],
        },
      },
    ],
  });

  await expect(
    matchArticlesWithOpenAI({
      provider: "smartaccounts",
      rows: [buildRow()],
      catalog: [{ code: "el", description: "Elekter" }],
      history: [],
    }),
  ).rejects.toThrow("OpenAI returned an empty response.");
});

it("treats non-text OpenAI content objects as empty responses", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("OPENAI_ARTICLE_MATCH_MODEL", "test-article-model");

  mockOpenAIResponse({
    choices: [
      {
        message: {
          content: { text: "not handled outside arrays" },
        },
      },
    ],
  });

  await expect(
    matchArticlesWithOpenAI({
      provider: "smartaccounts",
      rows: [buildRow()],
      catalog: [{ code: "el", description: "Elekter" }],
      history: [],
    }),
  ).rejects.toThrow("OpenAI returned an empty response.");
});

it("throws when OpenAI returns invalid JSON", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("OPENAI_ARTICLE_MATCH_MODEL", "test-article-model");

  mockOpenAIResponse({
    choices: [
      {
        message: {
          content: "not json",
        },
      },
    ],
  });

  await expect(
    matchArticlesWithOpenAI({
      provider: "smartaccounts",
      rows: [buildRow()],
      catalog: [{ code: "el", description: "Elekter" }],
      history: [],
    }),
  ).rejects.toThrow(
    "OpenAI did not return valid JSON for the article matcher.",
  );
});

it("returns an empty match list when the payload omits rows", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("OPENAI_ARTICLE_MATCH_MODEL", "test-article-model");

  mockOpenAIResponse({
    choices: [
      {
        message: {
          content: "{}",
        },
      },
    ],
  });

  await expect(
    matchArticlesWithOpenAI({
      provider: "smartaccounts",
      rows: [buildRow()],
      catalog: [{ code: "el", description: "Elekter" }],
      history: [],
    }),
  ).resolves.toEqual([]);
});

it("defaults the article matcher model to gpt-5.5", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("OPENAI_API_KEY", "test-key");

  const fetchMock = mockOpenAIResponse({
    choices: [
      {
        message: {
          content: '{"rows":[]}',
        },
      },
    ],
  });

  await matchArticlesWithOpenAI({
    provider: "smartaccounts",
    rows: [buildRow()],
    catalog: [{ code: "el", description: "Elekter" }],
    history: [],
  });

  const [, requestInit] = fetchMock.mock.calls[0] ?? [];
  const body = JSON.parse(
    String(requestInit?.body ?? "{}"),
  ) as OpenAIRequestBody;

  expect(body.model).toBe("gpt-5.5");
});

it("summarizes vendor history by article code", () => {
  const prompt = __test__.buildUserPrompt({
    provider: "smartaccounts",
    rows: [buildRow()],
    catalog: [{ code: "el", description: "Elekter" }],
    history: [
      {
        invoiceId: "hist-1",
        vendorId: "vendor-1",
        vendorName: "Utility OU",
        issueDate: "2026-04-01",
        description: "Elekter jaanuar 2025",
        articleCode: "el",
        articleDescription: "Elekter",
      },
      {
        invoiceId: "hist-2",
        vendorId: "vendor-1",
        vendorName: "Utility OU",
        issueDate: "2026-04-10",
        description: "Elekter veebruar 2025",
        articleCode: "el",
        articleDescription: "Elekter",
      },
    ],
  });

  expect(prompt).toContain('"matches":2');
  expect(prompt).toContain('"recentInvoiceDate":"2026-04-10"');
});

it("includes company context and provider labels in the user prompt", () => {
  const prompt = __test__.buildUserPrompt({
    provider: "merit",
    rows: [buildRow()],
    catalog: [
      { code: "el", description: "Elekter" },
      { code: "old", description: "Inactive", activePurchase: false },
    ],
    history: [],
    companyContext: "  Prefer configured project rules.  ",
  });

  expect(prompt).toContain("purchase invoice rows into Merit");
  expect(prompt).toContain("Prefer configured project rules.");
  expect(prompt).toContain('"code":"el"');
  expect(prompt).not.toContain('"code":"old"');
});

it("summarizes sparse vendor history without duplicate samples", () => {
  const summary = __test__.summarizeVendorHistory([
    {
      invoiceId: "hist-1",
      vendorId: "vendor-1",
      vendorName: "Utility OU",
      description: "",
      articleCode: "net",
    },
    {
      invoiceId: "hist-2",
      vendorId: "vendor-1",
      vendorName: "Utility OU",
      issueDate: "2026-01-10",
      description: "Internet jaanuar 2026",
      articleCode: "net",
      articleDescription: "Internet",
      purchaseAccountCode: "4000",
      taxCode: "VAT22",
    },
    {
      invoiceId: "hist-3",
      vendorId: "vendor-1",
      vendorName: "Utility OU",
      issueDate: "2026-01-01",
      description: "Internet jaanuar 2026",
      articleCode: "net",
      articleDescription: "Internet",
    },
  ]);

  expect(summary[0]).toMatchObject({
    articleCode: "net",
    articleDescription: null,
    matches: 3,
    recentInvoiceDate: "2026-01-10",
    sampleDescriptions: ["Internet jaanuar 2026"],
  });
});

it("sorts history summary by match count and then by recency", () => {
  const summary = __test__.summarizeVendorHistory([
    {
      invoiceId: "hist-1",
      vendorId: "vendor-1",
      vendorName: "Utility OU",
      issueDate: "2026-04-01",
      description: "Internet jaanuar 2025",
      articleCode: "net",
      articleDescription: "Internet",
    },
    {
      invoiceId: "hist-2",
      vendorId: "vendor-1",
      vendorName: "Utility OU",
      issueDate: "2026-04-11",
      description: "Telefon jaanuar 2025",
      articleCode: "tel",
      articleDescription: "Telefon",
    },
    {
      invoiceId: "hist-3",
      vendorId: "vendor-1",
      vendorName: "Utility OU",
      issueDate: "2026-04-12",
      description: "Internet veebruar 2025",
      articleCode: "net",
      articleDescription: "Internet",
    },
    {
      invoiceId: "hist-4",
      vendorId: "vendor-1",
      vendorName: "Utility OU",
      issueDate: "2026-04-15",
      description: "Elekter jaanuar 2025",
      articleCode: "el",
      articleDescription: "Elekter",
    },
  ]);

  expect(summary[0]).toMatchObject({
    articleCode: "net",
    matches: 2,
    recentInvoiceDate: "2026-04-12",
  });
  expect(summary[1]?.articleCode).toBe("el");
  expect(summary[2]?.articleCode).toBe("tel");
});
