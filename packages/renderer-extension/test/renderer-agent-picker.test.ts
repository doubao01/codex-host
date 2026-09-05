import { describe, expect, it } from "vitest";

import { isNativeModelControlCandidate } from "../src/renderer-composer-dom.js";
import { agentModelPaneState } from "../src/renderer-composer-dom.js";
import { agentModelPanePresentation } from "../src/renderer-agent-model-pane.js";
import {
  rendererAgentMenuPlacement,
  rendererAgentPickerView,
} from "../src/renderer-agent-picker.js";
import {
  harnessModelRefSchema,
  harnessThinkingOptionIdSchema,
  type HarnessModelCatalog,
} from "@codexhost/shared-contracts";

describe("Agent picker Model pane presentation", () => {
  const catalog: HarnessModelCatalog = {
    models: [
      { ref: harnessModelRefSchema.parse({ id: "gpt-5.2" }), label: "gpt-5.2" },
      {
        ref: harnessModelRefSchema.parse({ id: "gemini-3-pro" }),
        label: "gemini-3-pro",
        supportedThinkingOptionIds: [
          harnessThinkingOptionIdSchema.parse("high"),
          harnessThinkingOptionIdSchema.parse("low"),
        ],
      },
    ],
    thinkingOptions: [
      { id: harnessThinkingOptionIdSchema.parse("high"), label: "High" },
      { id: harnessThinkingOptionIdSchema.parse("low"), label: "Low" },
    ],
  } as unknown as HarnessModelCatalog;
  const selected = harnessModelRefSchema.parse({ id: "gemini-3-pro" });

  it("keeps the pane hidden while the catalog loads", () => {
    const presentation = agentModelPanePresentation({ busy: true });
    expect(presentation.modelLabel).toBe("Loading...");
    expect(presentation.rows).toEqual([]);
  });

  it("lists Models and strength segments for a ready catalog", () => {
    const presentation = agentModelPanePresentation({
      catalog,
      selected,
      selectedThinkingOptionId: harnessThinkingOptionIdSchema.parse("low"),
      busy: false,
    });
    expect(presentation.modelLabel).toBe("gemini-3-pro");
    expect(presentation.rows).toEqual([
      { id: "gpt-5.2", label: "gpt-5.2", selected: false, disabled: false },
      { id: "gemini-3-pro", label: "gemini-3-pro", selected: true, disabled: false },
    ]);
    // The catalog default is "high", so the pane leads with the 默认 reset
    // segment, then the native options in catalog order.
    expect(presentation.strengths).toEqual([
      { label: "默认", selected: false, resetsToDefault: true },
      { id: "high", label: "高", selected: false },
      { id: "low", label: "低", selected: true },
    ]);
  });

  it("marks the 默认 segment selected when no explicit tier is pinned", () => {
    const presentation = agentModelPanePresentation({
      catalog,
      selected,
      selectedThinkingOptionId: harnessThinkingOptionIdSchema.parse("high"),
      busy: false,
    });
    expect(presentation.strengths[0]).toEqual({
      label: "默认",
      selected: true,
      resetsToDefault: true,
    });
    expect(presentation.thinkingLabel).toBeUndefined();
  });

  it("hides strength segments when Thinking selection is unsupported", () => {
    const presentation = agentModelPanePresentation({
      catalog,
      selected,
      busy: false,
      thinkingSupported: false,
    });
    expect(presentation.rows).toHaveLength(2);
    expect(presentation.strengths).toEqual([]);
  });

  it("derives the pill Model segment from the composer Model view", () => {
    const state = agentModelPaneState({
      status: "ready",
      catalog,
      selected,
      selectedThinkingOptionId: harnessThinkingOptionIdSchema.parse("high"),
    });
    expect(agentModelPanePresentation(state).modelLabel).toBe("gemini-3-pro");
    expect(
      agentModelPanePresentation({ busy: false, unavailableReason: "offline" }).note,
    ).toBe("offline");
  });
});

