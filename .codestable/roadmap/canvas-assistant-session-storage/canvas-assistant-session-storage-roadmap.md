---
doc_type: roadmap
slug: canvas-assistant-session-storage
status: active
created: 2026-06-07
last_reviewed: 2026-06-07
tags: [canvas, assistant, persistence, sqlite]
related_requirements: [canvas-assistant]
related_architecture: [ui-shadcn-workbench]
---

# Canvas Assistant Session Storage

## 1. 背景

Canvas 助手已经可以在右侧面板用对话式命令调度节点、连线、提示词和运行。上一轮为了先解决重启后聊天记录消失的问题，把 `assistantMessages` 写进了 `CanvasProject`。这能恢复历史，但长期会把聊天文本和画布结构绑在同一个 JSON 快照里：项目列表、节点保存、导入导出都会携带越来越多消息，后续清理和分页也很难独立演进。

本 roadmap 的目标是把画布结构和助手会话历史解耦：项目 JSON 只保留画布事实，助手消息进入独立本地会话存储，并提供迁移、清理和分批加载的稳定接口。用户已明确要求开发阶段按长期最稳策略推进，不以赶工为目标。

## 2. 范围与明确不做

### 本 roadmap 覆盖

- 建立独立的 Canvas assistant session storage，不再把大量聊天文本作为 Canvas project 的长期事实源。
- 从旧 `CanvasProject.assistantMessages` 迁移到新会话存储。
- 支持最近消息加载、向上加载历史、追加消息、清空当前项目会话和删除项目时级联清理。
- 保留 Canvas project JSON 导入导出对聊天历史的可控行为：当前第一阶段不把聊天历史默认打进项目 JSON。
- 为未来 SQLite 全文搜索、工具调用日志、多会话分支留下服务层边界。

### 明确不做

- 不做云同步、账号协作或服务端聊天存储。
- 不接入大模型 Agent，不改变现有规则解析助手。
- 不做全文搜索、向量索引、会话分支树或工具调用明细 UI。
- 不做聊天历史随项目 JSON 默认导出；需要完整项目包时另起 feature。
- 不改变 Canvas workflow、生成预算、history/gallery 的事实源。

## 3. 模块拆分（概设）

```text
canvas-assistant-session-storage
├── session-database：本地 SQLite 表、迁移和项目级消息 CRUD
├── session-service-api：前端平台封装、pixaiApi API 和 Canvas store 状态
├── assistant-panel-history：右侧助手面板分页加载、清空和提交追加
└── project-lifecycle-cleanup：旧 project 消息迁移、项目删除级联清理和导入导出边界
```

### session-database · 本地会话数据库

- **职责**：用本地 SQLite 保存 Canvas assistant messages，按 `project_id` 分区，提供 append/list/count/clear/deleteProject 这组稳定操作。
- **承载的子 feature**：canvas-assistant-session-storage-core。
- **触碰的现有代码 / 模块**：`src-tauri/src/lib.rs`、`src-tauri/Cargo.toml`、`src/lib/platform.ts`。

### session-service-api · 前端会话服务 API

- **职责**：把平台层数据库能力封装成浏览器/Tauri 双运行时一致的 TypeScript 服务，再挂到 `pixaiApi` 和 `useCanvasStore`。
- **承载的子 feature**：canvas-assistant-session-storage-core。
- **触碰的现有代码 / 模块**：`src/services/app-api.ts`、新增 `src/services/canvas-assistant-sessions.ts`、`src/store/canvas-store.ts`、`src/shared/types.ts`。

### assistant-panel-history · 助手面板历史加载

- **职责**：让右侧助手面板只渲染当前页消息，默认加载最近一批，向上加载更早记录，支持清空当前项目记录。
- **承载的子 feature**：canvas-assistant-session-storage-core。
- **触碰的现有代码 / 模块**：`src/components/canvas/CanvasAssistantPanel.tsx`、`src/components/canvas/CanvasWorkspace.tsx`。

### project-lifecycle-cleanup · 项目生命周期清理

- **职责**：项目打开时迁移旧内嵌消息，项目删除时删除对应会话消息，导入项目时把旧内嵌消息迁移到新 project 的独立会话存储；导出项目不默认包含聊天历史。
- **承载的子 feature**：canvas-assistant-session-storage-core、canvas-assistant-session-export-options。
- **触碰的现有代码 / 模块**：`src/services/canvas-projects.ts`、`src/store/canvas-store.ts`、`src/components/canvas/CanvasWorkspace.tsx`。

## 4. 模块间接口契约 / 共享协议（架构层详设）

### 4.1 SQLite 表结构

**方向**：session-database 内部持久化

**形式**：本地 SQLite 表

**契约**：

```sql
CREATE TABLE IF NOT EXISTS canvas_assistant_messages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('assistant', 'user')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_canvas_assistant_messages_project_created
ON canvas_assistant_messages(project_id, created_at, id);
```

**约束**：

- `project_id` 绑定 Canvas project id，不绑定 conversation id。
- `created_at` 用 ISO8601 字符串，排序规则为先 `created_at` 后 `id`。
- 单条 `content` 前端规范化后最多 20000 字符；数据库侧不截断，只保存前端传入的规范化值。
- 删除项目必须调用 `delete_project_canvas_assistant_messages(projectId)`。

### 4.2 平台命令协议

**方向**：前端 platform → Tauri Rust

**形式**：Tauri invoke；浏览器运行时由 platform memory/localStorage fallback 模拟同一语义

**契约**：

