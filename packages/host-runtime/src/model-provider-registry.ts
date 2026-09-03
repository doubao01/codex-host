import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

import {
  modelPoolEntrySchema,
  modelProviderConfigSchema,
  type ModelPoolEntry,
  type ModelPoolEntryAddParams,
  type ModelPoolEntryRemoveParams,
  type ModelProviderConfig,
  type ModelProviderDefaultRoute,
  type ModelProviderHeader,
  type ModelProviderId,
  type ModelProviderSaveParams,
  type ModelProviderWireFormat,
} from "@codexhost/shared-contracts";

const STORE_VERSION = 2 as const;

const modelProviderStoreSchema = z
  .object({
    version: z.literal(STORE_VERSION),
    providers: z.array(modelProviderConfigSchema),
    pool: z.array(modelPoolEntrySchema),
  })
  .strict();

/** Pre-wire-format store layout; migrated to v2 on load. */
const modelProviderStoreSchemaV1 = z
  .object({
    version: z.literal(1),
    providers: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          protocol: z.enum(["openai", "anthropic", "ollama", "lmstudio"]),
          baseUrl: z.string(),
          apiKey: z.string().optional(),
          hasApiKey: z.boolean().optional(),
        })
        .strict(),
    ),
    pool: z.array(
      z
        .object({
          modelId: z.string(),
          label: z.string().optional(),
          providerId: z.string(),
          protocol: z.enum(["openai", "anthropic", "ollama", "lmstudio"]),
        })
        .strict(),
    ),
  })
  .strict();

type ModelProviderStore = z.infer<typeof modelProviderStoreSchema>;

type ModelProviderStoreV1 = z.infer<typeof modelProviderStoreSchemaV1>;

/** Un-normalized v1 migration shape; the ids are re-validated on the way out. */
type ModelProviderStoreMigrated = {
  version: typeof STORE_VERSION;
  providers: Array<{
    id: string;
    name: string;
    wireFormat: ModelProviderWireFormat;
    baseUrl: string;
    apiKey?: string;
  }>;
  pool: Array<{
    modelId: string;
    label?: string;
    providerId: string;
    wireFormat: ModelProviderWireFormat;
  }>;
};

const V1_WIRE_FORMAT: Readonly<Record<"openai" | "anthropic", ModelProviderWireFormat>> = {
  openai: "openai-chat",
  anthropic: "anthropic",
};

/** Converts a v1 store; local sources (Ollama / LM Studio) were removed. */
function migrateV1(store: ModelProviderStoreV1): ModelProviderStoreMigrated {
  const keptProtocols = new Set(["openai", "anthropic"]);
  const providers = store.providers
    .filter((provider) => keptProtocols.has(provider.protocol))
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      wireFormat: V1_WIRE_FORMAT[provider.protocol as "openai" | "anthropic"],
      baseUrl: provider.baseUrl,
      ...(provider.apiKey !== undefined && provider.apiKey.length > 0 ? { apiKey: provider.apiKey } : {}),
    }));
  const keptIds = new Set(providers.map((provider) => provider.id));
  const pool = store.pool
    .filter(
      (entry) => keptIds.has(entry.providerId) && keptProtocols.has(entry.protocol),
    )
    .map((entry) => ({
      modelId: entry.modelId,
      ...(entry.label !== undefined ? { label: entry.label } : {}),
      providerId: entry.providerId,
      wireFormat: V1_WIRE_FORMAT[entry.protocol as "openai" | "anthropic"],
    }));
  return { version: STORE_VERSION, providers, pool };
}

function parseStore(value: unknown): ModelProviderStore {
  if (value !== null && typeof value === "object" && (value as { version?: unknown }).version === 1) {
    const v1 = modelProviderStoreSchemaV1.safeParse(value);
    if (v1.success) {
      const migrated = modelProviderStoreSchema.safeParse(migrateV1(v1.data));
      if (migrated.success) return migrated.data;
    }
    // A corrupt v1 file should not prevent startup; fall back to empty.
    return emptyStore();
  }
  const parsed = modelProviderStoreSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  if (parsed.error.issues.some((issue) => issue.path[0] === "version")) {
    throw new Error(`Unsupported model provider store version`);
  }
  // A corrupt registry file should not prevent startup; fall back to empty.
  return emptyStore();
}

