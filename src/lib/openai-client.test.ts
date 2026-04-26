import { afterEach, expect, it, vi } from "vitest";
import {
  __resetOpenAIConcurrencyForTests,
  requestOpenAIStructuredOutput,
} from "./openai-client";

type DeferredResponse = {
  resolve: (response: Response) => void;
};

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function buildResponse(index: number) {
  return {
    id: `response-${index}`,
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify({ index }) }],
      },
    ],
    usage: {
      input_tokens: 100,
      input_tokens_details: {
        cached_tokens: 25,
      },
      output_tokens: 40,
      output_tokens_details: {
        reasoning_tokens: 10,
      },
      total_tokens: 140,
    },
  };
}

function buildStructuredOutputRequest(index: number, model = "test-model") {
  return requestOpenAIStructuredOutput<{ index: number }>({
    apiKey: "test-key",
    model,
    systemPrompt: "Extract the invoice.",
    userContent: [{ type: "input_text", text: `Invoice ${index}` }],
    jsonSchema: {
      name: "test_payload",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["index"],
        properties: {
          index: { type: "number" },
        },
      },
    },
    promptCacheKey: "test-payload",
    invalidJsonMessage: "Invalid JSON.",
  });
}

async function waitForCondition(assertion: () => void) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      if (attempt === 19) throw error;
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    }
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  __resetOpenAIConcurrencyForTests();
});

it("limits OpenAI structured-output requests to three at a time", async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  const deferredResponses: DeferredResponse[] = [];
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        deferredResponses.push({ resolve });
      }),
  );
  const requests = Array.from({ length: 5 }, (_, index) =>
    buildStructuredOutputRequest(index),
  );

  await waitForCondition(() => {
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  deferredResponses.splice(0, 3).forEach((deferred, index) => {
    deferred.resolve(jsonResponse(buildResponse(index)));
  });
  await waitForCondition(() => {
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  deferredResponses.splice(0, 2).forEach((deferred, index) => {
    deferred.resolve(jsonResponse(buildResponse(index + 3)));
  });

  await expect(Promise.all(requests)).resolves.toHaveLength(5);
});

it("logs Responses API token usage and cache-hit stats", async () => {
  const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    jsonResponse(buildResponse(1)),
  );

  await expect(buildStructuredOutputRequest(1, "gpt-5.5")).resolves.toEqual({
    index: 1,
  });

  expect(infoSpy).toHaveBeenCalledOnce();
  expect(JSON.parse(infoSpy.mock.calls[0][0] as string)).toMatchObject({
    category: "openai",
    event: "openai.responses.usage",
    level: "info",
    status: "success",
    metadata: {
      model: "gpt-5.5",
      responseId: "response-1",
      promptCacheKey: "test-payload",
      schemaName: "test_payload",
      inputTokens: 100,
      cachedInputTokens: 25,
      uncachedInputTokens: 75,
      outputTokens: 40,
      totalTokens: 140,
      reasoningOutputTokens: 10,
      cacheHitPercent: 25,
      estimatedCostUsd: 0.0015875,
    },
  });
});
