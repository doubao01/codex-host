import {
  defaultModelProviderPath,
  modelProviderWireFormats,
  type ModelGatewayStatusResult,
  type ModelPoolEntry,
  type ModelPoolEntryAddParams,
  type ModelPoolEntryRemoveParams,
  type ModelProviderConfig,
  type ModelProviderFetchModelsResult,
  type ModelProviderHeader,
  type ModelProviderId,
  type ModelProviderListResult,
  type ModelProviderSaveParams,
  type ModelProviderTestResult,
  type ModelProviderWireFormat,
} from "@codexhost/shared-contracts";

import type { RendererSettingsPageDefinition, RendererSettingsPageMountContext } from "./core.js";
import { createRendererSettingsIcon } from "./icons.js";
import type { RendererSettingsMessages } from "./localization.js";

/** RPC-backed client used by the Model Services settings page. */
export interface RendererModelProviderClient {
  listModelProviders(): Promise<ModelProviderListResult>;
  saveModelProvider(input: ModelProviderSaveParams): Promise<ModelProviderListResult>;
  removeModelProvider(id: string): Promise<ModelProviderListResult>;
  addModelPoolEntry(input: ModelPoolEntryAddParams): Promise<ModelProviderListResult>;
  removeModelPoolEntry(input: ModelPoolEntryRemoveParams): Promise<ModelProviderListResult>;
  fetchModelProviderModels(id: string): Promise<ModelProviderFetchModelsResult>;
  testModelProvider(id: string): Promise<ModelProviderTestResult>;
  readModelGatewayStatus(): Promise<ModelGatewayStatusResult>;
}

const MODEL_PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;

/** Sentinel used while the inline form is adding a brand-new source. */
const ADD_PROVIDER_KEY = "__new__";

function wireFormatLabel(
  wireFormat: ModelProviderWireFormat,
  messages: RendererSettingsMessages,
): string {
  if (wireFormat === "openai-chat") return messages.modelServicesWireFormatOpenAiChat;
  if (wireFormat === "openai-responses") return messages.modelServicesWireFormatOpenAiResponses;
  return messages.modelServicesWireFormatAnthropic;
}

function fullUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/u, "")}${path}`;
}

function poolKey(entry: Pick<ModelPoolEntry, "modelId" | "providerId">): string {
  return `${entry.providerId}/${entry.modelId}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

/** Derives a lowercase-slug ID from the source remark; no ID field is exposed. */
function generateProviderId(name: string, existing: Iterable<string>): ModelProviderId {
  const taken = new Set(existing);
  const base = slugify(name) || "provider";
  let candidate = base;
  let suffix = 2;
  while (taken.has(candidate) || !MODEL_PROVIDER_ID_PATTERN.test(candidate)) {
    candidate = `${base.slice(0, 56)}-${suffix++}`;
  }
  return candidate as ModelProviderId;
}

function createButton(
  document: Document,
  className: string,
  label: string,
  icon: "refresh" | "check" | "download" | "undo" | "close",
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.append(createRendererSettingsIcon(icon, 14), label);
  return button;
}

type HeaderRow = { name: string; value: string; storedValue: boolean };

/** Live state behind the single expanded inline form. Rebuilt on render. */
interface ExpandedFormState {
  /** Null while adding a brand-new source; set once the source is persisted. */
  providerId: ModelProviderId | null;
  wireFormat: ModelProviderWireFormat;
  baseUrl: string;
  path: string;
  apiKey: string;
  name: string;
  headers: HeaderRow[];
  clearedHeaders: Set<string>;
}

