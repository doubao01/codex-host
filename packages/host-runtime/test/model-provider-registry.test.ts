import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { modelProviderIdSchema } from "@codexhost/shared-contracts";
import { describe, expect, it } from "vitest";

import { ModelProviderRegistry } from "../src/model-provider-registry.js";

const gatewayId = modelProviderIdSchema.parse("my-gateway");
const claudeId = modelProviderIdSchema.parse("claude-direct");

async function withRegistry(
  run: (registry: ModelProviderRegistry) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "codexhost-registry-"));
  try {
    const registry = new ModelProviderRegistry(path.join(directory, "model-providers.json"));
    await registry.initialize();
    await run(registry);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("ModelProviderRegistry", () => {
  it("starts empty when the store file is missing", async () => {
    await withRegistry(async (registry) => {
      expect(registry.snapshot()).toEqual({ providers: [], pool: [] });
      expect(registry.listDefaultRoutes()).toEqual([]);
    });
  });

  it("recovers from a corrupt store file instead of failing", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "codexhost-registry-"));
    try {
      const storePath = path.join(directory, "model-providers.json");
      await writeFile(storePath, "{ not json", "utf8");
      const registry = new ModelProviderRegistry(storePath);
      await registry.initialize();
      expect(registry.snapshot()).toEqual({ providers: [], pool: [] });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("redacts stored API keys from snapshots but keeps them for routing", async () => {
    await withRegistry(async (registry) => {
      await registry.save({
        id: gatewayId,
        name: "My Gateway",
        wireFormat: "openai-chat",
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-secret",
      });
      const snapshot = registry.snapshot();
      expect(snapshot.providers).toHaveLength(1);
      expect(snapshot.providers[0]?.hasApiKey).toBe(true);
      expect(snapshot.providers[0]?.apiKey).toBeUndefined();

      const routed = registry.getProvider(gatewayId);
      expect(routed?.apiKey).toBe("sk-secret");
    });
  });

  it("keeps the stored key on save without one and clears it on an empty key", async () => {
    await withRegistry(async (registry) => {
      await registry.save({
        id: gatewayId,
        name: "My Gateway",
        wireFormat: "openai-chat",
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-secret",
      });
      await registry.save({
        id: gatewayId,
        name: "My Gateway",
        wireFormat: "openai-chat",
        baseUrl: "https://api.example.com/v1",
      });
      expect(registry.getProvider(gatewayId)?.apiKey).toBe("sk-secret");

      await registry.save({
        id: gatewayId,
        name: "My Gateway",
        wireFormat: "openai-chat",
        baseUrl: "https://api.example.com/v1",
        apiKey: "",
      });
      expect(registry.getProvider(gatewayId)?.apiKey).toBeUndefined();
      expect(registry.getProvider(gatewayId)?.hasApiKey).toBeUndefined();
    });
  });

  it("merges custom headers on save and redacts header values from snapshots", async () => {
    await withRegistry(async (registry) => {
      await registry.save({
        id: gatewayId,
        name: "My Gateway",
        wireFormat: "openai-chat",
        baseUrl: "https://api.example.com/v1",
        headers: [
          { name: "X-Custom", value: "abc" },
          { name: "X-Keep", value: "secret" },
        ],
      });
      const snapshot = registry.snapshot();
      expect(snapshot.providers[0]?.headers).toEqual([
        { name: "X-Custom", hasValue: true },
        { name: "X-Keep", hasValue: true },
      ]);
      // The stored values survive for host-side routing only.
      expect(registry.getProvider(gatewayId)?.headers).toEqual([
        { name: "X-Custom", value: "abc" },
        { name: "X-Keep", value: "secret" },
      ]);

      // An omitted value keeps the stored one; an empty value clears it.
      await registry.save({
        id: gatewayId,
        name: "My Gateway",
        wireFormat: "openai-chat",
        baseUrl: "https://api.example.com/v1",
        headers: [{ name: "X-Custom", value: "" }, { name: "X-Keep" }],
      });
      expect(registry.getProvider(gatewayId)?.headers).toEqual([
        { name: "X-Keep", value: "secret" },
      ]);
    });
  });

  it("deduplicates pool entries and rejects unknown providers", async () => {
    await withRegistry(async (registry) => {
      await registry.save({
        id: gatewayId,
        name: "My Gateway",
        wireFormat: "openai-chat",
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-secret",
      });
      await registry.addPoolEntry({ modelId: "gpt-5", label: "GPT-5", providerId: gatewayId });
      await registry.addPoolEntry({ modelId: "gpt-5", providerId: gatewayId });
      expect(registry.listPool()).toHaveLength(1);
      expect(registry.listPool()[0]?.label).toBe("GPT-5");

      await expect(
        registry.addPoolEntry({ modelId: "unknown-model", providerId: claudeId }),
      ).rejects.toThrow("Unknown model provider");
    });
  });

  it("keeps the context window and derives the wire format on pool adds", async () => {
    await withRegistry(async (registry) => {
      await registry.save({
        id: gatewayId,
        name: "My Gateway",
        wireFormat: "openai-chat",
        baseUrl: "https://api.example.com/v1",
      });
      await registry.addPoolEntry({
        modelId: "gpt-5",
        label: "GPT-5",
        providerId: gatewayId,
        contextWindow: 200_000,
      });
      expect(registry.listPool()[0]).toMatchObject({
        modelId: "gpt-5",
        providerId: gatewayId,
        wireFormat: "openai-chat",
        contextWindow: 200_000,
      });
    });
  });

  it("removes a provider and its pool entries together", async () => {
    await withRegistry(async (registry) => {
      await registry.save({
        id: gatewayId,
        name: "My Gateway",
        wireFormat: "openai-chat",
        baseUrl: "https://api.example.com/v1",
      });
      await registry.addPoolEntry({ modelId: "gpt-5", providerId: gatewayId });
      await registry.remove(gatewayId);

      expect(registry.snapshot()).toEqual({ providers: [], pool: [] });
    });
  });

  it("lists one default route per wire format, keeping the first configured source", async () => {
    await withRegistry(async (registry) => {
      await registry.save({
        id: gatewayId,
        name: "First OpenAI",
        wireFormat: "openai-chat",
        baseUrl: "https://api.example.com/v1",
      });
      await registry.save({
        id: claudeId,
        name: "Claude Direct",
        wireFormat: "anthropic",
        baseUrl: "https://api.anthropic.com",
      });
      await registry.save({
        id: modelProviderIdSchema.parse("second-openai"),
        name: "Second OpenAI",
        wireFormat: "openai-chat",
        baseUrl: "https://second.example.com/v1",
      });

      expect(registry.defaultProviderForWireFormat("openai-chat")?.id).toBe(gatewayId);
      expect(registry.defaultProviderForWireFormat("openai-responses")).toBeNull();
      expect(registry.listDefaultRoutes()).toEqual([
        { wireFormat: "openai-chat", providerId: gatewayId },
        { wireFormat: "anthropic", providerId: claudeId },
      ]);
    });
  });

  it("migrates a v1 store: remaps openai/anthropic and drops local sources", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "codexhost-registry-"));
    try {
      const storePath = path.join(directory, "model-providers.json");
      await writeFile(
        storePath,
        JSON.stringify({
          version: 1,
          providers: [
            {
              id: "my-gateway",
              name: "My Gateway",
              protocol: "openai",
              baseUrl: "https://api.example.com/v1",
              apiKey: "sk-secret",
            },
            {
              id: "claude-direct",
              name: "Claude Direct",
              protocol: "anthropic",
              baseUrl: "https://api.anthropic.com",
            },
            {
              id: "local-ollama",
              name: "Ollama",
              protocol: "ollama",
              baseUrl: "http://localhost:11434",
            },
            {
              id: "local-lmstudio",
              name: "LM Studio",
              protocol: "lmstudio",
              baseUrl: "http://localhost:1234",
            },
          ],
          pool: [
            { modelId: "gpt-5", label: "GPT-5", providerId: "my-gateway", protocol: "openai" },
            { modelId: "claude-sonnet-5", providerId: "claude-direct", protocol: "anthropic" },
            { modelId: "qwen2", providerId: "local-ollama", protocol: "ollama" },
          ],
        }),
        "utf8",
      );
      const registry = new ModelProviderRegistry(storePath);
      await registry.initialize();

      expect(registry.getProvider(gatewayId)).toMatchObject({
        name: "My Gateway",
        wireFormat: "openai-chat",
        apiKey: "sk-secret",
      });
      expect(registry.getProvider(claudeId)).toMatchObject({ wireFormat: "anthropic" });
      expect(registry.getProvider(modelProviderIdSchema.parse("local-ollama"))).toBeNull();
      expect(registry.getProvider(modelProviderIdSchema.parse("local-lmstudio"))).toBeNull();
      expect(registry.listPool()).toEqual([
        {
          modelId: "gpt-5",
          label: "GPT-5",
          providerId: gatewayId,
          wireFormat: "openai-chat",
        },
        { modelId: "claude-sonnet-5", providerId: claudeId, wireFormat: "anthropic" },
      ]);

      // The migrated store is repersisted under the current version.
      const persisted = JSON.parse(await readFile(storePath, "utf8"));
      expect(persisted.version).toBe(2);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("persists the store with a version marker", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "codexhost-registry-"));
    try {
      const storePath = path.join(directory, "model-providers.json");
      const registry = new ModelProviderRegistry(storePath);
      await registry.initialize();
      await registry.save({
        id: gatewayId,
        name: "My Gateway",
        wireFormat: "openai-chat",
        baseUrl: "https://api.example.com/v1",
      });

      const persisted = JSON.parse(await readFile(storePath, "utf8"));
      expect(persisted.version).toBe(2);
      expect(persisted.providers[0]).toMatchObject({
        id: gatewayId,
        name: "My Gateway",
        wireFormat: "openai-chat",
        baseUrl: "https://api.example.com/v1",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
