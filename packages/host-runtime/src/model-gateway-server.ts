import { randomBytes } from "node:crypto";
import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import { Agent as HttpAgent } from "node:http";
import type { AddressInfo } from "node:net";

import {
  isAnthropicWireFormat,
  isOpenAiWireFormat,
  type ModelPoolEntry,
  type ModelProviderConfig,
  type ModelProviderFetchModelsResult,
  type ModelProviderTestResult,
  type ModelProviderWireFormat,
} from "@codexhost/shared-contracts";

const MAX_FORWARD_BODY_BYTES = 32 * 1024 * 1024;
const TEST_TIMEOUT_MS = 15_000;

/** Delegation environment keys carrying the local Gateway endpoint / token. */
export const MODEL_GATEWAY_ENDPOINT_ENV = "CODEXHOST_MODEL_GATEWAY_ENDPOINT";
export const MODEL_GATEWAY_TOKEN_ENV = "CODEXHOST_MODEL_GATEWAY_TOKEN";

export interface ModelGatewayProviderSource {
  getProvider(id: string): ModelProviderConfig | null;
  listPool(): readonly ModelPoolEntry[];
  defaultProviderForWireFormat(wireFormat: ModelProviderWireFormat): ModelProviderConfig | null;
  /**
   * All configured providers in configuration order, including secrets.
   * Optional so minimal sources keep single-candidate (no fail-over) behavior;
   * the production registry provides it for cross-provider retry.
   */
  listProvidersForRouting?(): readonly ModelProviderConfig[];
}

export interface ModelGateway {
  readonly endpoint: string;
  readonly token: string;
  /** Unix milliseconds when the session token was issued. */
  readonly tokenIssuedAt: number;
  fetchModels(providerId: string): Promise<ModelProviderFetchModelsResult>;
  test(providerId: string): Promise<ModelProviderTestResult>;
  close(): Promise<void>;
}

function writeJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(value)}\n`);
}

function normalizeHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    normalized[name] = Array.isArray(value) ? value.join(", ") : value;
  }
  return normalized;
}

function parseModelList(body: Buffer): { id: string; label?: string }[] {
  const parsed: unknown = JSON.parse(body.toString("utf8"));
  const data =
    typeof parsed === "object" &&
    parsed !== null &&
    Array.isArray((parsed as { data?: unknown }).data)
      ? (parsed as { data: unknown[] }).data
      : Array.isArray(parsed)
        ? parsed
        : [];
  const models: { id: string; label?: string }[] = [];
  for (const item of data) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as { id?: unknown; display_name?: unknown; name?: unknown };
    if (typeof record.id !== "string" || record.id.length === 0) continue;
    const label =
      typeof record.display_name === "string" && record.display_name.length > 0
        ? record.display_name
        : typeof record.name === "string" && record.name.length > 0
          ? record.name
          : undefined;
    models.push(
      label !== undefined && label !== record.id ? { id: record.id, label } : { id: record.id },
    );
  }
  return models;
}

/** Configured custom headers with a non-empty stored value. */
function customHeaders(provider: ModelProviderConfig): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const header of provider.headers ?? []) {
    if (header.value !== undefined && header.value.length > 0) {
      headers[header.name.toLowerCase()] = header.value;
    }
  }
  return headers;
}

function authHeaders(provider: ModelProviderConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...customHeaders(provider),
  };
  if (isAnthropicWireFormat(provider.wireFormat)) {
    headers["anthropic-version"] = "2023-06-01";
    if (provider.apiKey) headers["x-api-key"] = provider.apiKey;
    else delete headers["x-api-key"];
    return headers;
  }
  if (provider.apiKey) headers.authorization = `Bearer ${provider.apiKey}`;
  else delete headers.authorization;
  return headers;
}

function forwardHeaders(
  incoming: IncomingHttpHeaders,
  provider: ModelProviderConfig,
): Record<string, string> {
  const headers = normalizeHeaders(incoming);
  delete headers.host;
  delete headers.connection;
  delete headers["keep-alive"];
  // Never forward the gateway credential to an upstream provider. Authentication
  // is rewritten below using the provider-owned secret.\n  delete headers["authorization"];\n  delete headers["x-api-key"];
  Object.assign(headers, customHeaders(provider));
  if (isAnthropicWireFormat(provider.wireFormat)) {
    delete headers.authorization;
    delete headers["x-api-key"];
    if (provider.apiKey) headers["x-api-key"] = provider.apiKey;
  } else {
    delete headers["x-api-key"];
    if (provider.apiKey) headers.authorization = `Bearer ${provider.apiKey}`;
    else delete headers.authorization;
  }
  return headers;
}

function upstreamUrl(provider: ModelProviderConfig, path: string): URL {
  return new URL(`${provider.baseUrl.replace(/\/+$/u, "")}${path}`);
}

/** Models listing path: honor an explicit `/models` path override, else the default. */
function modelsPath(provider: ModelProviderConfig): string {
  return provider.path !== undefined && provider.path.endsWith("/models")
    ? provider.path
    : "/v1/models";
}

export async function startModelGateway(input: {
  providers: ModelGatewayProviderSource;
}): Promise<ModelGateway> {
  const token = randomBytes(32).toString("hex");
  const tokenIssuedAt = Date.now();
  const httpAgent = new HttpAgent({ keepAlive: true });
  const httpsAgent = new HttpsAgent({ keepAlive: true });

  function agentFor(protocol: string): HttpAgent | HttpsAgent {
    return protocol === "https:" ? httpsAgent : httpAgent;
  }

  function authorize(
    authorization: string | undefined,
    xApiKey: string | string[] | undefined,
  ): boolean {
    return authorization === `Bearer ${token}` || xApiKey === token;
  }

  function poolModelsForPath(): { data: { id: string; display_name?: string }[] } {
    const entries = input.providers.listPool();
    return {
      data: entries.map((entry) =>
        entry.label !== undefined
          ? { id: entry.modelId, display_name: entry.label }
          : { id: entry.modelId },
      ),
    };
  }

  /** Wire formats are interchangeable within the OpenAI-compatible group. */
  function wireFormatsCompatible(a: ModelProviderWireFormat, b: ModelProviderWireFormat): boolean {
    return isOpenAiWireFormat(a) === isOpenAiWireFormat(b);
  }

  /** Pool-exact provider for a model, within the request's OpenAI-compatible group. */
  function poolProviderFor(
    modelId: string | undefined,
    wireFormat: ModelProviderWireFormat,
  ): ModelProviderConfig | null {
    if (modelId) {
      for (const entry of input.providers.listPool()) {
        if (entry.modelId !== modelId) continue;
        if (!wireFormatsCompatible(entry.wireFormat, wireFormat)) continue;
        const provider = input.providers.getProvider(entry.providerId);
        if (provider) return provider;
      }
    }
    return null;
  }

  /**
   * Ordered retry candidates: the pool-exact provider first, then every
   * compatible provider in configuration order (deduplicated). The wire-format
   * default is the first compatible configured provider, so it is naturally
   * covered when no pool entry matches.
   */
  function candidatesFor(
    modelId: string | undefined,
    wireFormat: ModelProviderWireFormat,
  ): ModelProviderConfig[] {
    const routed = poolProviderFor(modelId, wireFormat);
    const compatible = (input.providers.listProvidersForRouting?.() ?? []).filter((provider) =>
      wireFormatsCompatible(provider.wireFormat, wireFormat),
    );
    const candidates: ModelProviderConfig[] = [];
    const seen = new Set<string>();
    if (routed) {
      candidates.push(routed);
      seen.add(routed.id);
    }
    if (compatible.length === 0) {
      // Sources without an enumerable routing list fall back to the wire-format default.
      const fallback = input.providers.defaultProviderForWireFormat(wireFormat);
      if (fallback && !seen.has(fallback.id)) candidates.push(fallback);
      return candidates;
    }
    for (const provider of compatible) {
      if (seen.has(provider.id)) continue;
      candidates.push(provider);
      seen.add(provider.id);
    }
    return candidates;
  }

  /** True for upstream statuses that warrant trying another provider. */
  function retryableStatus(status: number): boolean {
    return status === 429 || status >= 500;
  }

  /**
   * Forwards one request to one provider and resolves with the outcome before
   * any bytes reach the client, so the caller can fall over to the next
   * candidate. Retryable statuses (429 / 5xx) and connection errors discard the
   * upstream body and resolve without touching the response; anything else
   * commits the response (writeHead + pipe) and is final.
   */
  function attemptForward(
    response: ServerResponse,
    provider: ModelProviderConfig,
    path: string,
    body: Buffer,
    incomingHeaders: IncomingHttpHeaders,
  ): Promise<
    | { kind: "forwarded" }
    | { kind: "status"; status: number }
    | { kind: "network"; message: string }
  > {
    return new Promise((resolve) => {
      const url = upstreamUrl(provider, path);
      const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
      const upstream = transport(
        url,
        {
          method: "POST",
          headers: forwardHeaders(incomingHeaders, provider),
          agent: agentFor(url.protocol),
        },
        (upstreamResponse) => {
          const status = upstreamResponse.statusCode ?? 502;
          if (retryableStatus(status) && !response.headersSent) {
            upstreamResponse.resume(); // discard the body so the keep-alive slot frees up
            resolve({ kind: "status", status });
            return;
          }
          const headers = normalizeHeaders(upstreamResponse.headers);
          delete headers.connection;
          delete headers["keep-alive"];
          response.writeHead(status, headers);
          upstreamResponse.pipe(response);
          resolve({ kind: "forwarded" });
        },
      );
      upstream.on("error", (error: Error) => {
        if (response.headersSent) {
          response.destroy();
          return;
        }
        resolve({ kind: "network", message: error.message });
      });
      upstream.end(body);
    });
  }

  async function requestUpstream(
    provider: ModelProviderConfig,
    method: "GET" | "POST",
    path: string,
  ): Promise<{ status: number; body: Buffer }> {
    return new Promise((resolve, reject) => {
      const url = upstreamUrl(provider, path);
      const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
      const req = transport(
        url,
        { method, headers: authHeaders(provider), agent: agentFor(url.protocol) },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () =>
            resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }),
          );
        },
      );
      req.on("error", reject);
      req.end();
    });
  }

  async function readBody(request: IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_FORWARD_BODY_BYTES) {
        const error = new Error("Request body is too large");
        Object.assign(error, { statusCode: 413 });
        throw error;
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks);
  }

  const server = createServer((request, response) => {
    void (async () => {
      if (!authorize(request.headers.authorization, request.headers["x-api-key"])) {
        writeJson(response, 401, {
          error: { code: "UNAUTHORIZED", message: "Gateway token is invalid" },
        });
        return;
      }
      const url = new URL(request.url ?? "/", "http://gateway.invalid");
      const wireFormat: ModelProviderWireFormat | null =
        url.pathname === "/v1/messages"
          ? "anthropic"
          : url.pathname === "/v1/responses"
            ? "openai-responses"
            : url.pathname === "/v1/chat/completions"
              ? "openai-chat"
              : null;

      if (request.method === "GET" && url.pathname === "/v1/models") {
        writeJson(response, 200, poolModelsForPath());
        return;
      }
      if (wireFormat === null) {
        writeJson(response, 404, {
          error: { code: "UNKNOWN_ROUTE", message: `Unknown Gateway route: ${url.pathname}` },
        });
        return;
      }

      const body = await readBody(request);
      let modelId: string | undefined;
      try {
        const parsed: unknown = JSON.parse(body.toString("utf8"));
        const candidate = (parsed as { model?: unknown } | null)?.model;
        modelId = typeof candidate === "string" ? candidate : undefined;
      } catch {
        // Forward the body anyway; the upstream may reject it with a clearer error.
      }

      const candidates = candidatesFor(modelId, wireFormat);
      if (candidates.length === 0) {
        writeJson(response, 503, {
          error: {
            code: "NO_MODEL_PROVIDER",
            message: "No model provider is configured for this request",
          },
        });
        return;
      }
      let lastFailure:
        { kind: "status"; status: number } | { kind: "network"; message: string } | null = null;
      for (const provider of candidates) {
        const forwardPath =
          provider.path !== undefined && provider.path.length > 0 ? provider.path : url.pathname;
        const outcome = await attemptForward(
          response,
          provider,
          forwardPath,
          body,
          request.headers,
        );
        if (outcome.kind === "forwarded") return;
        lastFailure = outcome;
      }
      // Every compatible provider failed before any bytes reached the client.
      const message =
        lastFailure?.kind === "network"
          ? `All model providers failed: ${lastFailure.message}`
          : lastFailure !== null
            ? `All model providers failed (last HTTP ${lastFailure.status})`
            : "No model provider is available for this request";
      writeJson(response, 502, {
        error: { code: "ALL_PROVIDERS_FAILED", message, attempted: candidates.length },
      });
    })().catch((error: unknown) => {
      const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
      writeJson(response, statusCode, {
        error: {
          code: "GATEWAY_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  const endpoint = `http://127.0.0.1:${address.port}`;

  function closeServer(target: Server): Promise<void> {
    return new Promise((resolve) => {
      target.close(() => resolve());
      target.closeAllConnections();
    });
  }

  async function fetchModels(providerId: string): Promise<ModelProviderFetchModelsResult> {
    const provider = input.providers.getProvider(providerId);
    if (!provider) throw new Error(`Unknown model provider: ${providerId}`);
    const { status, body } = await requestUpstream(provider, "GET", modelsPath(provider));
    if (status < 200 || status >= 300) {
      throw new Error(`Failed to fetch models (HTTP ${status})`);
    }
    return { models: parseModelList(body) };
  }

  async function test(providerId: string): Promise<ModelProviderTestResult> {
    const provider = input.providers.getProvider(providerId);
    if (!provider) return { ok: false, error: `Unknown model provider: ${providerId}` };
    const startedAt = Date.now();
    try {
      const timeout = new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Provider test timed out")),
          TEST_TIMEOUT_MS,
        );
        timer.unref?.();
      });
      const { status } = await Promise.race([
        requestUpstream(provider, "GET", modelsPath(provider)),
        timeout,
      ]);
      const latencyMs = Date.now() - startedAt;
      if (status >= 200 && status < 300) return { ok: true, latencyMs };
      return { ok: false, latencyMs, error: `HTTP ${status}` };
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      return {
        ok: false,
        latencyMs,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    endpoint,
    token,
    tokenIssuedAt,
    fetchModels,
    test,
    close: () => closeServer(server),
  };
}
