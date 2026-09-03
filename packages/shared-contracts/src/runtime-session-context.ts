import type { HarnessCapability } from "./harness-registry.js";
import { harnessIdSchema } from "./ids.js";
import type { HarnessId, HostThreadId } from "./ids.js";
import { z } from "zod";

export const runtimeSessionContextSchema = z
  .object({
    threadId: z
      .string()
      .min(1)
      .transform((value) => value as HostThreadId),
    harnessId: harnessIdSchema,
    sessionId: z.string().min(1),
    modelId: z.string().min(1),
    capabilitySnapshot: z.array(
      z.enum([
        "streaming",
        "models",
        "thinking",
        "permissions",
        "questions",
        "history",
        "fork",
      ] satisfies readonly HarnessCapability[]),
    ),
  })
  .strict();

export type RuntimeSessionContext = z.infer<typeof runtimeSessionContextSchema> & {
  threadId: HostThreadId;
  harnessId: HarnessId;
};

/** Validate the immutable identity/capability snapshot attached to a Runtime Session. */
export function parseRuntimeSessionContext(value: unknown): RuntimeSessionContext {
  return runtimeSessionContextSchema.parse(value) as RuntimeSessionContext;
}