function emptyStore(): ModelProviderStore {
  return { version: STORE_VERSION, providers: [], pool: [] };
}

function redactProvider(provider: ModelProviderConfig): ModelProviderConfig {
  return {
    id: provider.id,
    name: provider.name,
    wireFormat: provider.wireFormat,
    baseUrl: provider.baseUrl,
    ...(provider.path !== undefined && provider.path.length > 0 ? { path: provider.path } : {}),
    ...(provider.apiKey !== undefined && provider.apiKey.length > 0 ? { hasApiKey: true } : {}),
    ...(provider.headers !== undefined && provider.headers.length > 0
      ? {
          headers: provider.headers.map((header) => ({
            name: header.name,
            hasValue: header.value !== undefined && header.value.length > 0,
          })),
        }
      : {}),
  };
}

/**
 * Merges submitted headers against the stored ones: an omitted `value` keeps
 * the stored value for the same name, a non-empty `value` replaces it, and an
 * empty-string `value` removes the header entirely.
 */
function mergeHeaders(
  submitted: ModelProviderHeader[] | undefined,
  stored: readonly ModelProviderHeader[] | undefined,
): { name: string; value: string }[] {
  if (submitted === undefined) {
    return (stored ?? []).map((header) => ({
      name: header.name,
      value: header.value ?? "",
    }));
  }
  const result: { name: string; value: string }[] = [];
  for (const header of submitted) {
    if (header.value === undefined) {
      const previous = stored?.find((candidate) => candidate.name === header.name);
      if (previous?.value !== undefined && previous.value.length > 0) {
        result.push({ name: header.name, value: previous.value });
      }
    } else if (header.value.length > 0) {
      result.push({ name: header.name, value: header.value });
    }
    // An empty-string value clears the stored header.
  }
  return result;
}

export function defaultModelProviderRegistryPath(environment: NodeJS.ProcessEnv): string {
  const dataDirectory = environment.CODEXHOST_DATA_DIR;
  return path.join(
    dataDirectory ? path.resolve(dataDirectory) : path.join(os.homedir(), ".codexhost"),
    "model-providers.json",
  );
}

export type ModelProviderRegistrySnapshot = {
  providers: ModelProviderConfig[];
  pool: ModelPoolEntry[];
};

export class ModelProviderRegistry {
  private store: ModelProviderStore = emptyStore();

  constructor(
    private readonly registryPath: string,
    private readonly fileSystem: { readFile: typeof readFile; writeFile: typeof writeFile } = {
      readFile,
      writeFile,
    },
  ) {}