describe("Renderer Agent picker presentation", () => {
  it("normalizes viewport coordinates against the Codex window zoom", () => {
    expect(
      rendererAgentMenuPlacement(
        { right: 1_440, top: 1_312 },
        { width: 1_920, height: 1_440 },
        1.6,
      ),
    ).toEqual({ left: 700, bottom: 86 });
  });

  it("falls back to unscaled positioning when the Codex window zoom is unavailable", () => {
    expect(
      rendererAgentMenuPlacement(
        { right: 900, top: 820 },
        { width: 1_200, height: 900 },
        Number.NaN,
      ),
    ).toEqual({ left: 700, bottom: 86 });
  });

  it("keeps a Codex draft switchable while disabling unavailable external Agents", () => {
    expect(
      rendererAgentPickerView({ agent: "codex", phase: "draft" }, "unsupported", false, [
        "codex",
        "pi",
        "claude-code",
        "grok",
      ]),
    ).toEqual({
      label: "Codex",
      triggerDisabled: false,
      nativeModelHidden: false,
      optionDisabled: { codex: false, pi: true, "claude-code": true, grok: true },
      downloadVisible: { pi: false, "claude-code": false, grok: false },
      errorVisible: { pi: false, "claude-code": false, grok: false },
    });
  });

  it("hides the native Model for an external Agent and locks submitted selection", () => {
    expect(
      rendererAgentPickerView({ agent: "pi", phase: "locked" }, "ready", false, ["codex", "pi"], {
        pi: "ready",
      }),
    ).toEqual({
      label: "Pi",
      triggerDisabled: true,
      nativeModelHidden: true,
      optionDisabled: { codex: true, pi: true },
      downloadVisible: { pi: false },
      errorVisible: { pi: false },
    });
  });

  it("hides the native Model and disables all choices while switching", () => {
    expect(
      rendererAgentPickerView({ agent: "codex", phase: "draft" }, "ready", true, ["codex", "pi"]),
    ).toMatchObject({
      triggerDisabled: true,
      nativeModelHidden: true,
      optionDisabled: { codex: true, pi: true },
      downloadVisible: { pi: false },
    });
  });

  it("disables an uninstalled external Agent and exposes its install action", () => {
    expect(
      rendererAgentPickerView({ agent: "codex", phase: "draft" }, "ready", false, ["codex", "pi"], {
        pi: "notInstalled",
      }),
    ).toEqual({
      label: "Codex",
      triggerDisabled: false,
      nativeModelHidden: false,
      optionDisabled: { codex: false, pi: true },
      downloadVisible: { pi: true },
      errorVisible: { pi: false },
    });
  });

  it("surfaces a distinct error action (not the install action) once a Harness fails", () => {
    expect(
      rendererAgentPickerView({ agent: "codex", phase: "draft" }, "ready", false, ["codex", "pi"], {
        pi: "error",
      }),
    ).toEqual({
      label: "Codex",
      triggerDisabled: false,
      nativeModelHidden: false,
      optionDisabled: { codex: false, pi: true },
      downloadVisible: { pi: false },
      errorVisible: { pi: true },
    });
  });

  it("does not treat a first-load check as a connection error", () => {
    expect(
      rendererAgentPickerView({ agent: "codex", phase: "draft" }, "ready", false, ["codex", "pi"], {
        pi: "checking",
      }),
    ).toMatchObject({
      optionDisabled: { codex: false, pi: true },
      downloadVisible: { pi: false },
      errorVisible: { pi: false },
    });
  });

  it("recognizes only the native React Model menu as the Model candidate", () => {
    const element = (
      ownAttributes: readonly string[],
      matches: boolean,
      modelProps: boolean,
      attributes: Readonly<Record<string, string>> = {},
    ) => {
      const candidate = {
        getAttribute: (name: string) => attributes[name] ?? null,
        hasAttribute: (name: string) => ownAttributes.includes(name) || name in attributes,
        matches: () => matches,
      } as unknown as Element;
      Object.defineProperty(candidate, "__reactFiber$test", {
        value: {
          memoizedProps: modelProps
            ? {
                onSelectModel: () => undefined,
                onSelectReasoningEffort: () => undefined,
                reasoningEffort: "medium",
                fallbackPowerSelection: {},
              }
            : {},
        },
      });
      return candidate;
    };

    expect(isNativeModelControlCandidate(element([], true, true))).toBe(true);
    expect(
      isNativeModelControlCandidate(
        element([], true, false, {
          "data-codex-intelligence-trigger": "true",
          "data-composer-navigation-target": "reasoning",
        }),
      ),
    ).toBe(true);
    expect(isNativeModelControlCandidate(element([], true, false))).toBe(false);
    expect(isNativeModelControlCandidate(element([], false, true))).toBe(false);
    expect(
      isNativeModelControlCandidate(element(["data-codexhost-agent-control"], true, true)),
    ).toBe(false);
  });
});
