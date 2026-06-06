# Canvas Node Action Toolbar 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-06
> 关联方案 doc：`.codestable/features/2026-06-06-canvas-node-action-toolbar/canvas-node-action-toolbar-design.md`

## 1. 接口契约核对

对照方案第 2.1 节，实际实现一致：

- [x] `CanvasNodeActionToolbar`：作为 `CanvasNodeLayer.tsx` 私有组件落地，在节点 hover 或 selected 时显示；按 node type 暴露文本生成、图片预览、mask、生成运行/重试、连接和删除动作。
- [x] `createGenerateNodeFromText(textNodeId)`：已加入 `useCanvasStore`，只接受非空 text node，在一次 project mutation 内创建空 generate node 和 prompt connection，并返回新 generate node id。
- [x] `CanvasViewportProps.onTextNodeGenerate`：已加入 `CanvasViewport.tsx` 并透传到 `CanvasNodeLayer`。
- [x] `CanvasWorkspace.generateFromTextNode()`：已把 `createGenerateNodeFromText()` 的返回 id 接到既有 `generateCanvasNode()`。
- [x] 流程图核对：`用户 hover / 选中节点 -> CanvasNodeActionToolbar -> text/image/result/generate/delete/connect` 均有实际代码落点。

## 2. 行为与决策核对

需求摘要逐项验证：

- [x] 选中或 hover 节点时显示浮动动作条；未选中时 toolbar 隐藏但仍可通过 hover / focus 进入。
- [x] text node 非空时，动作条“生成”会先提交当前文本 draft，再创建下游 generate node、建立 prompt connection，并调用 `generateCanvasNode()`。
- [x] text node 空内容时，生成按钮 disabled；store action 返回 `null` 且不写盘。
- [x] image / result node 动作条可打开预览和 mask 编辑，复用既有 modal。
- [x] generate node 动作条可运行；failed / succeeded 显示“重试”，running 禁用。
- [x] 删除节点入口集中到动作条，仍调用 `deleteNode()` 清理相关 connections。
- [x] 连接入口仍可触发，连接类型继续由 `canvasConnectionKindForNodes()` 判定。

明确不做逐项核对：

- [x] 未新增视频、音频节点或入口；实现代码未新增 `Video` / `Audio` / `Music` 图标或“视频”“音频”文案，测试命中仅用于反向断言。
- [x] 未修改 `ImageService`、Provider、history、reference、Tauri API 或数据库结构。
- [x] 未新增 Canvas node type；仍只处理 `text/image/generate/config/batch/result`。
- [x] 未实现“连线到空白处创建节点”，该能力留给 `canvas-connection-create-menu`。

关键决策落地：

- [x] 动作条只编排既有能力，preview / mask / run / delete 都复用已有回调和 store action。
- [x] 文本一键生成的原子性放在 Canvas store；prompt 内容不复制到 generate node，避免 workflow 重复拼接。
- [x] 旧 body 操作保留；动作条只是高可见度快捷入口。

挂载点反向核对：

- [x] 挂载点清单覆盖实际代码：`CanvasNodeLayer.tsx`、`CanvasViewport.tsx`、`CanvasWorkspace.tsx`、`canvas-store.ts` 和对应测试。
- [x] grep 反向核查：`CanvasNodeActionToolbar`、`createGenerateNodeFromText`、`onTextNodeGenerate` 均落在 design 第 2.3 节清单内。
- [x] 拔除沙盘推演：移除 toolbar 私有组件、`onTextNodeGenerate` 透传、Workspace 接线和 store action 即可卸载本 feature；无 schema / Provider / Tauri 残留。

## 3. 验收场景核对

- [x] **S1**：选中或 hover text node 时显示动作条。证据：`CanvasViewport.test.tsx` 覆盖 selected 后 toolbar `opacity-100`；浏览器 smoke 可见。
- [x] **S2**：非空 text node 点击“生成”创建 generate node、建立 prompt connection，并调用 `generateCanvasNode()`。证据：`CanvasWorkspace.test.tsx` 与 `canvas-store.test.ts` 覆盖。
- [x] **S3**：空 text node 不创建节点。证据：`canvas-store.test.ts` 覆盖返回 `null`；`CanvasViewport.test.tsx` 覆盖 disabled。
- [x] **S4**：image node 动作条可打开图片预览和 mask 编辑。证据：`CanvasViewport.test.tsx` 覆盖。
- [x] **S5**：result node 且已有图片时动作条可打开预览和 mask 编辑。证据：`CanvasViewport.test.tsx` 覆盖。
- [x] **S6**：generate node 可运行 / 重试，running 不可重复点击。证据：`CanvasViewport.test.tsx` 覆盖 failed 和 running 状态。
- [x] **S7**：删除节点入口从动作条触发且仍调用 `deleteNode()`。证据：`CanvasViewport.test.tsx` 覆盖。
- [x] **S8**：连接入口仍可触发，连接规则不变。证据：既有连接测试继续通过，store `addConnection()` 改为使用 `canvasConnectionKindForNodes()`。
- [x] **S9**：不出现视频 / 音频入口，不新增 node type。证据：grep 反向核查 + 浏览器 smoke `hasVideoAudioText: false`。

