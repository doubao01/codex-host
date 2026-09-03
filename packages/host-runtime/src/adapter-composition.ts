import { AntigravityAdapter } from "@codexhost/adapter-antigravity";
import { ClaudeCodeAdapter } from "@codexhost/adapter-claude-code";
import { DeepSeekHarnessAdapter } from "@codexhost/adapter-deepseek-harness";
import { GrokAdapter } from "@codexhost/adapter-grok";
import { OpenCodeAdapter } from "@codexhost/adapter-opencode";
import { PiAdapter } from "@codexhost/adapter-pi";
import { OmpAdapter } from "@codexhost/adapter-omp";
import { BrokeredHarnessAdapter } from "@codexhost/harness-broker";
import type { HarnessAdapter } from "@codexhost/harness-adapter";
import type { ExternalHarnessId } from "@codexhost/protocol-core";
import { HarnessRegistry, type HarnessManifest } from "@codexhost/shared-contracts";

export const CLAUDE_CODE_COMMAND_ENV = "CODEXHOST_CLAUDE_COMMAND";
export const DEEPSEEK_HARNESS_COMMAND_ENV = "CODEXHOST_DEEPSEEK_HARNESS_COMMAND";
export const DEEPSEEK_HARNESS_ENDPOINT_ENV = "CODEXHOST_DEEPSEEK_HARNESS_ENDPOINT";
export const PI_COMMAND_ENV = "CODEXHOST_PI_COMMAND";
export const GROK_COMMAND_ENV = "CODEXHOST_GROK_COMMAND";
export const OMP_COMMAND_ENV = "CODEXHOST_OMP_COMMAND";
export const OPENCODE_COMMAND_ENV = "CODEXHOST_OPENCODE_COMMAND";
export const ANTIGRAVITY_COMMAND_ENV = "CODEXHOST_ANTIGRAVITY_COMMAND";

type InspectableHarnessAdapter = Pick<HarnessAdapter, "inspect">;

export type HarnessCapability = HarnessManifest["capabilities"][number];

export interface HarnessCapabilityProjection {
  id: ExternalHarnessId;
  displayName: string;
  capabilities: readonly HarnessCapability[];
  supports(capability: HarnessCapability): boolean;
}

export function projectHarnessCapabilities(
  registry: HarnessRegistry,
  harnessId: ExternalHarnessId,
): HarnessCapabilityProjection | null {
  const manifest = registry.get(harnessId);
  if (!manifest) return null;
  return {
    id: manifest.id as ExternalHarnessId,
    displayName: manifest.displayName,
    capabilities: manifest.capabilities,
    supports: (capability) => manifest.capabilities.includes(capability),
  };
}
export function createExternalHarnessRegistry(): HarnessRegistry {
  const registry = new HarnessRegistry();
  const manifests: HarnessManifest[] = [
    { id: "pi", displayName: "Pi", capabilities: ["streaming", "models", "thinking", "permissions", "history"] },
    { id: "claude-code", displayName: "Claude Code", capabilities: ["streaming", "models", "permissions", "questions", "history"] },
    { id: "deepseek-harness", displayName: "DeepSeek Harness", capabilities: ["streaming", "models", "thinking", "history"] },
    { id: "opencode", displayName: "OpenCode", capabilities: ["streaming", "models", "permissions", "questions", "history"] },
    { id: "grok", displayName: "Grok", capabilities: ["streaming", "models", "thinking", "history"] },
    { id: "omp", displayName: "OMP", capabilities: ["streaming", "models", "thinking", "permissions", "history"] },
    { id: "antigravity", displayName: "Antigravity", capabilities: ["streaming", "models", "thinking", "permissions", "questions", "history", "fork"] },
  ];
  for (const manifest of manifests) registry.register(manifest);
  return registry;
}


export async function prefetchClaudeCodeModelCatalog(
  adapters: ReadonlyMap<ExternalHarnessId, InspectableHarnessAdapter>,
): Promise<void> {
  try {
    await adapters.get("claude-code")?.inspect();
  } catch {
    // Startup prefetch must not affect official Codex or another Harness.
  }
}

export async function prefetchAntigravityModelCatalog(
  adapters: ReadonlyMap<ExternalHarnessId, InspectableHarnessAdapter>,
): Promise<void> {
  try {
    await adapters.get("antigravity")?.inspect();
  } catch {
    // Startup prefetch must not affect official Codex or another Harness.
  }
}

export function createExternalHarnessAdapters(
  environment: NodeJS.ProcessEnv,
  options: {
    platform?: NodeJS.Platform;
    managedRemoteHost?: boolean;
    brokerDescriptorPath?: string;
  } = {},
): ReadonlyMap<ExternalHarnessId, HarnessAdapter> {
  const claudeAdapter =
    (options.platform ?? process.platform) === "darwin" && options.managedRemoteHost === true
      ? new BrokeredHarnessAdapter({
          environment,
          ...(options.brokerDescriptorPath ? { descriptorPath: options.brokerDescriptorPath } : {}),
        })
      : new ClaudeCodeAdapter({
          ...(environment[CLAUDE_CODE_COMMAND_ENV]
            ? { command: environment[CLAUDE_CODE_COMMAND_ENV] }
            : {}),
          environment,
        });
  return new Map<ExternalHarnessId, HarnessAdapter>([
    [
      "pi",
      new PiAdapter({
        ...(environment[PI_COMMAND_ENV] ? { command: environment[PI_COMMAND_ENV] } : {}),
        environment,
      }),
    ],
    ["claude-code", claudeAdapter],
    [
      "deepseek-harness",
      new DeepSeekHarnessAdapter({
        ...(environment[DEEPSEEK_HARNESS_COMMAND_ENV]
          ? { command: environment[DEEPSEEK_HARNESS_COMMAND_ENV] }
          : {}),
        ...(environment[DEEPSEEK_HARNESS_ENDPOINT_ENV]
          ? { endpoint: environment[DEEPSEEK_HARNESS_ENDPOINT_ENV] }
          : {}),
        environment,
      }),
    ],
    [
      "opencode",
      new OpenCodeAdapter({
        ...(environment[OPENCODE_COMMAND_ENV]
          ? { command: environment[OPENCODE_COMMAND_ENV] }
          : {}),
        environment,
      }),
    ],
    [
      "grok",
      new GrokAdapter({
        ...(environment[GROK_COMMAND_ENV] ? { command: environment[GROK_COMMAND_ENV] } : {}),
        environment,
      }),
    ],
    [
      "omp",
      new OmpAdapter({
        ...(environment[OMP_COMMAND_ENV] ? { command: environment[OMP_COMMAND_ENV] } : {}),
        environment,
      }),
    ],
    [
      "antigravity",
      new AntigravityAdapter({
        ...(environment[ANTIGRAVITY_COMMAND_ENV]
          ? { command: environment[ANTIGRAVITY_COMMAND_ENV] }
          : {}),
        environment,
      }),
    ],
  ]);
}
