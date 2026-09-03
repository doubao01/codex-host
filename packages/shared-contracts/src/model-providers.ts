import { z } from "zod";

export const MODEL_PROVIDER_ID_MAX_LENGTH = 64;
export const MODEL_PROVIDER_NAME_MAX_LENGTH = 128;
export const MODEL_PROVIDER_BASE_URL_MAX_LENGTH = 512;
export const MODEL_PROVIDER_API_KEY_MAX_LENGTH = 512;
export const MODEL_PROVIDER_MODEL_ID_MAX_LENGTH = 256;
export const MODEL_PROVIDER_ERROR_MAX_LENGTH = 512;
export const MODEL_PROVIDER_HEADER_NAME_MAX_LENGTH = 128;
export const MODEL_PROVIDER_HEADER_VALUE_MAX_LENGTH = MODEL_PROVIDER_API_KEY_MAX_LENGTH;
export const MODEL_PROVIDER_PATH_MAX_LENGTH = MODEL_PROVIDER_BASE_URL_MAX_LENGTH;

const nonBlankTextSchema = z.string().refine((value) => value.trim().length > 0, {
  message: "Value must not be empty or whitespace",
});

/** The wire API a provider speaks; determines the request path and auth style. */
export const modelProviderWireFormatSchema = z.enum([
  "openai-chat",
  "openai-responses",
  "anthropic",
]);

export type ModelProviderWireFormat = z.infer<typeof modelProviderWireFormatSchema>;

export const modelProviderWireFormats: readonly ModelProviderWireFormat[] =
  modelProviderWireFormatSchema.options;

/** The default request path filled into `path` when a wire format is selected. */
export function defaultModelProviderPath(wireFormat: ModelProviderWireFormat): string {
  if (wireFormat === "anthropic") return "/v1/messages";
  if (wireFormat === "openai-responses") return "/v1/responses";
  return "/v1/chat/completions";
}

/** True for the Anthropic Messages wire format (`x-api-key` auth). */
export function isAnthropicWireFormat(wireFormat: ModelProviderWireFormat): boolean {
  return wireFormat === "anthropic";
}

/** True for any OpenAI-compatible wire format (Chat Completions / Responses). */
export function isOpenAiWireFormat(wireFormat: ModelProviderWireFormat): boolean {
  return wireFormat === "openai-chat" || wireFormat === "openai-responses";
}

export const modelProviderIdSchema = nonBlankTextSchema
  .max(MODEL_PROVIDER_ID_MAX_LENGTH)
  .regex(/^[a-z0-9][a-z0-9-]*$/u, "Provider ID must be a lowercase slug")
  .brand<"ModelProviderId">();

export type ModelProviderId = z.infer<typeof modelProviderIdSchema>;

export const modelProviderBaseUrlSchema = nonBlankTextSchema
  .max(MODEL_PROVIDER_BASE_URL_MAX_LENGTH)
  .url("Base URL must be an absolute http(s) URL");

/**
 * A custom request header. `value` appears only in save/test requests; host
 * list responses omit it and report `hasValue` instead so the renderer never
 * receives the secret (mirrors the `apiKey` redaction). An empty-string value
 * clears the stored header; an omitted value keeps the stored one.
 */
export const modelProviderHeaderSchema = z
  .object({
    name: nonBlankTextSchema.max(MODEL_PROVIDER_HEADER_NAME_MAX_LENGTH),
    value: z.string().max(MODEL_PROVIDER_HEADER_VALUE_MAX_LENGTH).optional(),
    hasValue: z.boolean().optional(),
  })
  .strict();

export type ModelProviderHeader = z.infer<typeof modelProviderHeaderSchema>;

/**
 * Provider source configuration. `apiKey` and header `value`s appear only in
 * save/test requests; host list responses omit them and report `hasApiKey` /
 * `hasValue` instead so the renderer never receives the secrets.
 * `path` is the exact request path (selected wire formats fill a default, the
 * user may override it).
 */