export function createModelServicesSettingsPage(
  messages: RendererSettingsMessages,
  getClient: () => RendererModelProviderClient | null,
): RendererSettingsPageDefinition {
  return Object.freeze({
    id: "model-services",
    label: messages.pageLabels["model-services"],
    icon: "model-pool",
    mount(context: RendererSettingsPageMountContext) {
      const document = context.content.ownerDocument;
      const client = getClient();

      const heading = document.createElement("div");
      heading.className = "settings-section-label";
      heading.textContent = messages.pageLabels["model-services"];
      const description = document.createElement("p");
      description.className = "settings-page-description";
      description.textContent = messages.modelServicesDescription;
      context.content.append(heading, description);

      if (!client) {
        const unavailable = document.createElement("p");
        unavailable.style.color = "var(--settings-muted)";
        unavailable.textContent = messages.runtimeCapabilityNotInstalled;
        context.content.append(unavailable);
        return undefined;
      }

      const gatewayPanel = document.createElement("section");
      gatewayPanel.className = "settings-model-gateway-panel";
      const gatewayTitle = document.createElement("strong");
      gatewayTitle.textContent = messages.modelServicesGatewayTitle;
      const gatewayBody = document.createElement("div");
      gatewayBody.className = "settings-model-gateway-body";
      gatewayPanel.append(gatewayTitle, gatewayBody);

      const sourceList = document.createElement("section");
      sourceList.className = "settings-model-source-list";

      const errorNote = document.createElement("p");
      errorNote.className = "settings-model-services-error";
      errorNote.setAttribute("aria-live", "polite");

      context.content.append(gatewayPanel, errorNote, sourceList);

      let latest: ModelProviderListResult | null = null;
      let gatewayStatus: ModelGatewayStatusResult | null = null;
      let formState: ExpandedFormState | null = null;
      const fetchedModels = new Map<string, ModelProviderFetchModelsResult["models"]>();
      const testResults = new Map<string, ModelProviderTestResult>();
      const pending = new Set<string>();

      const runRequest = <T>(
        operation: () => Promise<T>,
        success: (value: T) => void,
        failure?: (error: unknown) => void,
      ): void => {
        void context.runLatest(operation, {
          success,
          failure(error) {
            errorNote.textContent =
              error instanceof Error ? error.message : messages.modelServicesRequestFailed;
            failure?.(error);
          },
        });
      };

      const fetchModelsFor = (providerId: ModelProviderId): void => {
        pending.clear();
        pending.add(providerId);
        runRequest(
          () => client.fetchModelProviderModels(providerId),
          (result) => {
            fetchedModels.set(providerId, result.models);
            pending.delete(providerId);
            render(latest);
          },
          () => pending.delete(providerId),
        );
      };

      const buildHeadersPayload = (form: ExpandedFormState): ModelProviderHeader[] => {
        const headers: ModelProviderHeader[] = [];
        for (const row of form.headers) {
          const name = row.name.trim();
          if (name.length === 0) continue;
          const value = row.value.trim();
          if (value.length > 0) headers.push({ name, value });
          else if (row.storedValue) headers.push({ name }); // keep the stored value
        }
        for (const name of form.clearedHeaders) {
          if (name.length > 0) headers.push({ name, value: "" }); // clear the stored value
        }
        return headers;
      };

      const submitForm = (opts: {
        formStatus: HTMLElement;
        keepOpen: boolean;
        onSaved?: (id: ModelProviderId) => void;
      }): void => {
        if (!formState) return;
        const form = formState;
        const name = form.name.trim();
        const baseUrl = form.baseUrl.trim();
        const path = form.path.trim();
        if (name.length === 0 || baseUrl.length === 0) {
          opts.formStatus.textContent = messages.modelServicesSaveFailed;
          return;
        }
        if (path.length > 0 && !path.startsWith("/")) {
          opts.formStatus.textContent = messages.modelServicesInvalidPath;
          return;
        }
        const id =
          form.providerId ??
          generateProviderId(name, latest?.providers.map((provider) => provider.id) ?? []);
        const headers = buildHeadersPayload(form);
        opts.formStatus.textContent = "";
        runRequest(
          () =>
            client.saveModelProvider({
              id,
              name,
              wireFormat: form.wireFormat,
              baseUrl,
              ...(path.length > 0 ? { path } : {}),
              ...(form.apiKey.length > 0 ? { apiKey: form.apiKey } : {}),
              ...(headers.length > 0 ? { headers } : {}),
            }),
          (result) => {
            latest = result;
            if (opts.keepOpen) {
              form.providerId = id;
              form.apiKey = "";
              render(result);
              opts.onSaved?.(id);
            } else {
              formState = null;
              render(result);
            }
          },
        );
      };

      const renderGateway = (result: ModelProviderListResult): void => {
        gatewayBody.replaceChildren();
        const endpoint = document.createElement("div");
        endpoint.className = "settings-model-gateway-line";
        const endpointLabel = document.createElement("span");
        endpointLabel.textContent = messages.modelServicesGatewayEndpointLabel;
        const endpointValue = document.createElement("code");
        endpointValue.dataset.modelGatewayEndpoint = "value";
        endpointValue.textContent =
          result.gatewayEndpoint ?? messages.modelServicesGatewayNotConfigured;
        endpoint.append(endpointLabel, endpointValue);
        gatewayBody.append(endpoint);

        const routes = document.createElement("div");
        routes.className = "settings-model-gateway-routes";
        const routeTitle = document.createElement("span");
        routeTitle.textContent = messages.modelServicesGatewayDefaultRouteLabel;
        routes.append(routeTitle);
        const routesList = document.createElement("div");
        routesList.dataset.modelGatewayRoutes = "list";
        const defaultRoutes = gatewayStatus?.defaultRoutes ?? [];
        if (defaultRoutes.length === 0) {
          const empty = document.createElement("span");
          empty.textContent = messages.modelServicesGatewayNotConfigured;
          routesList.append(empty);
        } else {
          for (const route of defaultRoutes) {
            const item = document.createElement("span");
            item.className = "settings-model-gateway-route";
            item.dataset.modelDefaultRoute = route.wireFormat;
            item.textContent = `${wireFormatLabel(route.wireFormat, messages)}: ${route.providerId}`;
            routesList.append(item);
          }
        }
        routes.append(routesList);
        gatewayBody.append(routes);

        const note = document.createElement("p");
        note.className = "settings-model-gateway-note";
        note.textContent = messages.modelServicesNewThreadNote;
        gatewayBody.append(note);
      };

      const renderProviderCard = (
        provider: ModelProviderConfig,
        pool: readonly ModelPoolEntry[],
      ): HTMLElement => {
        const card = document.createElement("div");
        card.className = "settings-model-provider-card";
        card.dataset.modelProviderCard = provider.id;
        const expanded = formState !== null && formState.providerId === provider.id;
        if (expanded) card.dataset.modelProviderExpand = provider.id;

        const identity = document.createElement("div");
        identity.className = "settings-model-provider-card__identity";
        const badge = document.createElement("span");
        badge.className = "settings-model-wire-format-badge";
        badge.dataset.modelProviderWireFormat = provider.id;
        badge.textContent = wireFormatLabel(provider.wireFormat, messages);
        const name = document.createElement("strong");
        name.dataset.modelProviderName = provider.id;
        name.textContent = provider.name;
        identity.append(badge, name);

        const endpoint = document.createElement("div");
        endpoint.className = "settings-model-provider-card__endpoint";
        const baseUrl = document.createElement("code");
        baseUrl.dataset.modelProviderBaseUrl = provider.id;
        baseUrl.textContent = provider.baseUrl;
        const pathPreview = document.createElement("code");
        pathPreview.className = "settings-model-provider-card__path";
        pathPreview.dataset.modelProviderPath = provider.id;
        pathPreview.textContent = provider.path ?? defaultModelProviderPath(provider.wireFormat);
        endpoint.append(baseUrl, pathPreview);

        const meta = document.createElement("div");
        meta.className = "settings-model-provider-card__meta";
        const apiKeyStatus = document.createElement("span");
        apiKeyStatus.dataset.modelProviderApiKeyStatus = provider.id;
        apiKeyStatus.textContent = provider.hasApiKey
          ? messages.modelServicesProviderApiKeySaved
          : messages.modelServicesProviderApiKeyMissing;
        meta.append(apiKeyStatus);
        const storedHeaders = provider.headers?.filter((header) => header.hasValue) ?? [];
        if (storedHeaders.length > 0) {
          const headersBadge = document.createElement("span");
          headersBadge.dataset.modelProviderHeaders = provider.id;
          headersBadge.textContent = `${storedHeaders.length} ${messages.modelServicesHeaders}`;
          meta.append(headersBadge);
        }
        const modelCount = pool.filter((entry) => entry.providerId === provider.id).length;
        if (modelCount > 0) {
          const countBadge = document.createElement("span");
          countBadge.dataset.modelProviderModelCount = provider.id;
          countBadge.textContent = `${modelCount} ${messages.modelServicesModelsTitle}`;
          meta.append(countBadge);
        }

        const controls = document.createElement("div");
        controls.className = "settings-model-provider-card__controls";
        const busy = pending.has(provider.id);
        const fetchButton = createButton(
          document,
          "settings-command-button settings-command-button--secondary",
          busy ? messages.modelServicesFetchingModels : messages.modelServicesFetchModels,
          "refresh",
        );
        fetchButton.disabled = busy;
        fetchButton.addEventListener("click", () => {
          // Expand the card so the fetched candidates show in the model section.
          openForm(provider);
          fetchModelsFor(provider.id);
        });
        const testButton = createButton(
          document,
          "settings-command-button settings-command-button--secondary",
          busy ? messages.modelServicesTesting : messages.modelServicesTest,
          "check",
        );
        testButton.disabled = busy;
        testButton.addEventListener("click", () => {
          pending.clear();
          pending.add(provider.id);
          runRequest(
            () => client.testModelProvider(provider.id),
            (result) => {
              testResults.set(provider.id, result);
              pending.delete(provider.id);
              render(latest);
            },
            () => pending.delete(provider.id),
          );
        });
        const editButton = createButton(
          document,
          "settings-command-button settings-command-button--secondary",
          messages.modelServicesEditProvider,
          "undo",
        );
        editButton.addEventListener("click", () => openForm(provider));
        const removeButton = createButton(
          document,
          "settings-model-provider-remove",
          messages.modelServicesRemoveProvider,
          "close",
        );
        removeButton.setAttribute(
          "aria-label",
          `${messages.modelServicesRemoveProvider} ${provider.name}`,
        );
        removeButton.addEventListener("click", () => {
          if (formState?.providerId === provider.id) formState = null;
          runRequest(
            () => client.removeModelProvider(provider.id),
            (result) => {
              latest = result;
              fetchedModels.delete(provider.id);
              testResults.delete(provider.id);
              render(result);
            },
          );
        });
        controls.append(fetchButton, testButton, editButton, removeButton);

        const status = document.createElement("span");
        status.className = "settings-model-provider-status";
        status.dataset.modelProviderStatus = provider.id;
        const testResult = testResults.get(provider.id);
        if (testResult) {
          if (testResult.ok) {
            status.textContent =
              testResult.latencyMs !== undefined
                ? `${messages.modelServicesTestSuccess} · ${testResult.latencyMs} ms`
                : messages.modelServicesTestSuccess;
            status.style.color = "#4ade80";
          } else {
            status.textContent = `${messages.modelServicesTestFailed}${testResult.error ? `: ${testResult.error}` : ""}`;
            status.style.color = "var(--settings-muted)";
          }
        }

        card.append(identity, endpoint, meta, controls, status);
        if (expanded && formState) card.append(buildForm(formState));
        return card;
      };

      const renderAddCard = (): HTMLElement => {
        const card = document.createElement("div");
        card.className = "settings-model-provider-card settings-model-provider-card--add";
        card.dataset.modelProviderExpand = ADD_PROVIDER_KEY;
        const title = document.createElement("strong");
        title.className = "settings-model-provider-card__add-title";
        title.textContent = messages.modelServicesAddProvider;
        card.append(title);
        if (formState) card.append(buildForm(formState));
        return card;
      };

      const renderSourceList = (result: ModelProviderListResult): void => {
        sourceList.replaceChildren();
        const head = document.createElement("div");
        head.className = "settings-model-source-list__head";
        const title = document.createElement("strong");
        title.textContent = messages.modelServicesSourcesTitle;
        const addButton = createButton(
          document,
          "settings-command-button",
          messages.modelServicesAddProvider,
          "check",
        );
        addButton.addEventListener("click", () => openForm(null));
        head.append(title, addButton);
        sourceList.append(head);

        if (result.providers.length === 0 && formState === null) {
          const empty = document.createElement("p");
          empty.className = "settings-model-source-list__empty";
          empty.textContent = messages.modelServicesNoProviders;
          sourceList.append(empty);
          return;
        }
        for (const provider of result.providers) {
          sourceList.append(renderProviderCard(provider, result.pool));
        }
        if (formState !== null && formState.providerId === null) {
          sourceList.append(renderAddCard());
        }
      };

      const openForm = (provider: ModelProviderConfig | null): void => {
        formState = provider
          ? {
              providerId: provider.id,
              wireFormat: provider.wireFormat,
              baseUrl: provider.baseUrl,
              path: provider.path ?? defaultModelProviderPath(provider.wireFormat),
              apiKey: "",
              name: provider.name,
              headers: (provider.headers ?? []).map((header) => ({
                name: header.name,
                value: "",
                storedValue: header.hasValue ?? false,
              })),
              clearedHeaders: new Set<string>(),
            }
          : {
              providerId: null,
              wireFormat: "openai-chat",
              baseUrl: "",
              path: defaultModelProviderPath("openai-chat"),
              apiKey: "",
              name: "",
              headers: [],
              clearedHeaders: new Set<string>(),
            };
        render(latest);
      };

      const render = (result: ModelProviderListResult | null): void => {
        if (result) latest = result;
        errorNote.textContent = "";
        const current = latest;
        if (!current) return;
        renderGateway(current);
        renderSourceList(current);
      };

      const buildForm = (form: ExpandedFormState): HTMLFormElement => {
        const formElement = document.createElement("form");
        formElement.className = "settings-model-provider-form";
        formElement.noValidate = true;

        // 1. Wire format (linked to the exact request path).
        const wireFormatField = document.createElement("label");
        wireFormatField.className = "settings-model-field";
        const wireFormatLabelEl = document.createElement("span");
        wireFormatLabelEl.textContent = messages.modelServicesProviderWireFormat;
        const wireFormatInput = document.createElement("select");
        for (const wireFormat of modelProviderWireFormats) {
          const option = document.createElement("option");
          option.value = wireFormat;
          option.textContent = wireFormatLabel(wireFormat, messages);
          wireFormatInput.append(option);
        }
        wireFormatInput.value = form.wireFormat;
        wireFormatField.append(wireFormatLabelEl, wireFormatInput);

        // 2. Base URL with a live full-URL preview.
        const baseUrlField = document.createElement("label");
        baseUrlField.className = "settings-model-field";
        const baseUrlLabelEl = document.createElement("span");
        baseUrlLabelEl.textContent = messages.modelServicesProviderBaseUrl;
        const baseUrlInput = document.createElement("input");
        baseUrlInput.type = "url";
        baseUrlInput.placeholder = "https://api.example.com";
        baseUrlInput.value = form.baseUrl;
        const fullUrlPreview = document.createElement("code");
        fullUrlPreview.className = "settings-model-full-url";
        baseUrlField.append(baseUrlLabelEl, baseUrlInput, fullUrlPreview);

        // 3. API token with a reveal/hide toggle.
        const apiKeyField = document.createElement("label");
        apiKeyField.className = "settings-model-field";
        const apiKeyLabelEl = document.createElement("span");
        apiKeyLabelEl.textContent = messages.modelServicesProviderApiKey;
        const apiKeyRow = document.createElement("span");
        apiKeyRow.className = "settings-model-api-key-row";
        const apiKeyInput = document.createElement("input");
        apiKeyInput.type = "password";
        apiKeyInput.autocomplete = "off";
        apiKeyInput.placeholder = messages.modelServicesProviderApiKeyHint;
        const apiKeyToggle = document.createElement("button");
        apiKeyToggle.type = "button";
        apiKeyToggle.className = "settings-model-api-key-toggle";
        apiKeyToggle.textContent = messages.modelServicesApiKeyShow;
        apiKeyRow.append(apiKeyInput, apiKeyToggle);
        apiKeyField.append(apiKeyLabelEl, apiKeyRow);
        const hasStoredKey =
          form.providerId !== null &&
          (latest?.providers.find((candidate) => candidate.id === form.providerId)?.hasApiKey ??
            false);
        if (hasStoredKey) {
          const storedHint = document.createElement("span");
          storedHint.className = "settings-model-field__hint";
          storedHint.textContent = messages.modelServicesProviderApiKeySaved;
          apiKeyField.append(storedHint);
        }

        // 4. Model name / model list: fetch candidates, check into the pool,
        //    manual add row, context-window per model.
        const modelsBlock = document.createElement("div");
        modelsBlock.className = "settings-model-models";
        const modelsHead = document.createElement("div");
        modelsHead.className = "settings-model-models__head";
        const modelsTitle = document.createElement("strong");
        modelsTitle.textContent = messages.modelServicesModelsTitle;
        const providerBusy = form.providerId !== null && pending.has(form.providerId);
        const fetchButton = createButton(
          document,
          "settings-command-button settings-command-button--secondary",
          providerBusy ? messages.modelServicesFetchingModels : messages.modelServicesFetchModels,
          "refresh",
        );
        fetchButton.disabled = providerBusy;
        fetchButton.addEventListener("click", () => {
          if (form.providerId !== null) {
            fetchModelsFor(form.providerId);
            return;
          }
          // Add mode: persist the source first so the fetch has an ID to use.
          submitForm({
            formStatus,
            keepOpen: true,
            onSaved: (id) => fetchModelsFor(id),
          });
        });
        modelsHead.append(modelsTitle, fetchButton);
        const candidates = document.createElement("div");
        candidates.className = "settings-model-candidates";
        const poolList = document.createElement("div");
        poolList.className = "settings-model-pool-list";
        const addModelRow = document.createElement("div");
        addModelRow.className = "settings-model-add-model";
        const addModelIdInput = document.createElement("input");
        addModelIdInput.type = "text";
        addModelIdInput.placeholder = "model-id";
        const addModelLabelInput = document.createElement("input");
        addModelLabelInput.type = "text";
        addModelLabelInput.placeholder = messages.modelServicesModelLabelPlaceholder;
        const addModelContextInput = document.createElement("input");
        addModelContextInput.type = "number";
        addModelContextInput.min = "1";
        addModelContextInput.placeholder = messages.modelServicesContextWindow;
        const addModelButton = createButton(
          document,
          "settings-command-button settings-command-button--secondary",
          messages.modelServicesAddModel,
          "check",
        );
        addModelButton.addEventListener("click", () => {
          const modelId = addModelIdInput.value.trim();
          const providerId = form.providerId;
          if (modelId.length === 0 || providerId === null) return;
          const label = addModelLabelInput.value.trim();
          const contextWindow = addModelContextInput.value
            ? Number(addModelContextInput.value)
            : undefined;
          runRequest(
            () =>
              client.addModelPoolEntry({
                modelId,
                ...(label.length > 0 ? { label } : {}),
                providerId,
                ...(contextWindow !== undefined &&
                Number.isInteger(contextWindow) &&
                contextWindow > 0
                  ? { contextWindow }
                  : {}),
              }),
            (result) => {
              latest = result;
              render(result);
            },
          );
        });
        addModelRow.append(
          addModelIdInput,
          addModelLabelInput,
          addModelContextInput,
          addModelButton,
        );
        modelsBlock.append(modelsHead, candidates, poolList, addModelRow);

        // 5. Remark (the source display name; also the slug source).
        const nameField = document.createElement("label");
        nameField.className = "settings-model-field";
        const nameLabelEl = document.createElement("span");
        nameLabelEl.textContent = messages.modelServicesProviderName;
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.value = form.name;
        nameField.append(nameLabelEl, nameInput);

        // 6. Advanced: exact-path override + dynamic request headers.
        const advanced = document.createElement("details");
        advanced.className = "settings-model-advanced";
        const advancedSummary = document.createElement("summary");
        advancedSummary.textContent = messages.modelServicesAdvanced;
        const pathField = document.createElement("label");
        pathField.className = "settings-model-field";
        const pathLabelEl = document.createElement("span");
        pathLabelEl.textContent = messages.modelServicesProviderPath;
        const pathInput = document.createElement("input");
        pathInput.type = "text";
        pathInput.value = form.path;
        pathInput.placeholder = defaultModelProviderPath(form.wireFormat);
        const pathHint = document.createElement("span");
        pathHint.className = "settings-model-field__hint";
        pathHint.textContent = messages.modelServicesPathHint;
        pathField.append(pathLabelEl, pathInput, pathHint);
        const headersBlock = document.createElement("div");
        headersBlock.className = "settings-model-headers";
        const headersHead = document.createElement("div");
        headersHead.className = "settings-model-headers__head";
        const headersTitle = document.createElement("strong");
        headersTitle.textContent = messages.modelServicesHeaders;
        const addHeaderButton = createButton(
          document,
          "settings-command-button settings-command-button--secondary",
          messages.modelServicesAddHeader,
          "check",
        );
        headersHead.append(headersTitle, addHeaderButton);
        const headerRows = document.createElement("div");
        headerRows.className = "settings-model-headers__rows";
        headersBlock.append(headersHead, headerRows);
        advanced.append(advancedSummary, pathField, headersBlock);

        // 7. Actions + inline status.
        const actions = document.createElement("div");
        actions.className = "settings-model-provider-form__actions";
        const saveButton = createButton(
          document,
          "settings-command-button",
          messages.modelServicesSave,
          "check",
        );
        const cancelButton = createButton(
          document,
          "settings-command-button settings-command-button--secondary",
          messages.modelServicesCancel,
          "close",
        );
        const formStatus = document.createElement("span");
        formStatus.className = "settings-model-provider-form-status";
        formStatus.dataset.modelProviderFormStatus = "value";
        actions.append(saveButton, cancelButton, formStatus);

        formElement.append(
          wireFormatField,
          baseUrlField,
          apiKeyField,
          modelsBlock,
          nameField,
          advanced,
          actions,
        );

        const refreshFullUrl = (): void => {
          fullUrlPreview.textContent =
            baseUrlInput.value.trim().length > 0
              ? fullUrl(baseUrlInput.value.trim(), pathInput.value.trim())
              : "";
        };
        refreshFullUrl();

        wireFormatInput.addEventListener("change", () => {
          form.wireFormat = wireFormatInput.value as ModelProviderWireFormat;
          form.path = defaultModelProviderPath(form.wireFormat);
          pathInput.value = form.path;
          pathInput.placeholder = form.path;
          refreshFullUrl();
        });
        baseUrlInput.addEventListener("input", () => {
          form.baseUrl = baseUrlInput.value;
          refreshFullUrl();
        });
        pathInput.addEventListener("input", () => {
          form.path = pathInput.value;
          refreshFullUrl();
        });
        apiKeyInput.addEventListener("input", () => {
          form.apiKey = apiKeyInput.value;
        });
        nameInput.addEventListener("input", () => {
          form.name = nameInput.value;
        });
        apiKeyToggle.addEventListener("click", () => {
          const reveal = apiKeyInput.type === "password";
          apiKeyInput.type = reveal ? "text" : "password";
          apiKeyToggle.textContent = reveal
            ? messages.modelServicesApiKeyHide
            : messages.modelServicesApiKeyShow;
        });

        const renderHeaderRows = (): void => {
          headerRows.replaceChildren();
          if (form.headers.length === 0) {
            const empty = document.createElement("p");
            empty.className = "settings-model-headers__empty";
            empty.textContent = messages.modelServicesNoHeaders;
            headerRows.append(empty);
            return;
          }
          form.headers.forEach((row, index) => {
            const rowElement = document.createElement("div");
            rowElement.className = "settings-model-header-row";
            const nameInput = document.createElement("input");
            nameInput.type = "text";
            nameInput.placeholder = messages.modelServicesHeaderName;
            nameInput.value = row.name;
            nameInput.addEventListener("input", () => {
              row.name = nameInput.value;
            });
            const valueInput = document.createElement("input");
            valueInput.type = "text";
            valueInput.placeholder = row.storedValue
              ? messages.modelServicesHeaderValueSaved
              : messages.modelServicesHeaderValue;
            valueInput.value = row.value;
            valueInput.addEventListener("input", () => {
              row.value = valueInput.value;
            });
            const removeButton = createButton(
              document,
              "settings-model-header-remove",
              messages.modelServicesCandidateRemove,
              "close",
            );
            removeButton.setAttribute(
              "aria-label",
              `${messages.modelServicesRemoveHeader} ${row.name || ""}`.trim(),
            );
            removeButton.addEventListener("click", () => {
              if (row.storedValue) form.clearedHeaders.add(row.name.trim());
              form.headers.splice(index, 1);
              renderHeaderRows();
            });
            rowElement.append(nameInput, valueInput, removeButton);
            headerRows.append(rowElement);
          });
        };
        renderHeaderRows();
        addHeaderButton.addEventListener("click", () => {
          form.headers.push({ name: "", value: "", storedValue: false });
          renderHeaderRows();
        });

        const renderModelSection = (): void => {
          const providerId = form.providerId;
          const pool = latest?.pool ?? [];
          const fetched = providerId !== null ? (fetchedModels.get(providerId) ?? []) : [];
          const hasFetched = providerId !== null && fetchedModels.has(providerId);

          candidates.replaceChildren();
          for (const model of fetched) {
            const inPool =
              providerId !== null &&
              pool.some((entry) => entry.modelId === model.id && entry.providerId === providerId);
            const row = document.createElement("label");
            row.className = "settings-model-provider-candidate";
            row.dataset.modelCandidate = providerId ? `${providerId}/${model.id}` : model.id;
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = inPool;
            checkbox.disabled = providerId === null;
            checkbox.addEventListener("change", () => {
              if (providerId === null) return;
              if (checkbox.checked) {
                runRequest(
                  () =>
                    client.addModelPoolEntry({
                      modelId: model.id,
                      ...(model.label !== undefined ? { label: model.label } : {}),
                      providerId,
                    }),
                  (result) => {
                    latest = result;
                    render(result);
                  },
                );
              } else {
                runRequest(
                  () => client.removeModelPoolEntry({ modelId: model.id, providerId }),
                  (result) => {
                    latest = result;
                    render(result);
                  },
                );
              }
            });
            const label = document.createElement("span");
            label.textContent = model.label ?? model.id;
            const id = document.createElement("code");
            id.textContent = model.id;
            row.append(checkbox, label, id);
            candidates.append(row);
          }
          if (hasFetched && fetched.length === 0) {
            const hint = document.createElement("p");
            hint.className = "settings-model-candidates__empty";
            hint.textContent = messages.modelServicesNoModels;
            candidates.append(hint);
          } else if (!hasFetched && providerId !== null) {
            const hint = document.createElement("p");
            hint.className = "settings-model-candidates__empty";
            hint.textContent = messages.modelServicesModelsNotFetched;
            candidates.append(hint);
          }

          poolList.replaceChildren();
          const entries = pool.filter((entry) => entry.providerId === providerId);
          for (const entry of entries) {
            const rowElement = document.createElement("div");
            rowElement.className = "settings-model-pool-entry";
            rowElement.dataset.modelPoolEntry = poolKey(entry);
            const id = document.createElement("code");
            id.textContent = entry.modelId;
            const label = document.createElement("span");
            label.textContent = entry.label ?? "";
            const contextInput = document.createElement("input");
            contextInput.type = "number";
            contextInput.min = "1";
            contextInput.placeholder = messages.modelServicesContextWindow;
            contextInput.value =
              entry.contextWindow !== undefined ? String(entry.contextWindow) : "";
            contextInput.addEventListener("change", () => {
              const value = Number(contextInput.value);
              if (!Number.isInteger(value) || value <= 0) return;
              runRequest(
                () =>
                  client.addModelPoolEntry({
                    modelId: entry.modelId,
                    ...(entry.label !== undefined ? { label: entry.label } : {}),
                    providerId: entry.providerId,
                    contextWindow: value,
                  }),
                (result) => {
                  latest = result;
                  render(result);
                },
              );
            });
            const removeButton = createButton(
              document,
              "settings-model-pool-remove",
              messages.modelServicesCandidateRemove,
              "close",
            );
            removeButton.setAttribute(
              "aria-label",
              `${messages.modelServicesCandidateRemove} ${entry.modelId}`,
            );
            removeButton.addEventListener("click", () => {
              runRequest(
                () =>
                  client.removeModelPoolEntry({
                    modelId: entry.modelId,
                    providerId: entry.providerId,
                  }),
                (result) => {
                  latest = result;
                  render(result);
                },
              );
            });
            rowElement.append(id, label, contextInput, removeButton);
            poolList.append(rowElement);
          }
        };
        renderModelSection();

        saveButton.addEventListener("click", (event) => {
          event.preventDefault();
          submitForm({ formStatus, keepOpen: false });
        });
        cancelButton.addEventListener("click", (event) => {
          event.preventDefault();
          formState = null;
          render(latest);
        });

        return formElement;
      };

      // The gateway endpoint is carried by the list result while the default
      // routes come from gateway-status. runLatest only keeps the newest
      // request, so load both in a single operation before the first render.
      runRequest(
        () => Promise.all([client.readModelGatewayStatus(), client.listModelProviders()]),
        ([status, result]) => {
          gatewayStatus = status;
          latest = result;
          render(result);
        },
      );

      return undefined;
    },
  });
}