前端浏览器验证：

- [x] 临时 Vite `http://127.0.0.1:5181/`，点击顶栏 Canvas，创建 Canvas 项目，添加 text node，选中节点后动作条可见，点击“生成”后创建 generate node 和 prompt connection。
- [x] 浏览器 smoke 过程中发现 `CanvasViewport` 在真实浏览器内高度塌陷为 2px，已修复 `CanvasWorkspace` active project 分支为 flex 容器；复验后视口尺寸为 `1180x856`。
- [x] 复验截图：`C:\Users\admin\AppData\Local\Temp\pixai-canvas-node-toolbar-interaction-fixed.png`。

验证命令：

- [x] `pnpm exec tsc --noEmit`：通过。
- [x] `pnpm exec vitest run src/components/canvas/CanvasWorkspace.test.tsx src/components/canvas/CanvasViewport.test.tsx src/store/canvas-store.test.ts`：3 个文件 / 38 个测试通过。

## 4. 术语一致性

- `CanvasNodeActionToolbar`：代码、design、architecture 含义一致，指节点 hover / selected 时出现的浮动动作条。
- `文本一键生成`：代码中表现为 `createGenerateNodeFromText()` + `CanvasWorkspace.generateFromTextNode()`，未复制 prompt 到 generate node。
- `图片动作`：代码中表现为 `openNodePreview()` / `openNodeMaskEditor()`，复用既有 preview / mask modal。
- `生成动作`：代码中表现为 `runGenerateNode()`，running 状态禁用。
- `统一删除入口`：代码中表现为 toolbar `删除节点` 调用 `deleteCanvasNode()`，再走 `onNodeDelete()`。
- 禁用词核对：实现代码没有新增视频 / 音频入口；roadmap/design 中出现仅作为范围边界说明。

## 5. 架构归并

- [x] `.codestable/architecture/ui-shadcn-workbench.md`：已补充 `CanvasNodeActionToolbar` 术语、CanvasNodeLayer 节点动作条、文本一键生成、图片/结果 preview/mask、生成运行/重试、CanvasViewport 高度约束和 store action。
- [x] `.codestable/architecture/ARCHITECTURE.md`：已在 Canvas 子系统索引、关键架构决定和硬边界中补充节点动作条，并继续强调不引入视频/音频。

## 6. requirement 回写

- [x] `requirement: reference-image-input` 当前是 `status: current`。本 feature 没改变参考图输入的用户故事、数量 / 格式 / 大小限制或导入边界，只增强 Canvas 内图片/结果节点操作，因此 requirement 不更新。

## 7. roadmap 回写

- [x] `.codestable/roadmap/canvas-image-workbench-upgrade/canvas-image-workbench-upgrade-items.yaml`：`canvas-node-action-toolbar` 已从 `in-progress` 改为 `done`。
- [x] `.codestable/roadmap/canvas-image-workbench-upgrade/canvas-image-workbench-upgrade-roadmap.md`：第 5 节对应子 feature 已同步为 `done` 并填写 feature 目录名。
- [x] checklist checks 已全部标记为 `passed`。

## 8. attention.md 候选盘点

- [x] 无候选。本 feature 未暴露新的通用编译、运行、测试或路径陷阱；已有 `pnpm dev:client` 注意事项仍适用。

## 9. 遗留

- 后续优化点：进入 roadmap 下一项 `canvas-connection-create-menu`，补从节点连到空白处直接创建下游节点。
- 已知限制：本 feature 不做连接创建菜单、多选、快捷键、节点 inspector、节点取消生成或复杂右键菜单。
- 实现阶段顺手发现：`CanvasNodeLayer.tsx` 已继续变胖；后续如果继续增加节点级 inspector、菜单或快捷键，应单独 feature/refactor 拆出 `CanvasNodeCard` / `CanvasNodeActionToolbar` 文件。
