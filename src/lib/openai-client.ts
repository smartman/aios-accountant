import { logger } from "@/lib/logger";
import { logOpenAIUsage, type OpenAIUsage } from "./openai-usage-logger";

type OpenAIMessageContent =
  | {
      type: "input_text";
      text: string;
    }
  | {
      type: "input_file";
      filename: string;
      file_data: string;
    }
  | {
      type: "input_image";
      image_url: string;
      detail: "original";
    };

type OpenAIJsonSchema = {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
};

type OpenAIReasoningEffort = "low" | "medium" | "high" | "xhigh";

const MAX_PARALLEL_OPENAI_CALLS = 3;

type QueuedOpenAICall = {
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

let activeOpenAICalls = 0;
const pendingOpenAICalls: QueuedOpenAICall[] = [];

function runOpenAICall(call: QueuedOpenAICall) {
  activeOpenAICalls += 1;
  call
    .run()
    .then(call.resolve, call.reject)
    .finally(() => {
      activeOpenAICalls -= 1;
      drainOpenAICalls();
    });
}

function drainOpenAICalls() {
  while (
    activeOpenAICalls < MAX_PARALLEL_OPENAI_CALLS &&
    pendingOpenAICalls.length > 0
  ) {
    const call = pendingOpenAICalls.shift();
    if (call) {
      runOpenAICall(call);
    }
  }
}

function withOpenAIConcurrency<T>(run: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    pendingOpenAICalls.push({
      run,
      resolve: (value) => resolve(value as T),
      reject,
    });
    drainOpenAICalls();
  });
}

const VENDOR_PROPERTIES = {
  name: { type: ["string", "null"] },
  regCode: { type: ["string", "null"] },
  vatNumber: { type: ["string", "null"] },
  bankAccount: { type: ["string", "null"] },
  email: { type: ["string", "null"] },
  phone: { type: ["string", "null"] },
  countryCode: { type: ["string", "null"] },
  city: { type: ["string", "null"] },
  postalCode: { type: ["string", "null"] },
  addressLine1: { type: ["string", "null"] },
  addressLine2: { type: ["string", "null"] },
} as const;

const INVOICE_PROPERTIES = {
  documentType: { type: ["string", "null"] },
  invoiceNumber: { type: ["string", "null"] },
  referenceNumber: { type: ["string", "null"] },
  currency: { type: ["string", "null"] },
  issueDate: { type: ["string", "null"] },
  dueDate: { type: ["string", "null"] },
  entryDate: { type: ["string", "null"] },
  amountExcludingVat: { type: ["number", "null"] },
  vatAmount: { type: ["number", "null"] },
  totalAmount: { type: ["number", "null"] },
  roundingAmount: { type: ["number", "null"] },
  notes: { type: ["string", "null"] },
} as const;

const PAYMENT_PROPERTIES = {
  isPaid: { type: "boolean" },
  paymentDate: { type: ["string", "null"] },
  paymentAmount: { type: ["number", "null"] },
  paymentChannelHint: {
    type: ["string", "null"],
    enum: ["BANK", "CASH", null],
  },
  reason: { type: ["string", "null"] },
} as const;

const DIMENSION_PROPERTIES = {
  code: { type: ["string", "null"] },
  name: { type: ["string", "null"] },
  reason: { type: ["string", "null"] },
} as const;

const ROW_PROPERTIES = {
  sourceArticleCode: { type: ["string", "null"] },
  description: { type: "string" },
  quantity: { type: ["number", "null"] },
  unit: { type: ["string", "null"] },
  price: { type: ["number", "null"] },
  sum: { type: ["number", "null"] },
  vatRate: { type: ["number", "null"] },
  vatPc: { type: ["string", "null"] },
  accountPurchase: { type: ["string", "null"] },
  accountSelectionReason: { type: "string" },
  needsManualReview: { type: "boolean" },
  manualReviewReason: { type: ["string", "null"] },
} as const;

const ROW_ONLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["rows"],
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: Object.keys(ROW_PROPERTIES),
        properties: ROW_PROPERTIES,
      },
    },
  },
} as const;

