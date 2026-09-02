import type {
  HarnessModelCatalog,
  HarnessModelRef,
  HarnessThinkingOption,
  HarnessThinkingOptionId,
} from "@codexhost/shared-contracts";

import {
  rendererModelPickerModelMenuPlacement,
  rendererModelPickerStandaloneModelMenuPlacement,
  RENDERER_MODEL_PICKER_MODEL_MENU_MAX_HEIGHT,
  RENDERER_MODEL_PICKER_STRENGTH_CARD_WIDTH,
} from "./renderer-model-picker-positioning.js";
import {
  defaultThinkingOptionForModel,
  matchStrengthTier,
  strengthTiersForOptions,
  unmatchedThinkingOptions,
  type StrengthTierMatch,
} from "./renderer-thinking-strength.js";
import {
  ensureRendererTriggerChipStyle,
  TRIGGER_CHIP_CLASS,
} from "./renderer-trigger-chip-style.js";

const MENU_CLASSES =
  "fixed z-50 overflow-hidden rounded-xl bg-token-dropdown-background/90 text-token-foreground shadow-lg backdrop-blur-xl";

const SEARCH_INPUT_CLASSES =
  "mb-1 w-full shrink-0 rounded-lg border border-token-border bg-token-dropdown-background/95 px-2 py-1.5 text-sm text-token-foreground outline-none placeholder:text-token-text-tertiary disabled:cursor-not-allowed disabled:opacity-40";

const OPTION_CLASSES =
  "flex w-full cursor-interaction items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-token-foreground outline-none enabled:hover:bg-token-list-hover-background enabled:active:bg-token-foreground/15 disabled:cursor-not-allowed disabled:opacity-40";

const HEADING_CLASSES = "px-2 pb-1 pt-1.5 text-sm text-token-text-tertiary";
const MODEL_TRIGGER_MAX_WIDTH = "min(200px, 26vw)";
const MODEL_SCROLLBAR_STYLE_ATTRIBUTE = "data-codexhost-model-picker-scrollbar";

const STRENGTH_CARD_TITLE = "推理强度";
const MODEL_LIST_TITLE = "模型";
const SEARCH_MODELS_PLACEHOLDER = "搜索模型";
const NO_MATCHING_MODELS = "无匹配模型";

export interface RendererModelControlView {
  status: "idle" | "waitingForAdapter" | "loading" | "ready" | "selecting" | "empty" | "error";
  catalog?: HarnessModelCatalog;
  selected?: HarnessModelRef;
  selectedThinkingOptionId?: HarnessThinkingOptionId;
  resolvedModelLabel?: string;
  thinkingSelectionSupported?: boolean;
  /** Transient note shown inside the picker (e.g. a strength tier dropped on Model switch). */
  linkageHint?: string;
  error?: string;
}

export interface RendererModelPickerPresentation {
  modelLabel: string;
  thinkingLabel?: string;
  resolvedModelLabel?: string;
  strengthTiers: StrengthTierMatch[];
  otherOptions: HarnessThinkingOption[];
  defaultCaption?: string;
  isUsingDefault: boolean;
  showThinkingSection: boolean;
  thinkingSelectionEnabled: boolean;
  linkageHint?: string;
}

interface ModelOptionControl {
  button: HTMLButtonElement;
  check: HTMLElement;
  searchText: string;
}

export interface RendererModelPickerControl {
  root: HTMLElement;
  trigger: HTMLButtonElement;
  label: HTMLElement;
  thinkingLabel: HTMLElement;
  /** Model-list popover, opened directly from the trigger. */
  menu: HTMLElement;
  /** Per-model thinking-strength hover card, anchored to the hovered row. */
  card: HTMLElement;
  searchInput: HTMLInputElement;
  searchHeader: HTMLElement;
  searchEmpty: HTMLElement;
  options: Map<string, ModelOptionControl>;
  /** Transient linkage note (e.g. a dropped tier) shown under the model list. */
  hint: HTMLElement;
  close(): void;
  dispose(): void;
}

/** Mutable per-control state shared by mount handlers and the render function. */
interface RendererModelPickerRuntime {
  modelView?: RendererModelControlView;
  /** The model whose strength card is currently anchored (and open). */
  hoveredModelId: string | null;
  /** Model + tier chosen together; resolved once the Model selection lands. */
  pendingSelection: { modelId: string; thinkingOptionId: string } | null;
  pendingTimerId: number | undefined;
  selectModel: (modelId: string) => void;
  selectThinking: (thinkingOptionId: string) => void;
  selectDefaultThinking: () => void;
}

const pickerRuntimes = new WeakMap<RendererModelPickerControl, RendererModelPickerRuntime>();

