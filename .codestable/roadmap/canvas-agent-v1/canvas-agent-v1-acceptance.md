---
doc_type: roadmap-acceptance
roadmap: canvas-agent-v1
status: accepted
accepted_at: 2026-06-07
summary: Canvas Agent V1 roadmap 全部子项已完成，Provider、adapter、context、tools、runner、UI、pending change、legacy fallback 和验收加固均已落地并通过验证。
tags: [canvas, agent, tool-calling, acceptance]
---

# Canvas Agent V1 验收报告

> 验收类型：roadmap 级验收
> 验收日期：2026-06-07
> 关联 roadmap：`.codestable/roadmap/canvas-agent-v1/canvas-agent-v1-roadmap.md`

本次不是标准单 feature 流程收尾，因此没有 `{slug}-design.md` 和 `{slug}-checklist.yaml` 可逐条对照。验收对象是 `canvas-agent-v1` roadmap 的 9 个子项：以 roadmap 接口契约和 V1 约束为准，核对实现、测试和 CodeStable 回写是否完整。

## 1. 已完成模块

- [x] Provider/Profile：`ProviderUsage` 增加 `agent`，Provider settings 保存 `selectedAgentProfileId`，profile 保存 `defaultAgentModel`，Services 设置页支持 Canvas Agent 默认 Provider。
- [x] Adapter Contract：adapter 类型增加 Canvas Agent tool calling 契约，OpenAI-compatible adapter 实现 `runCanvasAgentTurn()`。
- [x] Canvas Context：新增画布 summary、node inspect、generation context inspect，并限制长文本与图片 data URL 暴露。
- [x] Tool Registry：新增 V1 工具定义、权限分级、参数校验、标准化结果、focus/highlight 和 pending change 语义。
- [x] Agent Runner：实现有限 tool loop、timeline、错误恢复、pending changes 和默认 8 次工具调用预算。
- [x] Pending Changes：`propose_prompt_enrichment` 只生成候选；`apply_pending_change` 必须经用户显式应用。
- [x] Assistant UI：`CanvasAssistantPanel` 优先跑 Agent，展示 Agent / 本地 badge、timeline 和 pending changes。
- [x] Focus/Highlight：tool result、mention hover/select 和 pending target 都可定位并短时高亮节点，状态不写入 project。
- [x] Legacy Fallback：未配置或不可用时保留本地规则解析路径，旧显式命令仍可用。

## 2. 关键约束核对

- [x] Canvas Agent Provider 独立于 Prompt Provider；`selectedAgentProfileId` 只指向 agent-compatible profile。
- [x] V1 只支持原生 tool calling，不做 JSON plan fallback。
- [x] V1 不暴露删除节点/连接、批量破坏性操作、导入导出、mask 编辑或复杂 workflow 编排工具。
- [x] 所有 mutation 工具顺序执行，不并发。
- [x] 单轮 runner 默认最多 8 次 tool call，预算耗尽会停止并返回明确说明。
- [x] 未知工具、非法参数和工具执行失败会作为 tool result 回传模型，不静默吞掉。
- [x] confirm 工具默认不由模型自动执行；`apply_pending_change` 只在 UI 用户点应用后执行。
- [x] Agent timeline、pending change 和节点高亮都是运行态 UI 状态，不写入 Canvas project JSON。
- [x] legacy fallback 不污染旧助手回复文本，未配置 Agent Provider 的旧使用路径保持可用。

## 3. 验收场景核对

- [x] 配置 Canvas Agent Provider 后，助手消息优先进入 Agent runner，并能通过 tool calling 产生 timeline。
- [x] `focus_node` 工具能定位并高亮目标节点，timeline 中可见对应工具结果。
- [x] 提示词丰富只产生 pending change，不直接覆盖文本节点；用户点应用后才更新节点内容。
- [x] Agent 不可用时自动回退到 legacy 本地规则路径，旧的创建节点、连接、修改提示词、运行节点和 workflow 指令继续工作。
- [x] Provider settings normalize 会清理不兼容的 agent 默认 profile，避免运行时选择无 tool calling 能力的服务。
- [x] OpenAI-compatible adapter 能解析模型返回的 tool calls，并将非法 provider 响应转换为明确错误。

## 4. 验证命令

- [x] `pnpm exec tsc --noEmit` 通过。
- [x] `pnpm exec vitest run src\components\canvas\CanvasWorkspace.test.tsx src\components\canvas\CanvasViewport.test.tsx` 通过：51 tests。
- [x] `pnpm exec vitest run src\services\canvas-agent-context.test.ts src\services\canvas-agent-tools.test.ts src\services\canvas-agent-runner.test.ts src\adapters\openai-compatible.test.ts src\services\provider-settings.test.ts` 通过：43 tests。
- [x] `pnpm check` 通过：39 files / 291 tests。

## 5. CodeStable 回写

- [x] `.codestable/roadmap/canvas-agent-v1/canvas-agent-v1-items.yaml`：9 个子项均为 `done`。
- [x] `.codestable/roadmap/canvas-agent-v1/canvas-agent-v1-roadmap.md`：frontmatter `status: completed`，子 feature 清单同步为 `done`，变更日志记录 V1 完成并通过 `pnpm check`。
- [x] `.codestable/architecture/ARCHITECTURE.md`：已记录 Canvas Agent Provider、原生 tool calling、受控工具、timeline、pending change、节点高亮和 legacy fallback。
- [x] `.codestable/architecture/ui-shadcn-workbench.md`：已记录 UI、Provider settings、adapter、Agent service、context/tools/runner、pending/highlight 运行态边界和 V1 硬约束。
- [x] `.codestable/requirements/canvas-assistant.md`：已从明确命令助手升级为 Canvas Agent + legacy fallback 能力描述。
- [x] `.codestable/requirements/VISION.md`：已同步 canvas-assistant pitch。

## 6. 明确不做 / 已知限制

- 不做 JSON plan fallback。
- 不做长期记忆、跨项目 Agent memory 或云同步。
- 不做删除节点/连接、批量破坏性工具、复杂 workflow agent 或后台队列。
- 不做多 provider tool calling 方言适配；V1 以 OpenAI-compatible 原生工具调用为主。
- 不把 Agent timeline、pending change 或高亮状态写入 Canvas project。

## 7. 结论

Canvas Agent V1 roadmap 已完成并验收通过。当前实现已经从“本地规则助手”升级为“Agent Provider 原生 tool calling 优先、本地规则兜底”的 Canvas Agent，并保留 V1 的稳定性边界。
