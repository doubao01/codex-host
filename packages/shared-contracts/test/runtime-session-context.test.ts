import { describe, expect, it } from "vitest";

import {
  parseRuntimeSessionContext,
  runtimeSessionContextSchema,
} from "../src/runtime-session-context.js";

describe("runtime session context", () => {
  it("captures thread, harness, session, model, and a capability snapshot", () => {
    expect(
      parseRuntimeSessionContext({
        threadId: "thread-1",
        harnessId: "pi",
        sessionId: "session-1",
        modelId: "gpt-5",
        capabilitySnapshot: ["streaming", "models", "thinking"],
      }),
    ).toEqual({
      threadId: "thread-1",
      harnessId: "pi",
      sessionId: "session-1",
      modelId: "gpt-5",
      capabilitySnapshot: ["streaming", "models", "thinking"],
    });
  });

  it("rejects an unknown capability or unexpected field", () => {
    expect(
      runtimeSessionContextSchema.safeParse({
        threadId: "thread-1",
        harnessId: "pi",
        sessionId: "session-1",
        modelId: "gpt-5",
        capabilitySnapshot: ["unknown"],
      }).success,
    ).toBe(false);

    expect(
      runtimeSessionContextSchema.safeParse({
        threadId: "thread-1",
        harnessId: "pi",
        sessionId: "session-1",
        modelId: "gpt-5",
        capabilitySnapshot: ["streaming"],
        secret: "must-not-cross",
      }).success,
    ).toBe(false);
  });
});
