import {
  harnessIdSchema,
  harnessModelRefSchema,
  harnessPermissionModeIdSchema,
  harnessThinkingOptionIdSchema,
  hostThreadIdSchema,
  hostTurnIdSchema,
  modelProviderIdSchema,
  type ThreadUsageInspection,
} from "@codexhost/shared-contracts";
import { describe, expect, it, vi } from "vitest";

import {
  DEEPSEEK_MODERN_SESSION_IMPORT_METHOD,
  DEEPSEEK_MODERN_SESSION_LIST_METHOD,
  HARNESS_INSPECT_METHOD,
  HARNESS_WEB_UI_OPEN_METHOD,
  MODEL_PROVIDER_FETCH_MODELS_METHOD,
  MODEL_PROVIDER_GATEWAY_STATUS_METHOD,
  MODEL_PROVIDER_LIST_METHOD,
  MODEL_PROVIDER_POOL_ADD_METHOD,
  MODEL_PROVIDER_POOL_REMOVE_METHOD,
  MODEL_PROVIDER_REMOVE_METHOD,
  MODEL_PROVIDER_SAVE_METHOD,
  MODEL_PROVIDER_TEST_METHOD,
  THREAD_FORK_METHOD,
  THREAD_INSPECT_METHOD,
  THREAD_MODEL_SELECT_METHOD,
  THREAD_PERMISSION_MODE_SELECT_METHOD,
  THREAD_THINKING_SELECT_METHOD,
  THREAD_OWNERSHIP_LIST_METHOD,
  THREAD_TOKEN_USAGE_UPDATED_METHOD,
  THREAD_USAGE_INSPECT_METHOD,
  THREAD_USAGE_UPDATED_METHOD,
  UPDATE_CHECK_METHOD,
  UPDATE_START_METHOD,
  UPDATE_STATUS_METHOD,
  RendererDeepSeekSessionUnavailableError,
  createRendererModelClient,
  createThreadUsageSubscriptionRelay,
} from "../src/renderer-model-client.js";

const piHarnessId = harnessIdSchema.parse("pi");
const model = harnessModelRefSchema.parse({ id: "pi-model-v1.synthetic" });
const high = harnessThinkingOptionIdSchema.parse("high");
const permissionModeId = harnessPermissionModeIdSchema.parse("auto");
const thinkingOptions = [
  { id: harnessThinkingOptionIdSchema.parse("off"), label: "Off" },
  { id: high, label: "High" },
];
const inspection = {
  status: "ready" as const,
  catalog: {
    models: [
      {
        ref: model,
        label: "provider / model",
        supportedThinkingOptionIds: thinkingOptions.map(({ id }) => id),
      },
    ],
    defaultModel: model,
    thinkingOptions,
    defaultThinkingOptionId: high,
  },
  capabilities: {
    configuration: {
      selectModel: true,
      selectThinkingOption: true,
      selectPermissionMode: false,
      permissionModeScope: "live" as const,
    },
    history: { fork: true, forkAcrossCwd: true, rollbackLastTurn: false },
  },
};