function runtimeFor(control: RendererModelPickerControl): RendererModelPickerRuntime {
  let runtime = pickerRuntimes.get(control);
  if (!runtime) {
    runtime = {
      hoveredModelId: null,
      pendingSelection: null,
      pendingTimerId: undefined,
      selectModel: () => undefined,
      selectThinking: () => undefined,
      selectDefaultThinking: () => undefined,
    };
    pickerRuntimes.set(control, runtime);
  }
  return runtime;
}

function popoverOpen(element: HTMLElement): boolean {
  return element.matches(":popover-open");
}

function ensureModelScrollbarStyle(ownerDocument: Document): void {
  if (ownerDocument.querySelector(`style[${MODEL_SCROLLBAR_STYLE_ATTRIBUTE}]`)) return;
  const style = ownerDocument.createElement("style");
  style.setAttribute(MODEL_SCROLLBAR_STYLE_ATTRIBUTE, "true");
  style.textContent = `
    [data-codexhost-model-scrollable] {
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.28) transparent;
    }
    [data-codexhost-model-scrollable]::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    [data-codexhost-model-scrollable]::-webkit-scrollbar-track {
      background: transparent;
    }
    [data-codexhost-model-scrollable]::-webkit-scrollbar-thumb {
      min-height: 28px;
      border: 1px solid transparent;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.28);
      background-clip: padding-box;
    }
    [data-codexhost-model-scrollable]::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.42);
      background-clip: padding-box;
    }
    [data-codexhost-model-scrollable]::-webkit-scrollbar-button {
      display: none;
      width: 0;
      height: 0;
    }
  `;
  (ownerDocument.head ?? ownerDocument.documentElement).append(style);
}

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

export function isRendererModelPickerDisabled(view: RendererModelControlView): boolean {
  return (
    view.status === "waitingForAdapter" ||
    view.status === "loading" ||
    view.status === "selecting" ||
    view.status === "empty" ||
    view.catalog === undefined
  );
}

export function shouldCloseRendererModelPicker(view: RendererModelControlView): boolean {
  return isRendererModelPickerDisabled(view) && view.status !== "selecting";
}

function isTransientPickerState(view: RendererModelControlView): boolean {
  return view.status === "idle" || view.status === "loading";
}

export function rendererModelPickerPresentation(
  view: RendererModelControlView,
): RendererModelPickerPresentation {
  const selectedModel = view.catalog?.models.find((model) => model.ref.id === view.selected?.id);
  const options =
    view.thinkingSelectionSupported === false
      ? []
      : thinkingOptionsForModel(view.catalog, view.selected);
  const strengthTiers = strengthTiersForOptions(options);
  const otherOptions = unmatchedThinkingOptions(options);
  const defaultOption =
    view.catalog && view.selected
      ? defaultThinkingOptionForModel(view.catalog, view.selected)
      : undefined;
  const selected = options.find(({ id }) => id === view.selectedThinkingOptionId);
  const isUsingDefault =
    selected === undefined || defaultOption === undefined || selected.id === defaultOption.id;
  const showThinkingSection =
    options.length > 0 &&
    (strengthTiers.length > 0 || !(otherOptions.length === 1 && otherOptions[0]?.id === "off"));
  const resolvedModelLabel = view.resolvedModelLabel ?? selectedModel?.resolvedModelLabel;
  let modelLabel = "Select model";
  if (selectedModel) modelLabel = selectedModel.label;
  else if (view.status === "waitingForAdapter" || view.status === "loading") {
    modelLabel = "Loading models...";
  } else if (view.status === "selecting") modelLabel = "Selecting...";
  else if (view.status === "empty") modelLabel = "No models";
  else if (view.status === "error") modelLabel = "Models unavailable";
  let thinkingLabel: string | undefined;
  if (showThinkingSection) {
    if (isUsingDefault) thinkingLabel = "默认";
    else if (selected) thinkingLabel = matchStrengthTier(selected)?.label ?? selected.label;
  }
  const defaultCaption = defaultOption
    ? `默认 · ${matchStrengthTier(defaultOption)?.label ?? defaultOption.label}`
    : undefined;
  return {
    modelLabel,
    ...(resolvedModelLabel && resolvedModelLabel !== modelLabel ? { resolvedModelLabel } : {}),
    ...(showThinkingSection && thinkingLabel ? { thinkingLabel } : {}),
    strengthTiers,
    otherOptions,
    ...(showThinkingSection && defaultCaption ? { defaultCaption } : {}),
    isUsingDefault,
    showThinkingSection,
    thinkingSelectionEnabled: strengthTiers.length + otherOptions.length > 1,
    ...(view.linkageHint ? { linkageHint: view.linkageHint } : {}),
  };
}

