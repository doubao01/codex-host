import {
  harnessModelCatalogSchema,
  harnessModelRefSchema,
  harnessThinkingOptionIdSchema,
} from "@codexhost/shared-contracts";
import { describe, expect, it } from "vitest";

import {
  rendererModelPickerMainMenuPlacement,
  rendererModelPickerModelMenuPlacement,
  rendererModelPickerStandaloneModelMenuPlacement,
} from "../src/renderer-model-picker-positioning.js";

import {
  isRendererModelPickerDisabled,
  rendererModelPickerPresentation,
  shouldCloseRendererModelPicker,
  syncRendererLabelText,
} from "../src/renderer-model-picker.js";

const model = harnessModelRefSchema.parse({ id: "pi-model-v1.synthetic" });

function catalog(levels: readonly string[]) {
  const thinkingOptions = levels.map((id) => ({
    id: harnessThinkingOptionIdSchema.parse(id),
    label: id === "xhigh" ? "Extra High" : `${id[0]?.toUpperCase() ?? ""}${id.slice(1)}`,
  }));
  return harnessModelCatalogSchema.parse({
    models: [
      {
        ref: model,
        label: "provider / model",
        supportedThinkingOptionIds: thinkingOptions.map(({ id }) => id),
      },
    ],
    defaultModel: model,
    thinkingOptions,
    ...(thinkingOptions[0] ? { defaultThinkingOptionId: thinkingOptions[0].id } : {}),
  });
}

function claudeCatalog(
  options: readonly { id: string; label: string }[],
  defaultThinkingOptionId?: string,
) {
  const thinkingOptions = options.map((option) => ({
    id: harnessThinkingOptionIdSchema.parse(option.id),
    label: option.label,
  }));
  return harnessModelCatalogSchema.parse({
    models: [
      {
        ref: model,
        label: "provider / model",
        supportedThinkingOptionIds: thinkingOptions.map(({ id }) => id),
      },
    ],
    defaultModel: model,
    thinkingOptions,
    ...((defaultThinkingOptionId ?? thinkingOptions[0]?.id)
      ? { defaultThinkingOptionId: defaultThinkingOptionId ?? thinkingOptions[0]?.id }
      : {}),
  });
}

