import { describe, expect, it } from "vitest";

import { officialEnvironment, officialRuntimeEnvironment } from "../src/app-server-host.js";
import { officialRuntimeArguments } from "../src/run-host-runtime.js";

describe("runtime provider injection", () => {
  it("keeps the gateway token process-local and does not persist Codex configuration", () => {
    const source: NodeJS.ProcessEnv = {
      HOME: "/home/test",
      OPENAI_API_KEY: "user-key",
      CODEXHOST_STOCK_CODEX_PATH: "/internal/codex",
      CODEXHOST_CONTROL_PORT: "1234",
      CODEXHOST_CONTROL_NONCE: "nonce",
    };

    expect(officialEnvironment(source)).toEqual({
      HOME: "/home/test",
      OPENAI_API_KEY: "user-key",
    });

    expect(
      officialRuntimeEnvironment(source, {
        endpoint: "http://127.0.0.1:43123/v1",
        token: "ephemeral-gateway-token",
      }),
    ).toEqual({
      HOME: "/home/test",
      OPENAI_API_KEY: "ephemeral-gateway-token",
    });
  });

  it("projects the gateway endpoint into explicit app-server config arguments", () => {
    const modelProviders = {
      gateway: { endpoint: "http://127.0.0.1:43123/v1" },
    } as never;

    expect(officialRuntimeArguments(["app-server", "--foo"], modelProviders)).toEqual([
      "--config",
      'openai_base_url="http://127.0.0.1:43123/v1"',
      "app-server",
      "--foo",
    ]);
  });
});
