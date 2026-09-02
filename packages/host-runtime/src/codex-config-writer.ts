import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseToml, stringify as stringifyToml, type JsonMap } from "@iarna/toml";

export const CODEX_GATEWAY_PROVIDER_ID = "codexhost-gateway";

export interface CodexConfigWriterInput {
  configPath: string;
  /** The local Gateway endpoint, e.g. `http://127.0.0.1:54321`. */
  endpoint: string;
  /** The session token the Gateway issues; sent as a Bearer credential. */
  token: string;
}

export interface CodexConfigWriterResult {
  wroteBackup: boolean;
}

export interface CodexConfigFileSystem {
  readFile: typeof readFile;
  writeFile: typeof writeFile;
}

/**
 * Merges the local Model Gateway into `~/.codex/config.toml` as a custom
 * provider so the official Codex Agent routes its model traffic through the
 * codexhost connection pool instead of reaching the provider directly.
 *
 * The original file is backed up before rewriting. Rewriting normalizes the
 * TOML, so hand-written comments are lost on the next write (documented v1
 * trade-off).
 */
export async function writeCodexGatewayProvider(
  input: CodexConfigWriterInput,
  fileSystem: CodexConfigFileSystem = { readFile, writeFile },
): Promise<CodexConfigWriterResult> {
  await mkdir(path.dirname(input.configPath), { recursive: true }).catch(() => undefined);
  const existing: JsonMap = {};
  let wroteBackup = false;
  let originalText: string | null = null;
  try {
    originalText = await fileSystem.readFile(input.configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (originalText !== null && originalText.trim().length > 0) {
    Object.assign(existing, parseToml(originalText));
    await fileSystem.writeFile(
      `${input.configPath}.codexhost-${Date.now()}.bak`,
      originalText,
      "utf8",
    );
    wroteBackup = true;
  }

  const modelProviders = (existing.model_providers as JsonMap | undefined) ?? {};
  modelProviders[CODEX_GATEWAY_PROVIDER_ID] = {
    base_url: input.endpoint,
    wire_api: "responses",
    http_headers: [`Authorization: Bearer ${input.token}`],
  };
  existing.model_providers = modelProviders;

  const serialized = stringifyToml(existing);
  await fileSystem.writeFile(input.configPath, serialized.endsWith("\n") ? serialized : `${serialized}\n`, "utf8");
  return { wroteBackup };
}

/** Resolves the Codex config path, overridable for tests. */
export function defaultCodexConfigPath(environment: NodeJS.ProcessEnv): string {
  return environment.CODEXHOST_CODEX_CONFIG_PATH ?? path.join(os.homedir(), ".codex", "config.toml");
}

/**
 * Removes the codexhost-gateway provider from `~/.codex/config.toml`, backing
 * up the original first. Returns whether the file was actually rewritten.
 */
export async function removeCodexGatewayProvider(
  input: { configPath: string },
  fileSystem: CodexConfigFileSystem = { readFile, writeFile },
): Promise<boolean> {
  let originalText: string | null = null;
  try {
    originalText = await fileSystem.readFile(input.configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (originalText === null || originalText.trim().length === 0) return false;
  const existing: JsonMap = parseToml(originalText);
  const modelProviders = existing.model_providers as JsonMap | undefined;
  if (!modelProviders || !(CODEX_GATEWAY_PROVIDER_ID in modelProviders)) return false;
  const remaining = Object.fromEntries(
    Object.entries(modelProviders).filter(([id]) => id !== CODEX_GATEWAY_PROVIDER_ID),
  );
  if (Object.keys(remaining).length === 0) {
    delete existing.model_providers;
  } else {
    existing.model_providers = remaining;
  }
  await fileSystem.writeFile(`${input.configPath}.codexhost-${Date.now()}.bak`, originalText, "utf8");
  const serialized = stringifyToml(existing);
  await fileSystem.writeFile(input.configPath, serialized.endsWith("\n") ? serialized : `${serialized}\n`, "utf8");
  return true;
}

/**
 * Keeps the Codex native provider in sync with the configured sources: writes
 * the gateway provider when an OpenAI-compatible source exists, otherwise
 * removes it so Codex does not route through a stale gateway.
 */
export async function syncCodexGatewayProvider(input: {
  configPath: string;
  hasOpenAiProvider: boolean;
  endpoint: string;
  token: string;
  fileSystem?: CodexConfigFileSystem;
}): Promise<void> {
  if (input.hasOpenAiProvider) {
    await writeCodexGatewayProvider(
      { configPath: input.configPath, endpoint: input.endpoint, token: input.token },
      input.fileSystem,
    );
  } else {
    await removeCodexGatewayProvider({ configPath: input.configPath }, input.fileSystem);
  }
}