function applyPlacement(
  element: HTMLElement,
  placement: { left: number; width: number; maxHeight?: number; top?: number; bottom?: number },
): void {
  element.style.setProperty("width", `${placement.width}px`, "important");
  element.style.left = `${placement.left}px`;
  element.style.maxWidth = `${placement.width}px`;
  element.style.right = "auto";
  element.style.top = placement.top === undefined ? "auto" : `${placement.top}px`;
  element.style.bottom = placement.bottom === undefined ? "auto" : `${placement.bottom}px`;
  if (placement.maxHeight !== undefined) element.style.maxHeight = `${placement.maxHeight}px`;
}

/** Positions the model list directly above the trigger (standalone popover). */
function positionModelList(control: RendererModelPickerControl): void {
  const triggerRect = control.trigger.getBoundingClientRect();
  const placement = rendererModelPickerStandaloneModelMenuPlacement(triggerRect, {
    width: window.innerWidth,
    height: window.innerHeight,
  });
  applyPlacement(control.menu, placement);
}

/**
 * Anchors the strength card to the right edge of the hovered row, flipping to
 * the row's left when the viewport runs out of room. The row's right edge is
 * the menu's inner padding edge, so the card starts exactly where the menu's
 * own right padding ends — no dead gap between the row and its card.
 */
function positionStrengthCard(control: RendererModelPickerControl): void {
  const runtime = runtimeFor(control);
  const row = runtime.hoveredModelId
    ? (control.options.get(runtime.hoveredModelId)?.button ?? null)
    : null;
  if (!row || row.hidden || !row.isConnected) {
    hideStrengthCard(control);
    return;
  }
  const rowRect = row.getBoundingClientRect();
  const placement = rendererModelPickerModelMenuPlacement(
    rowRect,
    { width: window.innerWidth, height: window.innerHeight },
    RENDERER_MODEL_PICKER_STRENGTH_CARD_WIDTH,
  );
  applyPlacement(control.card, placement);
}

export function syncRendererModelTriggerClass(control: RendererModelPickerControl): void {
  // Keep codexhost controls independent from Codex's private utility classes.
  // Codex can rename or remove those between Desktop releases; our own
  // `TRIGGER_CHIP_CLASS` chrome (see renderer-trigger-chip-style.ts) does not.
  control.trigger.className = TRIGGER_CHIP_CLASS;
  control.trigger.style.width = "fit-content";
  control.trigger.style.maxWidth = MODEL_TRIGGER_MAX_WIDTH;
}

function createCheck(): HTMLElement {
  const check = document.createElement("span");
  check.textContent = "✓";
  check.setAttribute("aria-hidden", "true");
  check.className = "w-4 shrink-0 text-token-text-secondary";
  check.style.width = "16px";
  check.style.flex = "none";
  return check;
}

function createHeading(text: string): HTMLElement {
  const heading = document.createElement("div");
  heading.textContent = text;
  heading.className = HEADING_CLASSES;
  heading.setAttribute("role", "presentation");
  return heading;
}

export function syncRendererLabelText(
  element: { textContent: string | null },
  text: string,
): boolean {
  if (element.textContent === text) return false;
  element.textContent = text;
  return true;
}

function applyModelSearchFilter(control: RendererModelPickerControl): void {
  const query = control.searchInput.value.trim().toLowerCase();
  let visibleCount = 0;
  for (const option of control.options.values()) {
    const matches = query.length === 0 || option.searchText.includes(query);
    option.button.hidden = !matches;
    if (matches) visibleCount += 1;
  }
  control.searchEmpty.hidden = query.length === 0 || visibleCount > 0;
}

function catalogModelEntry(
  view: RendererModelControlView | undefined,
  modelId: string,
): HarnessModelCatalog["models"][number] | undefined {
  return view?.catalog?.models.find((model) => model.ref.id === modelId);
}

function defaultCaptionFor(
  catalog: HarnessModelCatalog | undefined,
  model: HarnessModelRef,
): string {
  const option = catalog ? defaultThinkingOptionForModel(catalog, model) : undefined;
  return option ? `默认 · ${matchStrengthTier(option)?.label ?? option.label}` : "默认";
}

/** Refreshes check marks on an already-open card for the hovered model. */
function syncCardCheckedState(control: RendererModelPickerControl): void {
  const card = control.card;
  const runtime = runtimeFor(control);
  if (!popoverOpen(card) || runtime.hoveredModelId === null) return;
  const view = runtime.modelView;
  const modelId = runtime.hoveredModelId;
  const modelEntry = catalogModelEntry(view, modelId);
  if (!view || !modelEntry || view.thinkingSelectionSupported === false) return;

  let defaultActive = false;
  let activeOptionId: string | undefined;
  const options = thinkingOptionsForModel(view.catalog, modelEntry.ref);
  if (view.catalog && modelId === view.selected?.id && options.length > 0) {
    const defaultOption = defaultThinkingOptionForModel(view.catalog, modelEntry.ref);
    const active = options.find(({ id }) => id === view.selectedThinkingOptionId);
    defaultActive =
      active === undefined || defaultOption === undefined || active.id === defaultOption.id;
    activeOptionId = defaultActive ? undefined : active?.id;
  }

  const defaultRow = card.querySelector<HTMLButtonElement>("button[data-thinking-default]");
  if (defaultRow) setOptionRowChecked(defaultRow, defaultActive);
  for (const row of card.querySelectorAll<HTMLButtonElement>("button[data-thinking-option-id]")) {
    const optionId = row.dataset.thinkingOptionId;
    const active = modelId === view.selected?.id && !defaultActive && optionId === activeOptionId;
    setOptionRowChecked(row, active);
  }
}

