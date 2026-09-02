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
        protocol: "openai",
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
        protocol: "openai",
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-secret",
      });
      await registry.save({
        id: gatewayId,
        name: "My Gateway",
        protocol: "openai",
        baseUrl: "https://api.example.com/v1",
      });
      expect(registry.getProvider(gatewayId)?.apiKey).toBe("sk-secret");

      await registry.save({
        id: gatewayId,
        name: "My Gateway",
        protocol: "openai",
        baseUrl: "https://api.example.com/v1",
        apiKey: "",
      });
      expect(registry.getProvider(gatewayId)?.apiKey).toBeUndefined();
      expect(registry.getProvider(gatewayId)?.hasApiKey).toBeUndefined();
    });
  });

  it("deduplicates pool entries and rejects unknown providers", async () => {
    await withRegistry(async (registry) => {
      await registry.save({
        id: gatewayId,
        name: "My Gateway",
        protocol: "openai",
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

  it("removes a provider and its pool entries together", async () => {
    await withRegistry(async (registry) => {
      await registry.save({
        id: gatewayId,
        name: "My Gateway",
        protocol: "openai",
        baseUrl: "https://api.example.com/v1",
      });
      await registry.addPoolEntry({ modelId: "gpt-5", providerId: gatewayId });
      await registry.remove(gatewayId);

      expect(registry.snapshot()).toEqual({ providers: [], pool: [] });
    });
  });

  it("lists one default route per protocol, keeping the first configured source", async () => {
    await withRegistry(async (registry) => {
      await registry.save({
        id: gatewayId,
        name: "First OpenAI",
        protocol: "openai",
        baseUrl: "https://api.example.com/v1",
      });
      await registry.save({
        id: claudeId,
        name: "Claude Direct",
        protocol: "anthropic",
        baseUrl: "https://api.anthropic.com",
      });
      await registry.save({
        id: modelProviderIdSchema.parse("second-openai"),
        name: "Second OpenAI",
        protocol: "openai",
        baseUrl: "https://second.example.com/v1",
      });

      expect(registry.defaultProviderForProtocol("openai")?.id).toBe(gatewayId);
      expect(registry.listDefaultRoutes()).toEqual([
        { protocol: "openai", providerId: gatewayId },
        { protocol: "anthropic", providerId: claudeId },
      ]);
    });
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
        protocol: "openai",
        baseUrl: "https://api.example.com/v1",
      });

      const persisted = JSON.parse(await readFile(storePath, "utf8"));
      expect(persisted.version).toBe(1);
      expect(persisted.providers[0]).toMatchObject({
        id: gatewayId,
        name: "My Gateway",
        protocol: "openai",
        baseUrl: "https://api.example.com/v1",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
