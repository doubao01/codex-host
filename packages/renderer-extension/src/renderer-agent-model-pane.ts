import type {
  HarnessModelCatalog,
  HarnessModelRef,
  HarnessThinkingOption,
} from "@codexhost/shared-contracts";

import {
  defaultThinkingOptionForModel,
  matchStrengthTier,
} from "./renderer-thinking-strength.js";

/** Model pane state for one Agent, supplied by the Model control's view. */
export interface AgentModelPaneState {
  catalog?: HarnessModelCatalog;
  selected?: HarnessModelRef;
  selectedThinkingOptionId?: string;
  /** False when the Harness reports Thinking selection is unsupported for this Thread. */
  thinkingSupported?: boolean;
  /** True while the Model list is loading/selecting; rows render disabled. */
  busy: boolean;
  /** Present when the Agent has no Model catalog (unsupported / error). */
  unavailableReason?: string;
  /** Transient caption (e.g. a strength tier dropped on Model switch). */
  note?: string;
}

/** One strength segment: a tier row, or the "默认" Harness-default reset. */
export interface AgentModelPaneStrengthSegment {
  /** Native Thinking option id; absent for the "默认" reset segment. */
  id?: string;
  label: string;
  selected: boolean;
  /** True for the "默认" reset segment; selecting it clears an explicit tier. */
  resetsToDefault?: boolean;
}

/** Presentation for the pill's Model segment and the picker's Model pane. */
export interface AgentModelPanePresentation {
  /** Short Model label shown on the pill; empty when no catalog is ready. */
  modelLabel: string;
  /** Strength tier (or native option) suffix; undefined hides the segment. */
  thinkingLabel?: string;
  /** Pane rows: [modelId, label, isSelected, disabled]. Empty when unavailable. */
  rows: readonly { id: string; label: string; selected: boolean; disabled: boolean }[];
  /**
   * Strength segments for the selected Model. When the Harness exposes a
   * default, the first segment is the "默认" reset followed by every tier,
   * mirroring the official composer's reset row.
   */
  strengths: readonly AgentModelPaneStrengthSegment[];
  /** One-line caption shown under the pane when a reason exists. */
  note?: string;
}

/** Native Thinking options the selected Model supports, in catalog order. */
export function thinkingOptionsForModel(
  catalog: HarnessModelCatalog | undefined,
  selected: HarnessModelRef | undefined,
): HarnessThinkingOption[] {
  const supported = catalog?.models.find(
    (model) => model.ref.id === selected?.id,
  )?.supportedThinkingOptionIds;
  if (!supported) return [];
  return catalog?.thinkingOptions.filter((option) => supported.includes(option.id)) ?? [];
}

export function agentModelPanePresentation(
  state: AgentModelPaneState | undefined,
): AgentModelPanePresentation {
  const catalog = state?.catalog;
  const selected = state?.selected;
  const selectedModel = selected
    ? catalog?.models.find((model) => model.ref.id === selected.id)
    : undefined;
  if (!state || !catalog || !selected || !selectedModel || state.busy) {
    return {
      modelLabel: state?.busy ? "Loading..." : "",
      rows: [],
      strengths: [],
      ...(state?.unavailableReason ? { note: state.unavailableReason } : {}),
    };
  }
  const thinkingUsable = state.thinkingSupported !== false;
  const options = thinkingUsable ? thinkingOptionsForModel(catalog, selected) : [];
  const defaultOption = thinkingUsable
    ? defaultThinkingOptionForModel(catalog, selected)
    : undefined;
  const activeOption = options.find(({ id }) => id === state.selectedThinkingOptionId);
  const isUsingDefault =
    activeOption === undefined ||
    defaultOption === undefined ||
    activeOption.id === defaultOption.id;
  const thinkingLabel = !isUsingDefault
    ? (matchStrengthTier(activeOption)?.label ?? activeOption?.label)
    : undefined;
  const strengths: AgentModelPaneStrengthSegment[] = options.map((option) => ({
    id: option.id,
    label: matchStrengthTier(option)?.label ?? option.label,
    selected: !isUsingDefault && option.id === activeOption?.id,
  }));
  if (defaultOption) {
    strengths.unshift({
      label: "默认",
      selected: isUsingDefault,
      resetsToDefault: true,
    });
  }
  const note = state.unavailableReason ?? state.note;
  return {
    modelLabel: selectedModel.label,
    ...(thinkingLabel ? { thinkingLabel } : {}),
    rows: catalog.models.map((model) => ({
      id: model.ref.id,
      label: model.label,
      selected: model.ref.id === selected.id,
      disabled: false,
    })),
    strengths,
    ...(note ? { note } : {}),
  };
}
