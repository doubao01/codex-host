import { z } from "zod";

const runtimeProviderEndpointSchema = z
  .string()
  .url("Runtime provider endpoint must be an absolute URL")
  .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
    message: "Runtime provider endpoint must use http or https",
  });

const runtimeProviderTokenSchema = z.string().min(1, "Runtime provider token must not be empty");

/** Process-local model gateway connection injected into an official Codex runtime. */
export const runtimeProviderContextSchema = z
  .object({
    endpoint: runtimeProviderEndpointSchema,
    token: runtimeProviderTokenSchema,
  })
  .strict();

export type RuntimeProviderContext = z.infer<typeof runtimeProviderContextSchema>;

/** Validate and return a runtime provider context before crossing a process boundary. */
export function parseRuntimeProviderContext(value: unknown): RuntimeProviderContext {
  return runtimeProviderContextSchema.parse(value);
}
