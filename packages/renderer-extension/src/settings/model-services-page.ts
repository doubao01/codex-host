import {
  modelProviderProtocols,
  type ModelGatewayStatusResult,
  type ModelPoolEntry,
  type ModelPoolEntryAddParams,
  type ModelPoolEntryRemoveParams,
  type ModelProviderConfig,
  type ModelProviderFetchModelsResult,
  type ModelProviderId,
  type ModelProviderListResult,
  type ModelProviderProtocol,
  type ModelProviderSaveParams,
  type ModelProviderTestResult,
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

const MODEL_PROVIDER_PROTOCOL_LABELS: Readonly<Record<ModelProviderProtocol, string>> =
  Object.freeze({
    openai: "OpenAI",
    anthropic: "Anthropic",
    ollama: "Ollama",
    lmstudio: "LM Studio",
  });

const MODEL_PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;

function providerDescription(
  protocol: ModelProviderProtocol,
  messages: RendererSettingsMessages,
): string {
  if (protocol === "openai") return messages.modelServicesProtocolOpenAiDescription;
  if (protocol === "anthropic") return messages.modelServicesProtocolAnthropicDescription;
  if (protocol === "ollama") return messages.modelServicesProtocolOllamaDescription;
  return messages.modelServicesProtocolLmstudioDescription;
}

function poolKey(entry: Pick<ModelPoolEntry, "modelId" | "providerId">): string {
  return `${entry.providerId}/${entry.modelId}`;
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

      const errorNote = document.createElement("p");
      errorNote.className = "settings-model-services-error";
      errorNote.setAttribute("aria-live", "polite");

      // Add / edit form. Shared across every protocol section; the protocol is
      // only selectable while adding a brand-new source.
      const form = document.createElement("form");
      form.className = "settings-model-provider-form";
      form.hidden = true;
      const formTitle = document.createElement("strong");
      formTitle.textContent = messages.modelServicesAddProvider;
      const idField = document.createElement("label");
      idField.textContent = messages.modelServicesProviderId;
      const idInput = document.createElement("input");
      idInput.type = "text";
      idInput.autocomplete = "off";
      idInput.spellcheck = false;
      idInput.placeholder = "my-gateway";
      idField.append(idInput);
      const nameField = document.createElement("label");
      nameField.textContent = messages.modelServicesProviderName;
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameField.append(nameInput);
      const baseUrlField = document.createElement("label");
      baseUrlField.textContent = messages.modelServicesProviderBaseUrl;
      const baseUrlInput = document.createElement("input");
      baseUrlInput.type = "url";
      baseUrlInput.placeholder = "https://api.example.com/v1";
      baseUrlField.append(baseUrlInput);
      const protocolField = document.createElement("label");
      protocolField.textContent = messages.modelServicesProviderProtocol;
      const protocolInput = document.createElement("select");
      for (const protocol of modelProviderProtocols) {
        const option = document.createElement("option");
        option.value = protocol;
        option.textContent = MODEL_PROVIDER_PROTOCOL_LABELS[protocol];
        protocolInput.append(option);
      }
      protocolField.append(protocolInput);
      const apiKeyField = document.createElement("label");
      apiKeyField.textContent = messages.modelServicesProviderApiKey;
      const apiKeyInput = document.createElement("input");
      apiKeyInput.type = "password";
      apiKeyInput.autocomplete = "off";
      apiKeyInput.placeholder = messages.modelServicesProviderApiKeyHint;
      apiKeyField.append(apiKeyInput);
      const formStatus = document.createElement("span");
      formStatus.className = "settings-model-provider-form-status";
      const actions = document.createElement("div");
      actions.className = "settings-model-provider-form-actions";
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
      actions.append(saveButton, cancelButton);
      form.append(
        formTitle,
        idField,
        nameField,
        baseUrlField,
        protocolField,
        apiKeyField,
        formStatus,
        actions,
      );
      context.content.append(gatewayPanel, errorNote, form);

      let latest: ModelProviderListResult | null = null;
      let gatewayStatus: ModelGatewayStatusResult | null = null;
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
            item.dataset.modelDefaultRoute = route.protocol;
            item.textContent = `${MODEL_PROVIDER_PROTOCOL_LABELS[route.protocol]}: ${route.providerId}`;
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

      const openForm = (provider: ModelProviderConfig | null, protocol: ModelProviderProtocol): void => {
        form.hidden = false;
        formStatus.textContent = "";
        formTitle.textContent = provider
          ? messages.modelServicesEditProvider
          : messages.modelServicesAddProvider;
        idInput.value = provider?.id ?? "";
        idInput.disabled = provider !== null;
        protocolInput.value = provider?.protocol ?? protocol;
        protocolInput.disabled = provider !== null;
        nameInput.value = provider?.name ?? "";
        baseUrlInput.value = provider?.baseUrl ?? "";
        apiKeyInput.value = "";
        idInput.focus();
      };

      const closeForm = (): void => {
        form.hidden = true;
      };

      const renderPool = (container: HTMLElement, pool: readonly ModelPoolEntry[]): void => {
        container.replaceChildren();
        if (pool.length === 0) {
          const empty = document.createElement("p");
          empty.className = "settings-model-pool-empty";
          empty.textContent = messages.modelServicesPoolEmpty;
          container.append(empty);
          return;
        }
        const poolTitle = document.createElement("strong");
        poolTitle.textContent = messages.modelServicesPoolTitle;
        container.append(poolTitle);
        for (const entry of pool) {
          const row = document.createElement("div");
          row.className = "settings-model-pool-entry";
          row.dataset.modelPoolEntry = poolKey(entry);
          const model = document.createElement("strong");
          model.textContent = entry.label ?? entry.modelId;
          const modelId = document.createElement("code");
          modelId.textContent = entry.modelId;
          const provider = document.createElement("span");
          provider.textContent = entry.providerId;
          const remove = createButton(
            document,
            "settings-model-pool-remove",
            messages.modelServicesCandidateRemove,
            "close",
          );
          remove.setAttribute("aria-label", `${messages.modelServicesCandidateRemove} ${entry.modelId}`);
          remove.addEventListener("click", () => {
            runRequest(
              () => client.removeModelPoolEntry({ modelId: entry.modelId, providerId: entry.providerId }),
              (result) => {
                latest = result;
                render(result);
              },
            );
          });
          row.append(model, modelId, provider, remove);
          container.append(row);
        }
      };

      const renderProviderCard = (
        provider: ModelProviderConfig,
        poolEntries: readonly ModelPoolEntry[],
      ): HTMLElement => {
        const card = document.createElement("div");
        card.className = "settings-model-provider-card";
        card.dataset.modelProviderCard = provider.id;
        const identity = document.createElement("div");
        identity.className = "settings-model-provider-card__identity";
        const name = document.createElement("strong");
        name.dataset.modelProviderName = provider.id;
        name.textContent = provider.name;
        const baseUrl = document.createElement("code");
        baseUrl.dataset.modelProviderBaseUrl = provider.id;
        baseUrl.textContent = provider.baseUrl;
        const apiKeyStatus = document.createElement("span");
        apiKeyStatus.dataset.modelProviderApiKeyStatus = provider.id;
        apiKeyStatus.textContent = provider.hasApiKey
          ? messages.modelServicesProviderApiKeySaved
          : messages.modelServicesProviderApiKeyMissing;
        identity.append(name, baseUrl, apiKeyStatus);

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
          // runLatest replaces the previous in-flight request, so any prior
          // pending provider is no longer busy once this one is dispatched.
          pending.clear();
          pending.add(provider.id);
          runRequest(
            () => client.fetchModelProviderModels(provider.id),
            (result) => {
              fetchedModels.set(provider.id, result.models);
              pending.delete(provider.id);
              render(latest);
            },
            () => pending.delete(provider.id),
          );
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
        editButton.addEventListener("click", () => openForm(provider, provider.protocol));
        const removeButton = createButton(
          document,
          "settings-model-provider-remove",
          messages.modelServicesRemoveProvider,
          "close",
        );
        removeButton.setAttribute("aria-label", `${messages.modelServicesRemoveProvider} ${provider.name}`);
        removeButton.addEventListener("click", () => {
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

        const candidates = document.createElement("div");
        candidates.className = "settings-model-provider-candidates";
        const fetched = fetchedModels.get(provider.id);
        if (fetched !== undefined) {
          if (fetched.length === 0) {
            const none = document.createElement("p");
            none.textContent = messages.modelServicesNoModels;
            candidates.append(none);
          } else {
            const hint = document.createElement("p");
            hint.textContent = `${messages.modelServicesModelsFetched} ${fetched.length}`;
            candidates.append(hint);
            for (const model of fetched) {
              const inPool = poolEntries.some((entry) => entry.modelId === model.id);
              const row = document.createElement("label");
              row.className = "settings-model-provider-candidate";
              row.dataset.modelCandidate = `${provider.id}/${model.id}`;
              const checkbox = document.createElement("input");
              checkbox.type = "checkbox";
              checkbox.checked = inPool;
              checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                  runRequest(
                    () =>
                      client.addModelPoolEntry({
                        modelId: model.id,
                        ...(model.label !== undefined ? { label: model.label } : {}),
                        providerId: provider.id,
                      }),
                    (result) => {
                      latest = result;
                      render(result);
                    },
                  );
                } else {
                  runRequest(
                    () => client.removeModelPoolEntry({ modelId: model.id, providerId: provider.id }),
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
          }
        }

        card.append(identity, controls, status, candidates);
        return card;
      };

      const render = (result: ModelProviderListResult | null): void => {
        if (result) latest = result;
        errorNote.textContent = "";
        const current = latest;
        if (!current) return;

        renderGateway(current);

        // Protocol sections. Existing sections are keyed by protocol so their
        // scroll/anchor state survives re-renders; only the provider list is
        // refreshed each time.
        const existingSections = new Map<ModelProviderProtocol, HTMLElement>();
        for (const section of [...context.content.querySelectorAll<HTMLElement>(
          "[data-model-protocol-section]",
        )]) {
          const protocol = section.dataset.modelProtocolSection as ModelProviderProtocol;
          if (protocol) existingSections.set(protocol, section);
        }
        for (const protocol of modelProviderProtocols) {
          let section = existingSections.get(protocol);
          if (!section) {
            section = document.createElement("section");
            section.className = "settings-model-protocol-section";
            section.dataset.modelProtocolSection = protocol;
            context.content.append(section);
          }
          section.replaceChildren();
          const sectionHead = document.createElement("div");
          sectionHead.className = "settings-model-protocol-section__head";
          const title = document.createElement("strong");
          title.textContent = MODEL_PROVIDER_PROTOCOL_LABELS[protocol];
          const subtitle = document.createElement("span");
          subtitle.textContent = providerDescription(protocol, messages);
          const addButton = createButton(
            document,
            "settings-command-button settings-command-button--secondary",
            messages.modelServicesAddProvider,
            "check",
          );
          addButton.addEventListener("click", () => openForm(null, protocol));
          sectionHead.append(title, subtitle, addButton);
          section.append(sectionHead);

          const list = document.createElement("div");
          list.className = "settings-model-provider-list";
          const protocolProviders = current.providers.filter(
            (provider) => provider.protocol === protocol,
          );
          if (protocolProviders.length === 0) {
            const empty = document.createElement("p");
            empty.textContent = messages.modelServicesNoProviders;
            list.append(empty);
          } else {
            for (const provider of protocolProviders) {
              list.append(renderProviderCard(provider, current.pool));
            }
          }
          section.append(list);
        }

        const poolSection = context.content.querySelector<HTMLElement>(".settings-model-pool");
        const poolContainer =
          poolSection ??
          (() => {
            const section = document.createElement("section");
            section.className = "settings-model-pool";
            context.content.append(section);
            return section;
          })();
        renderPool(poolContainer, current.pool);
      };

      saveButton.addEventListener("click", (event) => {
        event.preventDefault();
        const id = idInput.value.trim();
        if (id.length === 0) {
          formStatus.textContent = messages.modelServicesFormInvalidId;
          return;
        }
        if (!MODEL_PROVIDER_ID_PATTERN.test(id)) {
          formStatus.textContent = messages.modelServicesFormInvalidId;
          return;
        }
        const name = nameInput.value.trim();
        if (name.length === 0) {
          formStatus.textContent = messages.modelServicesSaveFailed;
          return;
        }
        const baseUrl = baseUrlInput.value.trim();
        if (baseUrl.length === 0) {
          formStatus.textContent = messages.modelServicesSaveFailed;
          return;
        }
        formStatus.textContent = "";
        runRequest(
          () =>
            client.saveModelProvider({
              id: id as ModelProviderId,
              name,
              protocol: protocolInput.value as ModelProviderProtocol,
              baseUrl,
              ...(apiKeyInput.value.length > 0 ? { apiKey: apiKeyInput.value } : {}),
            }),
          (result) => {
            latest = result;
            closeForm();
            render(result);
          },
        );
      });
      cancelButton.addEventListener("click", (event) => {
        event.preventDefault();
        closeForm();
      });

      // The gateway endpoint is carried by the list result while the default
      // routes come from gateway-status. runLatest only keeps the newest
      // request, so load both in a single operation before the first render.
      runRequest(
        () =>
          Promise.all([client.readModelGatewayStatus(), client.listModelProviders()]),
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