function setOptionRowChecked(button: HTMLButtonElement, checked: boolean): void {
  button.setAttribute("aria-checked", String(checked));
  button.classList.toggle("bg-token-list-hover-background", checked);
  const check = button.querySelector('[aria-hidden="true"]');
  if (check instanceof HTMLElement) check.style.visibility = checked ? "visible" : "hidden";
}

/** Builds (from scratch) the strength-card contents for one model. */
function buildStrengthCard(control: RendererModelPickerControl, modelId: string): void {
  const card = control.card;
  card.replaceChildren();
  const view = runtimeFor(control).modelView;
  const modelEntry = catalogModelEntry(view, modelId);
  if (!view || !modelEntry) return;
  const options = thinkingOptionsForModel(view.catalog, modelEntry.ref);
  if (options.length === 0) return;
  const resolvedModelLabel =
    view.resolvedModelLabel && modelId === view.selected?.id
      ? view.resolvedModelLabel
      : modelEntry.resolvedModelLabel;

  const header = document.createElement("div");
  header.className = "min-w-0 px-2 pt-1";
  const headerLabel = document.createElement("div");
  headerLabel.textContent = modelEntry.label;
  headerLabel.className = "truncate text-sm font-medium text-token-foreground";
  headerLabel.title = modelEntry.label;
  header.append(headerLabel);
  if (resolvedModelLabel && resolvedModelLabel !== modelEntry.label) {
    const resolvedLabel = document.createElement("div");
    resolvedLabel.textContent = resolvedModelLabel;
    resolvedLabel.className = "truncate text-xs text-token-text-tertiary";
    resolvedLabel.title = resolvedModelLabel;
    header.append(resolvedLabel);
  }
  card.append(header);

  const divider = document.createElement("div");
  divider.setAttribute("role", "separator");
  divider.className = "my-1 h-px bg-token-border";
  card.append(divider);

  const defaultRow = document.createElement("button");
  defaultRow.type = "button";
  defaultRow.dataset.thinkingDefault = "true";
  defaultRow.setAttribute("role", "menuitemradio");
  defaultRow.className = OPTION_CLASSES;
  const defaultCaption = document.createElement("span");
  defaultCaption.className = "min-w-0 flex-1 truncate";
  defaultCaption.textContent = defaultCaptionFor(view.catalog, modelEntry.ref);
  defaultRow.append(defaultCaption, createCheck());
  card.append(defaultRow);

  for (const { tier, option } of strengthTiersForOptions(options)) {
    const row = document.createElement("button");
    row.type = "button";
    row.dataset.thinkingOptionId = option.id;
    row.setAttribute("role", "menuitemradio");
    row.className = OPTION_CLASSES;
    const text = document.createElement("span");
    text.textContent = tier.label;
    text.className = "min-w-0 flex-1 truncate";
    row.append(text, createCheck());
    card.append(row);
  }
}

function hideStrengthCard(control: RendererModelPickerControl): void {
  const runtime = runtimeFor(control);
  const card = control.card;
  if (popoverOpen(card)) card.hidePopover();
  card.replaceChildren();
  runtime.hoveredModelId = null;
}

function cancelPendingSelection(control: RendererModelPickerControl): void {
  const runtime = runtimeFor(control);
  if (runtime.pendingTimerId !== undefined) {
    window.clearTimeout(runtime.pendingTimerId);
    runtime.pendingTimerId = undefined;
  }
  runtime.pendingSelection = null;
}

/**
 * Opens the strength card for a hovered/focused model row. The card is built
 * lazily (and cleared on close) so the tier buttons only exist in the DOM while
 * the card is actually showing.
 */
function openStrengthCard(control: RendererModelPickerControl, modelId: string): void {
  const runtime = runtimeFor(control);
  const view = runtime.modelView;
  const modelEntry = catalogModelEntry(view, modelId);
  const options = modelEntry ? thinkingOptionsForModel(view?.catalog, modelEntry.ref) : [];
  if (!view || view.thinkingSelectionSupported === false || !modelEntry || options.length === 0) {
    hideStrengthCard(control);
    return;
  }
  if (runtime.hoveredModelId === modelId && popoverOpen(control.card)) {
    positionStrengthCard(control);
    syncCardCheckedState(control);
    return;
  }
  buildStrengthCard(control, modelId);
  if (control.card.childElementCount === 0) {
    runtime.hoveredModelId = null;
    return;
  }
  runtime.hoveredModelId = modelId;
  // Position against the row rect before showing so the card never flashes at
  // the top-layer default origin.
  positionStrengthCard(control);
  control.card.showPopover();
  syncCardCheckedState(control);
}

