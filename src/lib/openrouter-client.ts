type OpenRouterMessageContent =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "file";
      file: {
        filename: string;
        file_data: string;
      };
    }
  | {
      type: "image_url";
      image_url: {
        url: string;
      };
    };

type OpenRouterJsonSchema = {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
};

const MAX_PARALLEL_OPENROUTER_CALLS = 3;

type QueuedOpenRouterCall = {
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

let activeOpenRouterCalls = 0;
const pendingOpenRouterCalls: QueuedOpenRouterCall[] = [];

function runOpenRouterCall(call: QueuedOpenRouterCall) {
  activeOpenRouterCalls += 1;
  call
    .run()
    .then(call.resolve, call.reject)
    .finally(() => {
      activeOpenRouterCalls -= 1;
      drainOpenRouterCalls();
    });
}

function drainOpenRouterCalls() {
  while (
    activeOpenRouterCalls < MAX_PARALLEL_OPENROUTER_CALLS &&
    pendingOpenRouterCalls.length > 0
  ) {
    const call = pendingOpenRouterCalls.shift();
    if (call) {
      runOpenRouterCall(call);
    }
  }
}

function withOpenRouterConcurrency<T>(run: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    pendingOpenRouterCalls.push({
      run,
      resolve: (value) => resolve(value as T),
      reject,
    });
    drainOpenRouterCalls();
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

export function jsonSchemaForInvoiceExtraction(): OpenRouterJsonSchema {
  return {
    name: "invoice_import_payload",
    strict: true,
    schema: INVOICE_EXTRACTION_SCHEMA,
  };
}

export function jsonSchemaForInvoiceRows(): OpenRouterJsonSchema {
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

export function buildOpenRouterContent(params: {
  mimeType: string;
  filename: string;
  fileDataUrl: string;
  promptText: string;
}): OpenRouterMessageContent[] {
  const content: OpenRouterMessageContent[] = [
    {
      type: "text",
      text: params.promptText,
    },
  ];

  if (params.mimeType.startsWith("image/")) {
    content.push({
      type: "image_url",
      image_url: {
        url: params.fileDataUrl,
      },
    });
    return content;
  }

  content.push({
    type: "file",
    file: {
      filename: params.filename,
      file_data: params.fileDataUrl,
    },
  });

  return content;
}

export async function requestOpenRouterStructuredOutput<T>(params: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userContent: OpenRouterMessageContent[];
  jsonSchema: OpenRouterJsonSchema;
  invalidJsonMessage: string;
}): Promise<T> {
  const response = await withOpenRouterConcurrency(() =>
    fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
        "X-Title":
          process.env.OPENROUTER_APP_TITLE ?? "Accounting Invoice Importer",
      },
      body: JSON.stringify({
        model: params.model,
        messages: [
          {
            role: "system",
            content: params.systemPrompt,
          },
          {
            role: "user",
            content: params.userContent,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: params.jsonSchema,
        },
        temperature: 0.1,
      }),
    }),
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `OpenRouter ${response.status}: ${text || response.statusText}`,
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: unknown;
      };
    }>;
  };
  const rawContent = payload.choices?.[0]?.message?.content;
  const text = extractMessageText(rawContent);

  if (!text) {
    throw new Error("OpenRouter returned an empty response.");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(params.invalidJsonMessage);
  }
}

export function __resetOpenRouterConcurrencyForTests() {
  activeOpenRouterCalls = 0;
  pendingOpenRouterCalls.splice(0, pendingOpenRouterCalls.length);
}
