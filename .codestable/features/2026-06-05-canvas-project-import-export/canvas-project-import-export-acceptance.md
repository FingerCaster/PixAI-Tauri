# Canvas Project Import Export 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-05
> 关联方案 doc：`.codestable/features/2026-06-05-canvas-project-import-export/canvas-project-import-export-design.md`

## 1. 接口契约核对

**接口示例逐项核对**：

- [x] `CanvasProjectApi.exportProject(id)`：输入 active project id -> 返回 defensive clone。实现位于 `src/services/app-api.ts:createPixaiApi` 与 `src/services/canvas-projects.ts:CanvasProjectService.exportProject`，单测验证修改导出对象不会污染持久化项目。
- [x] `CanvasProjectApi.importProject(input, conversationId)`：输入未知 JSON + 当前 conversation -> 创建新 project。实现位于 `src/services/canvas-projects.ts:CanvasProjectService.importProject`，单测验证 project id 刷新、conversationId 改为当前会话。
- [x] `useCanvasStore.exportActiveProject()` / `importProjectFromJson()`：store 负责 active project 读写和导入后切换。`src/store/canvas-store.ts` 单测验证成功切换，失败保持原 active project。
- [x] `downloadTextFile()` / `readTextFile()`：platform 只做文本文件下载与 DOM 文件读取，不理解 Canvas 业务。`src/lib/platform.test.ts` 覆盖浏览器下载、FileReader 成功和失败。

**名词层“现状 -> 变化”逐项核对**：

- [x] Canvas project export JSON 使用 `CanvasProject` 形状，未新增 envelope。
- [x] Imported Canvas project 是 clone，新 id + 当前 conversation + 新时间戳。
- [x] 导入 normalize 复用 service 边界，UI 不直接修 nodes/connections。

**流程图核对**：

- [x] 导出流程：Canvas toolbar -> store -> `pixaiApi.canvas.exportProject` -> `JSON.stringify` -> `downloadTextFile`，组件测试验证调用链。
- [x] 导入流程：Canvas toolbar hidden file input -> `readTextFile` -> `JSON.parse` -> store -> `pixaiApi.canvas.importProject` -> active project 更新，组件测试验证调用链。

## 2. 行为与决策核对

**需求摘要逐项验证**：

- [x] Toolbar 有“导出项目”“导入项目”入口：Chrome smoke 截图和 `CanvasWorkspace.test.tsx` 均验证。
- [x] 导出当前 active Canvas project 为 JSON：`CanvasWorkspace.test.tsx` 断言 `downloadTextFile('Canvas 项目.json', JSON.stringify(project, null, 2), 'application/json')`。
- [x] 导入 JSON 创建新项目并切换 active project：`canvas-store.test.ts` 与 `CanvasWorkspace.test.tsx` 均验证。
- [x] 导入 normalize 过滤非法节点、重复节点和失效连线：`canvas-projects.test.ts` 覆盖。
- [x] 导入失败不改变当前项目：`canvas-store.test.ts` 覆盖 import reject。

**明确不做逐项核对**：

- [x] 未新增 zip/project package 资源包；grep 只命中 JSON helper 和 smoke/spec 文档。
- [x] 未覆盖同 id 现有项目；`importProject()` 总是 `createId('canvas')` 并 unshift 新项目。
- [x] 未新增云同步、批量导入导出、项目模板库或隐藏 conversation。
- [x] 未重写 history/run，也未迁移 history origin 到导入 project id。

**关键决策落地**：

- [x] 导出 JSON 直接使用 `CanvasProject`：UI 直接 `JSON.stringify(project, null, 2)`。
- [x] Clone/normalize 集中在 `CanvasProjectService`：UI/store 不解析节点结构。
- [x] 导入绑定当前 active conversation：`CanvasWorkspace` 只传 `activeConversationId`，service 忽略 JSON 内旧 conversationId。
- [x] Running generate node 降级 idle：`normalizeImportedCanvasNodes()` 清理 `runId/requestIndex/errorMessage/historyItemId` 并设置 `status: 'idle'`。

**挂载点反向核对**：

- [x] `src/services/canvas-projects.ts`：export/import clone 与导入 normalize。
- [x] `src/services/app-api.ts`：`pixaiApi.canvas` 增加 export/import 门面。
- [x] `src/store/canvas-store.ts`：active project 导出和导入切换。
- [x] `src/lib/platform.ts`：文本文件读写 helper。
- [x] `src/components/canvas/CanvasWorkspace.tsx`：toolbar 导入/导出入口。
- [x] 拔除沙盘推演：删除以上五处入口后，Canvas JSON 导入导出能力消失；已有 Canvas 创建、节点、生成、图库来源能力仍可独立工作。

## 3. 验收场景核对

- [x] **S1**：点击“导出项目” -> 当前 active Canvas project 被序列化为 JSON 并触发保存 / 下载。
  - 证据：`src/components/canvas/CanvasWorkspace.test.tsx`、`src/lib/platform.test.ts`。
