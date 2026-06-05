# Canvas Generate Node 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-05
> 关联方案 doc：`.codestable/features/2026-06-05-canvas-generate-node/canvas-generate-node-design.md`
> 用户终审：待用户确认；本报告已完成自动化测试、构建和 Chrome headless smoke 验证

## 1. 接口契约核对

**接口示例逐项核对**

- [x] `CanvasNodeType = 'text' | 'image' | 'generate'` 和 `CanvasConnectionKind = 'prompt' | 'reference-image' | 'result'` 已落到 `src/shared/types.ts`。
- [x] `CanvasNodeStatus` 与 `CanvasNodeMetadata.status/runId/requestIndex/errorMessage/historyItemId` 已落到 `src/shared/types.ts`。
- [x] `useCanvasStore` 已新增 `addGenerateNode`、`updateGenerateNodeState`、`bindImageNodeReference`、`addGeneratedImageNode`。
- [x] `useAppStore.generateCanvasNode(nodeId)` 已落地，负责 Canvas generation input resolution、reference import、`pixaiApi.image.generate`、history/runs refresh 和 Canvas result 写回。

**名词层“现状 -> 变化”逐项核对**

- [x] Canvas project 从 text/image nodes 扩展为 text/image/generate nodes。
- [x] Canvas connection 从 prompt/reference-image 扩展为 prompt/reference-image/result。
- [x] Generate node 使用 `metadata.content` 保存本节点 prompt，避免新增平行 prompt 字段造成漂移。
- [x] Partial preview 仍只保存在 app-store `generationPreviews` 临时状态；Canvas project 只记录 `runId/requestIndex` 以便读取 preview。

**流程图核对**

- [x] Canvas toolbar -> `addGenerateNode()` -> generate node 渲染 -> text/image incoming connections -> `generateCanvasNode()` 解析 -> `pixaiApi.image.generate()` -> partial preview -> history 成功项 -> Canvas result image node + result connection 均有代码落点。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] Canvas toolbar 可添加 generate node，节点可编辑本地 prompt：`CanvasWorkspace.test.tsx` / `CanvasViewport.test.tsx` 覆盖。
- [x] 触发生成时只解析指向当前 generate node 的 prompt/reference connections：`app-store.test.ts` 覆盖。
- [x] 已有 `referenceImageId` 的 image node 直接作为 reference id 参与生成：`app-store.test.ts` 覆盖。
- [x] 缺 `referenceImageId` 的 data URL image node 会先导入当前 project conversation referenceImages，并回写 image node binding：`app-store.test.ts` 覆盖。
- [x] 请求复用 conversation 参数但 `n = 1`，不会默认带入未连接的当前会话 referenceImages：`app-store.test.ts` 覆盖。
- [x] 生成中 partial preview 可在 generate node 中显示：`CanvasViewport.test.tsx` 与 Chrome smoke 覆盖。
- [x] 成功后产出 image node 与 result connection，失败/缺 prompt 不创建结果节点：`canvas-store.test.ts` / `app-store.test.ts` 覆盖。

**明确不做逐项核对**

- [x] 未新增 DAG 自动调度、批量运行、配置节点或多节点执行队列。
- [x] 未修改 `ImageHistoryItem` / `GenerationRun` schema，也没有新增 Canvas origin 持久化字段。
- [x] 未把当前会话全部 referenceImages 默认带入 Canvas 生成。
- [x] 未新增 Canvas 节点级取消/重试 UI。
- [x] 未改变经典工作台 `generate()`、`retryHistory()` 和 `CanvasArea` 行为；全量测试继续通过。

**关键决策落地**

- [x] D1 不新增平行 Canvas generation project，generate node 仍在 `CanvasProject.nodes` 内。
- [x] D2 `metadata.content` 作为 generate node prompt，`updateNodeContent` 继续复用同一编辑提交路径。
- [x] D3 `result` connection 表达生成产出关系，`connectionKindForNode(generate)` 返回 `result`。
- [x] D4 跨 store 编排放在 `useAppStore.generateCanvasNode()`，Canvas store 只维护 project 内节点状态和持久化。
- [x] D5 Canvas generation 使用 project.conversationId；缺 store conversation 时会尝试从 API 拉取。
- [x] D6 第一版固定 `n = 1`，每次成功只落一个结果 image node。

