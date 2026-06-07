---
doc_type: feature-acceptance
feature: 2026-06-07-canvas-assistant-session-storage-core
status: accepted
accepted_at: 2026-06-07
roadmap: canvas-assistant-session-storage
roadmap_item: canvas-assistant-session-storage-core
tags: [canvas, assistant, persistence, sqlite]
---

# Canvas Assistant Session Storage Core 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-07
> 关联方案 doc：`.codestable/features/2026-06-07-canvas-assistant-session-storage-core/canvas-assistant-session-storage-core-design.md`

## 1. 接口契约核对

**接口示例逐项核对**

- [x] `CanvasAssistantMessage` 已增加可选 `createdAt`；`CanvasAssistantSessionMessage` 和 `CanvasAssistantSessionPage` 已在 `src/shared/types.ts` 落地。
- [x] `CanvasAssistantSessionService` 已提供 `list/append/clear/deleteProject/migrateProjectMessages`，并由 `src/services/app-api.ts` 挂到 `pixaiApi.canvasAssistant`。
- [x] Tauri 平台命令已落地：`append_canvas_assistant_messages`、`list_canvas_assistant_messages`、`clear_canvas_assistant_messages`、`delete_project_canvas_assistant_messages`。
- [x] 浏览器/test fallback 已在 `src/lib/platform.ts` 落地，使用 `pixai-canvas-assistant-sessions` JSON state 模拟相同语义。

**名词层“现状 -> 变化”逐项核对**

- [x] 助手消息长期事实源从 `CanvasProject.assistantMessages` 转移到独立 session service。
- [x] `CanvasProject.assistantMessages` 保留为兼容字段，用于旧数据导入和迁移；`exportProject()` 默认返回空助手消息。
- [x] `useCanvasStore` 新增 `assistantMessages/assistantMessagesHasMore/assistantMessagesLoading/assistantMessagesTotal` 和加载、追加、清空动作。
- [x] `CanvasAssistantPanel` 改成 append 模式，面板只接收已加载消息页和回调，不直接读数据库。

**流程图核对**

- [x] 打开 / 创建 / 导入 project 后统一进入 `activateCanvasProject()`。
- [x] `activateCanvasProject()` 迁移旧 `assistantMessages`、清空兼容字段并加载最近页。
- [x] 提交助手命令先 append 用户消息，再执行命令，最后 append 助手回执或错误回执。
- [x] “加载更早消息”使用当前最早 message id 作为 `before` 游标。
- [x] “清空”只调用当前 project 的 session clear，不改 nodes/connections/viewport。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] 助手消息长期事实源迁移到本地 SQLite：Rust `rusqlite` 依赖和 SQLite 表 helper 已落地，`cargo test` 覆盖 append/list/clear。
- [x] Canvas project 保存节点/连线/视口时不再携带聊天历史：`persistActiveProject()` 不再传 `assistantMessages`。
- [x] 打开项目默认加载最近消息，能加载更早历史：store 和 CanvasWorkspace 测试覆盖 55 条消息分页。
- [x] 清空当前项目助手聊天不影响画布节点：CanvasWorkspace 测试覆盖清空后 text node 保留。
- [x] 删除 Canvas project 会级联清理助手聊天：store 测试覆盖 `deleteProject()` 调用 session cleanup 并切到下一个 project。
- [x] 旧 `assistantMessages` 自动迁移且不重复：service 和 store 测试覆盖 idempotent append 与旧字段清空。

**明确不做逐项核对**

- [x] 未引入云同步、账号协作或服务端聊天存储；grep 未发现新增远端 session API。
- [x] 未接入大模型 Agent 或 Provider/prompt API；助手解析仍由 `src/services/canvas-assistant.ts` 的本地规则完成。
- [x] 未做全文搜索、向量索引、会话分支或工具调用明细 UI。
- [x] 未默认把聊天历史导出到 Canvas project JSON。
- [x] 未改变 Canvas workflow、生成预算、history/gallery 事实源；`pnpm check` 中 app-store/canvas-workflow/history 相关测试通过。

**关键决策落地**

