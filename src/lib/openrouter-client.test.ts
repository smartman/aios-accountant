import { afterEach, expect, it, vi } from "vitest";
import {
  __resetOpenRouterConcurrencyForTests,
  requestOpenRouterStructuredOutput,
} from "./openrouter-client";

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
    choices: [
      {
        message: {
          content: JSON.stringify({ index }),
        },
      },
    ],
  };
}

function buildStructuredOutputRequest(index: number) {
  return requestOpenRouterStructuredOutput<{ index: number }>({
    apiKey: "test-key",
    model: "test-model",
    systemPrompt: "Extract the invoice.",
    userContent: [{ type: "text", text: `Invoice ${index}` }],
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
  __resetOpenRouterConcurrencyForTests();
});

it("limits OpenRouter structured-output requests to three at a time", async () => {
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
