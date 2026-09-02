import { z } from "zod";

export const MODEL_PROVIDER_ID_MAX_LENGTH = 64;
export const MODEL_PROVIDER_NAME_MAX_LENGTH = 128;
export const MODEL_PROVIDER_BASE_URL_MAX_LENGTH = 512;
export const MODEL_PROVIDER_API_KEY_MAX_LENGTH = 512;
export const MODEL_PROVIDER_MODEL_ID_MAX_LENGTH = 256;
export const MODEL_PROVIDER_ERROR_MAX_LENGTH = 512;

const nonBlankTextSchema = z.string().refine((value) => value.trim().length > 0, {
  message: "Value must not be empty or whitespace",
});

export const modelProviderProtocolSchema = z.enum([
  "openai",
  "anthropic",
  "ollama",
  "lmstudio",
]);

export type ModelProviderProtocol = z.infer<typeof modelProviderProtocolSchema>;

export const modelProviderProtocols: readonly ModelProviderProtocol[] =
  modelProviderProtocolSchema.options;

/** True for the local, OpenAI-compatible endpoints (Ollama / LM Studio). */
export function isLocalModelProviderProtocol(
  protocol: ModelProviderProtocol,
): boolean {
  return protocol === "ollama" || protocol === "lmstudio";
}

/** True for any protocol that speaks the OpenAI-compatible wire API. */
export function isOpenAiCompatibleModelProviderProtocol(
  protocol: ModelProviderProtocol,
): boolean {
  return protocol === "openai" || isLocalModelProviderProtocol(protocol);
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
 * Provider source configuration. `apiKey` appears only in save/test requests;
 * host list responses omit it and report `hasApiKey` instead so the renderer
 * never receives the secret. An empty-string `apiKey` clears the stored key.
 */
export const modelProviderConfigSchema = z
  .object({
    id: modelProviderIdSchema,
    name: nonBlankTextSchema.max(MODEL_PROVIDER_NAME_MAX_LENGTH),
    protocol: modelProviderProtocolSchema,
    baseUrl: modelProviderBaseUrlSchema,
    apiKey: z.string().max(MODEL_PROVIDER_API_KEY_MAX_LENGTH).optional(),
    hasApiKey: z.boolean().optional(),
  })
  .strict();

export type ModelProviderConfig = z.infer<typeof modelProviderConfigSchema>;

/** A verified model bound to its provider source (the Route). */
export const modelPoolEntrySchema = z
  .object({
    modelId: nonBlankTextSchema.max(MODEL_PROVIDER_MODEL_ID_MAX_LENGTH),
    label: nonBlankTextSchema.max(MODEL_PROVIDER_NAME_MAX_LENGTH).optional(),
    providerId: modelProviderIdSchema,
    protocol: modelProviderProtocolSchema,
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
    protocol: modelProviderProtocolSchema,
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

export type ModelProviderFetchModelsResult = z.infer<
  typeof modelProviderFetchModelsResultSchema
>;

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
