import type { DefaultRendererSettingsPageId } from "./pages.js";

export const RENDERER_SETTINGS_LOCALES = ["en", "zh-CN"] as const;
export type RendererSettingsLocale = (typeof RENDERER_SETTINGS_LOCALES)[number];

export const RENDERER_SETTINGS_LANGUAGE_SELECTIONS = ["automatic", "en", "zh-CN", "other"] as const;
export type RendererSettingsLanguageSelection =
  (typeof RENDERER_SETTINGS_LANGUAGE_SELECTIONS)[number];
export type RendererSettingsWritableLanguageSelection = Exclude<
  RendererSettingsLanguageSelection,
  "other"
>;

export interface RendererSettingsLanguageControl {
  readonly available: boolean;
  readonly selection: RendererSettingsLanguageSelection;
  setSelection(selection: RendererSettingsWritableLanguageSelection): Promise<void>;
}

export interface RendererSettingsMessages {
  readonly locale: RendererSettingsLocale;
  readonly title: string;
  readonly close: string;
  readonly starOnGitHub: string;
  readonly sectionsLabel: string;
  readonly generalSection: string;
  readonly otherSection: string;
  readonly pageUnavailable: string;
  readonly inDevelopment: string;
  readonly notAvailable: string;
  readonly runtimeCapabilityNotInstalled: string;
  readonly connectionsDescription: string;
  readonly connectionAdapter: string;
  readonly connectionHosts: string;
  readonly connectionLocalHost: string;
  readonly connectionRemoteHost: string;
  readonly connectionActiveHost: string;
  readonly connectionReason: string;
  readonly connectionRefresh: string;
  readonly connectionRefreshing: string;
  readonly connectionViewError: string;
  readonly connectionCopyDetails: string;
  readonly connectionCopied: string;
  readonly connectionCopyFailed: string;
  readonly connectionErrorCode: string;
  readonly connectionErrorMessage: string;
  readonly connectionRetryable: string;
  readonly connectionFailureStage: string;
  readonly connectionDuration: string;
  readonly connectionDiagnostic: string;
  readonly connectionNoRuntime: string;
  readonly connectionStatusReady: string;
  readonly connectionStatusChecking: string;
  readonly connectionStatusNotInstalled: string;
  readonly connectionStatusUnavailable: string;
  readonly connectionStatusError: string;
  readonly connectionStatusInstalling: string;
  readonly connectionStatusUnsupported: string;
  readonly connectionComponent: string;
  readonly connectionStatus: string;
  readonly connectionHostsScrollLeft: string;
  readonly connectionHostsScrollRight: string;
  readonly connectionOpenInstallation: string;
  readonly connectionInstall: string;
  readonly connectionInstallDescription: string;
  readonly connectionErrorTitle: string;
  readonly connectionErrorLog: string;
  readonly connectionOpenIssue: string;
  readonly connectionIssueDescription: string;
  readonly connectionReadyDescription: string;
  readonly connectionUnavailableDescription: string;
  readonly connectionGroupMoreLabel: string;
  readonly connectionGroupMoreHintTitle: string;
  readonly connectionGroupMoreHintBody: string;
  readonly connectionGroupMoveToMore: string;
  readonly connectionGroupMoveToMain: string;
  readonly connectionGroupDragHandle: string;
  readonly connectionGroupReset: string;
  readonly pickerMoreAgentsLabel: string;
  readonly pickerManageLink: string;
  readonly pickerHideUnusedAgentsCta: string;
  readonly enabled: string;
  readonly disabled: string;
  readonly openSettings: string;
  readonly settingsButtonTitle: string;
  readonly settingsUnavailableTitle: string;
  readonly updateCurrentVersion: string;
  readonly updateInstallation: string;
  readonly updateInstallationNpm: string;
  readonly updateInstallationWindowsInstaller: string;
  readonly updateInstallationMacOsDmg: string;
  readonly updateInstallationUnknown: string;
  readonly updateLatestVersion: string;
  readonly updateUpToDate: string;
  readonly updateAvailable: string;
  readonly updateWindowsManualRequired: string;
  readonly updateAndRestart: string;
  readonly updateChecking: string;
  readonly updateDownloading: string;
  readonly updatePreparing: string;
  readonly updateWaitingForExit: string;
  readonly updateInstalling: string;
  readonly updateInstallingNpm: string;
  readonly updateRequestTimeout: string;
  readonly updateRestarting: string;
  readonly updateSucceeded: string;
  readonly updateFailed: string;
  readonly updateRetry: string;
  readonly updateManualNpmDescription: string;
  readonly updateWindowsNpmDescription: string;
  readonly updateWindowsInstallerDescription: string;
  readonly updateManualTitle: string;
  readonly updateManualFallbackDescription: string;
  readonly updateCopyCommand: string;
  readonly updateCommandCopied: string;
  readonly updateCopyFailed: string;
  readonly updateDownloadFromReleases: string;
  readonly updateDownloadWindowsInstaller: string;
  readonly aboutTagline: string;
  readonly aboutParagraphs: readonly string[];
  readonly aboutOpenSource: string;
  readonly aboutStarCallout: string;
  readonly aboutRepository: string;
  readonly agentsDescription: string;
  readonly agentsReset: string;
  readonly modelServicesDescription: string;
  readonly modelServicesGatewayTitle: string;
  readonly modelServicesGatewayEndpointLabel: string;
  readonly modelServicesGatewayDefaultRouteLabel: string;
  readonly modelServicesGatewayNotConfigured: string;
  readonly modelServicesNewThreadNote: string;
  readonly modelServicesSourcesTitle: string;
  readonly modelServicesAddProvider: string;
  readonly modelServicesEditProvider: string;
  readonly modelServicesProviderWireFormat: string;
  readonly modelServicesWireFormatOpenAiChat: string;
  readonly modelServicesWireFormatOpenAiResponses: string;
  readonly modelServicesWireFormatAnthropic: string;
  readonly modelServicesProviderName: string;
  readonly modelServicesProviderBaseUrl: string;
  readonly modelServicesProviderApiKey: string;
  readonly modelServicesProviderApiKeyHint: string;
  readonly modelServicesProviderApiKeySaved: string;
  readonly modelServicesProviderApiKeyMissing: string;
  readonly modelServicesApiKeyShow: string;
  readonly modelServicesApiKeyHide: string;
  readonly modelServicesModelsTitle: string;
  readonly modelServicesAddModel: string;
  readonly modelServicesModelLabelPlaceholder: string;
  readonly modelServicesContextWindow: string;
  readonly modelServicesAdvanced: string;
  readonly modelServicesProviderPath: string;
  readonly modelServicesPathHint: string;
  readonly modelServicesInvalidPath: string;
  readonly modelServicesHeaders: string;
  readonly modelServicesAddHeader: string;
  readonly modelServicesHeaderName: string;
  readonly modelServicesHeaderValue: string;
  readonly modelServicesHeaderValueSaved: string;
  readonly modelServicesRemoveHeader: string;
  readonly modelServicesNoHeaders: string;
  readonly modelServicesModelsNotFetched: string;
  readonly modelServicesSave: string;
  readonly modelServicesCancel: string;
  readonly modelServicesFetchModels: string;
  readonly modelServicesFetchingModels: string;
  readonly modelServicesTest: string;
  readonly modelServicesTesting: string;
  readonly modelServicesRemoveProvider: string;
  readonly modelServicesTestSuccess: string;
  readonly modelServicesTestFailed: string;
  readonly modelServicesCandidateRemove: string;
  readonly modelServicesNoModels: string;
  readonly modelServicesNoProviders: string;
  readonly modelServicesSaveFailed: string;
  readonly modelServicesRequestFailed: string;
  readonly pageLabels: Readonly<Record<DefaultRendererSettingsPageId, string>>;
}