function isNodeWithin(node: EventTarget | null, container: HTMLElement): boolean {
  return node instanceof Node && container.contains(node);
}

/**
 * Fires the combined Model + tier selection once the Model lands. The tier is
 * applied on the render where the confirmed Model equals the requested one; an
 * error or a different confirmed Model drops the request instead.
 */
function resolvePendingSelection(
  control: RendererModelPickerControl,
  view: RendererModelControlView,
): void {
  const runtime = runtimeFor(control);
  const pending = runtime.pendingSelection;
  if (!pending) return;
  if (view.status === "ready" && view.selected?.id === pending.modelId) {
    runtime.pendingSelection = null;
    const { thinkingOptionId } = pending;
    runtime.pendingTimerId = window.setTimeout(() => {
      runtime.pendingTimerId = undefined;
      runtime.selectThinking(thinkingOptionId);
    }, 0);
    return;
  }
  if (
    view.status === "error" ||
    (view.status === "ready" && view.selected?.id !== pending.modelId)
  ) {
    runtime.pendingSelection = null;
  }
}

function rebuildModelList(
  control: RendererModelPickerControl,
  view: RendererModelControlView,
): void {
  const runtime = runtimeFor(control);
  const previouslyHovered = runtime.hoveredModelId;
  hideStrengthCard(control);
  control.options.clear();
  control.menu.replaceChildren(control.searchHeader, control.searchEmpty);

  const appendModel = (model: HarnessModelCatalog["models"][number]): void => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.modelId = model.ref.id;
    button.setAttribute("role", "menuitemradio");
    button.className = OPTION_CLASSES;

    const text = document.createElement("span");
    text.textContent = model.label;
    text.className = "min-w-0 flex-1 truncate";
    text.title = model.label;
    const check = createCheck();
    button.append(text, check);
    control.options.set(model.ref.id, {
      button,
      check,
      searchText: `${model.label} ${model.ref.id}`.toLowerCase(),
    });
    button.addEventListener("mouseenter", () => openStrengthCard(control, model.ref.id));
    button.addEventListener("focusin", () => openStrengthCard(control, model.ref.id));
    control.menu.append(button);
  };

  for (const model of view.catalog?.models ?? []) {
    appendModel(model);
  }
  control.menu.append(control.hint);
  applyModelSearchFilter(control);

  // Rebuilds replace the row nodes; keep the card open on the same model when
  // the list stays open (e.g. a catalog refresh under the pointer).
  if (popoverOpen(control.menu) && previouslyHovered !== null) {
    const row = control.options.get(previouslyHovered);
    if (row && !row.button.hidden) openStrengthCard(control, previouslyHovered);
  }
  // The search box was moved out and back in by replaceChildren, so a focused
  // box loses focus; restore it while the list stays open.
  if (popoverOpen(control.menu) && control.searchInput === document.activeElement) {
    control.searchInput.focus();
  }
}

