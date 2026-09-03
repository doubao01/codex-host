import { FakeHarnessAdapter } from "@codexhost/harness-adapter/testing";
import type { StoredThreadRecordV1 } from "@codexhost/mapping-store";
import { harnessIdSchema, hostThreadIdSchema, nativeSessionRefSchema } from "@codexhost/shared-contracts";
import { describe, expect, it } from "vitest";

import type { ExternalThreadRepository } from "../src/external-thread-repository.js";
import { ExternalThreadRuntime } from "../src/external-thread-runtime.js";

function testRecord(): StoredThreadRecordV1 {
  const harnessId = harnessIdSchema.parse("pi");
  const hostThreadId = hostThreadIdSchema.parse("runtime-context-thread");
  return {
    formatVersion: 1,
    revision: 1,
    hostThreadId,
    createRequestId: "create-runtime-context",
    harnessId,
    state: "ready",
    nativeSessionRef: nativeSessionRefSchema.parse({
      harnessId,
      nativeSessionId: "native-runtime-context",
      formatVersion: 1,
    }),
    cwd: "/synthetic",
    title: "Runtime Context Test",
    archived: false,
    transportModelId: "codexhost/pi-native",
    ephemeral: false,
    historyMode: "legacy",
    turnMappings: [],
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z",
  } as StoredThreadRecordV1;
}

describe("ExternalThreadRuntime session context integration", () => {
  it("binds a validated session context to every registered external thread", async () => {
    const adapter = new FakeHarnessAdapter(harnessIdSchema.parse("pi"));
    const opened = await adapter.open({ kind: "create", cwd: "/synthetic" });
    if (!opened.ok) throw new Error(opened.error.message);

    const runtime = new ExternalThreadRuntime({
      adapters: new Map([["pi", adapter]]),
      repository: { find: async () => null } as unknown as ExternalThreadRepository,
      consumeOutputs: async () => undefined,
      diagnose: () => undefined,
    });
    const record = testRecord();
    const thread = runtime.register({
      record,
      session: opened.value,
      sessionId: "session-runtime-context",
      thread: { id: record.hostThreadId },
      turns: [],
    });

    expect(thread.runtimeSessionContext).toEqual({
      threadId: record.hostThreadId,
      harnessId: "pi",
      sessionId: "session-runtime-context",
      modelId: opened.value.initialState.effectiveModel?.id ?? record.transportModelId,
      capabilitySnapshot: ["streaming", "models", "thinking", "permissions", "history"],
    });

    await adapter.close();
  });
});