  async initialize(): Promise<void> {
    try {
      const contents = await this.fileSystem.readFile(this.registryPath, "utf8");
      const parsed = JSON.parse(contents);
      const fromV1 =
        parsed !== null &&
        typeof parsed === "object" &&
        (parsed as { version?: unknown }).version === 1;
      this.store = parseStore(parsed);
      // A v1 store is upgraded in memory; write the migration back exactly once.
      if (fromV1) await this.#persist(this.store);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.store = emptyStore();
        return;
      }
      // A corrupt registry file should not prevent startup; fall back to empty.
      this.store = emptyStore();
    }
  }

  /** Providers with secrets redacted (API keys, header values), plus the Model Pool. */
  snapshot(): ModelProviderRegistrySnapshot {
    return {
      providers: this.store.providers.map(redactProvider),
      pool: this.store.pool,
    };
  }

  /** Full provider (including stored secrets) for host-side routing only. */
  getProvider(id: string): ModelProviderConfig | null {
    return this.store.providers.find((provider) => provider.id === id) ?? null;
  }

  /** All configured providers in configuration order, including secrets, for host-side routing only. */
  listProvidersForRouting(): readonly ModelProviderConfig[] {
    return this.store.providers;
  }

  /** Current Model Pool entries (routes from a model to its provider). */
  listPool(): readonly ModelPoolEntry[] {
    return this.store.pool;
  }

  /** Default source for a wire format: the first configured provider of that format. */
  defaultProviderForWireFormat(wireFormat: ModelProviderWireFormat): ModelProviderConfig | null {
    return this.store.providers.find((provider) => provider.wireFormat === wireFormat) ?? null;
  }

  /** Default route per wire format: the first configured provider of that format. */
  listDefaultRoutes(): ModelProviderDefaultRoute[] {
    const seen = new Set<ModelProviderWireFormat>();
    const routes: ModelProviderDefaultRoute[] = [];
    for (const provider of this.store.providers) {
      if (seen.has(provider.wireFormat)) continue;
      seen.add(provider.wireFormat);
      routes.push({ wireFormat: provider.wireFormat, providerId: provider.id });
    }
    return routes;
  }

  async save(input: ModelProviderSaveParams): Promise<ModelProviderRegistrySnapshot> {
    const existing = this.store.providers.find((provider) => provider.id === input.id);
    let apiKey: string | undefined;
    if (input.apiKey === undefined) {
      apiKey = existing?.apiKey;
    } else if (input.apiKey === "") {
      apiKey = undefined;
    } else {
      apiKey = input.apiKey;
    }
    const headers = mergeHeaders(input.headers, existing?.headers);
    const next: ModelProviderConfig = {
      id: input.id,
      name: input.name,
      wireFormat: input.wireFormat,
      baseUrl: input.baseUrl,
      ...(input.path !== undefined && input.path.length > 0 ? { path: input.path } : {}),
      ...(apiKey !== undefined && apiKey.length > 0 ? { apiKey } : {}),
      ...(headers.length > 0 ? { headers } : {}),
    };
    const providers = this.store.providers.filter((provider) => provider.id !== input.id);
    providers.push(next);
    this.store = { ...this.store, providers };
    await this.#persist(this.store);
    return this.snapshot();
  }

  async remove(id: string): Promise<ModelProviderRegistrySnapshot> {
    const providers = this.store.providers.filter((provider) => provider.id !== id);
    const pool = this.store.pool.filter((entry) => entry.providerId !== id);
    this.store = { ...this.store, providers, pool };
    await this.#persist(this.store);
    return this.snapshot();
  }

  async addPoolEntry(input: ModelPoolEntryAddParams): Promise<ModelProviderRegistrySnapshot> {
    const provider = this.getProvider(input.providerId);
    if (!provider) throw new Error(`Unknown model provider: ${input.providerId}`);
    const entry = modelPoolEntrySchema.parse({
      modelId: input.modelId,
      ...(input.label !== undefined && input.label.length > 0 ? { label: input.label } : {}),
      providerId: provider.id,
      wireFormat: provider.wireFormat,
      ...(input.contextWindow !== undefined ? { contextWindow: input.contextWindow } : {}),
    });
    const previous = this.store.pool.find(
      (existing) => existing.modelId === entry.modelId && existing.providerId === entry.providerId,
    );
    const pool = this.store.pool.filter(
      (existing) =>
        !(existing.modelId === entry.modelId && existing.providerId === entry.providerId),
    );
    // Re-checking an already pooled model keeps its label when none is given.
    pool.push(entry.label !== undefined ? entry : { ...entry, label: previous?.label });
    this.store = { ...this.store, pool };
    await this.#persist(this.store);
    return this.snapshot();
  }

  async removePoolEntry(input: ModelPoolEntryRemoveParams): Promise<ModelProviderRegistrySnapshot> {
    const pool = this.store.pool.filter(
      (entry) => !(entry.modelId === input.modelId && entry.providerId === input.providerId),
    );
    this.store = { ...this.store, pool };
    await this.#persist(this.store);
    return this.snapshot();
  }

  async #persist(next: ModelProviderStore): Promise<void> {
    const serialized = JSON.stringify(next, null, 2);
    await this.fileSystem.writeFile(this.registryPath, `${serialized}\n`, "utf8");
  }
}

/** Creates the registry for production, ensuring the data directory exists. */
export async function createProductionModelProviderRegistry(
  environment: NodeJS.ProcessEnv,
): Promise<ModelProviderRegistry> {
  const registryPath = defaultModelProviderRegistryPath(environment);
  await mkdir(path.dirname(registryPath), { recursive: true }).catch(() => undefined);
  const registry = new ModelProviderRegistry(registryPath);
  await registry.initialize();
  return registry;
}

export type { ModelProviderId };