const ENGLISH_MESSAGES: RendererSettingsMessages = Object.freeze({
  locale: "en",
  title: "Settings",
  close: "Close settings",
  starOnGitHub: "Give us a Star~",
  sectionsLabel: "Settings sections",
  generalSection: "General",
  otherSection: "Other",
  pageUnavailable: "Page unavailable",
  inDevelopment: "In development",
  notAvailable: "Not available",
  runtimeCapabilityNotInstalled: "This runtime capability is not installed yet.",
  connectionsDescription:
    "View runtime status by Host. Select an item to inspect details or complete its setup.",
  connectionAdapter: "Renderer adapter",
  connectionHosts: "Hosts",
  connectionLocalHost: "Local",
  connectionRemoteHost: "Remote Host",
  connectionActiveHost: "Current",
  connectionReason: "Reason",
  connectionRefresh: "Run connection diagnostics",
  connectionRefreshing: "Running diagnostics...",
  connectionViewError: "View error",
  connectionCopyDetails: "Copy diagnostics",
  connectionCopied: "Copied",
  connectionCopyFailed: "Copy failed",
  connectionErrorCode: "Error code",
  connectionErrorMessage: "Error message",
  connectionRetryable: "Retryable",
  connectionFailureStage: "Failure stage",
  connectionDuration: "Duration",
  connectionDiagnostic: "Diagnostic",
  connectionNoRuntime: "The renderer request bridge is not available yet.",
  connectionStatusReady: "Ready",
  connectionStatusChecking: "Checking",
  connectionStatusNotInstalled: "Not installed",
  connectionStatusUnavailable: "Unavailable",
  connectionStatusError: "Error",
  connectionStatusInstalling: "Installing",
  connectionStatusUnsupported: "Unsupported",
  connectionComponent: "Component",
  connectionStatus: "Status",
  connectionHostsScrollLeft: "Show previous Hosts",
  connectionHostsScrollRight: "Show more Hosts",
  connectionOpenInstallation: "Open official installation page",
  connectionInstall: "Install",
  connectionInstallDescription:
    "This Harness was not detected. Follow its official installation guide, then return here and run the check again.",
  connectionErrorTitle: "Connection check failed",
  connectionErrorLog: "Error log",
  connectionOpenIssue: "Open GitHub Issue",
  connectionIssueDescription:
    "Copy the error log and include the Host and reproduction steps when reporting the issue.",
  connectionReadyDescription: "This component is available on the selected Host.",
  connectionUnavailableDescription:
    "This component is not currently available on the selected Host.",
  connectionGroupMoreLabel: "More",
  connectionGroupMoreHintTitle: "Drag Agents here to collapse the ones you rarely use",
  connectionGroupMoreHintBody: "They fold into the picker's “More Agents” group",
  connectionGroupMoveToMore: "Move to More",
  connectionGroupMoveToMain: "Move back to Main",
  connectionGroupDragHandle: "Drag to reorder",
  connectionGroupReset: "Reset order",
  pickerMoreAgentsLabel: "More agents",
  pickerManageLink: "Manage",
  pickerHideUnusedAgentsCta: "Hide unused agents",
  enabled: "Enabled",
  disabled: "Disabled",
  openSettings: "Open codexhost settings",
  settingsButtonTitle: "codexhost settings",
  settingsUnavailableTitle: "codexhost settings unavailable",
  updateCurrentVersion: "Current version",
  updateInstallation: "Installation method",
  updateInstallationNpm: "npm",
  updateInstallationWindowsInstaller: "Windows installer",
  updateInstallationMacOsDmg: "macOS DMG",
  updateInstallationUnknown: "Unknown",
  updateLatestVersion: "Latest version",
  updateUpToDate: "You are up to date.",
  updateAvailable: "A new version is available.",
  updateWindowsManualRequired:
    "Automatic updates are unavailable on Windows. Update manually below.",
  updateAndRestart: "Update",
  updateChecking: "Checking for updates...",
  updateDownloading: "Downloading update...",
  updatePreparing: "Preparing update...",
  updateWaitingForExit: "Waiting for the application to close...",
  updateInstalling: "Installing update...",
  updateInstallingNpm: "Installing update through npm...",
  updateRequestTimeout: "The update service did not respond. Try again.",
  updateRestarting: "Restarting to finish the update...",
  updateSucceeded: "Update installed successfully.",
  updateFailed: "Update failed.",
  updateRetry: "Retry",
  updateManualNpmDescription: "To update manually, quit codexhost and run this command:",
  updateWindowsNpmDescription:
    "Automatic updates are unavailable on Windows. Quit codexhost and run this command in a terminal:",
  updateWindowsInstallerDescription:
    "Automatic updates are unavailable on Windows. Download and run the installer for this system.",
  updateManualTitle: "Manual update",
  updateManualFallbackDescription:
    "The automatic update did not complete. Run this command in a terminal instead, then quit Codex and relaunch it with codexhost.",
  updateCopyCommand: "Copy",
  updateCommandCopied: "Copied",
  updateCopyFailed: "Copy failed",
  updateDownloadFromReleases: "Download from GitHub Releases",
  updateDownloadWindowsInstaller: "Download Windows installer",
  aboutTagline: "Run Pi and other Harnesses in Codex Desktop",
  aboutParagraphs: Object.freeze([
    "We believe Codex Desktop offers the best desktop development experience available today.",
    "But Codex is not the only excellent Agent Harness. Some developers prefer Claude Code or Pi Agent.",
    "codexhost lets you choose the Agent that actually executes tasks inside Codex Desktop, while preserving the native Codex experience and enabling them to collaborate.",
  ]),
  aboutOpenSource: "codexhost is an open-source project. The source code is available at:",
  aboutStarCallout: "⭐ If this project helps you, please give us a Star! ⭐",
  aboutRepository: "Open-source repository",
  agentsDescription: "Choose which agents appear in the agent picker. Codex is always available.",
  agentsReset: "Reset to Default",
  modelServicesDescription:
    "Configure the sources models come from. Every source is reached through the local codexhost gateway, so provider keys never leave this device.",
  modelServicesGatewayTitle: "Local gateway",
  modelServicesGatewayEndpointLabel: "Endpoint",
  modelServicesGatewayDefaultRouteLabel: "Default sources",
  modelServicesGatewayNotConfigured: "No source configured yet.",
  modelServicesNewThreadNote:
    "Changes apply to new Threads. Restart the Host to update the Codex native agent.",
  modelServicesSourcesTitle: "Sources",
  modelServicesAddProvider: "Add source",
  modelServicesEditProvider: "Edit source",
  modelServicesProviderWireFormat: "Wire format",
  modelServicesWireFormatOpenAiChat: "OpenAI Chat",
  modelServicesWireFormatOpenAiResponses: "OpenAI Responses",
  modelServicesWireFormatAnthropic: "Anthropic",
  modelServicesProviderName: "Remark",
  modelServicesProviderBaseUrl: "API base URL",
  modelServicesProviderApiKey: "API token",
  modelServicesProviderApiKeyHint: "Optional. Leave blank to keep the saved key.",
  modelServicesProviderApiKeySaved: "Key saved",
  modelServicesProviderApiKeyMissing: "No key",
  modelServicesApiKeyShow: "Show",
  modelServicesApiKeyHide: "Hide",
  modelServicesModelsTitle: "Models",
  modelServicesAddModel: "Add model",
  modelServicesModelLabelPlaceholder: "Label (optional)",
  modelServicesContextWindow: "Context token",
  modelServicesAdvanced: "Advanced",
  modelServicesProviderPath: "Path",
  modelServicesPathHint: "Linked to the wire format; override for an exact request path.",
  modelServicesInvalidPath: "Path must start with /",
  modelServicesHeaders: "Headers",
  modelServicesAddHeader: "Add header",
  modelServicesHeaderName: "Header name",
  modelServicesHeaderValue: "Header value",
  modelServicesHeaderValueSaved: "Stored value; leave blank to keep",
  modelServicesRemoveHeader: "Remove header",
  modelServicesNoHeaders: "No custom headers.",
  modelServicesModelsNotFetched: "Click “Get models” to load the model list.",
  modelServicesSave: "Save",
  modelServicesCancel: "Cancel",
  modelServicesFetchModels: "Get models",
  modelServicesFetchingModels: "Getting models...",
  modelServicesTest: "Test",
  modelServicesTesting: "Testing...",
  modelServicesRemoveProvider: "Remove",
  modelServicesTestSuccess: "Connected",
  modelServicesTestFailed: "Failed",
  modelServicesCandidateRemove: "Remove from pool",
  modelServicesNoModels: "No models returned.",
  modelServicesNoProviders: "No sources configured yet.",
  modelServicesSaveFailed: "Remark and API base URL are required.",
  modelServicesRequestFailed: "Request failed.",
  pageLabels: Object.freeze({
    connections: "Connections",
    agents: "Agents",
    "model-services": "Model Services",
    updates: "Updates",
    about: "About",
  }),
});

