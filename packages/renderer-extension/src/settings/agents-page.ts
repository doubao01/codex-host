import { KNOWN_RENDERER_AGENTS, type ExternalRendererAgent } from "../agent-selection-state.js";
import {
  getSharedAgentVisibilityStore,
  type AgentVisibilityStore,
} from "../agent-visibility-store.js";
import { createRendererAgentIcon, RENDERER_AGENT_LABELS } from "../renderer-agent-icon.js";
import type { RendererSettingsPageDefinition, RendererSettingsPageMountContext } from "./core.js";
import { createRendererSettingsIcon } from "./icons.js";
import type { RendererSettingsMessages } from "./localization.js";

const EXTERNAL_AGENTS: readonly ExternalRendererAgent[] = KNOWN_RENDERER_AGENTS.filter(
  (agent): agent is ExternalRendererAgent => agent !== "codex",
);

const AGENT_DESCRIPTIONS: Readonly<Record<ExternalRendererAgent, string>> = Object.freeze({
  pi: "Pi · JSON-RPC",
  "claude-code": "Claude Code · Anthropic Agent SDK",
  "deepseek-harness": "DeepSeek Harness · DSH Host API",
  opencode: "OpenCode · OpenCode SDK",
  grok: "Grok · Agent Client Protocol",
  omp: "Oh My Pi · JSON-RPC",
  antigravity: "Antigravity · Antigravity CLI",
});

function createAgentRow(
  agent: ExternalRendererAgent,
  messages: RendererSettingsMessages,
  store: AgentVisibilityStore,
  document: Document,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "settings-preference-row";
  row.style.minHeight = "72px";
  row.style.gap = "16px";

  const iconContainer = document.createElement("div");
  iconContainer.style.flex = "none";
  iconContainer.style.display = "flex";
  iconContainer.style.alignItems = "center";
  iconContainer.style.justifyContent = "center";
  iconContainer.style.width = "36px";
  iconContainer.style.height = "36px";
  iconContainer.append(createRendererAgentIcon(agent, 28, document));

  const copy = document.createElement("div");
  copy.className = "settings-preference-row__copy";
  const name = document.createElement("strong");
  name.textContent = RENDERER_AGENT_LABELS[agent];
  const description = document.createElement("span");
  description.textContent = AGENT_DESCRIPTIONS[agent];
  copy.append(name, description);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "settings-preference-switch";
  toggle.setAttribute("role", "switch");
  const thumb = document.createElement("span");
  thumb.className = "settings-preference-switch__thumb";
  toggle.append(thumb);

  const statusLabel = document.createElement("span");
  statusLabel.style.fontSize = "12px";
  statusLabel.style.minWidth = "42px";
  statusLabel.style.textAlign = "center";

  const applyState = (visible: boolean): void => {
    toggle.setAttribute("aria-checked", String(visible));
    toggle.setAttribute(
      "aria-label",
      `${RENDERER_AGENT_LABELS[agent]}: ${visible ? messages.enabled : messages.disabled}`,
    );
    statusLabel.textContent = visible ? messages.enabled : messages.disabled;
    statusLabel.style.color = visible ? "#4ade80" : "var(--settings-muted)";
    row.style.opacity = visible ? "1" : "0.55";
  };

  applyState(store.isVisible(agent));

  toggle.addEventListener("click", () => {
    const next = !store.isVisible(agent);
    store.setVisible(agent, next);
    applyState(next);
  });

  const controls = document.createElement("div");
  controls.style.display = "flex";
  controls.style.alignItems = "center";
  controls.style.gap = "10px";
  controls.style.flex = "none";
  controls.append(statusLabel, toggle);

  row.append(iconContainer, copy, controls);
  return row;
}

export function createAgentsSettingsPage(
  messages: RendererSettingsMessages,
  getStore: () => AgentVisibilityStore | null = () => getSharedAgentVisibilityStore(),
): RendererSettingsPageDefinition {
  return Object.freeze({
    id: "agents",
    label: messages.pageLabels.agents ?? "Agents",
    icon: "routes" as const,
    mount(context: RendererSettingsPageMountContext) {
      const document = context.content.ownerDocument;
      const store = getStore();

      const heading = document.createElement("div");
      heading.className = "settings-section-label";
      heading.textContent = messages.pageLabels.agents ?? "Agents";

      const description = document.createElement("p");
      description.style.color = "var(--settings-muted)";
      description.style.fontSize = "13px";
      description.style.lineHeight = "20px";
      description.style.margin = "0 0 8px 0";
      description.textContent = messages.agentsDescription;

      context.content.append(heading, description);

      if (!store) {
        const unavailable = document.createElement("p");
        unavailable.style.color = "var(--settings-muted)";
        unavailable.textContent = messages.runtimeCapabilityNotInstalled;
        context.content.append(unavailable);
        return undefined;
      }

      const list = document.createElement("div");
      const rows = new Map<ExternalRendererAgent, HTMLElement>();

      for (const agent of EXTERNAL_AGENTS) {
        const row = createAgentRow(agent, messages, store, document);
        rows.set(agent, row);
        list.append(row);
      }

      const footer = document.createElement("div");
      footer.style.marginTop = "20px";
      const resetButton = document.createElement("button");
      resetButton.type = "button";
      resetButton.className = "settings-command-button settings-command-button--secondary";
      resetButton.append(createRendererSettingsIcon("undo", 16), messages.agentsReset);
      resetButton.addEventListener("click", () => {
        store.resetToDefault();
        for (const agent of EXTERNAL_AGENTS) {
          const row = rows.get(agent);
          if (!row) continue;
          const toggle = row.querySelector(".settings-preference-switch");
          if (toggle) {
            toggle.setAttribute("aria-checked", "true");
            toggle.setAttribute(
              "aria-label",
              `${RENDERER_AGENT_LABELS[agent]}: ${messages.enabled}`,
            );
          }
          const label = row.querySelector("span[style*='min-width']") as HTMLElement | null;
          if (label) {
            label.textContent = messages.enabled;
            label.style.color = "#4ade80";
          }
          row.style.opacity = "1";
        }
      });
      footer.append(resetButton);

      context.content.append(list, footer);

      const unsubscribe = store.subscribe(() => {
        for (const agent of EXTERNAL_AGENTS) {
          const row = rows.get(agent);
          if (!row) continue;
          const visible = store.isVisible(agent);
          const toggle = row.querySelector(".settings-preference-switch");
          if (toggle) {
            toggle.setAttribute("aria-checked", String(visible));
            toggle.setAttribute(
              "aria-label",
              `${RENDERER_AGENT_LABELS[agent]}: ${visible ? messages.enabled : messages.disabled}`,
            );
          }
          const label = row.querySelector("span[style*='min-width']") as HTMLElement | null;
          if (label) {
            label.textContent = visible ? messages.enabled : messages.disabled;
            label.style.color = visible ? "#4ade80" : "var(--settings-muted)";
          }
          row.style.opacity = visible ? "1" : "0.55";
        }
      });

      return unsubscribe;
    },
  });
}
