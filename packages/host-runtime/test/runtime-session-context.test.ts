import { describe, expect, it } from "vitest";

import { HarnessRegistry } from "@codexhost/shared-contracts";
import { createRuntimeSessionContext } from "../src/runtime-session-context.js";

describe("runtime session context builder", () => {
  it("projects the registered harness capabilities into an immutable runtime identity", () => {
    const registry = new HarnessRegistry();
    registry.register({
      id: "pi",
      displayName: "Pi",
      capabilities: ["streaming", "models", "thinking", "history"],
    });

    expect(
      createRuntimeSessionContext({
        record: {
          hostThreadId: "thread-1" as never,
          harnessId: "pi",
          transportModelId: "pi:default",
        },
        session: {
          initialState: {
            nativeRef: {
              harnessId: "pi",
              nativeSessionId: "native-1",
              formatVersion: 1,
            },
            effectiveModel: { id: "gpt-5", label: "GPT-5" },
          },
        },
        registry,
        sessionId: "session-1",
      }),
    ).toEqual({
      threadId: "thread-1",
      harnessId: "pi",
      sessionId: "session-1",
      modelId: "gpt-5",
      capabilitySnapshot: ["streaming", "models", "thinking", "history"],
    });
  });

  it("fails closed when the stored harness is not registered", () => {
    expect(() =>
      createRuntimeSessionContext({
        record: {
          hostThreadId: "thread-1" as never,
          harnessId: "pi",
          transportModelId: "pi:default",
        },
        session: {
          initialState: {
            nativeRef: { harnessId: "pi", nativeSessionId: "native-1", formatVersion: 1 },
          },
        },
        registry: new HarnessRegistry(),
        sessionId: "session-1",
      }),
    ).toThrow("Harness is not registered: pi");
  });
});