const CHINESE_MESSAGES: RendererSettingsMessages = Object.freeze({
  locale: "zh-CN",
  title: "设置",
  close: "关闭设置",
  starOnGitHub: "点个 Star~",
  sectionsLabel: "设置分类",
  generalSection: "通用",
  otherSection: "其他",
  pageUnavailable: "页面不可用",
  inDevelopment: "开发中",
  notAvailable: "暂不可用",
  runtimeCapabilityNotInstalled: "运行时尚未安装该项能力，因此暂不可用。",
  connectionsDescription: "按 Host 查看运行时状态。选择一项，在右侧检查详情或完成配置。",
  connectionAdapter: "Renderer 适配器",
  connectionHosts: "Host 列表",
  connectionLocalHost: "本地",
  connectionRemoteHost: "远程 Host",
  connectionActiveHost: "当前",
  connectionReason: "原因",
  connectionRefresh: "重新诊断连接",
  connectionRefreshing: "正在诊断...",
  connectionViewError: "查看错误",
  connectionCopyDetails: "复制诊断信息",
  connectionCopied: "已复制",
  connectionCopyFailed: "复制失败",
  connectionErrorCode: "错误码",
  connectionErrorMessage: "错误信息",
  connectionRetryable: "可重试",
  connectionFailureStage: "失败阶段",
  connectionDuration: "检查耗时",
  connectionDiagnostic: "诊断信息",
  connectionNoRuntime: "Renderer 请求桥尚未可用。",
  connectionStatusReady: "正常",
  connectionStatusChecking: "检查中",
  connectionStatusNotInstalled: "未安装",
  connectionStatusUnavailable: "不可用",
  connectionStatusError: "错误",
  connectionStatusInstalling: "安装中",
  connectionStatusUnsupported: "不支持",
  connectionComponent: "组件",
  connectionStatus: "状态",
  connectionHostsScrollLeft: "查看前面的 Host",
  connectionHostsScrollRight: "查看更多 Host",
  connectionOpenInstallation: "前往官方安装页面",
  connectionInstall: "安装",
  connectionInstallDescription:
    "尚未检测到该 Harness。请按照官方安装指南完成安装，然后返回此页面重新检查。",
  connectionErrorTitle: "连接检查失败",
  connectionErrorLog: "错误日志",
  connectionOpenIssue: "提交 GitHub Issue",
  connectionIssueDescription: "提交前请复制错误日志，并在 Issue 中说明当前 Host 与复现步骤。",
  connectionReadyDescription: "该组件在当前 Host 上可用。",
  connectionUnavailableDescription: "该组件当前无法在所选 Host 上使用。",
  connectionGroupMoreLabel: "更多",
  connectionGroupMoreHintTitle: "拖到这里可以收起不常用的 Agent",
  connectionGroupMoreHintBody: "它们会折叠进选择器的「更多」分组",
  connectionGroupMoveToMore: "移到更多",
  connectionGroupMoveToMain: "移回常用",
  connectionGroupDragHandle: "拖动排序",
  connectionGroupReset: "恢复默认排列",
  pickerMoreAgentsLabel: "更多 Agent",
  pickerManageLink: "管理",
  pickerHideUnusedAgentsCta: "收起不常用的 Agent",
  enabled: "已开启",
  disabled: "已关闭",
  openSettings: "打开 codexhost 设置",
  settingsButtonTitle: "codexhost 设置",
  settingsUnavailableTitle: "codexhost 设置不可用",
  updateCurrentVersion: "当前版本",
  updateInstallation: "安装方式",
  updateInstallationNpm: "npm",
  updateInstallationWindowsInstaller: "Windows 安装程序",
  updateInstallationMacOsDmg: "macOS DMG",
  updateInstallationUnknown: "未知",
  updateLatestVersion: "最新版本",
  updateUpToDate: "当前已是最新版本。",
  updateAvailable: "有新版本可用。",
  updateWindowsManualRequired: "Windows 暂不支持自动更新，请在下方手动更新。",
  updateAndRestart: "更新",
  updateChecking: "正在检查更新...",
  updateDownloading: "正在下载更新...",
  updatePreparing: "正在准备更新...",
  updateWaitingForExit: "正在等待应用退出...",
  updateInstalling: "正在安装更新...",
  updateInstallingNpm: "正在通过 npm 安装...",
  updateRequestTimeout: "更新服务未响应，请重试。",
  updateRestarting: "正在重启以完成更新...",
  updateSucceeded: "更新安装成功。",
  updateFailed: "更新失败。",
  updateRetry: "重试",
  updateManualNpmDescription:
    "如需手动更新，请在终端运行以下命令。更新完成后，请退出 Codex 并通过 codexhost 重新启动。",
  updateWindowsNpmDescription:
    "Windows 暂不支持自动更新。请退出 codexhost，在终端运行以下命令完成更新。",
  updateWindowsInstallerDescription:
    "Windows 暂不支持自动更新。请下载并运行适用于当前系统的安装包。",
  updateManualTitle: "手动更新",
  updateManualFallbackDescription:
    "自动更新未能完成，请改用下列命令在终端手动更新。完成后请退出 Codex 并通过 codexhost 重新启动。",
  updateCopyCommand: "复制",
  updateCommandCopied: "已复制",
  updateCopyFailed: "复制失败",
  updateDownloadFromReleases: "前往 GitHub Releases 下载",
  updateDownloadWindowsInstaller: "下载 Windows 安装包",
  aboutTagline: "在 Codex Desktop 中运行 Pi 和其他 Harness",
  aboutParagraphs: Object.freeze([
    "我们认为 Codex Desktop 提供了目前最好的桌面开发交互体验。",
    "但 Codex 并不是唯一优秀的 Agent Harness，也有人偏好 Claude Code 和 Pi Agent。",
    "codexhost 让你在 Codex Desktop 中选择真正执行任务的 Agent，同时保留 Codex 的原生体验，并让它们协作完成任务。",
  ]),
  aboutOpenSource: "codexhost 是一个开源项目，开源地址：",
  aboutStarCallout: "⭐ 如果这个项目对你有帮助，请给我们一个 Star！⭐",
  aboutRepository: "开源仓库",
  agentsDescription: "选择在代理选择器中显示哪些代理。Codex 始终可用。",
  agentsReset: "恢复默认",
  modelServicesDescription:
    "配置模型的来源。所有来源都经由本地 codexhost 网关转发，供应商密钥不会离开本机。",
  modelServicesGatewayTitle: "本地网关",
  modelServicesGatewayEndpointLabel: "端点",
  modelServicesGatewayDefaultRouteLabel: "默认来源",
  modelServicesGatewayNotConfigured: "尚未配置来源。",
  modelServicesNewThreadNote: "更改对新 Thread 生效。重启 Host 以更新 Codex 原生代理。",
  modelServicesSourcesTitle: "来源",
  modelServicesAddProvider: "添加来源",
  modelServicesEditProvider: "编辑来源",
  modelServicesProviderWireFormat: "接口格式",
  modelServicesWireFormatOpenAiChat: "OpenAI Chat",
  modelServicesWireFormatOpenAiResponses: "OpenAI Responses",
  modelServicesWireFormatAnthropic: "Anthropic",
  modelServicesProviderName: "备注",
  modelServicesProviderBaseUrl: "API 地址",
  modelServicesProviderApiKey: "API Token",
  modelServicesProviderApiKeyHint: "可选。留空则保留已保存的密钥。",
  modelServicesProviderApiKeySaved: "已保存密钥",
  modelServicesProviderApiKeyMissing: "未设置",
  modelServicesApiKeyShow: "显示",
  modelServicesApiKeyHide: "隐藏",
  modelServicesModelsTitle: "模型",
  modelServicesAddModel: "添加模型",
  modelServicesModelLabelPlaceholder: "标签（可选）",
  modelServicesContextWindow: "上下文 token",
  modelServicesAdvanced: "高级设置",
  modelServicesProviderPath: "精确路径",
  modelServicesPathHint: "与接口格式联动，可覆盖为精确请求路径。",
  modelServicesInvalidPath: "路径需以 / 开头",
  modelServicesHeaders: "请求头",
  modelServicesAddHeader: "添加请求头",
  modelServicesHeaderName: "请求头名称",
  modelServicesHeaderValue: "请求头值",
  modelServicesHeaderValueSaved: "已保存值，留空保留",
  modelServicesRemoveHeader: "删除请求头",
  modelServicesNoHeaders: "尚未配置自定义请求头。",
  modelServicesModelsNotFetched: "点击「获取模型」拉取模型列表。",
  modelServicesSave: "保存",
  modelServicesCancel: "取消",
  modelServicesFetchModels: "获取模型",
  modelServicesFetchingModels: "正在获取...",
  modelServicesTest: "测试",
  modelServicesTesting: "测试中...",
  modelServicesRemoveProvider: "删除",
  modelServicesTestSuccess: "连接成功",
  modelServicesTestFailed: "连接失败",
  modelServicesCandidateRemove: "移出模型",
  modelServicesNoModels: "未返回任何模型。",
  modelServicesNoProviders: "尚未配置任何来源。",
  modelServicesSaveFailed: "备注与 API 地址为必填项。",
  modelServicesRequestFailed: "请求失败。",
  pageLabels: Object.freeze({
    connections: "连接",
    agents: "代理",
    "model-services": "模型服务",
    updates: "更新",
    about: "关于",
  }),
});

