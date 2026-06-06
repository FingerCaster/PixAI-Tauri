# Canvas Asset Bridge Polish 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-06
> 关联方案 doc：`.codestable/features/2026-06-06-canvas-asset-bridge-polish/canvas-asset-bridge-polish-design.md`

## 1. 接口契约核对

对照方案第 2.1 节名词层逐一核查：

**接口示例逐项核对**：
- [x] `AppState.addReferenceToCanvas(referenceImageId: string): Promise<void>` 已加入 store 类型，并由 `Composer` 调用。代码实际行为：`src/store/app-store.ts:105` 声明 action，`src/store/app-store.ts:647` 实现 action，`src/components/workspace/Composer.tsx:208` 触发 action，一致。
- [x] 示例调用 `await useAppStore.getState().addReferenceToCanvas('reference-1')`：store 测试覆盖直接调用，成功后 Canvas project 出现 image node，`metadata.referenceImageId` 等于参考图 id，`view` 切到 `canvas`。一致。
- [x] metadata 契约：创建 image node 时写入 `referenceImageId`、`storagePath`、`mimeType`、`fileSizeBytes` 和安全展示源。代码实际行为：`src/store/app-store.ts:667` 到 `src/store/app-store.ts:674` 传入 `useCanvasStore.addImageNode()`，一致。

**名词层“现状 -> 变化”逐项核对**：
- [x] `AppState` 原有 `addHistoryToCanvas()`，本次新增 `addReferenceToCanvas()`：已落地。
- [x] `Composer` reference thumb 原本只有预览/移除，本次新增“加入 Canvas”按钮：`src/components/workspace/Composer.tsx:289` 已落地。
- [x] `CanvasImageNodeInput` 既有来源绑定字段继续复用：未新增并行类型，`useCanvasStore.addImageNode()` 仍承担写入和去重。
- [x] 非法图片源过滤与同源去重继续由 Canvas store 处理：`src/store/canvas-store.ts:664` 到 `src/store/canvas-store.ts:665` 保留同 `referenceImageId/historyItemId` 去重。

**流程图核对**：
- [x] `Composer reference thumb -> useAppStore.addReferenceToCanvas(referenceId)`：`src/components/workspace/Composer.tsx:289` 调用 `onAddReferenceToCanvas(reference.id)`。
- [x] `addReferenceToCanvas -> openCanvasWorkspace`：无 active project 时执行 `openCanvasWorkspace()`，代码落点 `src/store/app-store.ts:653`。
- [x] `project -> conversation -> reference`：通过 `getCanvasProjectConversation()` 和 `findReferenceImage()` 查找，代码落点 `src/store/app-store.ts:657` 到 `src/store/app-store.ts:664`。
- [x] `imageSourceForDisplay -> addImageNode -> view canvas + toast`：代码落点 `src/store/app-store.ts:665` 到 `src/store/app-store.ts:676`。

## 2. 行为与决策核对

对照方案第 1 节 + 第 2.2 节：

**需求摘要逐项验证**：
- [x] 当前参考图缩略图提供明确“加入 Canvas”入口：`Composer` 缩略图右下角新增 `ImagePlus` icon button，带 `title/aria-label="加入 Canvas"`。
- [x] 点击后确保有 Canvas project 并创建 image node：`addReferenceToCanvas()` 无 active project 时先打开 Canvas workspace，之后写入 Canvas image node。
- [x] Canvas image node 保留 `referenceImageId/storagePath/mimeType/fileSizeBytes`：store 测试覆盖 metadata，代码传参一致。
- [x] 同一参考图重复加入不创建重复节点：去重仍由 `useCanvasStore.addImageNode()` 基于 `referenceImageId/historyItemId` 处理，store 测试覆盖。
- [x] 历史 / 图库图仍走 `addHistoryToCanvas()` 和 `reference.addFromHistoryMany()`：`src/store/app-store.ts:622` 保留该调用，`ImageTile` 入口未改为新 action。
- [x] 本地图片 dock 仍只创建 Canvas image node：`src/components/canvas/CanvasWorkspace.tsx:181` 到 `src/components/canvas/CanvasWorkspace.tsx:193` 读取本地图片后直接 `addImageNode()`。

**明确不做逐项核对**：
- [x] 未新增平行素材库、asset store、数据库表或 project 图片包：未新增相关 service/store/schema。
- [x] 未迁入视频、音频、账号、Go 后端、AntD、Next.js 或 localforage：代码范围核查未发现新增这些依赖或入口。
- [x] 未复制 AGPL 项目代码：实现使用现有 PixAI React/Zustand/shadcn 结构。
- [x] 未修改 Provider、ImageService、history、reference API、Tauri API 或生成请求协议：本 feature 只改 app-store 编排、Composer 入口、CanvasWorkspace toast 和测试。
- [x] 未做批量加入 Canvas、项目选择器、从图库反向定位 Canvas 节点、云同步或复杂资产管理页。

