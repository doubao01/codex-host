# AGY（Antigravity CLI）集成调研与决策记录

> 状态：调研结论。压缩/Fork 部分未触发实现；cwd 部分已实施 `--cwd` 修复。基于 2026-09 时点的 `google-antigravity/antigravity-cli` 官方文档（Headless mode、Managing Conversations、CLI Reference、Best Practices）、CHANGELOG（v1.1.12–1.1.26）、issue 区与本仓库 Adapter 现状。

## 1. 能力现状速览

| 能力 | 可行性 | 结论 |
| --- | --- | --- |
| 斜杠命令 | **已落地** | `--print=/<command>` 形式执行 `/help`、`/config`、`/permissions`、`/hooks`、`/usage`（见 `packages/adapters/antigravity/src/commands.ts`） |
| 工作目录对齐 | **已落地** | Turn 显式传 `--cwd <thread-cwd>`（见下文第 4 节） |
| 手动上下文压缩（`/compact`） | **不可行（当前）** | AGY 没有 `/compact`；其上下文策略是 fork/隔离而非原位压缩 |
| 自动压缩投影 | **部分可行（被动）** | CLI 自行管理上下文；headless 流尚无压缩事件类型 |
| Fork（headless） | **不可行（当前）** | `/fork` 是 TUI 交互命令；headless 协议把 CLI 自答斜杠命令一律判为 ERROR |
| 修订上一条（rollback） | **不可行（当前）** | `/rewind` 同为 TUI 命令；`--conversation` 恢复后只能追加，不能截断 |

## 2. 压缩与 Fork 为什么不可行

### 2.1 AGY 的上下文策略与 codexhost 语义不对应

AGY 不提供 Claude Code 式的 in-place 压缩，而是采用「分支与隔离」策略：`/fork` 克隆会话、动态 subagent 各自持有独立上下文、计划状态放在 `.gemini` scratch 目录。CLI Reference 的斜杠命令表中**不存在 `/compact`**——这不是 Adapter 没接，而是 Harness 不提供。

codexhost 的既有先例（Grok 的 `x.ai/compact_conversation`、Pi 与 Claude 的原生压缩）都依赖 Harness 的显式压缩 RPC/命令。若在 AGY 上强行实现，只能伪造（发提示词让模型总结），违反仓库「Host 不猜测、不制造」的实现原则。

### 2.2 headless 协议排除会话管理类斜杠命令

Headless 文档的「Unsupported messages」表规定：

- CLI 自答的斜杠命令（如 `/model`、`/usage`）在 `--input-format stream-json` 下返回 `ERROR result` 并终止会话（exit 2）；
- 可独立执行的 CLI 自答命令只有 `--print=/<command>` 单独调用一种形式（斜杠命令能力已按此实现）。

`/fork`、`/resume`、`/rewind` 属于 **TUI 交互命令**（需要 picker、会切换当前终端的活跃会话），连 `--print=/fork` 也不可用。

### 2.3 已评估并否决的替代路径

| 路径 | 思路 | 否决原因 |
| --- | --- | --- |
| 双进程 Fork 模拟 | `--conversation <id>` 起新进程重放历史 | AGY 历史导出没有稳定 Turn 边界的公开接口，重放改写 `num_turns` 与 Checkpoint 语义，无法满足持久历史身份 Gate（实时 terminal 与 resume 后 Snapshot 的 NativeTurnRef 必须一致，见 `docs/acp-layer-follow-up.md`） |
| 本地会话库直读 | 只读投影 `~/.gemini/antigravity-cli/conversations/<id>.db` | 依赖未公开内部 schema；版本升级即碎 |
| 等待上游 headless fork API | 跟踪 antigravity-cli 的 headless 能力请求 | **正确路径**。上游一旦提供 `--fork` 类 flag 或流事件即可低成本接入 |

### 2.4 自动压缩的被动投影窗口

当前 stream 协议的 `step_type` 观察值只有 `user_input`、`agent_response`、`tool`、`checkpoint`。Adapter 已有 `HostContextCompactionItem` 类型，若后续 CLI 在流中新增压缩类 step/event，按 `stream-events.ts` 的既有解析模式扩展即可，不需要提前建抽象。

