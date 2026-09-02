import { modelProviderIdSchema } from "@codexhost/shared-contracts";
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

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const all = descendants(this);
    if (selector === "[data-model-protocol-section]") {
      return all.filter((element) => element.dataset.modelProtocolSection !== undefined);
    }
    if (selector === ".settings-model-pool") {
      return all.filter((element) => element.className.split(" ").includes("settings-model-pool"));
    }
    return [];
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

/** Form inputs are the only child of their <label>, whose text is the field label. */
function inputInLabel(form: FakeElement, labelText: string): FakeElement {
  const label = descendants(form).find(
    (element) => element.tagName === "label" && element.textContent === labelText,
  );
  const input = label?.children[0] as FakeElement | undefined;
  if (!input) throw new Error(`Input labelled ${labelText} is not rendered`);
  return input;
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
      protocol: "openai" as const,
      baseUrl: "https://api.example.com/v1",
      hasApiKey: true,
    },
    {
      id: claudeId,
      name: "Claude Direct",
      protocol: "anthropic" as const,
      baseUrl: "https://api.anthropic.com",
    },
  ],
  pool: [{ modelId: "gpt-5", label: "GPT-5", providerId: gatewayId, protocol: "openai" as const }],
  gatewayEndpoint: "http://127.0.0.1:54321",
};

