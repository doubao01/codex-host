import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { modelProviderIdSchema } from "@codexhost/shared-contracts";
import { describe, expect, it } from "vitest";

import { startModelGateway } from "../src/model-gateway-server.js";

const openaiId = modelProviderIdSchema.parse("primary-openai");
const fallbackId = modelProviderIdSchema.parse("fallback-openai");
const anthropicId = modelProviderIdSchema.parse("anthropic-direct");

type UpstreamRequest = {
  pathname: string;
  authorization: string | undefined;
  xApiKey: string | string[] | undefined;
  body: unknown;
};

async function mockUpstream(
  respond: (pathname: string) => { status: number; body: unknown },
): Promise<{
  url: string;
  requests: UpstreamRequest[];
  close: () => Promise<void>;
}> {
  const requests: UpstreamRequest[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const raw = Buffer.concat(chunks);
      const url = new URL(request.url ?? "/", "http://upstream.invalid");
      const result = respond(url.pathname);
      requests.push({
        pathname: url.pathname,
        authorization: request.headers.authorization,
        xApiKey: request.headers["x-api-key"],
        body: raw.length > 0 ? JSON.parse(raw.toString("utf8")) : null,
      });
      response.writeHead(result.status, { "content-type": "application/json" });
      response.end(`${JSON.stringify(result.body)}\n`);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

describe("Model Gateway server", () => {
  it("binds loopback and rejects requests without the session token", async () => {
    const upstream = await mockUpstream(() => ({ status: 200, body: { data: [] } }));
    try {
      const gateway = await startModelGateway({
        providers: {
          getProvider: () => null,
          listPool: () => [],
          defaultProviderForProtocol: () => null,
        },
      });
      try {
        expect(new URL(gateway.endpoint).hostname).toBe("127.0.0.1");

        const missing = await fetch(`${gateway.endpoint}/v1/models`);
        expect(missing.status).toBe(401);

        const wrong = await fetch(`${gateway.endpoint}/v1/models`, {
          headers: { authorization: "Bearer wrong-token" },
        });
        expect(wrong.status).toBe(401);

        const authorized = await fetch(`${gateway.endpoint}/v1/models`, {
          headers: { authorization: `Bearer ${gateway.token}` },
        });
        expect(authorized.status).toBe(200);
      } finally {
        await gateway.close();
      }
    } finally {
      await upstream.close();
    }
  });

  it("returns the Model Pool from GET /v1/models", async () => {
    const gateway = await startModelGateway({
      providers: {
        getProvider: () => null,
        listPool: () => [
          { modelId: "gpt-5", label: "GPT-5", providerId: openaiId, protocol: "openai" },
        ],
        defaultProviderForProtocol: () => null,
      },
    });
    try {
      const response = await fetch(`${gateway.endpoint}/v1/models`, {
        headers: { authorization: `Bearer ${gateway.token}` },
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        data: [{ id: "gpt-5", display_name: "GPT-5" }],
      });
    } finally {
      await gateway.close();
    }
  });

  it("routes a request by model and swaps the Bearer key for the routed provider", async () => {
    const upstream = await mockUpstream(() => ({ status: 200, body: { ok: true } }));
    try {
      const gateway = await startModelGateway({
        providers: {
          getProvider: (id) =>
            id === openaiId
              ? {
                  id: openaiId,
                  name: "Primary",
                  protocol: "openai",
                  baseUrl: upstream.url,
                  apiKey: "sk-primary",
                }
              : id === fallbackId
                ? {
                    id: fallbackId,
                    name: "Fallback",
                    protocol: "openai",
                    baseUrl: upstream.url,
                    apiKey: "sk-fallback",
                  }
                : null,
          listPool: () => [{ modelId: "gpt-5", providerId: openaiId, protocol: "openai" }],
          defaultProviderForProtocol: (protocol) =>
            protocol === "openai"
              ? {
                  id: fallbackId,
                  name: "Fallback",
                  protocol: "openai",
                  baseUrl: upstream.url,
                  apiKey: "sk-fallback",
                }
              : null,
        },
      });
      try {
        const response = await fetch(`${gateway.endpoint}/v1/responses`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${gateway.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ model: "gpt-5", input: "hello" }),
        });
        expect(response.status).toBe(200);
        expect(upstream.requests).toHaveLength(1);
        expect(upstream.requests[0]?.pathname).toBe("/v1/responses");
        expect(upstream.requests[0]?.authorization).toBe("Bearer sk-primary");
        expect(upstream.requests[0]?.body).toMatchObject({ model: "gpt-5" });
      } finally {
        await gateway.close();
      }
    } finally {
      await upstream.close();
    }
  });

  it("falls back to the protocol default when the model is not in the pool", async () => {
    const upstream = await mockUpstream(() => ({ status: 200, body: { ok: true } }));
    try {
      const gateway = await startModelGateway({
        providers: {
          getProvider: (id) =>
            id === openaiId
              ? {
                  id: openaiId,
                  name: "Primary",
                  protocol: "openai",
                  baseUrl: upstream.url,
                  apiKey: "sk-primary",
                }
              : null,
          listPool: () => [],
          defaultProviderForProtocol: (protocol) =>
            protocol === "openai"
              ? {
                  id: openaiId,
                  name: "Primary",
                  protocol: "openai",
                  baseUrl: upstream.url,
                  apiKey: "sk-primary",
                }
              : null,
        },
      });
      try {
        await fetch(`${gateway.endpoint}/v1/responses`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${gateway.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ model: "unknown-model" }),
        });
        expect(upstream.requests).toHaveLength(1);
        expect(upstream.requests[0]?.authorization).toBe("Bearer sk-primary");
      } finally {
        await gateway.close();
      }
    } finally {
      await upstream.close();
    }
  });

  it("forwards Anthropic traffic with the routed provider's x-api-key", async () => {
    const upstream = await mockUpstream(() => ({ status: 200, body: { ok: true } }));
    try {
      const gateway = await startModelGateway({
        providers: {
          getProvider: (id) =>
            id === anthropicId
              ? {
                  id: anthropicId,
                  name: "Claude Direct",
                  protocol: "anthropic",
                  baseUrl: upstream.url,
                  apiKey: "sk-ant-secret",
                }
              : null,
          listPool: () => [],
          defaultProviderForProtocol: (protocol) =>
            protocol === "anthropic"
              ? {
                  id: anthropicId,
                  name: "Claude Direct",
                  protocol: "anthropic",
                  baseUrl: upstream.url,
                  apiKey: "sk-ant-secret",
                }
              : null,
        },
      });
      try {
        await fetch(`${gateway.endpoint}/v1/messages`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${gateway.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ model: "claude-sonnet-5" }),
        });
        expect(upstream.requests).toHaveLength(1);
        expect(upstream.requests[0]?.pathname).toBe("/v1/messages");
        expect(upstream.requests[0]?.xApiKey).toBe("sk-ant-secret");
        expect(upstream.requests[0]?.authorization).toBeUndefined();
      } finally {
        await gateway.close();
      }
    } finally {
      await upstream.close();
    }
  });

  it("rejects unknown routes and reports missing providers", async () => {
    const gateway = await startModelGateway({
      providers: {
        getProvider: () => null,
        listPool: () => [],
        defaultProviderForProtocol: () => null,
      },
    });
    try {
      const unknown = await fetch(`${gateway.endpoint}/v1/unknown`, {
        method: "POST",
        headers: { authorization: `Bearer ${gateway.token}` },
        body: "{}",
      });
      expect(unknown.status).toBe(404);

      const noProvider = await fetch(`${gateway.endpoint}/v1/responses`, {
        method: "POST",
        headers: { authorization: `Bearer ${gateway.token}` },
        body: JSON.stringify({ model: "any" }),
      });
      expect(noProvider.status).toBe(503);
      await expect(noProvider.json()).resolves.toMatchObject({
        error: { code: "NO_MODEL_PROVIDER" },
      });
    } finally {
      await gateway.close();
    }
  });

  it("fetches and parses the upstream model catalog", async () => {
    const upstream = await mockUpstream((pathname) =>
      pathname === "/v1/models"
        ? {
            status: 200,
            body: {
              data: [
                { id: "gpt-5", display_name: "GPT-5" },
                { id: "gpt-5-mini" },
                { id: "legacy", name: "Legacy Model" },
              ],
            },
          }
        : { status: 404, body: {} },
    );
    try {
      const gateway = await startModelGateway({
        providers: {
          getProvider: (id) =>
            id === openaiId
              ? {
                  id: openaiId,
                  name: "Primary",
                  protocol: "openai",
                  baseUrl: upstream.url,
                  apiKey: "sk-primary",
                }
              : null,
          listPool: () => [],
          defaultProviderForProtocol: () => null,
        },
      });
      try {
        await expect(gateway.fetchModels(openaiId)).resolves.toEqual({
          models: [
            { id: "gpt-5", label: "GPT-5" },
            { id: "gpt-5-mini" },
            { id: "legacy", label: "Legacy Model" },
          ],
        });
        await expect(gateway.fetchModels(anthropicId)).rejects.toThrow("Unknown model provider");
      } finally {
        await gateway.close();
      }
    } finally {
      await upstream.close();
    }
  });

  it("measures latency on a successful provider test and reports failures", async () => {
    const upstream = await mockUpstream(() => ({ status: 503, body: { error: "down" } }));
    try {
      const gateway = await startModelGateway({
        providers: {
          getProvider: (id) =>
            id === openaiId
              ? {
                  id: openaiId,
                  name: "Primary",
                  protocol: "openai",
                  baseUrl: upstream.url,
                  apiKey: "sk-primary",
                }
              : null,
          listPool: () => [],
          defaultProviderForProtocol: () => null,
        },
      });
      try {
        const failed = await gateway.test(openaiId);
        expect(failed.ok).toBe(false);
        expect(failed.error).toContain("503");

        const unknown = await gateway.test(anthropicId);
        expect(unknown.ok).toBe(false);
        expect(unknown.error).toContain("Unknown model provider");
      } finally {
        await gateway.close();
      }
    } finally {
      await upstream.close();
    }
  });
});
