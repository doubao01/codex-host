import { Buffer } from "node:buffer";
import path from "node:path";

import { createTwoFilesPatch } from "diff";

import type { HostFileChange } from "@codexhost/harness-adapter";

/**
 * Antigravity headless stream steps do not carry a structured diff payload, so
 * File Change evidence is derived from a completed file-mutating tool's own
 * parameters (path + content). This mirrors the Grok adapter's rule: only a
 * verifiable success terminal state projects a File Change, and the diff is
 * generated locally from native before/after text without reading the
 * post-write file or inspecting Git.
 */

export const DEFAULT_ANTIGRAVITY_FILE_CHANGE_TEXT_LIMIT = 4 * 1024 * 1024;

/** agy write/edit tool names that carry their full target content in parameters. */
const FILE_MUTATING_TOOL_NAMES = new Set([
  "write_file",
  "write-file",
  "writefile",
  "create_file",
  "create-file",
  "createfile",
  "edit_file",
  "edit-file",
  "editfile",
  "replace_file",
  "replace-file",
  "replacefile",
  "overwrite_file",
  "overwrite-file",
  "str_replace_editor",
  "str_replace_based_edit_tool",
  "text_editor",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validAbsolutePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    path.isAbsolute(value) &&
    value.trim().length > 0 &&
    !value.includes("\0") &&
    !value.includes("\n") &&
    !value.includes("\r")
  );
}

function displayPath(nativePath: string, cwd: string): { path: string; absolute: boolean } | null {
  const resolvedCwd = path.resolve(cwd);
  const resolvedPath = path.resolve(nativePath);
  const relative = path.relative(resolvedCwd, resolvedPath);
  const inside = relative.length > 0 && relative !== ".." && !relative.startsWith(`..${path.sep}`);
  const selected = inside ? relative : resolvedPath;
  const normalized = selected.replaceAll("\\", "/");
  if (normalized.length === 0 || normalized === ".") return null;
  return { path: normalized, absolute: !inside };
}

interface FileToolEvidence {
  path: string;
  newText: string;
  oldText: string | null;
}

/**
 * Accepts a completed file-mutating tool's parameters when they name an
 * absolute path and carry full file content. `command` style editors are
 * rejected because the Adapter cannot prove what the tool actually changed.
 */
function fileToolEvidence(parameters: unknown): FileToolEvidence | null {
  if (!isRecord(parameters)) return null;
  const candidate = parameters.path ?? parameters.file_path ?? parameters.file ?? parameters.target;
  if (!validAbsolutePath(candidate)) return null;
  const content = parameters.content ?? parameters.new_string ?? parameters.new_text;
  if (typeof content !== "string") return null;
  const oldContent = parameters.old_string ?? parameters.old_text;
  return {
    path: candidate,
    newText: content,
    oldText: typeof oldContent === "string" ? oldContent : null,
  };
}

function projectEvidence(
  evidence: FileToolEvidence,
  cwd: string,
  remainingTextBytes: number,
): { change: HostFileChange; textBytes: number } | null {
  if (evidence.oldText !== null && evidence.oldText === evidence.newText) return null;
  const textBytes =
    Buffer.byteLength(evidence.oldText ?? "", "utf8") + Buffer.byteLength(evidence.newText, "utf8");
  if (textBytes > remainingTextBytes) return null;
  const displayed = displayPath(evidence.path, cwd);
  if (!displayed) return null;
  const kind = evidence.oldText === null ? "add" : "update";
  const oldHeader =
    kind === "add" ? "/dev/null" : displayed.absolute ? displayed.path : `a/${displayed.path}`;
  const newHeader = displayed.absolute ? displayed.path : `b/${displayed.path}`;
  return {
    change: {
      path: displayed.path,
      kind,
      unifiedDiff: createTwoFilesPatch(
        oldHeader,
        newHeader,
        evidence.oldText ?? "",
        evidence.newText,
        "",
        "",
        {
          context: 3,
        },
      ),
    },
    textBytes,
  };
}

/**
 * Projects File Changes from one completed Antigravity tool step. Returns null
 * for read-only, failed, deletion, or unparsable tools: without a provable
 * before state the Adapter does not guess a diff.
 */
export function projectAntigravityToolFileChanges(
  toolName: string,
  parameters: unknown,
  cwd: string,
  textLimit = DEFAULT_ANTIGRAVITY_FILE_CHANGE_TEXT_LIMIT,
): HostFileChange[] | null {
  if (!Number.isSafeInteger(textLimit) || textLimit <= 0) return null;
  if (!FILE_MUTATING_TOOL_NAMES.has(toolName.trim().toLowerCase())) return null;
  const evidence = fileToolEvidence(parameters);
  if (!evidence) return null;
  const projected = projectEvidence(evidence, cwd, textLimit);
  return projected ? [projected.change] : null;
}