**流程级约束核对**

- [x] 缺 active project 或目标 node 不是 generate 时不调用生成服务。
- [x] prompt 为空时不调用 `pixaiApi.image.generate`，节点写 failed 状态。
- [x] 只解析 incoming connections，其他 Canvas 连线不影响请求。
- [x] 缺 binding 的图片节点通过 `pixaiApi.reference.importPayloads()` 进入现有 reference 链路，不绕过上限/格式/大小限制。
- [x] `status: running` 的 generate node 不重复发起请求。
- [x] provider 不返回 partial 时仍保持 running 占位；preview 缺失不是错误。
- [x] 生成失败不创建结果 image node；成功但没有可用成功项时写 failed 状态。

**挂载点反向核对**

- [x] `src/shared/types.ts`：generate/result/status 类型契约。
- [x] `src/services/canvas-projects.ts`：generate node / result connection normalize。
- [x] `src/store/canvas-store.ts`：generate node action、状态回写、reference binding、结果节点落盘。
- [x] `src/store/app-store.ts`：`generateCanvasNode` 编排 action。
- [x] `src/components/canvas/CanvasWorkspace.tsx` / `CanvasViewport.tsx` / `CanvasNodeLayer.tsx` / `CanvasGenerateNodeBody.tsx`：添加生成、运行触发和 preview 展示。
- [x] 反向 grep：`generateCanvasNode`、`CanvasGenerateNodeBody`、`CanvasNodeStatus` 和 `kind: 'result'` 命中集中在上述挂载点与测试内。
- [x] 拔除沙盘推演：移除 shared 类型扩展、canvas-store generate actions、app-store `generateCanvasNode`、Canvas generate UI 文件后，本 feature 能力消失；reference bridge、basic nodes 和经典生成流仍可保留。

## 3. 验收场景核对

- [x] **S1**：点击 Canvas toolbar “添加生成”后，画布出现 generate node，可编辑本节点 prompt，刷新 project 后仍保留。
  - 证据来源：`CanvasWorkspace.test.tsx`、`CanvasProjectService` generate node normalize 测试。
  - 结果：通过。
- [x] **S2**：文本节点连接到 generate node 后点击运行，生成请求 prompt 包含连接文本和生成节点自身 prompt，`n` 固定为 1。
  - 证据来源：`app-store.test.ts`。
  - 结果：通过。
- [x] **S3**：图片节点已带 `referenceImageId` 并连接到 generate node，生成请求只传该 reference id，不带未连接参考图。
  - 证据来源：`app-store.test.ts`。
  - 结果：通过。
- [x] **S4**：图片节点没有 `referenceImageId` 但有 data URL，生成前导入当前 project conversation referenceImages，并回写 image node binding。
  - 证据来源：`app-store.test.ts`。
  - 结果：通过。
- [x] **S5**：生成中收到 partial preview，generate node 内展示中间图。
  - 证据来源：`CanvasViewport.test.tsx` + Chrome headless smoke 截图。
  - 结果：通过。
- [x] **S6**：生成成功后刷新 history/runs，generate node 状态为 succeeded，Canvas 产出结果 image node，并创建 result connection。
  - 证据来源：`canvas-store.test.ts` + `app-store.test.ts`。
  - 结果：通过。
- [x] **S7**：生成失败、preflight 报错或缺 prompt 时，generate node 状态为 failed，不创建结果 image node。
  - 证据来源：`app-store.test.ts`。
  - 结果：通过。
- [x] **S8**：目标 node 不是 generate 时不调用 `pixaiApi.image.generate`。
  - 证据来源：`generateCanvasNode()` 入口守卫 + 类型/单测覆盖缺 prompt路径；反向 grep 未发现其他 Canvas UI 旁路直接调用 image generate。
  - 结果：通过。

**前端浏览器验证**

