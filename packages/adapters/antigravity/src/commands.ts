/**
 * Antigravity CLI slash commands answered by the CLI itself.
 *
 * The CLI rejects slash commands on `--input-format stream-json`, so each
 * command runs as its own `--print=/<command>` invocation (the same mechanism
 * the quota reader uses for `/usage`). The CLI answers with a `command_result`
 * event followed by a terminal `result` event on stdout.
 */

import {
  hostTurnIdSchema,
  harnessCommandCatalogSchema,
  type HarnessCommandCatalog,
  type HostTurnId,
} from "@codexhost/shared-contracts";
import type { HarnessCommandInvocation } from "@codexhost/harness-adapter";

import { isRecord, parseAntigravityStreamLine } from "./stream-events.js";

/** Runs the Antigravity CLI with the given arguments and resolves stdout. */
export type AntigravityCommandRunner = (arguments_: readonly string[]) => Promise<string>;

const COMMAND_CATALOG: HarnessCommandCatalog = harnessCommandCatalogSchema.parse({
  commands: [
    {
      id: "antigravity.help",
      invocation: "/help",
      label: "Help",
      description: "List the commands print mode answers",
      argumentMode: "none",
    },
    {
      id: "antigravity.config",
      invocation: "/config",
      label: "Config",
      description: "Print the current configuration",
      argumentMode: "none",
    },
    {
      id: "antigravity.permissions",
      invocation: "/permissions",
      label: "Permissions",
      description: "Print the current permission rules",
      argumentMode: "none",
    },
    {
      id: "antigravity.hooks",
      invocation: "/hooks",
      label: "Hooks",
      description: "Print the configured hooks",
      argumentMode: "none",
    },
    {
      id: "antigravity.usage",
      invocation: "/usage",
      label: "Usage",
      description: "Print the current plan limits",
      argumentMode: "none",
    },
  ],
});

interface CommandDescriptor {
  id: string;
  invocation: string;
  argumentMode: "none" | "text";
}

function commandDescriptor(commandId: string): CommandDescriptor | undefined {
  for (const command of COMMAND_CATALOG.commands) {
    if (command.id === commandId) {
      return { id: command.id, invocation: command.invocation, argumentMode: command.argumentMode };
    }
  }
  return undefined;
}

/** Extracts the human-readable answer the CLI attached to a command_result. */
export function parseAntigravityCommandText(command: unknown): string | null {
  if (!isRecord(command)) return null;
  const data = isRecord(command.data) ? command.data : undefined;
  const candidates = [command.output, command.result, data?.output, data?.result, command.text];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return null;
}

export class AntigravityCommandError extends Error {
  readonly kind: "unsupported" | "invalidRequest" | "nativeFailure";

  constructor(kind: "unsupported" | "invalidRequest" | "nativeFailure", message: string) {
    super(message);
    this.name = "AntigravityCommandError";
    this.kind = kind;
  }
}

/**
 * Runs one print-mode slash command and returns the CLI's text answer.
 * `turnId` is accepted for signature parity with the capability surface; the
 * print-mode invocation does not create a Host Turn.
 */
export async function runAntigravityCommand(
  run: AntigravityCommandRunner,
  command: HarnessCommandInvocation,
): Promise<string> {
  const descriptor = commandDescriptor(command.commandId);
  if (!descriptor) {
    throw new AntigravityCommandError(
      "unsupported",
      `Antigravity does not expose Harness command '${command.commandId}'`,
    );
  }
  const argumentKeys = Object.keys(command.arguments ?? {});
  if (argumentKeys.length > 0) {
    if (descriptor.argumentMode !== "text") {
      throw new AntigravityCommandError(
        "invalidRequest",
        `Antigravity command '${descriptor.invocation}' does not accept arguments`,
      );
    }
    const text = command.arguments?.text;
    if (typeof text !== "string" || !text.trim()) {
      throw new AntigravityCommandError(
        "invalidRequest",
        "Antigravity command argument 'text' must be a non-empty string",
      );
    }
  }
  const invocationArguments = [
    `--print=${descriptor.invocation}`,
    "--output-format",
    "stream-json",
  ];
  if (descriptor.argumentMode === "text") {
    const text = command.arguments?.text;
    if (typeof text === "string") invocationArguments.push(text);
  }
  let stdout: string;
  try {
    stdout = await run(invocationArguments);
  } catch (error) {
    throw new AntigravityCommandError(
      "nativeFailure",
      error instanceof Error ? error.message : String(error),
    );
  }
  for (const line of stdout.split(/\r?\n/u)) {
    const event = parseAntigravityStreamLine(line);
    if (event?.event !== "command_result") continue;
    const text = parseAntigravityCommandText(event.command);
    if (text) return text;
  }
  throw new AntigravityCommandError(
    "nativeFailure",
    `Antigravity CLI returned no answer for '${descriptor.invocation}'`,
  );
}

export function antigravityCommandTurnId(turnId: string): HostTurnId {
  return hostTurnIdSchema.parse(turnId);
}

export const antigravityCommandCatalog: HarnessCommandCatalog = COMMAND_CATALOG;