export function mountRendererModelPicker(
  composerId: string,
  onSelectModel: (modelId: string) => void,
  onSelectThinking: (thinkingOptionId: string) => void,
  onSelectDefaultThinking: () => void,
): RendererModelPickerControl {
  ensureRendererTriggerChipStyle(document);

  const root = document.createElement("div");
  root.setAttribute("data-codexhost-model-control", composerId);
  root.className = "relative min-w-0";
  root.style.display = "none";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("data-state", "closed");
  trigger.style.height = "28px";
  trigger.style.padding = "0 8px";
  trigger.style.gap = "4px";
  trigger.style.font = "400 13px/18px system-ui, sans-serif";
  trigger.style.letterSpacing = "0";

  const label = document.createElement("span");
  label.style.color = "inherit";
  label.style.minWidth = "0";
  label.style.overflow = "hidden";
  label.style.textOverflow = "ellipsis";
  label.style.whiteSpace = "nowrap";

  const thinkingLabel = document.createElement("span");
  thinkingLabel.style.color = "var(--color-text-tertiary, #8f8f8f)";
  thinkingLabel.style.flex = "none";
  thinkingLabel.style.maxWidth = "96px";
  thinkingLabel.style.overflow = "hidden";
  thinkingLabel.style.textOverflow = "ellipsis";
  thinkingLabel.style.whiteSpace = "nowrap";
  thinkingLabel.hidden = true;

  trigger.append(label, thinkingLabel);

  const menu = document.createElement("div");
  menu.id = `${composerId}-model-menu`;
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Model");
  // The strength card is a separate top-layer popover appended to the
  // document, so an `auto` popover here would light-dismiss whenever the
  // search input or a row inside that card receives a pointer. Dismissal is
  // handled manually (onDocumentPointerDown / onDocumentKeyDown) instead.
  menu.setAttribute("popover", "manual");
  menu.className = MENU_CLASSES;
  menu.dataset.codexhostModelScrollable = "true";
  ensureModelScrollbarStyle(document);
  menu.style.position = "fixed";
  menu.style.inset = "auto";
  menu.style.margin = "0";
  menu.style.padding = "4px";
  menu.style.border = "0";
  menu.style.maxHeight = `min(${RENDERER_MODEL_PICKER_MODEL_MENU_MAX_HEIGHT}px, 60vh)`;
  menu.style.overflowY = "auto";
  menu.style.overflowX = "hidden";
  trigger.setAttribute("aria-controls", menu.id);

  const options = new Map<string, ModelOptionControl>();
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.placeholder = SEARCH_MODELS_PLACEHOLDER;
  searchInput.setAttribute("aria-label", SEARCH_MODELS_PLACEHOLDER);
  searchInput.autocomplete = "off";
  searchInput.spellcheck = false;
  searchInput.className = SEARCH_INPUT_CLASSES;
  const searchHeader = document.createElement("div");
  searchHeader.append(createHeading(MODEL_LIST_TITLE), searchInput);
  // Sits flush against the menu's top padding so rows never peek through while
  // scrolling; the search field keeps its own field background.
  searchHeader.className = "bg-token-dropdown-background/95 pb-1";
  searchHeader.style.position = "sticky";
  searchHeader.style.top = "-4px";
  searchHeader.style.zIndex = "2";
  const searchEmpty = document.createElement("div");
  searchEmpty.dataset.codexhostModelSearchEmpty = "true";
  searchEmpty.textContent = NO_MATCHING_MODELS;
  searchEmpty.className = "block px-2 py-2 text-sm text-token-text-tertiary";
  searchEmpty.hidden = true;
  const onSearchInput = (): void => {
    applyModelSearchFilter(control);
    hideStrengthCard(control);
  };
  searchInput.addEventListener("input", onSearchInput);
  // The search box lives in an injected popover. The harness's global keydown
  // and focus handling must never see keystrokes typed here, or it refocuses
  // the composer and yanks the cursor out of the box. Silence these events at
  // the input so they do not bubble to the harness (React event delegation).
  const silencedEventTypes: string[] = [
    "keydown",
    "keypress",
    "keyup",
    "beforeinput",
    "input",
    "compositionstart",
    "compositionupdate",
    "compositionend",
    "change",
  ];
  const silenceForHarness = (event: Event): void => {
    event.stopPropagation();
  };
  for (const type of silencedEventTypes) {
    searchInput.addEventListener(type, silenceForHarness);
  }
  // Safety net: if the harness still manages to steal focus to the composer
  // (e.g. via an earlier capture-phase listener), pull the cursor back into the
  // search box as long as the list remains open.
  const onSearchBlur = (): void => {
    if (!popoverOpen(menu)) return;
    const active = document.activeElement;
    const movedToComposer =
      active === document.body ||
      (active instanceof Element &&
        (active.matches('textarea, [contenteditable="true"], [role="textbox"]') ||
          active.closest('textarea, [contenteditable="true"], [role="textbox"]') !== null));
    if (!movedToComposer) return;
    requestAnimationFrame(() => {
      if (popoverOpen(menu) && searchInput.isConnected) searchInput.focus();
    });
  };
  searchInput.addEventListener("blur", onSearchBlur);

  const card = document.createElement("div");
  card.id = `${composerId}-model-strength-card`;
  card.setAttribute("role", "menu");
  card.setAttribute("aria-label", STRENGTH_CARD_TITLE);
  card.setAttribute("popover", "manual");
  card.className = MENU_CLASSES;
  card.dataset.codexhostModelScrollable = "true";
  card.style.position = "fixed";
  card.style.inset = "auto";
  card.style.margin = "0";
  card.style.padding = "4px";
  card.style.border = "0";
  card.style.overflowY = "auto";
  card.style.overflowX = "hidden";

  const hint = document.createElement("div");
  hint.className = "px-2 py-1 text-xs text-token-text-tertiary";
  hint.hidden = true;

  const control: RendererModelPickerControl = {
    root,
    trigger,
    label,
    thinkingLabel,
    menu,
    card,
    searchInput,
    searchHeader,
    searchEmpty,
    options,
    hint,
    close() {
      cancelPendingSelection(control);
      hideStrengthCard(control);
      if (popoverOpen(menu)) menu.hidePopover();
    },
    // Installed at the end of mount once the handlers it must unregister exist.
    dispose: () => undefined,
  };
  const runtime = runtimeFor(control);
  runtime.selectModel = onSelectModel;
  runtime.selectThinking = onSelectThinking;
  runtime.selectDefaultThinking = onSelectDefaultThinking;

  const pickerOpen = (): boolean => popoverOpen(menu) || popoverOpen(card);
  const open = (): void => {
    if (trigger.disabled || pickerOpen()) return;
    // Position before showing so the list never flashes at the top-layer origin.
    positionModelList(control);
    menu.showPopover();
  };
  const onTriggerClick = (): void => {
    if (pickerOpen()) control.close();
    else open();
  };
  const onMenuToggle = (): void => {
    const openState = popoverOpen(menu);
    trigger.setAttribute("aria-expanded", String(openState));
    trigger.setAttribute("data-state", openState ? "open" : "closed");
    if (!openState) hideStrengthCard(control);
  };
  const onMenuClick = (event: MouseEvent): void => {
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>("button[data-model-id]")
        : null;
    if (!target?.dataset.modelId) return;
    // Picking a row selects that Model (with its default/kept strength) and
    // dismisses every popover. Cancel any pending Model + tier combination.
    cancelPendingSelection(control);
    control.close();
    trigger.focus();
    runtime.selectModel(target.dataset.modelId);
  };
  const onCardClick = (event: MouseEvent): void => {
    const target =
      event.target instanceof Element ? event.target.closest<HTMLButtonElement>("button") : null;
    const hoveredModelId = runtime.hoveredModelId;
    if (target?.dataset.thinkingDefault) {
      control.close();
      trigger.focus();
      if (hoveredModelId === null || hoveredModelId === runtime.modelView?.selected?.id) {
        runtime.selectDefaultThinking();
      } else {
        // Default strength of another Model == just selecting that Model.
        runtime.selectModel(hoveredModelId);
      }
      return;
    }
    if (target?.dataset.thinkingOptionId && hoveredModelId) {
      const thinkingOptionId = target.dataset.thinkingOptionId;
      control.close();
      trigger.focus();
      if (hoveredModelId === runtime.modelView?.selected?.id) {
        runtime.selectThinking(thinkingOptionId);
      } else {
        // One gesture: remember the tier, select the Model, then re-apply the
        // tier once the Model confirmation lands (see resolvePendingSelection).
        cancelPendingSelection(control);
        runtime.pendingSelection = { modelId: hoveredModelId, thinkingOptionId };
        runtime.selectModel(hoveredModelId);
      }
    }
  };
  const onMenuMouseLeave = (event: MouseEvent): void => {
    if (isNodeWithin(event.relatedTarget, card)) return;
    hideStrengthCard(control);
  };
  const onCardMouseLeave = (event: MouseEvent): void => {
    if (isNodeWithin(event.relatedTarget, menu) || isNodeWithin(event.relatedTarget, card)) return;
    hideStrengthCard(control);
  };
  const onMenuKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const active = document.activeElement;
    if (!(active instanceof HTMLButtonElement) || active.dataset.modelId === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const rows = [...control.options.values()]
      .filter((option) => !option.button.hidden)
      .map((option) => option.button);
    if (rows.length === 0) return;
    const index = rows.indexOf(active);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const next = rows[(index + delta + rows.length) % rows.length];
    if (next) next.focus();
  };
  const onDocumentPointerDown = (event: PointerEvent): void => {
    if (!popoverOpen(menu) && !popoverOpen(card)) return;
    const target = event.target instanceof Node ? event.target : null;
    if (target && (root.contains(target) || menu.contains(target) || card.contains(target))) {
      return;
    }
    control.close();
  };
  const onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    if (!popoverOpen(menu) && !popoverOpen(card)) return;
    event.preventDefault();
    if (popoverOpen(card)) {
      // Remember the anchor row before hiding resets the hovered model.
      const row = runtime.hoveredModelId
        ? (control.options.get(runtime.hoveredModelId)?.button ?? null)
        : null;
      hideStrengthCard(control);
      if (row && row.isConnected) row.focus();
      else trigger.focus();
      return;
    }
    control.close();
    trigger.focus();
  };
  // The menu/card scroll independently; the window-level scroll listener does
  // not catch element scroll (it does not bubble), so keep a hovered card glued
  // to its row while the list itself scrolls under the pointer.
  const onMenuScroll = (): void => {
    if (popoverOpen(card)) positionStrengthCard(control);
  };
  const onViewportChange = (): void => {
    if (popoverOpen(menu)) positionModelList(control);
    if (popoverOpen(card)) positionStrengthCard(control);
  };
  trigger.addEventListener("click", onTriggerClick);
  menu.addEventListener("toggle", onMenuToggle);
  menu.addEventListener("click", onMenuClick);
  menu.addEventListener("mouseleave", onMenuMouseLeave);
  menu.addEventListener("keydown", onMenuKeyDown);
  menu.addEventListener("scroll", onMenuScroll, true);
  card.addEventListener("scroll", onMenuScroll, true);
  card.addEventListener("click", onCardClick);
  card.addEventListener("mouseleave", onCardMouseLeave);
  document.addEventListener("pointerdown", onDocumentPointerDown, true);
  document.addEventListener("keydown", onDocumentKeyDown, true);
  window.addEventListener("resize", onViewportChange);
  window.addEventListener("scroll", onViewportChange, true);
  // Keep both popovers in the document viewport's coordinate space. The native
  // composer toolbar can be affected by browser zoom or a transformed ancestor;
  // portaling the menus prevents fixed-position coordinates from being resolved
  // in that local coordinate space.
  root.append(trigger);
  document.body.append(menu, card);

  // Install dispose on the same object returned (and stored in the runtime
  // WeakMap above) so composer-dom teardown releases the shared listeners.
  control.dispose = () => {
    control.close();
    trigger.removeEventListener("click", onTriggerClick);
    menu.removeEventListener("toggle", onMenuToggle);
    menu.removeEventListener("click", onMenuClick);
    menu.removeEventListener("mouseleave", onMenuMouseLeave);
    menu.removeEventListener("keydown", onMenuKeyDown);
    menu.removeEventListener("scroll", onMenuScroll, true);
    card.removeEventListener("scroll", onMenuScroll, true);
    card.removeEventListener("click", onCardClick);
    card.removeEventListener("mouseleave", onCardMouseLeave);
    searchInput.removeEventListener("input", onSearchInput);
    for (const type of silencedEventTypes) {
      searchInput.removeEventListener(type, silenceForHarness);
    }
    searchInput.removeEventListener("blur", onSearchBlur);
    document.removeEventListener("pointerdown", onDocumentPointerDown, true);
    document.removeEventListener("keydown", onDocumentKeyDown, true);
    window.removeEventListener("resize", onViewportChange);
    window.removeEventListener("scroll", onViewportChange, true);
    card.remove();
    menu.remove();
    root.remove();
  };
  syncRendererModelTriggerClass(control);
  return control;
}

