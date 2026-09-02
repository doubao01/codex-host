import type {
  HarnessModelCatalog,
  HarnessModelRef,
  HarnessThinkingOption,
} from "@codexhost/shared-contracts";

/**
 * Presentation-only mapping from a Harness's native thinking options onto a
 * unified five-step strength scale (低 / 中 / 高 / 超高 / 最高).
 *
 * The native IDs reported by Claude Code / Pi / OMP are drawn from the same
 * vocabulary (`low` / `medium` / `high` / `xhigh` / `max`), so those map
 * one-to-one. Grok and DeepSeek report dynamic effort lists that reuse the
 * same words. Options that match no tier (e.g. `off`, `minimal`, `auto`,
 * OpenCode model variants) are surfaced separately as "更多" so real Harness
 * capabilities are never hidden.
 *
 * This module never touches adapters or shared contracts — it is purely a
 * renderer-extension projection of data the Host already provides.
 */

export type UnifiedStrengthKey = "low" | "medium" | "high" | "xhigh" | "max";

export interface UnifiedStrengthTier {
  readonly key: UnifiedStrengthKey;
  readonly label: string;
  /** Exact native option IDs that represent this tier. */
  readonly nativeIds: readonly string[];
  /** Normalized (lowercased) native labels that fall back to this tier. */
  readonly nativeLabelMatches: readonly string[];
}

export const UNIFIED_STRENGTH_TIERS: readonly UnifiedStrengthTier[] = Object.freeze([
  {
    key: "low",
    label: "低",
    nativeIds: ["low"],
    nativeLabelMatches: ["low"],
  },
  {
    key: "medium",
    label: "中",
    nativeIds: ["medium"],
    nativeLabelMatches: ["medium", "middle"],
  },
  {
    key: "high",
    label: "高",
    nativeIds: ["high"],
    nativeLabelMatches: ["high"],
  },
  {
    key: "xhigh",
    label: "超高",
    nativeIds: ["xhigh", "extra-high", "extra_high", "extrahigh"],
    nativeLabelMatches: ["extra high", "x-high", "xhigh", "ultra high"],
  },
  {
    key: "max",
    label: "最高",
    nativeIds: ["max", "maximum"],
    nativeLabelMatches: ["max", "maximum"],
  },
]);

export interface StrengthTierMatch {
  readonly tier: UnifiedStrengthTier;
  readonly option: HarnessThinkingOption;
}

function normalizedLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/gu, " ");
}

export function matchStrengthTier(
  option: HarnessThinkingOption,
): UnifiedStrengthTier | undefined {
  const normalized = normalizedLabel(option.label);
  return UNIFIED_STRENGTH_TIERS.find(
    (tier) =>
      tier.nativeIds.includes(option.id) ||
      tier.nativeLabelMatches.includes(normalized),
  );
}

/**
 * The subset of the unified scale this option list supports, in scale order.
 * Each entry pairs the tier with the native option that represents it.
 */
export function strengthTiersForOptions(
  options: readonly HarnessThinkingOption[],
): StrengthTierMatch[] {
  const matches: StrengthTierMatch[] = [];
  for (const tier of UNIFIED_STRENGTH_TIERS) {
    const option = options.find(
      (candidate) => matchStrengthTier(candidate)?.key === tier.key,
    );
    if (option) matches.push({ tier, option });
  }
  return matches;
}

/** Native options that do not map onto any unified tier (off / minimal / auto / variants). */
export function unmatchedThinkingOptions(
  options: readonly HarnessThinkingOption[],
): HarnessThinkingOption[] {
  return options.filter((option) => matchStrengthTier(option) === undefined);
}

/**
 * The native option the Harness would use when no explicit tier is chosen for
 * the selected model: `catalog.defaultThinkingOptionId`, else the first
 * supported option — the same resolution as `draftThinkingOptionForModel`.
 */
export function defaultThinkingOptionForModel(
  catalog: HarnessModelCatalog,
  model: HarnessModelRef | undefined,
): HarnessThinkingOption | undefined {
  const supported = catalog.models.find(
    (candidate) => candidate.ref.id === model?.id,
  )?.supportedThinkingOptionIds;
  if (!supported) return undefined;
  const options = catalog.thinkingOptions.filter((option) =>
    supported.includes(option.id),
  );
  return (
    options.find(({ id }) => id === catalog.defaultThinkingOptionId) ?? options[0]
  );
}
