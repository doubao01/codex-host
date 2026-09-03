import { describe, expect, it } from "vitest";

import {
  parseRuntimeProviderContext,
  runtimeProviderContextSchema,
} from "../src/runtime-provider.js";

describe("runtime provider context", () => {
  it("accepts an http or https endpoint with a non-empty token", () => {
    expect(
      parseRuntimeProviderContext({
        endpoint: "http://127.0.0.1:43123/v1",
        token: "ephemeral-token",
      }),
    ).toEqual({
      endpoint: "http://127.0.0.1:43123/v1",
      token: "ephemeral-token",
    });
  });

  it("rejects non-http(s) endpoints", () => {
    expect(
      runtimeProviderContextSchema.safeParse({
        endpoint: "file:///tmp/gateway",
        token: "ephemeral-token",
      }).success,
    ).toBe(false);
  });

  it("rejects an empty token", () => {
    expect(
      runtimeProviderContextSchema.safeParse({
        endpoint: "http://127.0.0.1:43123/v1",
        token: "",
      }).success,
    ).toBe(false);
  });

  it("is strict about its boundary", () => {
    expect(
      runtimeProviderContextSchema.safeParse({
        endpoint: "https://gateway.example/v1",
        token: "ephemeral-token",
        apiKey: "should-not-cross",
      }).success,
    ).toBe(false);
  });
});