describe("Renderer Model Services settings page", () => {
  it("renders gateway status, protocol sections, and provider cards", async () => {
    const client = providerClient({
      listModelProviders: vi.fn(async () => withGatewaySource),
      readModelGatewayStatus: vi.fn(async () => ({
        endpoint: "http://127.0.0.1:54321",
        tokenIssuedAt: 42,
        defaultRoutes: [{ protocol: "openai" as const, providerId: gatewayId }],
      })),
    });
    const { content, scope } = mountPage(client);

    await vi.waitFor(() => {
      expect(
        descendants(content).find(({ dataset }) => dataset.modelGatewayEndpoint !== undefined)
          ?.textContent,
      ).toBe("http://127.0.0.1:54321");
    });
    expect(visibleText(content)).toContain("OpenAI: my-gateway");
    expect(
      descendants(content).filter(({ dataset }) => dataset.modelProtocolSection !== undefined),
    ).toHaveLength(4);
    const cards = descendants(content).filter(
      ({ dataset }) => dataset.modelProviderCard !== undefined,
    );
    expect(cards).toHaveLength(2);
    expect(visibleText(cards[0] as FakeElement)).toContain("My Gateway");
    expect(
      descendants(content).find(({ dataset }) => dataset.modelProviderApiKeyStatus !== undefined)
        ?.textContent,
    ).toBe("Key saved");
    expect(
      descendants(content)
        .filter(({ dataset }) => dataset.modelProviderBaseUrl !== undefined)
        .some(({ textContent }) => textContent === "https://api.anthropic.com"),
    ).toBe(true);
    const poolEntry = descendants(content).find(
      ({ dataset }) => dataset.modelPoolEntry !== undefined,
    );
    expect(poolEntry).toBeDefined();
    expect(visibleText(poolEntry as FakeElement)).toContain("GPT-5");

    scope.dispose();
  });

  it("adds a source through the form and refreshes the provider list", async () => {
    const saved = vi.fn(async () => ({
      providers: [
        {
          id: gatewayId,
          name: "My Gateway",
          protocol: "openai" as const,
          baseUrl: "https://api.example.com/v1",
          hasApiKey: false,
        },
      ],
      pool: [],
      gatewayEndpoint: "http://127.0.0.1:54321",
    }));
    const client = providerClient({ saveModelProvider: saved });
    const { content, scope } = mountPage(client);

    const addButton = await vi.waitFor(() => buttonWithLabel(content, "Add source"));
    addButton.dispatch("click");
    const form = descendants(content).find(({ tagName }) => tagName === "form");
    if (!form) throw new Error("Provider form is not rendered");
    expect(form.hidden).toBe(false);

    inputInLabel(form, "ID").value = "my-gateway";
    inputInLabel(form, "Name").value = "My Gateway";
    inputInLabel(form, "Base URL").value = "https://api.example.com/v1";
    inputInLabel(form, "API key").value = "sk-test";

    buttonWithLabel(form, "Save").dispatch("click", { preventDefault: vi.fn() });

    await vi.waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(saved).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "my-gateway",
        name: "My Gateway",
        protocol: "openai",
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
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

  it("rejects an invalid source ID with a form note", async () => {
    const save = vi.fn();
    const client = providerClient({ saveModelProvider: save });
    const { content, scope } = mountPage(client);

    const addButton = await vi.waitFor(() => buttonWithLabel(content, "Add source"));
    addButton.dispatch("click");
    const form = descendants(content).find(({ tagName }) => tagName === "form");
    if (!form) throw new Error("Provider form is not rendered");

    inputInLabel(form, "ID").value = "My Gateway";
    inputInLabel(form, "Name").value = "My Gateway";
    inputInLabel(form, "Base URL").value = "https://api.example.com/v1";
    buttonWithLabel(form, "Save").dispatch("click", { preventDefault: vi.fn() });

    await vi.waitFor(() => {
      expect(
        descendants(form).find(
          ({ className }) => className === "settings-model-provider-form-status",
        )?.textContent,
      ).toBeTruthy();
    });
    expect(save).not.toHaveBeenCalled();

    scope.dispose();
  });

  it("fetches models and checks a candidate into the pool", async () => {
    const client = providerClient({
      listModelProviders: vi.fn(async () => withGatewaySource),
      fetchModelProviderModels: vi.fn(async () => ({
        models: [{ id: "gpt-5", label: "GPT-5" }, { id: "gpt-5-mini" }],
      })),
      addModelPoolEntry: vi.fn(async () => ({
        ...withGatewaySource,
        pool: [
          { modelId: "gpt-5", label: "GPT-5", providerId: gatewayId, protocol: "openai" as const },
        ],
      })),
    });
    const { content, scope } = mountPage(client, "zh-CN");
    await vi.waitFor(() => {
      expect(
        descendants(content).find(({ dataset }) => dataset.modelProviderCard !== undefined),
      ).toBeDefined();
    });

    const fetchButton = buttonWithLabel(content, "获取模型");
    fetchButton.dispatch("click");

    await vi.waitFor(() => {
      expect(
        descendants(content).filter(({ dataset }) => dataset.modelCandidate !== undefined),
      ).toHaveLength(2);
    });
    const candidate = descendants(content).find(
      ({ dataset }) => dataset.modelCandidate === "my-gateway/gpt-5",
    );
    if (!candidate) throw new Error("Candidate row is not rendered");
    expect(visibleText(candidate)).toContain("GPT-5");
    expect(candidate.checked).toBe(false);

    candidate.checked = true;
    candidate.dispatch("change");

    await vi.waitFor(() => {
      const entry = descendants(content).find(
        ({ dataset }) => dataset.modelPoolEntry !== undefined,
      );
      expect(entry).toBeDefined();
    });
    expect(visibleText(content)).toContain("GPT-5");

    scope.dispose();
  });

  it("shows test failure status on the provider card", async () => {
    const client = providerClient({
      listModelProviders: vi.fn(async () => withGatewaySource),
      testModelProvider: vi.fn(async () => ({ ok: false, error: "boom" })),
    });
    const { content, scope } = mountPage(client, "zh-CN");
    await vi.waitFor(() => {
      expect(
        descendants(content).find(({ dataset }) => dataset.modelProviderStatus !== undefined),
      ).toBeDefined();
    });

    const testButton = buttonWithLabel(content, "测试");
    testButton.dispatch("click");

    await vi.waitFor(() => {
      expect(
        descendants(content).find(({ dataset }) => dataset.modelProviderStatus !== undefined)
          ?.textContent,
      ).toContain("boom");
    });

    scope.dispose();
  });

  it("removes a provider and clears its pool entries", async () => {
    const client = providerClient({
      listModelProviders: vi.fn(async () => withGatewaySource),
      removeModelProvider: vi.fn(async () => ({
        providers: [],
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

    const remove = descendants(content).find(
      ({ tagName, className }) =>
        tagName === "button" && className.split(" ").includes("settings-model-provider-remove"),
    );
    if (!remove) throw new Error("Remove source button is not rendered");
    remove.dispatch("click");

    await vi.waitFor(() => {
      expect(
        descendants(content).filter(({ dataset }) => dataset.modelProviderCard !== undefined),
      ).toHaveLength(0);
    });
    expect(
      descendants(content).filter(({ dataset }) => dataset.modelPoolEntry !== undefined),
    ).toHaveLength(0);

    scope.dispose();
  });
});
