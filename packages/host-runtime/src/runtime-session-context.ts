import {
  parseRuntimeSessionContext,
  type HarnessRegistry,
  type RuntimeSessionContext,
} from "@codexhost/shared-contracts";
import type { HarnessSession } from "@codexhost/harness-adapter";
import type { ExternalHarnessId } from "@codexhost/protocol-core";
import type { StoredThreadRecordV1 } from "@codexhost/mapping-store";

/** Build the immutable session identity/capability snapshot used at runtime boundaries. */
export function createRuntimeSessionContext(input: {
  record: Pick<StoredThreadRecordV1, "hostThreadId" | "harnessId" | "transportModelId">;
  session: Pick<HarnessSession, "initialState">;
  registry: HarnessRegistry;
  sessionId: string;
  modelId?: string;
}): RuntimeSessionContext {
  const harnessId = input.record.harnessId as ExternalHarnessId;
  const manifest = input.registry.get(harnessId);
  if (!manifest) throw new Error(`Harness is not registered: ${input.record.harnessId}`);

  const modelId =
    input.modelId ?? input.session.initialState.effectiveModel?.id ?? input.record.transportModelId;
  if (!modelId) {
    throw new Error(`Runtime Session has no Model identity: ${input.record.hostThreadId}`);
  }

  return parseRuntimeSessionContext({
    threadId: input.record.hostThreadId,
    harnessId,
    sessionId: input.sessionId,
    modelId,
    capabilitySnapshot: [...manifest.capabilities],
  });
}