**关键决策落地**：
- [x] 当前参考图加入 Canvas 由 app-store 编排：`Composer` 只触发 action，不处理 Canvas project 或持久化细节。
- [x] 不重复导入 reference：`addReferenceToCanvas()` 不调用 `reference.importPayloads()` 或 `reference.addFromHistoryMany()`。
- [x] Canvas project 仍绑定 Canvas conversation：action 读取 active project 和绑定 conversation，缺失时失败 toast。
- [x] 去重仍放在 Canvas store：未在 UI 层维护 disabled/已加入状态。

**编排层“现状 -> 变化”逐项核对**：
- [x] 首次从 workspace reference 加入 Canvas 时，允许先保存当前 workspace conversation 再打开 Canvas project，并从 workspace conversation 回查 reference，避免用户当前参考图丢失。
- [x] `imageSourceForDisplay()` 作为安全展示源入口，storagePath 不直接裸写 DOM。
- [x] 成功 toast 区分来源：参考图、历史图、本地图片分别有不同文案。

**流程级约束核对**：
- [x] reference 不存在或无法显示时不创建 node，并显示失败 toast。
- [x] 历史 / 图库图保持既有上限和格式校验，因为仍走 `reference.addFromHistoryMany()`。
- [x] 不新增视频/音频文案、类型或入口；代码中“视频/音频”命中为既有测试反向断言。

**挂载点反向核对（可卸载性）**：
- [x] 挂载点 M1 `src/store/app-store.ts`：新增 `addReferenceToCanvas()` 和 `findReferenceImage()`，声明在 AppState 中。
- [x] 挂载点 M2 `src/components/workspace/Composer.tsx`：新增 `ImagePlus` import、store action 解构、缩略图按钮和 handler。
- [x] 挂载点 M3 tests：`app-store.test.ts` 覆盖成功、去重、storagePath 和失败；`Composer.test.tsx` 覆盖按钮互不串扰；`CanvasWorkspace.test.tsx` 更新本地图片 toast。
- [x] 反向 grep：`addReferenceToCanvas` 只命中 app-store、Composer 和对应测试，均在挂载点清单内。
- [x] 拔除沙盘推演：删除 Composer 按钮、store action 和测试后，本 feature 可被独立移除；历史 / 图库 / 本地图片原桥接不受影响。

## 3. 验收场景核对

- [x] **S1 当前参考图点击“加入 Canvas”**：store 测试与 Python Playwright smoke 均通过；smoke 中 Canvas 出现 1 个 image node，节点标题含 `smoke-reference`，stored metadata 含 `referenceImageId: reference-smoke-canvas-button` 与 `storagePath: browser-memory/references/smoke-reference.png`。
- [x] **S2 同一参考图重复点击不重复创建**：`src/store/app-store.test.ts` 覆盖重复调用 `addReferenceToCanvas()` 后 node 去重。
- [x] **S3 storagePath 参考图使用安全展示源**：`src/store/app-store.test.ts` 覆盖 `storagePath` 情况，并确认 Canvas node content 使用可显示源。
- [x] **S4 reference 不存在或图片源不可用**：`src/store/app-store.test.ts` 覆盖失败 toast `图片内容不可用，无法加入 Canvas。` 且不创建 node。
- [x] **S5 预览、移除、加入 Canvas 三按钮互不串扰**：`src/components/workspace/Composer.test.tsx` 覆盖点击加入 Canvas 不打开预览、不触发移除。
- [x] **S6 历史 / 图库图继续走既有链路**：`src/store/app-store.test.ts` 仍断言 `pixaiApi.reference.addFromHistoryMany(conversation.id, [item.id])`。
- [x] **S7 本地图片 dock 仍能加入 Canvas**：`src/components/canvas/CanvasWorkspace.test.tsx` 覆盖本地文件导入后 toast `本地图片已加入 Canvas：local-cat.png`。
- [x] **前端浏览器验证**：Python Playwright smoke 已在 `http://127.0.0.1:5181/` 验证 reference thumb 加入 Canvas；截图路径：`C:\Users\admin\AppData\Local\Temp\pixai-canvas-asset-bridge-polish-smoke.png`。

## 4. 术语一致性

- 素材桥：只用于文档层描述，代码不新增 asset store 或 asset library。
- 当前参考图：代码对应 `Conversation.referenceImages` / `ReferenceImage`，action 命名为 `addReferenceToCanvas`，一致。
- 历史 / 图库图：仍以 `ImageHistoryItem` 和 `historyId` 为输入，action 命名为 `addHistoryToCanvas`，一致。
- Canvas 图片节点：代码使用 `CanvasNodeData(type: 'image')` 与 `CanvasImageNodeInput`，一致。
- 安全展示源：代码统一使用 `imageSourceForDisplay()` / `imageSourceForDisplaySync()` 语义，未把不可用本地裸路径直接作为 UI 图片源。
- 防冲突：新增入口未引入 video/audio 类型、按钮或文案；反向命中只来自既有测试断言和文档范围说明。