- [x] **S2**：选择合法 Canvas project JSON 导入 -> 新 project id、当前 conversationId、切换 active project。
  - 证据：`src/services/canvas-projects.test.ts`、`src/store/canvas-store.test.ts`、`src/components/canvas/CanvasWorkspace.test.tsx`。
- [x] **S3**：重复节点、非法节点和失效连线被 normalize 过滤。
  - 证据：`src/services/canvas-projects.test.ts`。
- [x] **S4**：running generate node 导入后变 idle。
  - 证据：`src/services/canvas-projects.test.ts`。
- [x] **S5**：取消文件选择不触发导入。
  - 证据：组件 onChange 无 file 时直接 return，未调用 store action。
- [x] **S6**：非法 JSON 或 schema 不支持时不改变当前项目。
  - 证据：`src/services/canvas-projects.test.ts` schema reject、`src/store/canvas-store.test.ts` import reject rollback。
- [x] **S7**：无 active conversation 或无 active project 时入口禁用 / 不执行。
  - 证据：`CanvasWorkspace` 按 `activeProject` / `activeConversationId` / `loading` 控制按钮 disabled；空会话测试不创建 unbound project。

**前端 smoke**：

- [x] Chrome headless 1080x720 最小桌面基线截图通过：`.codestable/features/2026-06-05-canvas-project-import-export/canvas-project-import-export-smoke-min.png`。
- [x] Chrome headless 1440x900 桌面截图通过：`.codestable/features/2026-06-05-canvas-project-import-export/canvas-project-import-export-smoke.png`。
- [x] 项目全局 CSS 明确 `min-width: 1080px`，窄屏截图仅作为裁切观察，不作为移动端响应式验收目标。

## 4. 术语一致性

- Canvas project export JSON：design、architecture 和实现均指 `CanvasProject` 形状 JSON。
- Imported Canvas project：实现命名为 `importProject` / `importProjectFromJson`，语义一致。
- Project package helper：实现为 `downloadTextFile` / `readTextFile`，只处理文本文件，不引入 Canvas 业务名。
- 防冲突：未新增“project package zip”“resource manifest”等范围外术语到代码。

## 5. 架构归并

- [x] `.codestable/architecture/ui-shadcn-workbench.md`：已归并 Canvas toolbar 导入/导出入口、store actions、CanvasProjectService import/export clone 语义、platform 文本 helper 和 JSON 导入约束。
- [x] `.codestable/architecture/ARCHITECTURE.md`：已把 Canvas 模式摘要、模块索引、关键决定和硬边界更新为支持 JSON 导入导出。
- [x] `.codestable/attention.md`：本 feature 未暴露新的每次启动必读命令或环境坑，不需要更新。

## 6. requirement 回写

- [x] `requirement` 为空，且本 feature 是 `workspace-canvas-mode` roadmap 的后置 project-package 单元；当前 `.codestable/requirements/reference-image-input.md` 未变。
- [x] 未新增独立 requirement。Canvas 模式整体仍由 roadmap 管理，后续如要沉淀为能力愿景可单独 backfill。

## 7. roadmap 回写

- [x] `.codestable/roadmap/workspace-canvas-mode/workspace-canvas-mode-items.yaml`：`canvas-project-import-export` 已从 `in-progress` 改为 `done`，feature 指向 `2026-06-05-canvas-project-import-export`。
- [x] `.codestable/roadmap/workspace-canvas-mode/workspace-canvas-mode-roadmap.md`：第 4.2 CanvasProjectApi 契约补充 export/import，子 feature 清单第 7 条改为 done。
- [x] YAML 校验通过：feature checklist 与 roadmap items 均 valid。

## 8. attention.md 候选盘点

- [x] 无候选。本 feature 使用的 `pnpm check`、`pnpm build`、Chrome headless smoke 都是已有验证方式；真实 Tauri 客户端注意事项已在 `.codestable/attention.md` 中存在。

## 9. 遗留

- 后续优化点：带图片资源的项目包需要单独 feature，不能在 JSON 导入导出上补丁式追加。
- 后续优化点：项目管理页、批量导入导出、项目模板库、云同步都不在当前单元范围。
- 已知限制：导入 project 会保留 image node 的展示源和 history/reference binding，但不会重写 history origin 或为旧 reference id 补建当前会话参考图；后续生成时仍按现有 Canvas reference resolution 处理。
- 实现阶段顺手发现：无。

## 10. 验证命令

- `pnpm vitest run src/services/canvas-projects.test.ts src/store/canvas-store.test.ts src/lib/platform.test.ts src/components/canvas/CanvasWorkspace.test.tsx`：4 files / 38 tests passed。
- `pnpm check`：31 files / 171 tests passed。
- `pnpm build`：通过；仅 Vite 既有 chunk size warning。
- Chrome headless smoke：生成 `canvas-project-import-export-smoke.png`、`canvas-project-import-export-smoke-min.png`、`canvas-project-import-export-smoke-mobile.png`。
