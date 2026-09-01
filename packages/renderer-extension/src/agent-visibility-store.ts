import { KNOWN_RENDERER_AGENTS, type ExternalRendererAgent } from "./agent-selection-state.js";

export interface AgentVisibilityStore {
  isVisible(agent: ExternalRendererAgent): boolean;
  setVisible(agent: ExternalRendererAgent, visible: boolean): void;
  resetToDefault(): void;
  subscribe(listener: () => void): () => void;
}

export const AGENT_VISIBILITY_STORAGE_KEY = "codexhost.agentVisibility.v1";

const EXTERNAL_AGENTS: readonly ExternalRendererAgent[] = KNOWN_RENDERER_AGENTS.filter(
  (agent): agent is ExternalRendererAgent => agent !== "codex",
);

function readStorage(
  storage: Pick<Storage, "getItem"> | null,
): Record<string, boolean> | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(AGENT_VISIBILITY_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<string, boolean>;
  } catch {
    return null;
  }
}

function writeStorage(
  storage: Pick<Storage, "setItem"> | null,
  visibility: ReadonlyMap<ExternalRendererAgent, boolean>,
): void {
  if (!storage) return;
  try {
    const record: Record<string, boolean> = {};
    for (const [agent, visible] of visibility) record[agent] = visible;
    storage.setItem(AGENT_VISIBILITY_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Best effort only: private browsing / quota errors should not break the UI.
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function createAgentVisibilityStore(
  storage: Storage | null = safeLocalStorage(),
): AgentVisibilityStore {
  const visibility = new Map<ExternalRendererAgent, boolean>(
    EXTERNAL_AGENTS.map((agent) => [agent, true]),
  );
  const listeners = new Set<() => void>();

  const stored = readStorage(storage);
  if (stored) {
    for (const agent of EXTERNAL_AGENTS) {
      if (typeof stored[agent] === "boolean") visibility.set(agent, stored[agent]);
    }
  }

  const persist = (): void => writeStorage(storage, visibility);
  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };

  return {
    isVisible(agent) {
      return visibility.get(agent) ?? true;
    },
    setVisible(agent, visible) {
      if (!EXTERNAL_AGENTS.includes(agent)) return;
      if (visibility.get(agent) === visible) return;
      visibility.set(agent, visible);
      persist();
      notify();
    },
    resetToDefault() {
      for (const agent of EXTERNAL_AGENTS) visibility.set(agent, true);
      persist();
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

let sharedStore: AgentVisibilityStore | null = null;

export function getSharedAgentVisibilityStore(): AgentVisibilityStore {
  if (!sharedStore) sharedStore = createAgentVisibilityStore();
  return sharedStore;
}
