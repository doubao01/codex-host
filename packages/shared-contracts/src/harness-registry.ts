export type HarnessCapability =
  "streaming" | "models" | "thinking" | "permissions" | "questions" | "history" | "fork";

export interface HarnessManifest {
  id: string;
  displayName: string;
  capabilities: readonly HarnessCapability[];
}

/**
 * Runtime-neutral registry for harness metadata.
 * Injection and CDP lifecycle deliberately do not live here: the renderer is
 * injected once and selects adapters through this registry.
 */
export class HarnessRegistry {
  private readonly manifests = new Map<string, HarnessManifest>();

  register(manifest: HarnessManifest): void {
    if (!manifest.id.trim()) throw new Error("Harness id must not be empty");
    if (this.manifests.has(manifest.id)) {
      throw new Error(`Harness already registered: ${manifest.id}`);
    }
    this.manifests.set(
      manifest.id,
      Object.freeze({ ...manifest, capabilities: [...manifest.capabilities] }),
    );
  }

  get(id: string): HarnessManifest | undefined {
    return this.manifests.get(id);
  }

  list(): readonly HarnessManifest[] {
    return [...this.manifests.values()];
  }

  supports(id: string, capability: HarnessCapability): boolean {
    return this.manifests.get(id)?.capabilities.includes(capability) ?? false;
  }
}