export function renderRendererModelPicker(
  control: RendererModelPickerControl,
  view: RendererModelControlView,
  visible: boolean,
): void {
  control.root.style.display = visible ? "inline-flex" : "none";
  control.root.style.alignItems = "center";
  control.root.style.alignSelf = "center";
  control.root.style.height = "28px";
  control.root.style.flex = "0 0 auto";
  control.root.style.verticalAlign = "middle";
  if (!visible) {
    control.close();
    return;
  }
  const runtime = runtimeFor(control);
  runtime.modelView = view;
  resolvePendingSelection(control, view);
  const presentation = rendererModelPickerPresentation(view);
  const catalogSignature = JSON.stringify({ models: view.catalog?.models });
  // While the popover is open and the picker passes through a transient state
  // (conversation target rebind or catalog reload during turn renders), keep the
  // already-rendered list stable: do not rebuild it to an empty list or
  // force-close it under the pointer. It refreshes once a real catalog returns.
  const keepOpenMenu = popoverOpen(control.menu) && isTransientPickerState(view);
  if (control.root.dataset.catalogSignature !== catalogSignature && !keepOpenMenu) {
    rebuildModelList(control, view);
    control.root.dataset.catalogSignature = catalogSignature;
  }

  syncRendererLabelText(control.label, presentation.modelLabel);
  control.label.title = presentation.modelLabel;
  const secondaryLabel = presentation.thinkingLabel ?? presentation.resolvedModelLabel;
  syncRendererLabelText(control.thinkingLabel, secondaryLabel ?? "");
  control.thinkingLabel.hidden = secondaryLabel === undefined;
  const accessibleLabel = secondaryLabel
    ? `${presentation.modelLabel}, ${secondaryLabel}`
    : presentation.modelLabel;
  control.trigger.title = view.error ?? accessibleLabel;
  control.trigger.setAttribute("aria-label", `Model: ${accessibleLabel}`);
  control.trigger.setAttribute(
    "aria-busy",
    String(view.status === "loading" || view.status === "selecting"),
  );
  control.trigger.disabled = isRendererModelPickerDisabled(view);
  if (shouldCloseRendererModelPicker(view) && !keepOpenMenu) control.close();

  control.hint.textContent = presentation.linkageHint ?? "";
  control.hint.hidden = presentation.linkageHint === undefined;

  for (const [modelId, option] of control.options) {
    const selected = modelId === view.selected?.id;
    setOptionRowChecked(option.button, selected);
    option.button.disabled = control.trigger.disabled;
  }
  if (popoverOpen(control.card)) syncCardCheckedState(control);
}