- [x] 使用 Rust 侧 `rusqlite`：`src-tauri/Cargo.toml` 已加入 `rusqlite`，Rust helper 负责 schema、分页和清理。
- [x] `CanvasProject.assistantMessages` 降级为兼容字段：项目服务仍可读/导入旧字段，但导出默认清空。
- [x] 分页由 store 编排，panel 只收 props：`CanvasWorkspace` 从 store 取消息页状态后传入 panel。
- [x] 清空和删除清理走 project 级 API：`clearAssistantMessages()` 和 `deleteProject()` 均通过 `pixaiApi.canvasAssistant`。

**流程级约束核对**

- [x] 追加消息幂等：Rust SQL 使用 `INSERT OR IGNORE`，fallback 按 id 去重；service test 覆盖重复 append。
- [x] 分页按 `createdAt/id` 稳定排序，UI 渲染正序；Rust 和 fallback 都按同一排序返回。
- [x] 迁移旧消息后 project 写回 `assistantMessages: []`，避免重复迁移。
- [x] 清空当前聊天不改变 nodes/connections/viewport/history。
- [x] project JSON 导出不默认包含聊天历史。

**挂载点反向核对**

- [x] `src-tauri/src/lib.rs`：SQLite commands、schema、分页 helper、清理 helper和 Rust 单测。
- [x] `src/lib/platform.ts`：Tauri invoke 和 browser/test fallback。
- [x] `src/services/canvas-assistant-sessions.ts` / `src/services/app-api.ts`：session service 与 `pixaiApi.canvasAssistant`。
- [x] `src/store/canvas-store.ts`：active project 迁移、最近页、加载更多、append、clear、delete cleanup。
- [x] `src/components/canvas/CanvasAssistantPanel.tsx` / `CanvasWorkspace.tsx`：append props、加载更多按钮、清空按钮。
- [x] grep `CanvasAssistantSession|appendAssistantMessages|loadMoreAssistantMessages|clearAssistantMessages|delete_project_canvas_assistant|clear_canvas_assistant` 未发现清单外挂载点。
- [x] 拔除沙盘推演：移除 Rust commands、platform wrappers、session service、store 会话 actions、panel props 和相关测试后，本 feature 行为消失；Canvas 节点、workflow、history/gallery 入口仍可保留。

## 3. 验收场景核对

- [x] **S1：打开带旧 `assistantMessages` 的 Canvas project 时迁移到独立会话存储，旧字段清空且不重复迁移。**
  - 证据来源：`src/services/canvas-assistant-sessions.test.ts`、`src/store/canvas-store.test.ts`
  - 结果：通过。

- [x] **S2：发送助手命令后用户消息和助手回执追加到会话存储，重新打开 workspace 后能恢复。**
  - 证据来源：`src/components/canvas/CanvasWorkspace.test.tsx`
  - 结果：通过。

- [x] **S3：消息超过默认页大小时打开只加载最近页，点击加载更多能取回更早消息且顺序正确。**
  - 证据来源：`src/services/canvas-assistant-sessions.test.ts`、`src/components/canvas/CanvasWorkspace.test.tsx`
  - 结果：通过。

- [x] **S4：清空当前聊天后助手回到欢迎态，当前项目 nodes/connections/viewport 不变。**
  - 证据来源：`src/store/canvas-store.test.ts`、`src/components/canvas/CanvasWorkspace.test.tsx`
  - 结果：通过。

- [x] **S5：删除 Canvas project 后对应助手会话消息被删除，其他项目消息不受影响。**
  - 证据来源：`src/services/canvas-assistant-sessions.test.ts`、`src/store/canvas-store.test.ts`
  - 结果：通过。

- [x] **S6：导出 Canvas project JSON 不默认包含聊天历史。**
  - 证据来源：`src/services/canvas-projects.test.ts`
  - 结果：通过。

- [x] **S7：未识别命令和非法连接仍会产生助手回执，但不会改变 nodes/connections。**
  - 证据来源：`src/components/canvas/CanvasWorkspace.test.tsx`
  - 结果：通过。

**前端浏览器验证**

- [x] 使用临时 Chrome profile + 本地 Vite 页面 `http://127.0.0.1:5179/` 做 DOM 冒烟。
  - 证据：右侧 `aside.canvas-assistant-panel` 存在，宽度 320；清空聊天记录按钮存在；示例按钮和发送按钮正常渲染；页面没有视频/音频入口。
  - 结果：通过。