export const modelProviderConfigSchema = z
  .object({
    id: modelProviderIdSchema,
    name: nonBlankTextSchema.max(MODEL_PROVIDER_NAME_MAX_LENGTH),
    wireFormat: modelProviderWireFormatSchema,
    baseUrl: modelProviderBaseUrlSchema,
    path: z
      .string()
      .startsWith("/", "Path must start with /")
      .max(MODEL_PROVIDER_PATH_MAX_LENGTH)
      .optional(),
    apiKey: z.string().max(MODEL_PROVIDER_API_KEY_MAX_LENGTH).optional(),
    hasApiKey: z.boolean().optional(),
    headers: z.array(modelProviderHeaderSchema).optional(),
  })
  .strict();

export type ModelProviderConfig = z.infer<typeof modelProviderConfigSchema>;

/** A verified model bound to its provider source (the Route). */
export const modelPoolEntrySchema = z
  .object({
    modelId: nonBlankTextSchema.max(MODEL_PROVIDER_MODEL_ID_MAX_LENGTH),
    label: nonBlankTextSchema.max(MODEL_PROVIDER_NAME_MAX_LENGTH).optional(),
    providerId: modelProviderIdSchema,
    wireFormat: modelProviderWireFormatSchema,
    contextWindow: z.number().int().positive().optional(),
  })
  .strict();

export type ModelPoolEntry = z.infer<typeof modelPoolEntrySchema>;

export const modelProviderSaveParamsSchema = modelProviderConfigSchema;

export type ModelProviderSaveParams = z.infer<typeof modelProviderSaveParamsSchema>;

export const modelProviderIdParamsSchema = z
  .object({
    id: modelProviderIdSchema,
  })
  .strict();

export type ModelProviderIdParams = z.infer<typeof modelProviderIdParamsSchema>;

export const modelPoolEntryAddParamsSchema = z
  .object({
    modelId: nonBlankTextSchema.max(MODEL_PROVIDER_MODEL_ID_MAX_LENGTH),
    label: nonBlankTextSchema.max(MODEL_PROVIDER_NAME_MAX_LENGTH).optional(),
    providerId: modelProviderIdSchema,
    contextWindow: z.number().int().positive().optional(),
  })
  .strict();

export type ModelPoolEntryAddParams = z.infer<typeof modelPoolEntryAddParamsSchema>;

export const modelPoolEntryRemoveParamsSchema = z
  .object({
    modelId: nonBlankTextSchema.max(MODEL_PROVIDER_MODEL_ID_MAX_LENGTH),
    providerId: modelProviderIdSchema,
  })
  .strict();

export type ModelPoolEntryRemoveParams = z.infer<typeof modelPoolEntryRemoveParamsSchema>;

export const modelProviderDefaultRouteSchema = z
  .object({
    wireFormat: modelProviderWireFormatSchema,
    providerId: modelProviderIdSchema,
  })
  .strict();

export type ModelProviderDefaultRoute = z.infer<typeof modelProviderDefaultRouteSchema>;

export const modelProviderListResultSchema = z
  .object({
    providers: z.array(modelProviderConfigSchema),
    pool: z.array(modelPoolEntrySchema),
    gatewayEndpoint: z.string().nullable(),
  })
  .strict();

export type ModelProviderListResult = z.infer<typeof modelProviderListResultSchema>;

export const modelProviderFetchModelsResultSchema = z
  .object({
    models: z.array(
      z
        .object({
          id: nonBlankTextSchema.max(MODEL_PROVIDER_MODEL_ID_MAX_LENGTH),
          label: nonBlankTextSchema.max(MODEL_PROVIDER_NAME_MAX_LENGTH).optional(),
        })
        .strict(),
    ),
  })
  .strict();

export type ModelProviderFetchModelsResult = z.infer<typeof modelProviderFetchModelsResultSchema>;

export const modelProviderTestResultSchema = z
  .object({
    ok: z.boolean(),
    latencyMs: z.number().int().nonnegative().optional(),
    error: z.string().max(MODEL_PROVIDER_ERROR_MAX_LENGTH).optional(),
  })
  .strict();

export type ModelProviderTestResult = z.infer<typeof modelProviderTestResultSchema>;

export const modelGatewayStatusResultSchema = z
  .object({
    endpoint: z.string().nullable(),
    tokenIssuedAt: z.number().int().nonnegative().optional(),
    defaultRoutes: z.array(modelProviderDefaultRouteSchema),
  })
  .strict();

export type ModelGatewayStatusResult = z.infer<typeof modelGatewayStatusResultSchema>;
