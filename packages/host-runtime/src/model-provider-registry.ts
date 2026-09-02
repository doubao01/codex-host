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
  type ModelProviderId,
  type ModelProviderProtocol,
  type ModelProviderSaveParams,
} from "@codexhost/shared-contracts";

const STORE_VERSION = 1 as const;

const modelProviderStoreSchema = z
  .object({
    version: z.literal(STORE_VERSION),
    providers: z.array(modelProviderConfigSchema),
    pool: z.array(modelPoolEntrySchema),
  })
  .strict();

type ModelProviderStore = z.infer<typeof modelProviderStoreSchema>;

function parseStore(value: unknown): ModelProviderStore {
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
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    ...(provider.apiKey !== undefined && provider.apiKey.length > 0 ? { hasApiKey: true } : {}),
  };
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
      this.store = parseStore(JSON.parse(contents));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.store = emptyStore();
        return;
      }
      // A corrupt registry file should not prevent startup; fall back to empty.
      this.store = emptyStore();
    }
  }

  /** Providers with the API key redacted, plus the current Model Pool. */
  snapshot(): ModelProviderRegistrySnapshot {
    return {
      providers: this.store.providers.map(redactProvider),
      pool: this.store.pool,
    };
  }

  /** Full provider (including the stored API key) for host-side routing only. */
  getProvider(id: string): ModelProviderConfig | null {
    return this.store.providers.find((provider) => provider.id === id) ?? null;
  }

  /** Current Model Pool entries (routes from a model to its provider). */
  listPool(): readonly ModelPoolEntry[] {
    return this.store.pool;
  }

  /** Default source for a protocol: the first configured provider of that protocol. */
  defaultProviderForProtocol(protocol: ModelProviderProtocol): ModelProviderConfig | null {
    return this.store.providers.find((provider) => provider.protocol === protocol) ?? null;
  }

  /** Default route per protocol: the first configured provider of that protocol. */
  listDefaultRoutes(): ModelProviderDefaultRoute[] {
    const seen = new Set<ModelProviderProtocol>();
    const routes: ModelProviderDefaultRoute[] = [];
    for (const provider of this.store.providers) {
      if (seen.has(provider.protocol)) continue;
      seen.add(provider.protocol);
      routes.push({ protocol: provider.protocol, providerId: provider.id });
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
    const next: ModelProviderConfig = {
      id: input.id,
      name: input.name,
      protocol: input.protocol,
      baseUrl: input.baseUrl,
      ...(apiKey !== undefined && apiKey.length > 0 ? { apiKey } : {}),
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
      protocol: provider.protocol,
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