## 4. 术语一致性

- `CanvasAssistantSessionMessage` / `CanvasAssistantSessionPage`：代码命中集中在 shared types、platform、session service 和 Rust/测试，命名一致。
- `assistantMessages`：仍保留在 `CanvasProject` 类型和项目服务中，但用途已收敛为兼容迁移；store 和 panel 的常规读写不再依赖 activeProject 字段。
- `loadMoreAssistantMessages` / `clearAssistantMessages` / `appendAssistantMessages`：命中均落在 store、CanvasWorkspace 和测试内，命名一致。
- 防冲突：未新增 `video/audio` Canvas 助手动作或入口；浏览器冒烟和组件测试均确认页面没有视频/音频入口。

## 5. 架构归并

- [x] `.codestable/architecture/ARCHITECTURE.md`：已补充 Canvas 模式包含助手会话本地持久化，画布助手消息写入独立本地会话存储，不写入 Canvas project JSON，不做云同步。
- [x] `.codestable/architecture/ui-shadcn-workbench.md`：已补充 CanvasAssistantPanel 的独立会话存储、分页加载，CanvasProjectService 的 `assistantMessages` 兼容字段边界，以及 `CanvasAssistantSessionService` 当前事实源说明。
- [x] `.codestable/attention.md`：本 feature 没有新增每次开工都必须知道的环境约束；无需写入。

## 6. requirement 回写

- [x] `.codestable/requirements/canvas-assistant.md` 已更新：
  - 新增用户故事：长期使用同一个 Canvas project 时，助手聊天记录能重启恢复，并按需加载更早消息。
  - 方案描述补充本地会话存储、最近页、加载更早和清空当前项目聊天。
  - 边界补充：不云同步，项目导出默认不包含聊天历史。
  - 变更日志新增 2026-06-07 记录。

## 7. roadmap 回写

- [x] `.codestable/roadmap/canvas-assistant-session-storage/canvas-assistant-session-storage-items.yaml`：`canvas-assistant-session-storage-core` 已从 `in-progress` 改为 `done`。
- [x] `.codestable/roadmap/canvas-assistant-session-storage/canvas-assistant-session-storage-roadmap.md`：第 5 节子 feature 清单已同步为 `done`。
- [x] YAML 校验已通过。

## 8. attention.md 候选盘点

- [x] 无候选。本 feature 未暴露新的通用启动命令、代理配置或每次 feature 都会踩的环境约束。

## 9. 遗留

- 后续优化点：
  - `canvas-assistant-session-export-options`：按需提供包含聊天历史的显式导出选项或完整项目包。
  - `canvas-assistant-session-search`：在独立会话存储上增加项目内聊天搜索和筛选。
  - `CanvasAssistantPanel.tsx` 仍同时承载 UI 和动作执行；如果后续扩展 LLM/工具调用日志，建议单独 feature 或 refactor 抽执行器。
- 已知限制：
  - 助手聊天不云同步，不随 project JSON 默认导出。
  - 当前分页是按 message id 的 before cursor，不提供全文检索。
- 实现阶段发现：
  - `rusqlite 0.40.1` 在本机当前 Rust 环境下触发 `libsqlite3-sys` 构建问题，已改用 `rusqlite 0.34.0` + `bundled` 并通过 `cargo test`。
  - 原 Rust HTTP proxy 诊断测试会受系统代理影响返回 502，已在该测试 client 上显式 `no_proxy()`，让测试稳定验证连接错误格式化。

## 10. 验证命令

- [x] `cargo test`（`src-tauri`）通过：5 passed。
- [x] `pnpm check` 通过：35 test files / 267 tests passed。
- [x] `python .codestable\tools\validate-yaml.py --file .codestable\features\2026-06-07-canvas-assistant-session-storage-core\canvas-assistant-session-storage-core-checklist.yaml` 通过。
- [x] `python .codestable\tools\validate-yaml.py --file .codestable\roadmap\canvas-assistant-session-storage\canvas-assistant-session-storage-items.yaml` 通过。