const INVOICE_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["vendor", "invoice", "payment", "dimension", "rows", "warnings"],
  properties: {
    vendor: {
      type: "object",
      additionalProperties: false,
      required: Object.keys(VENDOR_PROPERTIES),
      properties: VENDOR_PROPERTIES,
    },
    invoice: {
      type: "object",
      additionalProperties: false,
      required: Object.keys(INVOICE_PROPERTIES),
      properties: INVOICE_PROPERTIES,
    },
    payment: {
      type: "object",
      additionalProperties: false,
      required: Object.keys(PAYMENT_PROPERTIES),
      properties: PAYMENT_PROPERTIES,
    },
    dimension: {
      type: "object",
      additionalProperties: false,
      required: Object.keys(DIMENSION_PROPERTIES),
      properties: DIMENSION_PROPERTIES,
    },
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: Object.keys(ROW_PROPERTIES),
        properties: ROW_PROPERTIES,
      },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

export function jsonSchemaForInvoiceExtraction(): OpenAIJsonSchema {
  return {
    name: "invoice_import_payload",
    strict: true,
    schema: INVOICE_EXTRACTION_SCHEMA,
  };
}

export function jsonSchemaForInvoiceRows(): OpenAIJsonSchema {
  return {
    name: "invoice_import_rows_payload",
    strict: true,
    schema: ROW_ONLY_SCHEMA,
  };
}

function extractMessageText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && "text" in item) {
          const text = (item as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join("");
  }

  return "";
}

function extractResponseText(payload: {
  output_text?: unknown;
  output?: Array<{
    type?: unknown;
    content?: unknown;
  }>;
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
}): string {
  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }

  const outputText =
    payload.output
      ?.filter((item) => item.type === "message")
      .map((item) => extractMessageText(item.content))
      .join("") ?? "";

  if (outputText) {
    return outputText;
  }

  return extractMessageText(payload.choices?.[0]?.message?.content);
}

export function buildOpenAIContent(params: {
  mimeType: string;
  filename: string;
  fileDataUrl: string;
  promptText: string;
}): OpenAIMessageContent[] {
  const content: OpenAIMessageContent[] = [
    {
      type: "input_text",
      text: params.promptText,
    },
  ];

  if (params.mimeType.startsWith("image/")) {
    content.push({
      type: "input_image",
      image_url: params.fileDataUrl,
      detail: "original",
    });
    return content;
  }

  content.push({
    type: "input_file",
    filename: params.filename,
    file_data: params.fileDataUrl,
  });

  return content;
}

export async function requestOpenAIStructuredOutput<T>(params: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userContent: OpenAIMessageContent[];
  jsonSchema: OpenAIJsonSchema;
  promptCacheKey: string;
  reasoningEffort?: OpenAIReasoningEffort;
  invalidJsonMessage: string;
}): Promise<T> {
  const startedAt = performance.now();
  const response = await withOpenAIConcurrency(() =>
    fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: params.model,
        instructions: params.systemPrompt,
        input: [
          {
            role: "user",
            content: params.userContent,
          },
        ],
        reasoning: params.reasoningEffort
          ? {
              effort: params.reasoningEffort,
            }
          : undefined,
        text: {
          format: {
            type: "json_schema",
            ...params.jsonSchema,
          },
        },
        prompt_cache_key: params.promptCacheKey,
        prompt_cache_retention: "24h",
        store: false,
      }),
    }),
  );

  if (!response.ok) {
    const durationMs = Math.round(performance.now() - startedAt);
    const text = await response.text();
    logger.error({
      category: "openai",
      event: "openai.responses.error",
      status: "error",
      durationMs,
      metadata: {
        model: params.model,
        promptCacheKey: params.promptCacheKey,
        reasoningEffort: params.reasoningEffort,
        schemaName: params.jsonSchema.name,
        httpStatus: response.status,
      },
      error: new Error(text || response.statusText),
    });
    throw new Error(
      `OpenAI ${response.status}: ${text || response.statusText}`,
    );
  }

  const payload = (await response.json()) as {
    output_text?: unknown;
    output?: Array<{
      type?: unknown;
      content?: unknown;
    }>;
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
    id?: unknown;
    usage?: OpenAIUsage;
  };
  logOpenAIUsage({
    durationMs: Math.round(performance.now() - startedAt),
    model: params.model,
    promptCacheKey: params.promptCacheKey,
    reasoningEffort: params.reasoningEffort,
    schemaName: params.jsonSchema.name,
    payload,
  });
  const text = extractResponseText(payload);

  if (!text) {
    throw new Error("OpenAI returned an empty response.");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(params.invalidJsonMessage);
  }
}

export function __resetOpenAIConcurrencyForTests() {
  activeOpenAICalls = 0;
  pendingOpenAICalls.splice(0, pendingOpenAICalls.length);
}
