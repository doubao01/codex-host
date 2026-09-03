import { FakeHarnessAdapter } from "@codexhost/harness-adapter/testing";
import {
  harnessIdSchema,
  hostThreadIdSchema,
  nativeSessionRefSchema,
  type StoredThreadRecordV1,
} from "@codexhost/shared-contracts";
import { describe, expect, it } from "vitest";

import type { ExternalThreadRepository } from "../src/external-thread-repository.js";
import { ExternalThreadRuntime } from "../src/external-thread-runtime.js";

describe("ExternalThreadRuntime session context integration", () => {
  it("binds one immutable context to a registered Harness Session", async () => {
    const harnessId = harnessIdSchema.parse("pi");
    const hostThreadId = hostThreadIdSchema.parse("runtime-context-thread");
    const adapter = new FakeHarnessAdapter(harnessId);
    const opened = await adapter.open({ kind: "create", cwd: "/synthetic" });
    if (!opened.ok) throw new Error(opened.error.message);

    const nativeRef = opened.value.initialState.nativeRef;
    const model = opened.value.initialState.effectiveModel;
    if (!nativeRef || !model) throw new Error("Fake Session did not expose native/model identity");

    const runtime = new ExternalThreadRuntime({
      adapters: new Map([["pi", adapter]]),
      repository: { find: async () => null } as unknown as ExternalThreadRepository,
      consumeOutputs: async () => undefined,
      diagnose: () => undefined,
    });

    const thread = runtime.register({
      record: {
        formatVersion: 1,
        revision: 1,
        hostThreadId,
        createRequestId: "runtime-context-create",
        harnessId,
        state: "ready",
        nativeSessionRef: nativeSessionRefSchema.parse(nativeRef),
        cwd: "/synthetic",
        title: "Runtime Context",
        archived: false,
        transportModelId: "codexhost/pi-native",
        ephemeral: false,
        historyMode: "legacy",
        turnMappings: [],
        createdAt: "2026-09-03T00:00:00.000Z",
        updatedAt: "2026-09-03T00:00:00.000Z",
      } as unknown as StoredThreadRecordV1,
      session: opened.value,
      sessionId: "session-1",
      thread: { id: hostThreadId },
      turns: [],
    });

    expect(thread.runtimeSessionContext).toMatchObject({
      threadId: hostThreadId,
      harnessId,
      sessionId: "session-1",
      modelId: model.id,
    });
    expect(thread.runtimeSessionContext.capabilitySnapshot).toEqual([
      "streaming",
      "models",
      "thinking",
      "permissions",
      "history",
    ]);

    await adapter.close();
  });
});