export const DEFAULT_RENDERER_SETTINGS_MESSAGES = ENGLISH_MESSAGES;

function languageFromTag(tag: string): string | undefined {
  try {
    return new Intl.Locale(tag).language.toLowerCase();
  } catch {
    return undefined;
  }
}

export function resolveRendererSettingsLocale(
  languageTags: readonly string[],
): RendererSettingsLocale {
  for (const tag of languageTags) {
    const language = languageFromTag(tag);
    if (language === "zh") return "zh-CN";
    if (language === "en") return "en";
  }
  return "en";
}

export function rendererSettingsMessages(locale: RendererSettingsLocale): RendererSettingsMessages {
  return locale === "zh-CN" ? CHINESE_MESSAGES : ENGLISH_MESSAGES;
}

export function rendererSettingsLanguageSelection(
  localeOverride: string | null | undefined,
): RendererSettingsLanguageSelection {
  if (localeOverride == null) return "automatic";
  const language = languageFromTag(localeOverride);
  if (language === "zh") return "zh-CN";
  if (language === "en") return "en";
  return "other";
}

export function codexLocaleOverrideForSettingsSelection(
  selection: RendererSettingsWritableLanguageSelection,
): "en-US" | "zh-CN" | null {
  if (selection === "automatic") return null;
  return selection === "en" ? "en-US" : "zh-CN";
}