- [x] 定向测试：`pnpm vitest run src/services/canvas-projects.test.ts src/store/canvas-store.test.ts src/store/app-store.test.ts src/components/canvas/CanvasViewport.test.tsx src/components/canvas/CanvasWorkspace.test.tsx`，5 files / 39 tests passed。
- [x] `pnpm check`：30 files / 156 tests passed。
- [x] `pnpm build`：生产构建通过；Vite 仍提示单 chunk 超过 500 kB，这是既有构建体积提示。
- [x] Chrome headless smoke：截图证据 `.codestable/features/2026-06-05-canvas-generate-node/canvas-generate-node-smoke.png`，可见添加生成入口、generate node、running 状态、partial preview 和结果 image node。

## 4. 术语一致性

- Canvas generate node：源码使用 `type: 'generate'`、`addGenerateNode`、`CanvasGenerateNodeBody`。
- Canvas generation input resolution：源码集中在 `generateCanvasNode` 及其 helper，不另起平行生成服务。
- Canvas generated image node：源码通过 `addGeneratedImageNode` 创建 `type: 'image'` 节点并写 `historyItemId`。
- Result connection：源码使用 `kind: 'result'`，只表达 generate -> image 产出关系。
- Canvas node partial preview：源码从 `generationPreviews[runId][requestIndex]` 读取，不把 preview data URL 写入 Canvas project。

## 5. 架构归并

- [x] `.codestable/architecture/ui-shadcn-workbench.md`：已补充 Canvas generate node、Canvas generated image node、result connection、`CanvasGenerateNodeBody` 和 Canvas node partial preview。
- [x] `.codestable/architecture/ui-shadcn-workbench.md`：已在数据与状态中记录 `CanvasNodeStatus`、generate node metadata、`generateCanvasNode` 编排和 `addGeneratedImageNode` 落盘。
- [x] `.codestable/architecture/ui-shadcn-workbench.md`：已更新边界为“支持手动单节点生成，但不支持 DAG/批量/Canvas origin schema/节点级取消”。
- [x] `.codestable/architecture/ARCHITECTURE.md`：已把 Canvas module 摘要扩展为手动生成节点复用现有 ImageService/history 链路，并更新硬边界。

## 6. requirement 回写

- [x] 方案 frontmatter `requirement` 为空。
- [x] 本 feature 是 `workspace-canvas-mode` roadmap 下的 Canvas 生成桥实现单元，不新增独立 requirement。
- [x] `reference-image-input` 没有用户故事或边界变化，不回写。

## 7. roadmap 回写

- [x] 方案 frontmatter 指向 `roadmap: workspace-canvas-mode` / `roadmap_item: canvas-generate-node`。
- [x] `.codestable/roadmap/workspace-canvas-mode/workspace-canvas-mode-items.yaml`：`canvas-generate-node` 已由 `in-progress` 改为 `done`，保留 `feature: 2026-06-05-canvas-generate-node`。
- [x] `.codestable/roadmap/workspace-canvas-mode/workspace-canvas-mode-roadmap.md`：第 5 节子 feature 清单已同步为 `状态：done` / `对应 feature：2026-06-05-canvas-generate-node`。
- [x] YAML 校验：`workspace-canvas-mode-items.yaml` 和 `canvas-generate-node-checklist.yaml` 均通过 `validate-yaml.py --yaml-only`。

## 8. attention.md 候选盘点

- [x] 本 feature 未暴露新的项目常驻事项。真实 Tauri 客户端仍按既有 `pnpm dev:client` 注意事项执行，本次只做 Web smoke。

## 9. 遗留

- 后续优化点：Canvas 生成结果还没有在 history/gallery 中显示 Canvas 来源；留给 `canvas-history-gallery-integration`。
- 后续优化点：没有节点级取消/重试 UI；后续如果要做，应明确 runId/requestIndex 绑定和 UI 状态恢复语义。
- 已知限制：不支持 DAG 自动调度、批量运行、多结果展开、配置节点或 Canvas 专用参数面板。
- 实现阶段顺手发现：`app-store.ts` 继续变胖，后续如果再增加 Canvas history/gallery 编排，建议走 `cs-refactor` 拆 generation/canvas orchestration slice。