## 5. 架构归并

- [x] `.codestable/architecture/ui-shadcn-workbench.md`：已归并 Composer 当前参考图缩略图“加入 Canvas”入口、`addReferenceToCanvas()` 编排、Canvas image node metadata 与素材桥边界。
- [x] `.codestable/architecture/ARCHITECTURE.md`：已同步 Canvas 模式术语、Canvas 子系统索引和硬边界，明确当前参考图/历史图/图库图/本地图片到 Canvas 的素材桥。
- [x] `.codestable/attention.md`：本 feature 未暴露新的通用环境或命令坑，不需要更新。

## 6. requirement 回写

- [x] `requirement: reference-image-input` 指向 current req；本次改了用户视角和边界，已执行 update。
- [x] `.codestable/requirements/reference-image-input.md`：已补充“从当前参考图缩略图直接加入 Canvas”的用户故事、怎么解决、边界和变更日志。
- [x] `.codestable/requirements/VISION.md`：已同步 `reference-image-input` 的 pitch。

## 7. roadmap 回写

- [x] `roadmap: canvas-image-workbench-upgrade` + `roadmap_item: canvas-asset-bridge-polish` 字段完整。
- [x] `.codestable/roadmap/canvas-image-workbench-upgrade/canvas-image-workbench-upgrade-items.yaml`：`canvas-asset-bridge-polish.status` 已改为 `done`，`feature` 指向 `2026-06-06-canvas-asset-bridge-polish`。
- [x] `.codestable/roadmap/canvas-image-workbench-upgrade/canvas-image-workbench-upgrade-roadmap.md`：第 5 节第 6 条已同步为 `done` 和对应 feature；所有子项完成后 roadmap 状态已收束为 `completed`。

## 8. attention.md 候选盘点

- [x] 本 feature 未暴露需要补入 `.codestable/attention.md` 的内容。既有注意事项“真实 Tauri 客户端测试用 `pnpm dev:client`”仍有效。

## 9. 遗留

- 后续优化点：`app-store.ts` 的 Canvas 编排职责继续变重，后续如果 Canvas action 继续扩张，建议另起 refactor 拆分 Canvas bridge/action 模块。
- 已知限制：本 feature 不做批量加入 Canvas、项目选择器、从图库反向定位 Canvas 节点、云同步或复杂资产管理页。
- 实现阶段顺手发现：未新增需要单独 issue 的阻塞问题。

## 验证证据

- `pnpm exec tsc --noEmit`：通过。
- `pnpm exec vitest run`：通过，33 files / 235 tests；仍输出既有 `WorkspaceConfigPanel / SettingsToggleRow` 嵌套 button warning，非本 feature 改动范围。
- `pnpm run build`：通过；Vite 输出既有 chunk size warning。
- `pnpm exec vitest run src/store/app-store.test.ts src/components/workspace/Composer.test.tsx src/components/canvas/CanvasWorkspace.test.tsx src/components/workspace/ImageTile.test.tsx src/components/gallery/GalleryPage.test.tsx src/store/canvas-store.test.ts src/components/canvas/CanvasViewport.test.tsx src/services/canvas-projects.test.ts src/services/canvas-workflow.test.ts`：通过，9 files / 127 tests。
- `pnpm exec vitest run src/store/app-store.test.ts src/components/workspace/Composer.test.tsx`：通过，2 files / 54 tests。
- `pnpm exec vitest run src/components/canvas/CanvasWorkspace.test.tsx src/components/workspace/ImageTile.test.tsx src/components/gallery/GalleryPage.test.tsx`：通过，3 files / 25 tests。
- `pnpm exec vitest run src/store/canvas-store.test.ts src/components/canvas/CanvasViewport.test.tsx src/services/canvas-projects.test.ts src/services/canvas-workflow.test.ts`：通过，4 files / 48 tests。
- `python .codestable/tools/validate-yaml.py --file .codestable/features/2026-06-06-canvas-asset-bridge-polish/canvas-asset-bridge-polish-checklist.yaml --yaml-only`：通过。
- `python .codestable/tools/validate-yaml.py --file .codestable/roadmap/canvas-image-workbench-upgrade/canvas-image-workbench-upgrade-items.yaml --yaml-only`：通过。
- `git diff --check`：通过，仅输出 Windows CRLF 换行提示，无 whitespace error。
- Python Playwright smoke：通过，截图 `C:\Users\admin\AppData\Local\Temp\pixai-canvas-asset-bridge-polish-smoke.png`。
