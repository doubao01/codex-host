import { describe, expect, it } from "vitest";

import { createRuntimeProviderContext } from "../src/runtime-provider-context.js";

describe("runtime provider context bridge", () => {
  it("projects only the process-boundary endpoint and token", () => {
    const gateway = {
      endpoint: "http://127.0.0.1:43123/v1",
      token: "ephemeral-token",
      registry: { secret: "must-not-cross" },
    };

    expect(createRuntimeProviderContext(gateway)).toEqual({
      endpoint: "http://127.0.0.1:43123/v1",
      token: "ephemeral-token",
    });
  });

  it("fails closed for an invalid gateway endpoint", () => {
    expect(() =>
      createRuntimeProviderContext({
        endpoint: "file:///tmp/not-http",
        token: "ephemeral-token",
      }),
    ).toThrow();
  });
});
