import { logger, type LogMetadata } from "@/lib/logger";

export type OpenAIUsage = {
  input_tokens?: unknown;
  output_tokens?: unknown;
  total_tokens?: unknown;
  input_tokens_details?: {
    cached_tokens?: unknown;
  };
  output_tokens_details?: {
    reasoning_tokens?: unknown;
  };
  prompt_tokens_details?: {
    cached_tokens?: unknown;
  };
};

type UsageTokenCounts = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningOutputTokens?: number;
};

type CostRates = {
  input: number;
  cachedInput: number;
  output: number;
};

const OPENAI_TEXT_MODEL_PRICING_USD_PER_1M: Record<string, CostRates> = {
  "gpt-5.5": {
    input: 5,
    cachedInput: 0.5,
    output: 30,
  },
  "gpt-5.5-pro": {
    input: 30,
    cachedInput: 30,
    output: 180,
  },
  "gpt-5.4": {
    input: 2.5,
    cachedInput: 0.25,
    output: 15,
  },
  "gpt-5.4-mini": {
    input: 0.75,
    cachedInput: 0.075,
    output: 4.5,
  },
  "gpt-5.4-nano": {
    input: 0.2,
    cachedInput: 0.02,
    output: 1.25,
  },
};

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function getModelPricing(model: string): CostRates | undefined {
  return OPENAI_TEXT_MODEL_PRICING_USD_PER_1M[model];
}

function estimateOpenAICostUsd(params: {
  model: string;
  tokens: UsageTokenCounts;
}): number | undefined {
  const rates = getModelPricing(params.model);
  if (!rates) {
    return undefined;
  }

  const uncachedInputTokens = Math.max(
    params.tokens.inputTokens - params.tokens.cachedInputTokens,
    0,
  );
  const estimatedCost =
    (uncachedInputTokens / 1_000_000) * rates.input +
    (params.tokens.cachedInputTokens / 1_000_000) * rates.cachedInput +
    (params.tokens.outputTokens / 1_000_000) * rates.output;

  return Number(estimatedCost.toFixed(8));
}

function extractUsageTokenCounts(
  usage: OpenAIUsage | undefined,
): UsageTokenCounts {
  const inputTokens = toFiniteNumber(usage?.input_tokens) ?? 0;
  const outputTokens = toFiniteNumber(usage?.output_tokens) ?? 0;
  const cachedInputTokens =
    toFiniteNumber(usage?.input_tokens_details?.cached_tokens) ??
    toFiniteNumber(usage?.prompt_tokens_details?.cached_tokens) ??
    0;

  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens:
      toFiniteNumber(usage?.total_tokens) ?? inputTokens + outputTokens,
    reasoningOutputTokens: toFiniteNumber(
      usage?.output_tokens_details?.reasoning_tokens,
    ),
  };
}

function cacheHitPercent(tokens: UsageTokenCounts): number {
  if (tokens.inputTokens <= 0) {
    return 0;
  }

  return Number(
    ((tokens.cachedInputTokens / tokens.inputTokens) * 100).toFixed(2),
  );
}

function buildOpenAIUsageMetadata(params: {
  durationMs: number;
  model: string;
  promptCacheKey: string;
  reasoningEffort?: string;
  schemaName: string;
  responseId?: string;
  usage?: OpenAIUsage;
}): LogMetadata {
  const tokens = extractUsageTokenCounts(params.usage);

  return {
    model: params.model,
    responseId: params.responseId,
    promptCacheKey: params.promptCacheKey,
    reasoningEffort: params.reasoningEffort,
    schemaName: params.schemaName,
    inputTokens: tokens.inputTokens,
    cachedInputTokens: tokens.cachedInputTokens,
    uncachedInputTokens: Math.max(
      tokens.inputTokens - tokens.cachedInputTokens,
      0,
    ),
    outputTokens: tokens.outputTokens,
    totalTokens: tokens.totalTokens,
    reasoningOutputTokens: tokens.reasoningOutputTokens,
    cacheHitPercent: cacheHitPercent(tokens),
    estimatedCostUsd: estimateOpenAICostUsd({
      model: params.model,
      tokens,
    }),
    durationMs: params.durationMs,
  };
}

export function logOpenAIUsage(params: {
  durationMs: number;
  model: string;
  promptCacheKey: string;
  reasoningEffort?: string;
  schemaName: string;
  payload: {
    id?: unknown;
    usage?: OpenAIUsage;
  };
}): void {
  logger.info({
    category: "openai",
    event: "openai.responses.usage",
    status: "success",
    durationMs: params.durationMs,
    metadata: buildOpenAIUsageMetadata({
      durationMs: params.durationMs,
      model: params.model,
      promptCacheKey: params.promptCacheKey,
      reasoningEffort: params.reasoningEffort,
      schemaName: params.schemaName,
      responseId:
        typeof params.payload.id === "string" ? params.payload.id : undefined,
      usage: params.payload.usage,
    }),
  });
}