describe("Renderer combined Model and Thinking picker presentation", () => {
  it("anchors the main menu's right edge to the model trigger", () => {
    expect(
      rendererModelPickerMainMenuPlacement(
        { left: 700, right: 900, top: 820 },
        { width: 1200, height: 900 },
        180,
      ),
    ).toEqual({ left: 720, width: 180, bottom: 88 });
  });

  it("keeps the main menu inside the viewport when the trigger is near an edge", () => {
    expect(
      rendererModelPickerMainMenuPlacement(
        { left: 0, right: 50, top: 820 },
        { width: 240, height: 900 },
        180,
      ).left,
    ).toBe(8);
  });

  it("opens the model-only picker directly above the model trigger", () => {
    expect(
      rendererModelPickerStandaloneModelMenuPlacement(
        { left: 700, right: 900, top: 820 },
        { width: 1200, height: 900 },
      ),
    ).toEqual({ left: 620, width: 280, maxHeight: 360, bottom: 88 });
  });

  it("keeps the model submenu top-aligned with the main menu while flipping left", () => {
    expect(
      rendererModelPickerModelMenuPlacement(
        { left: 700, right: 1120, top: 100 },
        { width: 1200, height: 900 },
      ),
    ).toEqual({ left: 416, top: 100, width: 280, maxHeight: 360 });
  });

  it("keeps the model submenu on the right when there is enough space", () => {
    expect(
      rendererModelPickerModelMenuPlacement(
        { left: 100, right: 280, top: 100 },
        { width: 1200, height: 900 },
      ),
    ).toEqual({ left: 284, top: 100, width: 280, maxHeight: 360 });
  });

  it("does not rewrite an unchanged Thinking label", () => {
    let value: string | null = "High";
    let writes = 0;
    const element = {
      get textContent() {
        return value;
      },
      set textContent(next: string | null) {
        writes += 1;
        value = next;
      },
    };

    expect(syncRendererLabelText(element, "High")).toBe(false);
    expect(writes).toBe(0);
    expect(syncRendererLabelText(element, "Extra High")).toBe(true);
    expect(syncRendererLabelText(element, "Extra High")).toBe(false);
    expect(writes).toBe(1);
  });

  it("projects DeepSeek-style (off/low/high) onto 低/高 plus the off row", () => {
    const view = rendererModelPickerPresentation({
      status: "ready",
      catalog: catalog(["off", "low", "high"]),
      selected: model,
      selectedThinkingOptionId: harnessThinkingOptionIdSchema.parse("high"),
    });

    expect(view).toEqual({
      modelLabel: "provider / model",
      thinkingLabel: "高",
      strengthTiers: [
        {
          tier: expect.objectContaining({ key: "low", label: "低" }),
          option: { id: "low", label: "Low" },
        },
        {
          tier: expect.objectContaining({ key: "high", label: "高" }),
          option: { id: "high", label: "High" },
        },
      ],
      otherOptions: [{ id: "off", label: "Off" }],
      defaultCaption: "默认 · Off",
      isUsingDefault: false,
      showThinkingSection: true,
      thinkingSelectionEnabled: true,
    });
    expect(view.strengthTiers.map(({ tier }) => tier.key)).toEqual(["low", "high"]);
    expect(view.strengthTiers.map(({ tier }) => tier.key)).not.toContain("xhigh");
    expect(view.strengthTiers.map(({ tier }) => tier.key)).not.toContain("max");
  });

  it("shows Claude runtime-resolved Model display without exposing Thinking controls", () => {
    const claudeModel = harnessModelRefSchema.parse({ id: "claude-model-v1.c29ubmV0" });
    const claudeCatalog = harnessModelCatalogSchema.parse({
      models: [
        {
          ref: claudeModel,
          label: "Family alias",
          resolvedModelLabel: "runtime-custom",
          supportedThinkingOptionIds: ["low", "high"],
        },
      ],
      defaultModel: claudeModel,
      thinkingOptions: [
        { id: "low", label: "Low" },
        { id: "high", label: "High" },
      ],
    });

    expect(
      rendererModelPickerPresentation({
        status: "ready",
        catalog: claudeCatalog,
        selected: claudeModel,
        thinkingSelectionSupported: false,
      }),
    ).toEqual({
      modelLabel: "Family alias",
      resolvedModelLabel: "runtime-custom",
      strengthTiers: [],
      otherOptions: [],
      isUsingDefault: true,
      showThinkingSection: false,
      thinkingSelectionEnabled: false,
    });
  });

  it("projects Claude-style (off/auto/high) with the default row selected", () => {
    expect(
      rendererModelPickerPresentation({
        status: "ready",
        catalog: claudeCatalog(
          [
            { id: "off", label: "Off" },
            { id: "auto", label: "Auto" },
            { id: "high", label: "High" },
          ],
          "auto",
        ),
        selected: model,
        selectedThinkingOptionId: harnessThinkingOptionIdSchema.parse("auto"),
        thinkingSelectionSupported: true,
      }),
    ).toMatchObject({
      thinkingLabel: "默认",
      strengthTiers: [
        {
          tier: expect.objectContaining({ key: "high", label: "高" }),
          option: { id: "high", label: "High" },
        },
      ],
      otherOptions: [
        { id: "off", label: "Off" },
        { id: "auto", label: "Auto" },
      ],
      defaultCaption: "默认 · Auto",
      isUsingDefault: true,
      showThinkingSection: true,
      thinkingSelectionEnabled: true,
    });
  });

  it("projects a full Claude-style seven-option list onto all five tiers", () => {
    expect(
      rendererModelPickerPresentation({
        status: "ready",
        catalog: claudeCatalog([
          { id: "off", label: "Off" },
          { id: "auto", label: "Auto" },
          { id: "low", label: "Low" },
          { id: "medium", label: "Medium" },
          { id: "high", label: "High" },
          { id: "xhigh", label: "Extra High" },
          { id: "max", label: "Maximum" },
        ]),
        selected: model,
        selectedThinkingOptionId: harnessThinkingOptionIdSchema.parse("max"),
        thinkingSelectionSupported: true,
      }),
    ).toEqual({
      modelLabel: "provider / model",
      thinkingLabel: "最高",
      strengthTiers: [
        { tier: expect.objectContaining({ key: "low" }), option: { id: "low", label: "Low" } },
        {
          tier: expect.objectContaining({ key: "medium" }),
          option: { id: "medium", label: "Medium" },
        },
        { tier: expect.objectContaining({ key: "high" }), option: { id: "high", label: "High" } },
        {
          tier: expect.objectContaining({ key: "xhigh" }),
          option: { id: "xhigh", label: "Extra High" },
        },
        { tier: expect.objectContaining({ key: "max" }), option: { id: "max", label: "Maximum" } },
      ],
      otherOptions: [
        { id: "off", label: "Off" },
        { id: "auto", label: "Auto" },
      ],
      defaultCaption: "默认 · Off",
      isUsingDefault: false,
      showThinkingSection: true,
      thinkingSelectionEnabled: true,
    });
  });

  it("does not reuse global Thinking options for a Model without a declared list", () => {
    const uninspectedCatalog = harnessModelCatalogSchema.parse({
      models: [{ ref: model, label: "provider / model" }],
      defaultModel: model,
      thinkingOptions: [
        { id: "off", label: "Off" },
        { id: "high", label: "High" },
      ],
      defaultThinkingOptionId: "high",
    });

    expect(
      rendererModelPickerPresentation({
        status: "ready",
        catalog: uninspectedCatalog,
        selected: model,
        selectedThinkingOptionId: harnessThinkingOptionIdSchema.parse("high"),
      }),
    ).toEqual({
      modelLabel: "provider / model",
      strengthTiers: [],
      otherOptions: [],
      isUsingDefault: true,
      showThinkingSection: false,
      thinkingSelectionEnabled: false,
    });
  });

  it("omits the Thinking section and trigger suffix when Pi reports only off", () => {
    expect(
      rendererModelPickerPresentation({
        status: "ready",
        catalog: catalog(["off"]),
        selected: model,
        selectedThinkingOptionId: harnessThinkingOptionIdSchema.parse("off"),
      }),
    ).toEqual({
      modelLabel: "provider / model",
      strengthTiers: [],
      otherOptions: [{ id: "off", label: "Off" }],
      isUsingDefault: true,
      showThinkingSection: false,
      thinkingSelectionEnabled: false,
    });
  });

  it("shows one non-off Thinking option as read-only with the default row", () => {
    expect(
      rendererModelPickerPresentation({
        status: "ready",
        catalog: catalog(["minimal"]),
        selected: model,
        selectedThinkingOptionId: harnessThinkingOptionIdSchema.parse("minimal"),
      }),
    ).toMatchObject({
      thinkingLabel: "默认",
      defaultCaption: "默认 · Minimal",
      isUsingDefault: true,
      showThinkingSection: true,
      thinkingSelectionEnabled: false,
    });
  });

  it("pushes OpenCode model variants entirely into the more-options group", () => {
    const openCodeModel = harnessModelRefSchema.parse({ id: "oc-model-v1.synthetic" });
    const openCodeCatalog = harnessModelCatalogSchema.parse({
      models: [
        {
          ref: openCodeModel,
          label: "provider / oc-model",
          supportedThinkingOptionIds: [
            "ocv.default",
            "b3BlbmNvZGUvY29kZS1tb2RlbHMvaGFja2VyL2dwdC01LjYtc29s",
          ],
        },
      ],
      defaultModel: openCodeModel,
      thinkingOptions: [
        { id: "ocv.default", label: "ocv.default" },
        { id: "b3BlbmNvZGUvY29kZS1tb2RlbHMvaGFja2VyL2dwdC01LjYtc29s", label: "gpt-5.6-sol" },
      ],
      defaultThinkingOptionId: "ocv.default",
    });

    expect(
      rendererModelPickerPresentation({
        status: "ready",
        catalog: openCodeCatalog,
        selected: openCodeModel,
        selectedThinkingOptionId: harnessThinkingOptionIdSchema.parse("ocv.default"),
        thinkingSelectionSupported: true,
      }),
    ).toEqual({
      modelLabel: "provider / oc-model",
      thinkingLabel: "默认",
      strengthTiers: [],
      otherOptions: [
        { id: "ocv.default", label: "ocv.default" },
        { id: "b3BlbmNvZGUvY29kZS1tb2RlbHMvaGFja2VyL2dwdC01LjYtc29s", label: "gpt-5.6-sol" },
      ],
      defaultCaption: "默认 · ocv.default",
      isUsingDefault: true,
      showThinkingSection: true,
      thinkingSelectionEnabled: true,
    });
  });

  it("surfaces a linkage hint when the previous tier is unavailable", () => {
    const view = rendererModelPickerPresentation({
      status: "ready",
      catalog: catalog(["off", "low", "high"]),
      selected: model,
      selectedThinkingOptionId: harnessThinkingOptionIdSchema.parse("low"),
      thinkingSelectionSupported: true,
      linkageHint: "Low 在此模型不可用，已使用默认",
    });

    expect(view.linkageHint).toBe("Low 在此模型不可用，已使用默认");
  });

  it("disables the combined control for loading and selection, but permits retry", () => {
    const readyCatalog = catalog(["off", "low"]);
    expect(isRendererModelPickerDisabled({ status: "loading" })).toBe(true);
    const selectingView = {
      status: "selecting" as const,
      catalog: readyCatalog,
      selected: model,
    };
    expect(isRendererModelPickerDisabled(selectingView)).toBe(true);
    expect(shouldCloseRendererModelPicker(selectingView)).toBe(false);
    expect(shouldCloseRendererModelPicker({ status: "loading" })).toBe(true);
    expect(
      isRendererModelPickerDisabled({
        status: "error",
        catalog: readyCatalog,
        selected: model,
        error: "selection failed",
      }),
    ).toBe(false);
    expect(isRendererModelPickerDisabled({ status: "error", error: "inspection failed" })).toBe(
      true,
    );
  });

  it("uses stable loading and unsupported presentation without inventing options", () => {
    for (const status of ["waitingForAdapter", "loading"] as const) {
      expect(isRendererModelPickerDisabled({ status })).toBe(true);
      expect(rendererModelPickerPresentation({ status })).toEqual({
        modelLabel: "Loading models...",
        strengthTiers: [],
        otherOptions: [],
        isUsingDefault: true,
        showThinkingSection: false,
        thinkingSelectionEnabled: false,
      });
    }
    expect(
      rendererModelPickerPresentation({
        status: "ready",
        catalog: catalog([]),
        selected: model,
      }),
    ).toEqual({
      modelLabel: "provider / model",
      strengthTiers: [],
      otherOptions: [],
      isUsingDefault: true,
      showThinkingSection: false,
      thinkingSelectionEnabled: false,
    });
  });
});