describe("Renderer fixed Model request client", () => {
  it("calls only the fixed inspect and select methods with validated params", async () => {
    let usageNotification: ((notification: unknown) => void) | undefined;
    const removeUsageNotification = vi.fn();
    const addNotificationCallback = vi.fn(
      (_method: string | readonly string[], callback: (notification: unknown) => void) => {
        usageNotification = callback;
        return removeUsageNotification;
      },
    );
    const sendRequest = vi
      .fn<(method: string, params: unknown) => Promise<unknown>>()
      .mockResolvedValueOnce(inspection)
      .mockResolvedValueOnce({
        owner: "external",
        harnessId: "pi",
        transportModelId: "codexhost/pi-native",
        effectiveModel: model,
        effectiveThinkingOptionId: high,
        availableThinkingOptions: thinkingOptions,
        history: { fork: true, forkAcrossCwd: true, rollbackLastTurn: false },
        locked: true,
      })
      .mockResolvedValueOnce({ threadId: "forked-thread" })
      .mockResolvedValueOnce({
        threads: [
          { threadId: "thread-1", owner: "external", harnessId: "pi" },
          { threadId: "official-thread", owner: "codex" },
        ],
      })
      .mockResolvedValueOnce({
        effectiveModel: model,
        effectiveThinkingOptionId: high,
        availableThinkingOptions: thinkingOptions,
      })
      .mockResolvedValueOnce({
        effectiveModel: model,
        effectiveThinkingOptionId: high,
        availableThinkingOptions: thinkingOptions,
      })
      .mockResolvedValueOnce({
        effectiveModel: model,
        effectivePermissionModeId: permissionModeId,
      })
      .mockResolvedValueOnce({
        threadId: "thread-1",
        usage: { cacheHitRatePercent: 99.9, totalCostUsd: 0.168 },
      })
      .mockResolvedValueOnce({
        threadId: "thread-1",
        usage: { cacheHitRatePercent: 97.9, totalCostUsd: 5.913 },
      })
      .mockResolvedValueOnce({
        currentVersion: "1.2.2",
        installation: "npm",
        latestVersion: "1.2.3",
        updateAvailable: true,
        installationAvailable: true,
        releaseNotes: "Safer updates",
        releaseNotesUrl: "https://github.com/BytePioneer-AI/codex-host/releases/tag/v1.2.3",
        status: null,
        error: null,
      })
      .mockResolvedValueOnce({
        status: {
          version: "1.2.3",
          installation: "npm",
          phase: "prepared",
          updatedAt: 10,
          error: null,
        },
      })
      .mockResolvedValueOnce({ status: null });
    const client = createRendererModelClient([{ addNotificationCallback, sendRequest }]);
    if (!client) throw new Error("Synthetic Model client was not created");
    expect(Object.keys(client).sort()).toEqual([
      "addModelPoolEntry",
      "checkUpdate",
      "executeThreadCommand",
      "fetchModelProviderModels",
      "forkThread",
      "importDeepSeekModernSession",
      "inspectHarness",
      "inspectThread",
      "inspectThreadCommands",
      "inspectThreadUsage",
      "listDeepSeekModernSessions",
      "listModelProviders",
      "listThreadOwnership",
      "openHarnessWebUi",
      "readModelGatewayStatus",
      "readUpdateStatus",
      "removeModelPoolEntry",
      "removeModelProvider",
      "saveModelProvider",
      "selectThreadModel",
      "selectThreadPermissionMode",
      "selectThreadThinking",
      "startUpdate",
      "subscribeThreadUsage",
      "testModelProvider",
    ]);

    await expect(client.inspectHarness({ harnessId: piHarnessId, refresh: true })).resolves.toEqual(
      inspection,
    );
    await expect(
      client.inspectThread({ threadId: hostThreadIdSchema.parse("thread-1") }),
    ).resolves.toMatchObject({
      owner: "external",
      harnessId: "pi",
      history: { fork: true, forkAcrossCwd: true, rollbackLastTurn: false },
      locked: true,
    });
    await expect(
      client.forkThread({
        threadId: hostThreadIdSchema.parse("thread-1"),
        lastTurnId: hostTurnIdSchema.parse("turn-1"),
      }),
    ).resolves.toEqual({ threadId: "forked-thread" });
    await expect(
      client.listThreadOwnership({
        threadIds: [
          hostThreadIdSchema.parse("thread-1"),
          hostThreadIdSchema.parse("official-thread"),
        ],
      }),
    ).resolves.toEqual({
      threads: [
        { threadId: "thread-1", owner: "external", harnessId: "pi" },
        { threadId: "official-thread", owner: "codex" },
      ],
    });
    await expect(
      client.selectThreadModel({
        threadId: hostThreadIdSchema.parse("thread-1"),
        model,
      }),
    ).resolves.toMatchObject({ effectiveModel: model, effectiveThinkingOptionId: high });
    await expect(
      client.selectThreadThinking({
        threadId: hostThreadIdSchema.parse("thread-1"),
        thinkingOptionId: high,
      }),
    ).resolves.toMatchObject({ effectiveModel: model, effectiveThinkingOptionId: high });
    expect(sendRequest).toHaveBeenNthCalledWith(1, HARNESS_INSPECT_METHOD, {
      harnessId: "pi",
      refresh: true,
    });
    expect(sendRequest).toHaveBeenNthCalledWith(2, THREAD_INSPECT_METHOD, {
      threadId: "thread-1",
    });
    expect(sendRequest).toHaveBeenNthCalledWith(3, THREAD_FORK_METHOD, {
      threadId: "thread-1",
      lastTurnId: "turn-1",
    });
    expect(sendRequest).toHaveBeenNthCalledWith(4, THREAD_OWNERSHIP_LIST_METHOD, {
      threadIds: ["thread-1", "official-thread"],
    });
    expect(sendRequest).toHaveBeenNthCalledWith(5, THREAD_MODEL_SELECT_METHOD, {
      threadId: "thread-1",
      model,
    });
    expect(sendRequest).toHaveBeenNthCalledWith(6, THREAD_THINKING_SELECT_METHOD, {
      threadId: "thread-1",
      thinkingOptionId: high,
    });
    await expect(
      client.selectThreadPermissionMode({
        threadId: hostThreadIdSchema.parse("thread-1"),
        permissionModeId,
      }),
    ).resolves.toMatchObject({ effectivePermissionModeId: permissionModeId });
    expect(sendRequest).toHaveBeenNthCalledWith(7, THREAD_PERMISSION_MODE_SELECT_METHOD, {
      threadId: "thread-1",
      permissionModeId,
    });
    await expect(
      client.inspectThreadUsage({
        threadId: hostThreadIdSchema.parse("thread-1"),
        refresh: "exact",
      }),
    ).resolves.toEqual({
      threadId: "thread-1",
      usage: { cacheHitRatePercent: 99.9, totalCostUsd: 0.168 },
    });
    expect(sendRequest).toHaveBeenNthCalledWith(8, THREAD_USAGE_INSPECT_METHOD, {
      threadId: "thread-1",
      refresh: "exact",
    });
    const onUsage = vi.fn();
    const unsubscribe = client.subscribeThreadUsage?.(onUsage);
    expect(addNotificationCallback).toHaveBeenCalledWith(
      [THREAD_TOKEN_USAGE_UPDATED_METHOD, THREAD_USAGE_UPDATED_METHOD],
      expect.any(Function),
    );
    usageNotification?.({
      method: THREAD_USAGE_UPDATED_METHOD,
      params: { threadId: "thread-1" },
    });
    usageNotification?.({
      method: THREAD_TOKEN_USAGE_UPDATED_METHOD,
      params: { threadId: "", turnId: "turn-1", tokenUsage: {} },
    });
    await vi.waitFor(() => expect(onUsage).toHaveBeenCalledOnce());
    expect(onUsage).toHaveBeenCalledWith({
      threadId: "thread-1",
      usage: { cacheHitRatePercent: 97.9, totalCostUsd: 5.913 },
    });
    unsubscribe?.();
    expect(removeUsageNotification).toHaveBeenCalledOnce();
    await expect(client.checkUpdate()).resolves.toMatchObject({ latestVersion: "1.2.3" });
    await expect(client.startUpdate()).resolves.toMatchObject({ status: { phase: "prepared" } });
    await expect(client.readUpdateStatus()).resolves.toEqual({ status: null });
    expect(sendRequest).toHaveBeenNthCalledWith(9, THREAD_USAGE_INSPECT_METHOD, {
      threadId: "thread-1",
    });
    expect(sendRequest).toHaveBeenNthCalledWith(10, UPDATE_CHECK_METHOD, {});
    expect(sendRequest).toHaveBeenNthCalledWith(11, UPDATE_START_METHOD, {});
    expect(sendRequest).toHaveBeenNthCalledWith(12, UPDATE_STATUS_METHOD, {});
  });

  it("uses only the fixed DSH Modern Session import methods and strict shapes", async () => {
    const sendRequest = vi
      .fn<(method: string, params: unknown) => Promise<unknown>>()
      .mockResolvedValueOnce({
        candidates: [
          {
            nativeSessionId: "native-1",
            title: "Existing session",
            updatedAt: 1_000,
            cwd: "C:\\work",
            running: false,
          },
        ],
      })
      .mockResolvedValueOnce({ threadId: "thread-1" });
    const client = createRendererModelClient([{ sendRequest }]);
    if (!client?.listDeepSeekModernSessions || !client.importDeepSeekModernSession) {
      throw new Error("DSH Modern Session client was not created");
    }

    await expect(client.listDeepSeekModernSessions({})).resolves.toMatchObject({
      candidates: [{ nativeSessionId: "native-1" }],
    });
    await expect(
      client.importDeepSeekModernSession({ nativeSessionId: "native-1" }),
    ).resolves.toEqual({ threadId: "thread-1" });
    expect(sendRequest).toHaveBeenNthCalledWith(1, DEEPSEEK_MODERN_SESSION_LIST_METHOD, {});
    expect(sendRequest).toHaveBeenNthCalledWith(2, DEEPSEEK_MODERN_SESSION_IMPORT_METHOD, {
      nativeSessionId: "native-1",
    });

    await expect(
      client.importDeepSeekModernSession({
        nativeSessionId: "native-2",
        cwd: "C:\\injected",
      } as never),
    ).rejects.toThrow();
    expect(sendRequest).toHaveBeenCalledTimes(2);
  });

  it("coalesces an in-flight DSH Modern import across page mounts", async () => {
    const response = Promise.withResolvers<unknown>();
    const sendRequest = vi.fn(() => response.promise);
    const client = createRendererModelClient([{ sendRequest }]);
    if (!client?.importDeepSeekModernSession) {
      throw new Error("DSH Modern Session client was not created");
    }

    const first = client.importDeepSeekModernSession({ nativeSessionId: "native-1" });
    const remounted = client.importDeepSeekModernSession({ nativeSessionId: "native-1" });

    expect(sendRequest).toHaveBeenCalledOnce();
    response.resolve({ threadId: "thread-1" });
    await expect(first).resolves.toEqual({ threadId: "thread-1" });
    await expect(remounted).resolves.toEqual({ threadId: "thread-1" });
  });

  it("normalizes only stable unavailable DSH Modern response codes", async () => {
    const unavailable = Object.assign(new Error("private unavailable detail"), { code: -32076 });
    const unsupported = Object.assign(new Error("private unsupported detail"), { code: -32077 });
    const sendRequest = vi
      .fn()
      .mockRejectedValueOnce(unavailable)
      .mockRejectedValueOnce(unsupported);
    const client = createRendererModelClient([{ sendRequest }]);
    if (!client?.listDeepSeekModernSessions || !client.importDeepSeekModernSession) {
      throw new Error("DSH Modern Session client was not created");
    }

    await expect(client.listDeepSeekModernSessions({})).rejects.toBeInstanceOf(
      RendererDeepSeekSessionUnavailableError,
    );
    await expect(
      client.importDeepSeekModernSession({ nativeSessionId: "native-1" }),
    ).rejects.toBeInstanceOf(RendererDeepSeekSessionUnavailableError);
  });

  it("opens Harness Web through the pathless Host action", async () => {
    const sendRequest = vi.fn(() => Promise.resolve({}));
    const client = createRendererModelClient([{ sendRequest }]);
    if (!client?.openHarnessWebUi) throw new Error("Harness Web UI client was not created");
    const harnessId = harnessIdSchema.parse("deepseek-harness");

    await expect(client.openHarnessWebUi({ harnessId })).resolves.toBeUndefined();
    expect(sendRequest).toHaveBeenCalledWith(HARNESS_WEB_UI_OPEN_METHOD, { harnessId });
    await expect(
      client.openHarnessWebUi({ harnessId, url: "http://127.0.0.1/?token=secret" } as never),
    ).rejects.toThrow();
    expect(sendRequest).toHaveBeenCalledOnce();
  });

  it("defers Usage notification registration until a request manager is available", () => {
    const relay = createThreadUsageSubscriptionRelay();
    const listener = vi.fn();
    const unsubscribe = relay.subscribe(listener);
    const unavailable = vi.fn(() => {
      throw new Error("Request manager is unavailable");
    });
    let notify: ((update: ThreadUsageInspection) => void) | undefined;
    const removeNotification = vi.fn();
    const subscribeThreadUsage = vi.fn((callback: typeof notify) => {
      notify = callback;
      return removeNotification;
    });

    expect(unavailable).not.toHaveBeenCalled();
    relay.connect({ subscribeThreadUsage: unavailable });
    relay.connect({ subscribeThreadUsage });
    expect(unavailable).toHaveBeenCalledOnce();
    expect(subscribeThreadUsage).toHaveBeenCalledOnce();
    notify?.({ threadId: hostThreadIdSchema.parse("thread-1"), usage: null });
    expect(listener).toHaveBeenCalledWith({ threadId: "thread-1", usage: null });

    unsubscribe();
    expect(removeNotification).toHaveBeenCalledOnce();
    relay.dispose();
  });

  it("fails closed when request manager ownership is absent or ambiguous", () => {
    expect(createRendererModelClient([])).toBeNull();
    expect(
      createRendererModelClient([{ sendRequest: vi.fn() }, { sendRequest: vi.fn() }]),
    ).toBeNull();
    expect(createRendererModelClient([{}])).toBeNull();
  });

  it("fails closed when Usage notifications cannot be attached", () => {
    const client = createRendererModelClient([{ sendRequest: vi.fn() }]);
    expect(client).not.toBeNull();
    expect(() => client?.subscribeThreadUsage?.(() => undefined)).toThrow(
      "Renderer Usage notification callback is unavailable",
    );
  });

  it("rejects a Thread inspection that leaks Native identity", async () => {
    const sendRequest = vi.fn(async () => ({
      owner: "external",
      harnessId: "pi",
      transportModelId: "codexhost/pi-native",
      locked: true,
      nativeSessionRef: { nativeSessionId: "private" },
    }));
    const client = createRendererModelClient([{ sendRequest }]);
    if (!client) throw new Error("Synthetic Model client was not created");

    await expect(
      client.inspectThread({ threadId: hostThreadIdSchema.parse("thread-1") }),
    ).rejects.toThrow();
  });

  it("rejects ownership results that do not exactly match requested IDs", async () => {
    const sendRequest = vi.fn(async () => ({
      threads: [
        { threadId: "thread-2", owner: "codex" },
        { threadId: "thread-1", owner: "external", harnessId: "pi" },
      ],
    }));
    const client = createRendererModelClient([{ sendRequest }]);
    if (!client) throw new Error("Synthetic Model client was not created");

    await expect(
      client.listThreadOwnership({
        threadIds: [hostThreadIdSchema.parse("thread-1"), hostThreadIdSchema.parse("thread-2")],
      }),
    ).rejects.toThrow("does not match");
  });

  it("rejects update results that expose privileged artifact data", async () => {
    const sendRequest = vi.fn(async () => ({
      currentVersion: "1.2.2",
      installation: "npm",
      latestVersion: "1.2.3",
      updateAvailable: true,
      installationAvailable: true,
      releaseNotes: "Safer updates",
      releaseNotesUrl: "https://github.com/BytePioneer-AI/codex-host/releases/tag/v1.2.3",
      status: null,
      error: null,
      artifactUrl: "https://example.com/update.exe",
    }));
    const client = createRendererModelClient([{ sendRequest }]);
    if (!client) throw new Error("Synthetic update client was not created");

    await expect(client.checkUpdate()).rejects.toThrow();
  });

  it("rejects a response that leaks undeclared native Model fields", async () => {
    const sendRequest = vi.fn(async () => ({
      ...inspection,
      catalog: {
        ...inspection.catalog,
        models: [
          {
            ref: model,
            label: "provider / model",
            provider: { baseUrl: "https://private.invalid", apiKey: "secret" },
          },
        ],
      },
    }));
    const client = createRendererModelClient([{ sendRequest }]);
    if (!client) throw new Error("Synthetic Model client was not created");

    await expect(client.inspectHarness({ harnessId: piHarnessId })).rejects.toThrow();
  });

  it("routes Model provider, pool, and gateway methods with validated params", async () => {
    const providerId = modelProviderIdSchema.parse("my-gateway");
    const sendRequest = vi
      .fn<(method: string, params: unknown) => Promise<unknown>>()
      .mockResolvedValueOnce({
        providers: [
          {
            id: providerId,
            name: "My Gateway",
            wireFormat: "openai-chat",
            baseUrl: "https://api.example.com/v1",
            hasApiKey: true,
          },
        ],
        pool: [{ modelId: "gpt-5", providerId, wireFormat: "openai-chat" }],
        gatewayEndpoint: "http://127.0.0.1:54321",
      })
      .mockResolvedValueOnce({
        providers: [
          {
            id: providerId,
            name: "My Gateway",
            wireFormat: "openai-chat",
            baseUrl: "https://api.example.com/v1",
            hasApiKey: true,
          },
        ],
        pool: [],
        gatewayEndpoint: "http://127.0.0.1:54321",
      })
      .mockResolvedValueOnce({
        providers: [],
        pool: [],
        gatewayEndpoint: "http://127.0.0.1:54321",
      })
      .mockResolvedValueOnce({
        providers: [],
        pool: [{ modelId: "gpt-5", providerId, wireFormat: "openai-chat" }],
        gatewayEndpoint: "http://127.0.0.1:54321",
      })
      .mockResolvedValueOnce({
        providers: [],
        pool: [],
        gatewayEndpoint: "http://127.0.0.1:54321",
      })
      .mockResolvedValueOnce({
        models: [{ id: "gpt-5", label: "GPT-5" }],
      })
      .mockResolvedValueOnce({ ok: true, latencyMs: 120 })
      .mockResolvedValueOnce({
        endpoint: "http://127.0.0.1:54321",
        tokenIssuedAt: 42,
        defaultRoutes: [{ wireFormat: "openai-chat", providerId }],
      });
    const client = createRendererModelClient([{ sendRequest }]);
    if (!client) throw new Error("Synthetic Model client was not created");

    const list = await client.listModelProviders();
    expect(list.gatewayEndpoint).toBe("http://127.0.0.1:54321");
    expect(list.providers[0]?.id).toBe(providerId);
    expect(list.providers[0]?.wireFormat).toBe("openai-chat");
    expect(list.providers[0]?.hasApiKey).toBe(true);
    expect(list.providers[0]?.apiKey).toBeUndefined();
    expect(sendRequest).toHaveBeenNthCalledWith(1, MODEL_PROVIDER_LIST_METHOD, {});

    await expect(
      client.saveModelProvider({
        id: providerId,
        name: "My Gateway",
        wireFormat: "openai-chat",
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-test",
      }),
    ).resolves.toMatchObject({ pool: [] });
    expect(sendRequest).toHaveBeenNthCalledWith(2, MODEL_PROVIDER_SAVE_METHOD, {
      id: providerId,
      name: "My Gateway",
      wireFormat: "openai-chat",
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
    });

    await expect(client.removeModelProvider(providerId)).resolves.toMatchObject({
      providers: [],
    });
    expect(sendRequest).toHaveBeenNthCalledWith(3, MODEL_PROVIDER_REMOVE_METHOD, {
      id: providerId,
    });

    await expect(
      client.addModelPoolEntry({ modelId: "gpt-5", label: "GPT-5", providerId }),
    ).resolves.toMatchObject({ pool: [{ modelId: "gpt-5" }] });
    expect(sendRequest).toHaveBeenNthCalledWith(4, MODEL_PROVIDER_POOL_ADD_METHOD, {
      modelId: "gpt-5",
      label: "GPT-5",
      providerId,
    });

    await expect(
      client.removeModelPoolEntry({ modelId: "gpt-5", providerId }),
    ).resolves.toMatchObject({ pool: [] });
    expect(sendRequest).toHaveBeenNthCalledWith(5, MODEL_PROVIDER_POOL_REMOVE_METHOD, {
      modelId: "gpt-5",
      providerId,
    });

    await expect(client.fetchModelProviderModels(providerId)).resolves.toEqual({
      models: [{ id: "gpt-5", label: "GPT-5" }],
    });
    expect(sendRequest).toHaveBeenNthCalledWith(6, MODEL_PROVIDER_FETCH_MODELS_METHOD, {
      id: providerId,
    });

    await expect(client.testModelProvider(providerId)).resolves.toEqual({
      ok: true,
      latencyMs: 120,
    });
    expect(sendRequest).toHaveBeenNthCalledWith(7, MODEL_PROVIDER_TEST_METHOD, {
      id: providerId,
    });

    await expect(client.readModelGatewayStatus()).resolves.toMatchObject({
      tokenIssuedAt: 42,
      defaultRoutes: [{ wireFormat: "openai-chat", providerId }],
    });
    expect(sendRequest).toHaveBeenNthCalledWith(8, MODEL_PROVIDER_GATEWAY_STATUS_METHOD, {});
  });
});
