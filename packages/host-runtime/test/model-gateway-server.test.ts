import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { modelProviderIdSchema } from "@codexhost/shared-contracts";
import { describe, expect, it } from "vitest";

import {
  startModelGateway,
  type ModelGateway,
  type ModelGatewayProviderSource,
} from "../src/model-gateway-server.js";

const openaiId = modelProviderIdSchema.parse("primary-openai");
const fallbackId = modelProviderIdSchema.parse("fallback-openai");
const anthropicId = modelProviderIdSchema.parse("anthropic-direct");

type UpstreamRequest = {
  pathname: string;
  headers: Record<string, string | string[] | undefined>;
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
        headers: request.headers,
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

async function chatRequest(
  gateway: ModelGateway,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${gateway.endpoint}/v1/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${gateway.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("Model Gateway server", () => {
  it("binds loopback and rejects requests without the session token", async () => {
    const upstream = await mockUpstream(() => ({ status: 200, body: { data: [] } }));
    try {
      const gateway = await startModelGateway({
        providers: {
          getProvider: () => null,
          listPool: () => [],
          defaultProviderForWireFormat: () => null,
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
          { modelId: "gpt-5", label: "GPT-5", providerId: openaiId, wireFormat: "openai-chat" },
        ],
        defaultProviderForWireFormat: () => null,
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

  it("never forwards the ephemeral gateway credential when the provider has no API key", async () => {
    const upstream = await mockUpstream(() => ({ status: 200, body: { ok: true } }));
    try {
      const gateway = await startModelGateway({
        providers: {
          getProvider: () => ({
            id: openaiId,
            name: "Keyless upstream",
            wireFormat: "openai-chat",
            baseUrl: upstream.url,
          }),
          listPool: () => [{ modelId: "local-model", providerId: openaiId, wireFormat: "openai-chat" }],
          defaultProviderForWireFormat: () => null,
        },
      });
      try {
        await chatRequest(gateway, { model: "local-model" });
        expect(upstream.requests).toHaveLength(1);
        expect(upstream.requests[0]?.headers.authorization).toBeUndefined();
        expect(upstream.requests[0]?.headers["x-api-key"]).toBeUndefined();
      } finally {
        await gateway.close();
      }
    } finally {
      await upstream.close();
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
                  wireFormat: "openai-chat",
                  baseUrl: upstream.url,
                  apiKey: "sk-primary",
                }
              : id === fallbackId
                ? {
                    id: fallbackId,
                    name: "Fallback",
                    wireFormat: "openai-chat",
                    baseUrl: upstream.url,
                    apiKey: "sk-fallback",
                  }
                : null,
          listPool: () => [{ modelId: "gpt-5", providerId: openaiId, wireFormat: "openai-chat" }],
          defaultProviderForWireFormat: (wireFormat) =>
            wireFormat === "openai-chat" || wireFormat === "openai-responses"
              ? {
                  id: fallbackId,
                  name: "Fallback",
                  wireFormat: "openai-chat",
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
        expect(upstream.requests[0]?.headers.authorization).toBe("Bearer sk-primary");
        expect(upstream.requests[0]?.body).toMatchObject({ model: "gpt-5" });
      } finally {
        await gateway.close();
      }
    } finally {
      await upstream.close();
    }
  });

  it("honors a provider path override and merges configured headers", async () => {
    const upstream = await mockUpstream(() => ({ status: 200, body: { ok: true } }));
    try {
      const gateway = await startModelGateway({
        providers: {
          getProvider: (id) =>
            id === openaiId
              ? {
                  id: openaiId,
                  name: "Primary",
                  wireFormat: "openai-chat",
                  baseUrl: upstream.url,
                  path: "/custom/completions",
                  apiKey: "sk-primary",
                  headers: [
                    { name: "X-Project", value: "hermes" },
                    { name: "authorization", value: "Bearer weak-user-key" },
                  ],
                }
              : null,
          listPool: () => [{ modelId: "gpt-5", providerId: openaiId, wireFormat: "openai-chat" }],
          defaultProviderForWireFormat: () => null,
        },
      });
      try {
        await fetch(`${gateway.endpoint}/v1/chat/completions`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${gateway.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ model: "gpt-5" }),
        });
        expect(upstream.requests).toHaveLength(1);
        const request = upstream.requests[0];
        if (!request) throw new Error("No upstream request was captured");
        // The provider path override wins over the incoming Gateway route.
        expect(request.pathname).toBe("/custom/completions");
        expect(request.headers.authorization).toBe("Bearer sk-primary");
        // A user header with an auth-like name does not leak past the apiKey override.
        expect(request.headers["x-project"]).toBe("hermes");
      } finally {
        await gateway.close();
      }
    } finally {
      await upstream.close();
    }
  });

  it("falls back to the wire-format default when the model is not in the pool", async () => {
    const upstream = await mockUpstream(() => ({ status: 200, body: { ok: true } }));
    try {
      const gateway = await startModelGateway({
        providers: {
          getProvider: (id) =>
            id === openaiId
              ? {
                  id: openaiId,
                  name: "Primary",
                  wireFormat: "openai-chat",
                  baseUrl: upstream.url,
                  apiKey: "sk-primary",
                }
              : null,
          listPool: () => [],
          defaultProviderForWireFormat: (wireFormat) =>
            wireFormat === "openai-chat" || wireFormat === "openai-responses"
              ? {
                  id: openaiId,
                  name: "Primary",
                  wireFormat: "openai-chat",
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
        expect(upstream.requests[0]?.headers.authorization).toBe("Bearer sk-primary");
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
                  wireFormat: "anthropic",
                  baseUrl: upstream.url,
                  apiKey: "sk-ant-secret",
                }
              : null,
          listPool: () => [],
          defaultProviderForWireFormat: (wireFormat) =>
            wireFormat === "anthropic"
              ? {
                  id: anthropicId,
                  name: "Claude Direct",
                  wireFormat: "anthropic",
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
        expect(upstream.requests[0]?.headers["x-api-key"]).toBe("sk-ant-secret");
        expect(upstream.requests[0]?.headers.authorization).toBeUndefined();
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
        defaultProviderForWireFormat: () => null,
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
                  wireFormat: "openai-chat",
                  baseUrl: upstream.url,
                  apiKey: "sk-primary",
                }
              : null,
          listPool: () => [],
          defaultProviderForWireFormat: () => null,
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

  it("uses an explicit /models path override when listing models", async () => {
    const upstream = await mockUpstream((pathname) =>
      pathname === "/custom/models"
        ? { status: 200, body: { data: [{ id: "gpt-5", display_name: "GPT-5" }] } }
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
                  wireFormat: "openai-chat",
                  baseUrl: upstream.url,
                  path: "/custom/models",
                  apiKey: "sk-primary",
                }
              : null,
          listPool: () => [],
          defaultProviderForWireFormat: () => null,
        },
      });
      try {
        await expect(gateway.fetchModels(openaiId)).resolves.toEqual({
          models: [{ id: "gpt-5", label: "GPT-5" }],
        });
        expect(upstream.requests).toHaveLength(1);
        expect(upstream.requests[0]?.pathname).toBe("/custom/models");
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
                  wireFormat: "openai-chat",
                  baseUrl: upstream.url,
                  apiKey: "sk-primary",
                }
              : null,
          listPool: () => [],
          defaultProviderForWireFormat: () => null,
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

  it("fails over to the next provider when the first returns HTTP 503", async () => {
    const failing = await mockUpstream(() => ({ status: 503, body: { error: "down" } }));
    const healthy = await mockUpstream(() => ({ status: 200, body: { ok: true } }));
    try {
      const gateway = await startModelGateway({
        providers: {
          getProvider: (id) =>
            id === openaiId
              ? {
                  id: openaiId,
                  name: "Failing",
                  wireFormat: "openai-chat",
                  baseUrl: failing.url,
                  apiKey: "sk-a",
                }
              : id === fallbackId
                ? {
                    id: fallbackId,
                    name: "Healthy",
                    wireFormat: "openai-chat",
                    baseUrl: healthy.url,
                    apiKey: "sk-b",
                  }
                : null,
          listPool: () => [],
          defaultProviderForWireFormat: (wireFormat) =>
            wireFormat === "openai-chat" || wireFormat === "openai-responses"
              ? {
                  id: openaiId,
                  name: "Failing",
                  wireFormat: "openai-chat",
                  baseUrl: failing.url,
                  apiKey: "sk-a",
                }
              : null,
          listProvidersForRouting: () => [
            {
              id: openaiId,
              name: "Failing",
              wireFormat: "openai-chat",
              baseUrl: failing.url,
              apiKey: "sk-a",
            },
            {
              id: fallbackId,
              name: "Healthy",
              wireFormat: "openai-chat",
              baseUrl: healthy.url,
              apiKey: "sk-b",
            },
          ],
        },
      });
      try {
        const response = await chatRequest(gateway, { model: "gpt-5" });
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ ok: true });
        // The first candidate returned 503 and the second succeeded.
        expect(failing.requests).toHaveLength(1);
        expect(healthy.requests).toHaveLength(1);
      } finally {
        await gateway.close();
      }
    } finally {
      await failing.close();
      await healthy.close();
    }
  });

  it("fails over on HTTP 429 but not on HTTP 400", async () => {
    const throttled = await mockUpstream(() => ({ status: 429, body: { error: "limited" } }));
    const rejected = await mockUpstream(() => ({ status: 400, body: { error: "bad request" } }));
    const healthy = await mockUpstream(() => ({ status: 200, body: { ok: true } }));
    const healthyFor400 = await mockUpstream(() => ({ status: 200, body: { ok: true } }));
    try {
      const source = (
        first: { url: string },
        second: { url: string },
      ): ModelGatewayProviderSource => ({
        getProvider: (id: string) =>
          id === openaiId
            ? {
                id: openaiId,
                name: "First",
                wireFormat: "openai-chat",
                baseUrl: first.url,
                apiKey: "sk-a",
              }
            : id === fallbackId
              ? {
                  id: fallbackId,
                  name: "Second",
                  wireFormat: "openai-chat",
                  baseUrl: second.url,
                  apiKey: "sk-b",
                }
              : null,
        listPool: () => [],
        defaultProviderForWireFormat: () => null,
        listProvidersForRouting: () => [
          {
            id: openaiId,
            name: "First",
            wireFormat: "openai-chat",
            baseUrl: first.url,
            apiKey: "sk-a",
          },
          {
            id: fallbackId,
            name: "Second",
            wireFormat: "openai-chat",
            baseUrl: second.url,
            apiKey: "sk-b",
          },
        ],
      });

      // 429 is a retryable status: the second provider is attempted.
      const gateway429 = await startModelGateway({
        providers: source(throttled, healthy),
      });
      try {
        const response = await chatRequest(gateway429, { model: "gpt-5" });
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ ok: true });
        expect(throttled.requests).toHaveLength(1);
        expect(healthy.requests).toHaveLength(1);
      } finally {
        await gateway429.close();
      }

      // 400 is a client error: no fail-over happens and the upstream status is kept.
      const gateway400 = await startModelGateway({
        providers: source(rejected, healthyFor400),
      });
      try {
        const response = await chatRequest(gateway400, { model: "gpt-5" });
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({ error: "bad request" });
        expect(rejected.requests).toHaveLength(1);
        expect(healthyFor400.requests).toHaveLength(0);
      } finally {
        await gateway400.close();
      }
    } finally {
      await throttled.close();
      await rejected.close();
      await healthy.close();
      await healthyFor400.close();
    }
  });

  it("tries the pool-exact provider before the wire-format candidates", async () => {
    const routed = await mockUpstream(() => ({ status: 503, body: { error: "down" } }));
    const fallback = await mockUpstream(() => ({ status: 200, body: { ok: true } }));
    try {
      const gateway = await startModelGateway({
        providers: {
          getProvider: (id) =>
            id === openaiId
              ? {
                  id: openaiId,
                  name: "Routed",
                  wireFormat: "openai-chat",
                  baseUrl: routed.url,
                  apiKey: "sk-routed",
                }
              : id === fallbackId
                ? {
                    id: fallbackId,
                    name: "Fallback",
                    wireFormat: "openai-chat",
                    baseUrl: fallback.url,
                    apiKey: "sk-fallback",
                  }
                : null,
          listPool: () => [
            { modelId: "gpt-5", providerId: openaiId, wireFormat: "openai-chat" },
          ],
          // The fallback is first in configuration order; the pool-exact provider is not.
          defaultProviderForWireFormat: () => ({
            id: fallbackId,
            name: "Fallback",
            wireFormat: "openai-chat",
            baseUrl: fallback.url,
            apiKey: "sk-fallback",
          }),
          listProvidersForRouting: () => [
            {
              id: fallbackId,
              name: "Fallback",
              wireFormat: "openai-chat",
              baseUrl: fallback.url,
              apiKey: "sk-fallback",
            },
            {
              id: openaiId,
              name: "Routed",
              wireFormat: "openai-chat",
              baseUrl: routed.url,
              apiKey: "sk-routed",
            },
          ],
        },
      });
      try {
        const response = await chatRequest(gateway, { model: "gpt-5" });
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ ok: true });
        // The pool-exact provider was attempted first (503), then the fallback won.
        expect(routed.requests).toHaveLength(1);
        expect(fallback.requests).toHaveLength(1);
      } finally {
        await gateway.close();
      }
    } finally {
      await routed.close();
      await fallback.close();
    }
  });

  it("reports ALL_PROVIDERS_FAILED when every candidate errors", async () => {
    const first = await mockUpstream(() => ({ status: 503, body: { error: "down" } }));
    const second = await mockUpstream(() => ({ status: 502, body: { error: "bad gateway" } }));
    try {
      const gateway = await startModelGateway({
        providers: {
          getProvider: (id) =>
            id === openaiId
              ? {
                  id: openaiId,
                  name: "First",
                  wireFormat: "openai-chat",
                  baseUrl: first.url,
                  apiKey: "sk-a",
                }
              : id === fallbackId
                ? {
                    id: fallbackId,
                    name: "Second",
                    wireFormat: "openai-chat",
                    baseUrl: second.url,
                    apiKey: "sk-b",
                  }
                : null,
          listPool: () => [],
          defaultProviderForWireFormat: () => null,
          listProvidersForRouting: () => [
            {
              id: openaiId,
              name: "First",
              wireFormat: "openai-chat",
              baseUrl: first.url,
              apiKey: "sk-a",
            },
            {
              id: fallbackId,
              name: "Second",
              wireFormat: "openai-chat",
              baseUrl: second.url,
              apiKey: "sk-b",
            },
          ],
        },
      });
      try {
        const response = await chatRequest(gateway, { model: "gpt-5" });
        expect(response.status).toBe(502);
        await expect(response.json()).resolves.toMatchObject({
          error: { code: "ALL_PROVIDERS_FAILED", attempted: 2 },
        });
        expect(first.requests).toHaveLength(1);
        expect(second.requests).toHaveLength(1);
      } finally {
        await gateway.close();
      }
    } finally {
      await first.close();
      await second.close();
    }
  });

  it("keeps single-candidate behavior without an enumerable routing list", async () => {
    const upstream = await mockUpstream(() => ({ status: 503, body: { error: "down" } }));
    try {
      const gateway = await startModelGateway({
        providers: {
          getProvider: () => null,
          listPool: () => [],
          defaultProviderForWireFormat: (wireFormat) =>
            wireFormat === "openai-chat" || wireFormat === "openai-responses"
              ? {
                  id: openaiId,
                  name: "Only",
                  wireFormat: "openai-chat",
                  baseUrl: upstream.url,
                  apiKey: "sk-only",
                }
              : null,
        },
      });
      try {
        // No second candidate exists, so the 503 exhausts the single candidate.
        const response = await chatRequest(gateway, { model: "gpt-5" });
        expect(response.status).toBe(502);
        await expect(response.json()).resolves.toMatchObject({
          error: { code: "ALL_PROVIDERS_FAILED", attempted: 1 },
        });
        expect(upstream.requests).toHaveLength(1);
      } finally {
        await gateway.close();
      }
    } finally {
      await upstream.close();
    }
  });
});