```ts
export type CanvasAssistantSessionMessage = {
  id: string
  projectId: string
  role: 'assistant' | 'user'
  content: string
  createdAt: string
}

export type CanvasAssistantSessionPage = {
  messages: CanvasAssistantSessionMessage[]
  total: number
  hasMore: boolean
}

appendCanvasAssistantMessages(messages: CanvasAssistantSessionMessage[]): Promise<void>
listCanvasAssistantMessages(projectId: string, options: {
  limit: number
  before?: string | null
}): Promise<CanvasAssistantSessionPage>
clearCanvasAssistantMessages(projectId: string): Promise<void>
deleteProjectCanvasAssistantMessages(projectId: string): Promise<void>
```

**约束**：

- `list` 返回升序消息，便于 UI 直接渲染；`before` 表示只取早于某条 message id 的历史。
- `limit` clamp 到 `1..100`，默认 UI 使用 50。
- `append` 幂等：同一 `id` 再次写入不产生重复消息。
- 无效 project id 或空消息数组是 no-op，不抛错。

### 4.3 Canvas store 会话状态协议

**方向**：CanvasWorkspace / CanvasAssistantPanel → useCanvasStore → pixaiApi.canvasAssistant

**形式**：Zustand store actions

**契约**：

```ts
type CanvasStoreState = {
  assistantMessages: CanvasAssistantMessage[]
  assistantMessagesHasMore: boolean
  assistantMessagesLoading: boolean
  loadAssistantMessages(projectId?: string): Promise<void>
  loadMoreAssistantMessages(): Promise<void>
  appendAssistantMessages(messages: Array<Omit<CanvasAssistantMessage, 'createdAt'>>): Promise<void>
  clearAssistantMessages(): Promise<void>
}
```

**约束**：

- `activeProject` 不再是助手消息的长期事实源；UI 从 store 的 `assistantMessages` 读取。
- `openProject` / `createProject` / `importProjectFromJson` / `ensureDefaultProject` 成功后必须加载该 project 最近消息。
- `deleteProject` 成功时必须清理对应 session messages。
- 旧 `CanvasProject.assistantMessages` 只作为迁移输入；迁移后 project 更新应写回空数组，避免重复迁移。

### 4.4 助手面板分页与清理协议

**方向**：CanvasAssistantPanel → CanvasWorkspace callbacks

**形式**：React props

**契约**：

```ts
type CanvasAssistantPanelProps = {
  messages: CanvasAssistantMessage[]
  hasMoreMessages?: boolean
  loadingMessages?: boolean
  onLoadMoreMessages?: () => Promise<void> | void
  onAppendMessages?: (messages: CanvasAssistantMessage[]) => Promise<void> | void
  onClearMessages?: () => Promise<void> | void
}
```

**约束**：

- 面板默认只展示 store 中已加载页；不自行读取数据库。
- 提交命令时先 append 用户消息，再 append 助手回执；执行失败也 append 失败回执。
- 清空操作只清当前 active project 的助手消息，不影响节点、连线、history 或 project 本身。
- 加载更多按钮放在消息列表顶部，避免初次打开渲染海量历史。

## 5. 子 feature 清单

1. **canvas-assistant-session-storage-core** — 建立本地 SQLite 会话表、前端服务 API、旧消息迁移、右侧面板分页加载和清空。
   - 所属模块：session-database、session-service-api、assistant-panel-history、project-lifecycle-cleanup
   - 依赖：无
   - 状态：done
   - 对应 feature：2026-06-07-canvas-assistant-session-storage-core
   - 备注：最小闭环已完成；助手历史不再依赖 Canvas project JSON，重启恢复、清空和分页加载可用。

2. **canvas-assistant-session-export-options** — 为导入导出增加聊天历史选项或完整项目包策略。
   - 所属模块：project-lifecycle-cleanup
   - 依赖：canvas-assistant-session-storage-core
   - 状态：planned
   - 对应 feature：未启动
   - 备注：当前不默认导出聊天历史，后续根据用户需求提供显式选项。

3. **canvas-assistant-session-search** — 在独立会话存储之上增加项目内聊天搜索和筛选。
   - 所属模块：session-database、assistant-panel-history
   - 依赖：canvas-assistant-session-storage-core
   - 状态：planned
   - 对应 feature：未启动
   - 备注：全文搜索不进入第一阶段。

**最小闭环**：第 1 条 `canvas-assistant-session-storage-core` 做完后，用户能在一个 Canvas project 中发送助手消息，重启/重新打开仍恢复最近消息；消息不写进 Canvas project JSON；可加载更早历史；清空当前项目聊天不会删除画布节点；删除项目会清理对应会话记录。

## 6. 排期思路

先做 `canvas-assistant-session-storage-core`，因为它把数据边界一次性定稳：SQLite 表、前端服务 API、store 状态、UI 分页和清理都在同一闭环里。导出选项和搜索都是建立在这个稳定边界上的后续增强，不阻塞当前性能和长期维护风险收敛。

## 7. 观察项

- `CanvasProject` 仍暂时保留可选 `assistantMessages` 字段，用作旧数据迁移和旧 JSON 导入兼容；验收后架构文档必须明确它不是长期事实源。
- `CanvasAssistantPanel.tsx` 已同时承载 UI 和动作执行，后续如果扩展 LLM/工具调用日志，建议把执行器抽到独立 service。
- 当前 Tauri 状态层已有 JSON 持久化，SQLite 只先承担助手会话这种高增长序列数据；不扩大为全应用数据库迁移。