## 3. 工作目录（scratch → 用户 cwd）

### 3.1 问题界定

「工作目录固定为 `~/.gemini/antigravity-cli/scratch`」指的是 **AGY 自身的 workspace 概念**与 codexhost Thread 的 cwd 不一致：Adapter 从第一天就把进程 cwd 设为 Thread 的真实工作目录，但 AGY 的 workspace 识别并不等于进程 cwd——CLI 会确定一个 "workspace"（directory-scoped session cache），历史上多个版本把 workspace 错误落在 scratch 目录，导致 agent 只能读写 scratch、用户项目文件被当作 "Non-Workspace" 拒绝（Google AI Developers Forum 与 antigravity-cli issue #20 均有同类报告）。

### 3.2 AGY 侧的关键事实

- headless 支持官方 `--cwd <path>` flag（Best Practices：`agy -p "..." --cwd $(pwd)`）；`init` 事件回报 `cwd`；
- 会话按 workspace 隔离，`/resume` 分组视图（v1.1.25）按目录聚类；
- workspace 外写入在 `always-proceed` 曾被错误自动批准（v1.1.3 修复）；`permissions.allow` 规则可预放行工作区内写入；
- cwd 含隐藏祖先目录曾被拒绝作为 workspace（issue #20）；issue #7（per-conversation/workspace 作用域）仍未关闭。

### 3.3 已实施的修复：显式传 `--cwd`

Turn 启动参数追加 `--cwd <resolved thread cwd>`，把「进程 cwd」与「AGY workspace」显式对齐，不再依赖 AGY 从启动目录推断。官方 flag、无协议猜测；旧版 CLI 若不识别会显式报参数错误（fail-fast）。配套聚焦测试断言该参数随 Turn 传入。`inspect`（`agy models`）与 `/usage` 等只读 print 调用不依赖 workspace 判定，保持现状。

### 3.4 剩余缓解项（用户侧，文档化而非代码）

- 若 AGY 仍将写入限制在 scratch（其内部 bug），可在 `~/.gemini/antigravity-cli/settings.json` 配置 `permissions.allow`（如 `write_file(...)`），或用户明确接受风险时 `allowNonWorkspaceAccess`；
- 已否决 symlink 包装与提示词注入 "cd"：前者改变用户可见路径且无法保证 workspace 归属一致，后者依赖模型行为，违反「Host 不猜测」原则。

## 4. 后续建议

1. **不实现**手动压缩与 Fork 的模拟路径；保持 capability 诚实声明（`fork: false`）。
2. 上游提供 headless fork/rewind 入口或压缩流事件后，按「只读投影 → 持久历史身份 Gate → 声明 capability」顺序接入。
3. 更值得投入的下一批缺口（按价值排序）：
   - **提问交互（question interaction）**：headless 默认 soft-deny 权限请求，`interaction.respond` 目前返回 unsupported；若上游开放 headless 审批回调，价值最高；
   - **持久历史身份**：AGY 恢复会话后尚无稳定 Native Turn Ref 来源，是 Fork/Rollback 类能力的共同前置。
4. 追踪上游：`google-antigravity/antigravity-cli` 的 headless/print 相关 issue（先例：issue #7）与 CHANGELOG headless 小节。

## 参考

- `packages/adapters/antigravity/src/antigravity-adapter.ts`：capability、Turn 参数与 fork/rollback 拒绝路径
- `packages/adapters/antigravity/src/commands.ts`：`--print=/<command>` 斜杠命令实现
- `packages/adapters/grok/src/grok-manual-compaction.ts`：Harness 显式压缩 RPC 先例（AGY 无对应物）
- `docs/acp-layer-follow-up.md`：持久历史身份 Gate 的判定标准
- 官方文档：`antigravity.google/docs/cli/{headless,best-practices,conversations,reference}/`
- issue #7 / issue #20；CHANGELOG 1.1.3 / 1.1.6 / 1.1.22 / 1.1.25
