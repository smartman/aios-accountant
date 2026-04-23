import { afterEach, expect, it, vi } from "vitest";
import { __test__, matchArticlesWithOpenRouter } from "./article-matching-ai";
import { InvoiceImportDraftRow } from "../invoice-import-types";

type OpenRouterRequestBody = {
  model?: string;
  messages: Array<{
    role: string;
    content: unknown;
  }>;
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

function mockOpenRouterResponse(payload: unknown): ReturnType<typeof vi.spyOn> {
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
    matchArticlesWithOpenRouter({
      provider: "smartaccounts",
      rows: [buildRow()],
      catalog: [{ code: "el", description: "Elekter" }],
      history: [],
    }),
  ).resolves.toBeNull();
});

it("sends rows, catalog, and history summaries to OpenRouter", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubEnv("OPENROUTER_ARTICLE_MATCH_MODEL", "test-article-model");
  vi.stubEnv("OPENROUTER_APP_TITLE", "AI Accountant");

  const fetchMock = mockOpenRouterResponse({
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

  const matches = await matchArticlesWithOpenRouter({
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
  ) as OpenRouterRequestBody;
  const systemPrompt = body.messages.find(
    (message) => message.role === "system",
  )?.content;
  const userPrompt = body.messages.find(
    (message) => message.role === "user",
  )?.content;
  const headers = requestInit?.headers as Record<string, string> | undefined;

  expect(typeof systemPrompt).toBe("string");
  expect(systemPrompt).toContain("best existing accounting article");
  expect(systemPrompt).toContain("Uldelekter oine jaanuar 2025");
  expect(body.model).toBe("test-article-model");
  expect(headers?.["X-Title"]).toBe("AI Accountant");
  expect(String(userPrompt)).toContain(
    '"description":"Elekter oine jaanuar 2025"',
  );
  expect(String(userPrompt)).toContain('"code":"el"');
  expect(String(userPrompt)).toContain('"matches":1');
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

it("returns null when OpenRouter credentials are missing outside tests", async () => {
  vi.stubEnv("NODE_ENV", "development");

  await expect(
    matchArticlesWithOpenRouter({
      provider: "smartaccounts",
      rows: [buildRow()],
      catalog: [{ code: "el", description: "Elekter" }],
      history: [],
    }),
  ).resolves.toBeNull();
});

it("throws when OpenRouter returns an error response", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubEnv("OPENROUTER_ARTICLE_MATCH_MODEL", "test-article-model");

  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("gateway issue", {
      status: 502,
      statusText: "Bad Gateway",
    }),
  );

  await expect(
    matchArticlesWithOpenRouter({
      provider: "smartaccounts",
      rows: [buildRow()],
      catalog: [{ code: "el", description: "Elekter" }],
      history: [],
    }),
  ).rejects.toThrow("OpenRouter 502");
});

it("falls back to the response status text when the error body is empty", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubEnv("OPENROUTER_ARTICLE_MATCH_MODEL", "test-article-model");

  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("", {
      status: 503,
      statusText: "Service Unavailable",
    }),
  );

  await expect(
    matchArticlesWithOpenRouter({
      provider: "smartaccounts",
      rows: [buildRow()],
      catalog: [{ code: "el", description: "Elekter" }],
      history: [],
    }),
  ).rejects.toThrow("OpenRouter 503: Service Unavailable");
});

it("throws when OpenRouter returns empty content", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubEnv("OPENROUTER_ARTICLE_MATCH_MODEL", "test-article-model");

  mockOpenRouterResponse({
    choices: [
      {
        message: {
          content: [{ type: "output_text", value: "missing text field" }],
        },
      },
    ],
  });

  await expect(
    matchArticlesWithOpenRouter({
      provider: "smartaccounts",
      rows: [buildRow()],
      catalog: [{ code: "el", description: "Elekter" }],
      history: [],
    }),
  ).rejects.toThrow("OpenRouter returned an empty response.");
});

it("treats non-text OpenRouter content objects as empty responses", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubEnv("OPENROUTER_ARTICLE_MATCH_MODEL", "test-article-model");

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
    matchArticlesWithOpenRouter({
      provider: "smartaccounts",
      rows: [buildRow()],
      catalog: [{ code: "el", description: "Elekter" }],
      history: [],
    }),
  ).rejects.toThrow("OpenRouter returned an empty response.");
});

it("throws when OpenRouter returns invalid JSON", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubEnv("OPENROUTER_ARTICLE_MATCH_MODEL", "test-article-model");

  mockOpenRouterResponse({
    choices: [
      {
        message: {
          content: "not json",
        },
      },
    ],
  });

  await expect(
    matchArticlesWithOpenRouter({
      provider: "smartaccounts",
      rows: [buildRow()],
      catalog: [{ code: "el", description: "Elekter" }],
      history: [],
    }),
  ).rejects.toThrow(
    "OpenRouter did not return valid JSON for the article matcher.",
  );
});

it("returns an empty match list when the payload omits rows", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.stubEnv("OPENROUTER_ARTICLE_MATCH_MODEL", "test-article-model");

  mockOpenRouterResponse({
    choices: [
      {
        message: {
          content: "{}",
        },
      },
    ],
  });

  await expect(
    matchArticlesWithOpenRouter({
      provider: "smartaccounts",
      rows: [buildRow()],
      catalog: [{ code: "el", description: "Elekter" }],
      history: [],
    }),
  ).resolves.toEqual([]);
});

it("defaults the article matcher model to openai/gpt-5.4-mini", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");

  const fetchMock = mockOpenRouterResponse({
    choices: [
      {
        message: {
          content: '{"rows":[]}',
        },
      },
    ],
  });

  await matchArticlesWithOpenRouter({
    provider: "smartaccounts",
    rows: [buildRow()],
    catalog: [{ code: "el", description: "Elekter" }],
    history: [],
  });

  const [, requestInit] = fetchMock.mock.calls[0] ?? [];
  const body = JSON.parse(
    String(requestInit?.body ?? "{}"),
  ) as OpenRouterRequestBody;

  expect(body.model).toBe("openai/gpt-5.4-mini");
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
