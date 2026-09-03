import {
  modelProviderIdSchema,
  type ModelProviderListResult,
} from "@codexhost/shared-contracts";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/settings/icons.js", () => ({
  createRendererSettingsIcon: () => "icon",
  isRendererSettingsIconName: () => true,
}));

import { RendererSettingsPageScope } from "../../src/settings/core.js";
import { rendererSettingsMessages } from "../../src/settings/localization.js";
import {
  createModelServicesSettingsPage,
  type RendererModelProviderClient,
} from "../../src/settings/model-services-page.js";

class FakeElement {
  readonly children: unknown[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly style: Record<string, string> = {};
  readonly #listeners = new Map<string, (event?: unknown) => void>();
  className = "";
  hidden = false;
  checked = false;
  value = "";
  disabled = false;
  type = "";
  textContent = "";

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument,
  ) {}

  addEventListener(name: string, listener: (event?: unknown) => void): void {
    this.#listeners.set(name, listener);
  }

  removeEventListener(name: string): void {
    this.#listeners.delete(name);
  }

  append(...children: unknown[]): void {
    this.children.push(...children);
  }

  dispatch(name: string, event?: unknown): void {
    this.#listeners.get(name)?.(event);
  }

  focus(): void {}

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  replaceChildren(...children: unknown[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }

  createElementNS(_namespace: string, tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }
}

function descendants(root: FakeElement): FakeElement[] {
  return [
    root,
    ...root.children.flatMap((child) => (child instanceof FakeElement ? descendants(child) : [])),
  ];
}

function visibleText(root: FakeElement): string {
  return descendants(root)
    .map(({ textContent }) => textContent)
    .filter(Boolean)
    .join(" ");
}

/** Buttons built by createButton carry their label as a text child, not textContent. */
function buttonWithLabel(root: FakeElement, label: string): FakeElement {
  const button = descendants(root).find(
    (element) => element.tagName === "button" && element.children.includes(label),
  );
  if (!button) throw new Error(`Button ${label} is not rendered`);
  return button;
}

function cardFor(root: FakeElement, id: string): FakeElement {
  const card = descendants(root).find(
    ({ dataset, className }) =>
      dataset.modelProviderCard === id &&
      className.split(" ").includes("settings-model-provider-card"),
  );
  if (!card) throw new Error(`Provider card ${id} is not rendered`);
  return card;
}

/** A `.settings-model-field` whose leading <span> carries the given label text. */
function fieldLabel(form: FakeElement, labelText: string): FakeElement {
  const label = descendants(form).find(
    (element) =>
      element.tagName === "label" &&
      element.className.split(" ").includes("settings-model-field") &&
      (element.children[0] as FakeElement | undefined)?.textContent === labelText,
  );
  if (!label) throw new Error(`Field ${labelText} is not rendered`);
  return label;
}

/** The (single) control of the requested tag inside the labelled field. */
function fieldControl(form: FakeElement, labelText: string, tag: string): FakeElement {
  const label = fieldLabel(form, labelText);
  const control = descendants(label).find(
    (element) => element.tagName === tag && element !== label,
  );
  if (!control) throw new Error(`Control <${tag}> in field ${labelText} is not rendered`);
  return control;
}

function formElement(root: FakeElement): FakeElement {
  const form = descendants(root).find(({ tagName }) => tagName === "form");
  if (!form) throw new Error("Provider form is not rendered");
  return form;
}

function mountPage(
  client: RendererModelProviderClient,
  locale: "en" | "zh-CN" = "en",
): { content: FakeElement; scope: RendererSettingsPageScope } {
  const page = createModelServicesSettingsPage(rendererSettingsMessages(locale), () => client);
  const document = new FakeDocument();
  const content = document.createElement("main");
  const scope = new RendererSettingsPageScope();
  page.mount({
    content: content as unknown as HTMLElement,
    signal: scope.signal,
    runLatest: (operation, handlers) => scope.runLatest(operation, handlers),
  });
  return { content, scope };
}

function providerClient(
  overrides: Partial<RendererModelProviderClient> = {},
): RendererModelProviderClient {
  return {
    listModelProviders: vi.fn(async () => ({
      providers: [],
      pool: [],
      gatewayEndpoint: "http://127.0.0.1:54321",
    })),
    saveModelProvider: vi.fn(async () => ({
      providers: [],
      pool: [],
      gatewayEndpoint: "http://127.0.0.1:54321",
    })),
    removeModelProvider: vi.fn(async () => ({
      providers: [],
      pool: [],
      gatewayEndpoint: "http://127.0.0.1:54321",
    })),
    addModelPoolEntry: vi.fn(async () => ({
      providers: [],
      pool: [],
      gatewayEndpoint: "http://127.0.0.1:54321",
    })),
    removeModelPoolEntry: vi.fn(async () => ({
      providers: [],
      pool: [],
      gatewayEndpoint: "http://127.0.0.1:54321",
    })),
    fetchModelProviderModels: vi.fn(async () => ({ models: [] })),
    testModelProvider: vi.fn(async () => ({ ok: true })),
    readModelGatewayStatus: vi.fn(async () => ({
      endpoint: "http://127.0.0.1:54321",
      tokenIssuedAt: 42,
      defaultRoutes: [],
    })),
    ...overrides,
  };
}

const gatewayId = modelProviderIdSchema.parse("my-gateway");
const claudeId = modelProviderIdSchema.parse("claude-direct");

const withGatewaySource = {
  providers: [
    {
      id: gatewayId,
      name: "My Gateway",
      wireFormat: "openai-chat" as const,
      baseUrl: "https://api.example.com/v1",
      hasApiKey: true,
      headers: [{ name: "X-Project", hasValue: true }],
    },
    {
      id: claudeId,
      name: "Claude Direct",
      wireFormat: "anthropic" as const,
      baseUrl: "https://api.anthropic.com",
    },
  ],
  pool: [
    {
      modelId: "gpt-5",
      label: "GPT-5",
      providerId: gatewayId,
      wireFormat: "openai-chat" as const,
    },
  ],
  gatewayEndpoint: "http://127.0.0.1:54321",
};

describe("Renderer Model Services settings page", () => {
  it("renders gateway routes and flat provider cards without protocol sections", async () => {
    const client = providerClient({
      listModelProviders: vi.fn(async () => withGatewaySource),
      readModelGatewayStatus: vi.fn(async () => ({
        endpoint: "http://127.0.0.1:54321",
        tokenIssuedAt: 42,
        defaultRoutes: [{ wireFormat: "openai-chat" as const, providerId: gatewayId }],
      })),
    });
    const { content, scope } = mountPage(client);

    await vi.waitFor(() => {
      expect(
        descendants(content).find(({ dataset }) => dataset.modelGatewayEndpoint !== undefined)
          ?.textContent,
      ).toBe("http://127.0.0.1:54321");
    });
    // No protocol-partition sections remain: every card is flat.
    expect(
      descendants(content).filter(({ dataset }) => dataset.modelProtocolSection !== undefined),
    ).toHaveLength(0);
    expect(
      descendants(content).find(({ dataset }) => dataset.modelDefaultRoute !== undefined)
        ?.textContent,
    ).toBe("OpenAI Chat: my-gateway");

    const cards = descendants(content).filter(
      ({ dataset }) => dataset.modelProviderCard !== undefined,
    );
    expect(cards).toHaveLength(2);
    expect(visibleText(cards[0] as FakeElement)).toContain("My Gateway");
    // Wire-format badge + linked path preview on the card.
    const gatewayBadge = descendants(cards[0] as FakeElement).find(
      ({ dataset }) => dataset.modelProviderWireFormat !== undefined,
    );
    expect(gatewayBadge?.textContent).toBe("OpenAI Chat");
    const claudePath = descendants(cards[1] as FakeElement).find(
      ({ dataset }) => dataset.modelProviderPath !== undefined,
    );
    expect(claudePath?.textContent).toBe("/v1/messages");
    // Redacted secrets only surface as a status line.
    expect(
      descendants(content).find(({ dataset }) => dataset.modelProviderApiKeyStatus !== undefined)
        ?.textContent,
    ).toBe("Key saved");
    expect(
      descendants(cards[1] as FakeElement).find(
        ({ dataset }) => dataset.modelProviderApiKeyStatus !== undefined,
      )?.textContent,
    ).toBe("No key");
    // A stored custom header appears as a badge, not the value.
    expect(
      descendants(cards[0] as FakeElement).find(
        ({ dataset }) => dataset.modelProviderHeaders !== undefined,
      )?.textContent,
    ).toContain("Headers");

    scope.dispose();
  });

  it("selecting a wire format links the exact path and full-URL preview", async () => {
    const client = providerClient();
    const { content, scope } = mountPage(client);

    await vi.waitFor(() => buttonWithLabel(content, "Add source"));
    buttonWithLabel(content, "Add source").dispatch("click");
    const form = formElement(content);
    expect(descendants(content).some(({ dataset }) => dataset.modelProviderExpand === "__new__"))
      .toBe(true);

    const wireFormat = fieldControl(form, "Wire format", "select");
    const baseUrl = fieldControl(form, "API base URL", "input");
    const path = fieldControl(form, "Path", "input");
    const preview = descendants(content).find(({ className }) =>
      className.split(" ").includes("settings-model-full-url"),
    );
    if (!preview) throw new Error("Full-URL preview is not rendered");

    expect(wireFormat.value).toBe("openai-chat");
    expect(path.value).toBe("/v1/chat/completions");

    baseUrl.value = "https://api.anthropic.com";
    baseUrl.dispatch("input");
    wireFormat.value = "anthropic";
    wireFormat.dispatch("change");
    expect(path.value).toBe("/v1/messages");
    expect(preview.textContent).toBe("https://api.anthropic.com/v1/messages");

    wireFormat.value = "openai-responses";
    wireFormat.dispatch("change");
    expect(path.value).toBe("/v1/responses");
    expect(preview.textContent).toBe("https://api.anthropic.com/v1/responses");

    scope.dispose();
  });

  it("adds a source through the inline form, including a custom header", async () => {
    const saved = vi.fn(async () => ({
      providers: [
        {
          id: gatewayId,
          name: "My Gateway",
          wireFormat: "openai-chat" as const,
          baseUrl: "https://api.example.com/v1",
          hasApiKey: false,
          headers: [{ name: "X-Project", value: "abc", hasValue: true }],
        },
      ],
      pool: [],
      gatewayEndpoint: "http://127.0.0.1:54321",
    }));
    const client = providerClient({ saveModelProvider: saved });
    const { content, scope } = mountPage(client);

    const addButton = await vi.waitFor(() => buttonWithLabel(content, "Add source"));
    addButton.dispatch("click");
    const form = formElement(content);

    const baseUrl = fieldControl(form, "API base URL", "input");
    baseUrl.value = "https://api.example.com/v1";
    baseUrl.dispatch("input");
    const apiKey = fieldControl(form, "API token", "input");
    apiKey.value = "sk-test";
    apiKey.dispatch("input");
    const remark = fieldControl(form, "Remark", "input");
    remark.value = "My Gateway";
    remark.dispatch("input");

    // Request headers are added and filled in the advanced block.
    buttonWithLabel(content, "Add header").dispatch("click");
    const row = descendants(content).find(({ className }) =>
      className.split(" ").includes("settings-model-header-row"),
    );
    if (!row) throw new Error("Header row is not rendered");
    const headerName = row.children[0] as FakeElement | undefined;
    const headerValue = row.children[1] as FakeElement | undefined;
    if (!headerName || !headerValue) throw new Error("Header row fields are missing");
    headerName.value = "X-Project";
    headerName.dispatch("input");
    headerValue.value = "abc";
    headerValue.dispatch("input");

    buttonWithLabel(content, "Save").dispatch("click", { preventDefault: vi.fn() });

    await vi.waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "my-gateway",
        name: "My Gateway",
        wireFormat: "openai-chat",
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
        headers: [{ name: "X-Project", value: "abc" }],
      }),
    );
    await vi.waitFor(() => {
      expect(
        descendants(content).find(({ dataset }) => dataset.modelProviderCard !== undefined),
      ).toBeDefined();
    });
    expect(visibleText(content)).toContain("My Gateway");

    scope.dispose();
  });

  it("requires a remark and base URL before saving", async () => {
    const save = vi.fn();
    const client = providerClient({ saveModelProvider: save });
    const { content, scope } = mountPage(client);

    await vi.waitFor(() => buttonWithLabel(content, "Add source"));
    buttonWithLabel(content, "Add source").dispatch("click");
    buttonWithLabel(content, "Save").dispatch("click", { preventDefault: vi.fn() });

    await vi.waitFor(() => {
      expect(
        descendants(content).find(({ dataset }) => dataset.modelProviderFormStatus !== undefined)
          ?.textContent,
      ).toBe("Remark and API base URL are required.");
    });
    expect(save).not.toHaveBeenCalled();

    scope.dispose();
  });

  it("rejects a request path that does not start with a slash", async () => {
    const save = vi.fn();
    const client = providerClient({ saveModelProvider: save });
    const { content, scope } = mountPage(client);

    await vi.waitFor(() => buttonWithLabel(content, "Add source"));
    buttonWithLabel(content, "Add source").dispatch("click");
    const form = formElement(content);
    const baseUrl = fieldControl(form, "API base URL", "input");
    baseUrl.value = "https://api.example.com/v1";
    baseUrl.dispatch("input");
    const remark = fieldControl(form, "Remark", "input");
    remark.value = "My Gateway";
    remark.dispatch("input");
    const path = fieldControl(form, "Path", "input");
    path.value = "chat/completions";
    path.dispatch("input");
    buttonWithLabel(content, "Save").dispatch("click", { preventDefault: vi.fn() });

    await vi.waitFor(() => {
      expect(
        descendants(content).find(({ dataset }) => dataset.modelProviderFormStatus !== undefined)
          ?.textContent,
      ).toBe("Path must start with /");
    });
    expect(save).not.toHaveBeenCalled();

    scope.dispose();
  });

  it("edits an existing source inline: stored-key hint, header keep, context window", async () => {
    const saved = vi.fn(async () => withGatewaySource);
    const client = providerClient({
      listModelProviders: vi.fn(async () => withGatewaySource),
      saveModelProvider: saved,
      addModelPoolEntry: vi.fn(async () => withGatewaySource),
    });
    const { content, scope } = mountPage(client);

    await vi.waitFor(() => {
      expect(
        descendants(content).find(({ dataset }) => dataset.modelProviderCard !== undefined),
      ).toBeDefined();
    });
    const gatewayCard = cardFor(content, gatewayId);
    buttonWithLabel(gatewayCard, "Edit source").dispatch("click");

    // openForm re-renders the list, so re-locate the freshly expanded card.
    const expandedCard = cardFor(content, gatewayId);
    const form = formElement(expandedCard);
    expect(descendants(expandedCard).some(({ dataset }) => dataset.modelProviderExpand !== undefined))
      .toBe(true);
    // Saved key hint, not the key itself.
    const apiKeyField = fieldLabel(form, "API token");
    expect(visibleText(apiKeyField)).toContain("Key saved");
    // Stored header is kept when its value input is left blank.
    buttonWithLabel(content, "Save").dispatch("click", { preventDefault: vi.fn() });
    await vi.waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "my-gateway",
        name: "My Gateway",
        wireFormat: "openai-chat",
        headers: [{ name: "X-Project" }],
      }),
    );

    scope.dispose();
  });

  it("sets a context window on a pooled model", async () => {
    const added = vi.fn(async () => withGatewaySource);
    const client = providerClient({
      listModelProviders: vi.fn(async () => withGatewaySource),
      addModelPoolEntry: added,
    });
    const { content, scope } = mountPage(client);

    await vi.waitFor(() => {
      expect(
        descendants(content).find(({ dataset }) => dataset.modelProviderCard !== undefined),
      ).toBeDefined();
    });
    const gatewayCard = cardFor(content, gatewayId);
    buttonWithLabel(gatewayCard, "Edit source").dispatch("click");
    const form = formElement(cardFor(content, gatewayId));

    const entry = descendants(form).find(({ dataset }) => dataset.modelPoolEntry !== undefined);
    if (!entry) throw new Error("Pooled model row is not rendered");
    const contextInput = descendants(entry).find(({ tagName }) => tagName === "input");
    if (!contextInput) throw new Error("Context-window input is not rendered");
    contextInput.value = "200000";
    contextInput.dispatch("change");

    await vi.waitFor(() => expect(added).toHaveBeenCalledOnce());
    expect(added).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "gpt-5",
        providerId: gatewayId,
        contextWindow: 200000,
      }),
    );

    scope.dispose();
  });

  it("fetches models on a card and checks a candidate into the pool", async () => {
    const added = vi.fn(async (): Promise<ModelProviderListResult> => ({
      providers: withGatewaySource.providers,
      pool: [
        { modelId: "gpt-5", label: "GPT-5", providerId: gatewayId, wireFormat: "openai-chat" },
        { modelId: "gpt-5-mini", providerId: gatewayId, wireFormat: "openai-chat" },
      ],
      gatewayEndpoint: "http://127.0.0.1:54321",
    }));
    const client = providerClient({
      listModelProviders: vi.fn(async () => withGatewaySource),
      fetchModelProviderModels: vi.fn(async () => ({
        models: [{ id: "gpt-5", label: "GPT-5" }, { id: "gpt-5-mini" }],
      })),
      addModelPoolEntry: added,
    });
    const { content, scope } = mountPage(client);

    await vi.waitFor(() => {
      expect(
        descendants(content).find(({ dataset }) => dataset.modelProviderCard !== undefined),
      ).toBeDefined();
    });
    const gatewayCard = cardFor(content, gatewayId);
    buttonWithLabel(gatewayCard, "Get models").dispatch("click");

    await vi.waitFor(() => {
      expect(
        descendants(content).filter(({ dataset }) => dataset.modelCandidate !== undefined),
      ).toHaveLength(2);
    });
    const mini = descendants(content).find(
      ({ dataset }) => dataset.modelCandidate === "my-gateway/gpt-5-mini",
    );
    if (!mini) throw new Error("Candidate row is not rendered");
    const checkbox = descendants(mini).find(({ tagName }) => tagName === "input");
    if (!checkbox) throw new Error("Candidate checkbox is not rendered");
    checkbox.checked = true;
    checkbox.dispatch("change");

    await vi.waitFor(() => expect(added).toHaveBeenCalledOnce());
    expect(added).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: "gpt-5-mini", providerId: gatewayId }),
    );
    await vi.waitFor(() => {
      expect(
        descendants(content).find(
          ({ dataset }) => dataset.modelPoolEntry === "my-gateway/gpt-5-mini",
        ),
      ).toBeDefined();
    });

    scope.dispose();
  });

  it("shows test failure status on the provider card", async () => {
    const client = providerClient({
      listModelProviders: vi.fn(async () => withGatewaySource),
      testModelProvider: vi.fn(async () => ({ ok: false, error: "boom" })),
    });
    const { content, scope } = mountPage(client);
    await vi.waitFor(() => {
      expect(
        descendants(content).find(({ dataset }) => dataset.modelProviderCard !== undefined),
      ).toBeDefined();
    });

    const gatewayCard = cardFor(content, gatewayId);
    buttonWithLabel(gatewayCard, "Test").dispatch("click");

    // Rendering after the test resolves rebuilds the card; re-locate it live.
    await vi.waitFor(() => {
      const refreshedCard = cardFor(content, gatewayId);
      expect(
        descendants(refreshedCard).find(({ dataset }) => dataset.modelProviderStatus !== undefined)
          ?.textContent,
      ).toContain("boom");
    });

    scope.dispose();
  });

  it("removes a provider and its cards", async () => {
    const client = providerClient({
      listModelProviders: vi.fn(async () => withGatewaySource),
      removeModelProvider: vi.fn(async (): Promise<ModelProviderListResult> => ({
        providers: withGatewaySource.providers.filter((provider) => provider.id !== gatewayId),
        pool: [],
        gatewayEndpoint: "http://127.0.0.1:54321",
      })),
    });
    const { content, scope } = mountPage(client, "zh-CN");
    await vi.waitFor(() => {
      expect(
        descendants(content).find(({ dataset }) => dataset.modelProviderCard !== undefined),
      ).toBeDefined();
    });

    const gatewayCard = cardFor(content, gatewayId);
    buttonWithLabel(gatewayCard, "删除").dispatch("click");

    await vi.waitFor(() => {
      expect(
        descendants(content).filter(({ dataset }) => dataset.modelProviderCard !== undefined),
      ).toHaveLength(1);
    });
    expect(visibleText(content)).not.toContain("My Gateway");

    scope.dispose();
  });
});
