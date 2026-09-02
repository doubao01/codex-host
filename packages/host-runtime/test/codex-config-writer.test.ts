import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseToml } from "@iarna/toml";
import { describe, expect, it } from "vitest";

import {
  CODEX_GATEWAY_PROVIDER_ID,
  removeCodexGatewayProvider,
  syncCodexGatewayProvider,
  writeCodexGatewayProvider,
} from "../src/codex-config-writer.js";

async function withConfigDirectory(
  run: (configPath: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "codexhost-config-"));
  try {
    await run(path.join(directory, "config.toml"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function gatewayProvider(configPath: string): Promise<Record<string, unknown> | undefined> {
  const parsed = parseToml(await readFile(configPath, "utf8")) as {
    model_providers?: Record<string, Record<string, unknown>>;
  };
  return parsed.model_providers?.[CODEX_GATEWAY_PROVIDER_ID];
}

describe("Codex config writer", () => {
  it("creates the gateway provider when no config file exists", async () => {
    await withConfigDirectory(async (configPath) => {
      const result = await writeCodexGatewayProvider({
        configPath,
        endpoint: "http://127.0.0.1:54321",
        token: "synthetic-token",
      });
      expect(result.wroteBackup).toBe(false);

      await expect(gatewayProvider(configPath)).resolves.toEqual({
        base_url: "http://127.0.0.1:54321",
        wire_api: "responses",
        http_headers: ["Authorization: Bearer synthetic-token"],
      });
    });
  });

  it("merges into an existing config, backing up the original", async () => {
    await withConfigDirectory(async (configPath) => {
      await writeFile(
        configPath,
        [
          `model = "gpt-5"`,
          `[model_providers.other]`,
          `name = "Other"`,
          `base_url = "https://other.example.com/v1"`,
          ``,
        ].join("\n"),
        "utf8",
      );

      const result = await writeCodexGatewayProvider({
        configPath,
        endpoint: "http://127.0.0.1:54321",
        token: "synthetic-token",
      });
      expect(result.wroteBackup).toBe(true);

      const written = parseToml(await readFile(configPath, "utf8")) as {
        model?: string;
        model_providers?: Record<string, Record<string, unknown>>;
      };
      expect(written.model).toBe("gpt-5");
      expect(written.model_providers?.["other"]).toMatchObject({
        name: "Other",
        base_url: "https://other.example.com/v1",
      });
      await expect(gatewayProvider(configPath)).resolves.toMatchObject({
        base_url: "http://127.0.0.1:54321",
      });

      const backups = (await readdir(path.dirname(configPath))).filter((name) =>
        name.endsWith(".bak"),
      );
      expect(backups).toHaveLength(1);
      await expect(readFile(path.join(path.dirname(configPath), backups[0] ?? ""), "utf8")).resolves.toContain(
        "model_providers.other",
      );
    });
  });

  it("removes the gateway provider and keeps other providers", async () => {
    await withConfigDirectory(async (configPath) => {
      await writeFile(
        configPath,
        [
          `[model_providers.other]`,
          `name = "Other"`,
          `base_url = "https://other.example.com/v1"`,
          ``,
          `[model_providers.codexhost-gateway]`,
          `base_url = "http://127.0.0.1:54321"`,
          ``,
        ].join("\n"),
        "utf8",
      );

      const removed = await removeCodexGatewayProvider({ configPath });
      expect(removed).toBe(true);

      const written = parseToml(await readFile(configPath, "utf8")) as {
        model_providers?: Record<string, Record<string, unknown>>;
      };
      expect(written.model_providers?.[CODEX_GATEWAY_PROVIDER_ID]).toBeUndefined();
      expect(written.model_providers?.["other"]).toBeDefined();

      await expect(gatewayProvider(configPath)).resolves.toBeUndefined();
    });
  });

  it("does not rewrite when the gateway provider is absent", async () => {
    await withConfigDirectory(async (configPath) => {
      await writeFile(configPath, `model = "gpt-5"\n`, "utf8");
      const removed = await removeCodexGatewayProvider({ configPath });
      expect(removed).toBe(false);
      await expect(readFile(configPath, "utf8")).resolves.toBe(`model = "gpt-5"\n`);
    });
  });

  it("removes the whole provider table when it is the last provider", async () => {
    await withConfigDirectory(async (configPath) => {
      await writeFile(
        configPath,
        `[model_providers.codexhost-gateway]\nbase_url = "http://127.0.0.1:54321"\n`,
        "utf8",
      );
      await removeCodexGatewayProvider({ configPath });

      const written = parseToml(await readFile(configPath, "utf8")) as {
        model_providers?: Record<string, unknown>;
      };
      expect(written.model_providers).toBeUndefined();
    });
  });

  it("syncs to a removal when no OpenAI-compatible source is configured", async () => {
    await withConfigDirectory(async (configPath) => {
      await writeCodexGatewayProvider({
        configPath,
        endpoint: "http://127.0.0.1:54321",
        token: "synthetic-token",
      });
      await syncCodexGatewayProvider({
        configPath,
        hasOpenAiProvider: false,
        endpoint: "http://127.0.0.1:54321",
        token: "synthetic-token",
      });

      await expect(gatewayProvider(configPath)).resolves.toBeUndefined();
    });
  });
});
