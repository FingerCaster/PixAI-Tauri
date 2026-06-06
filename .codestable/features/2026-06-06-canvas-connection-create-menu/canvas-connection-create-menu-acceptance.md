---
doc_type: feature-acceptance
feature: 2026-06-06-canvas-connection-create-menu
status: accepted
accepted_at: 2026-06-06
roadmap: canvas-image-workbench-upgrade
roadmap_item: canvas-connection-create-menu
tags: [canvas, connections, node-creation, image-generation, ux]
---

# Canvas Connection Create Menu 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-06
> 关联方案 doc：`.codestable/features/2026-06-06-canvas-connection-create-menu/canvas-connection-create-menu-design.md`

## 1. 接口契约核对

**接口示例逐项核对**

- [x] `addConnectedNode({ sourceNodeId, type, position })`：创建目标节点并自动连接。
  - 代码实际行为：`src/store/canvas-store.ts:19` 定义 `CanvasConnectedNodeInput`，`src/store/canvas-store.ts:266` 在一次 `persistActiveProject()` mutation 内创建目标节点、推导 connection kind 并追加 connection。
  - 证据：`src/store/canvas-store.test.ts:340` 覆盖 text/image/result/config/batch -> generate 和 generate -> result。

**名词层“现状 -> 变化”逐项核对**

- [x] `CanvasViewport` 背景点击：连接模式下先反算世界坐标并交给 NodeLayer，非连接模式仍走 pan。
  - 代码实际行为：`src/components/canvas/CanvasViewport.tsx:120` 调用 `handleCanvasBlankPointerDown()`；未接管时继续 `setPointerCapture()`。
- [x] `CanvasNodeLayer` 菜单状态：局部保存 `pendingConnectionCreate`，创建后关闭菜单并清空连接源。
  - 代码实际行为：`src/components/canvas/CanvasNodeLayer.tsx:95`、`src/components/canvas/CanvasNodeLayer.tsx:232`。
- [x] `CanvasWorkspace` 接线：把 `useCanvasStore.addConnectedNode()` 传入 `CanvasViewport`。
  - 代码实际行为：`src/components/canvas/CanvasWorkspace.tsx:32`、`src/components/canvas/CanvasWorkspace.tsx:140`。

**流程图核对**

- [x] 用户点击连接入口 -> NodeLayer 设置 source -> 背景点击 -> Viewport 反算世界坐标 -> NodeLayer 菜单 -> store 创建目标并连线，均有代码落点。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] text/image/result/config/batch source 可创建 generate：store 测试覆盖所有 kind，组件测试覆盖 text UI。
- [x] generate source 可创建 result：`CanvasViewport.test.tsx:437` 覆盖菜单只提供结果节点并回调 result。
- [x] 菜单位置和新节点坐标按世界坐标落地：`CanvasViewport.test.tsx:363` 和 `CanvasWorkspace.test.tsx:259` 覆盖 viewport `{ x: 40, y: -20, k: 2 }` 下点击坐标反算为 `{ x: 210, y: 100 }`。
- [x] 连接类型继续由 `canvasConnectionKindForNodes()` 决定：`src/store/canvas-store.ts:273` 复用该函数，未引入平行事实源。

**明确不做逐项核对**

- [x] 不新增视频/音频入口：`rg` 只命中测试里的反向断言和 roadmap/architecture 边界说明，Canvas 代码无视频/音频节点入口。
- [x] 不创建空 image node：`connectionCreateOptionsForSource()` 只返回 generate/result，`createBlankCanvasNodeAt()` 对 image 返回 `null`。
- [x] 不修改 Provider、ImageService、history、reference 或 Tauri API：本 feature 代码改动集中在 Canvas UI、Canvas store 和测试。
- [x] 不复制参考项目源码：实现使用本项目 React/shadcn/Zustand 结构重写。

**关键决策落地**

- [x] 菜单状态放在 `CanvasNodeLayer` 局部：`pendingConnectionCreate` 是组件状态，不持久化。
- [x] 空白点击由 `CanvasViewport` 回调给 NodeLayer：通过 `CanvasNodeLayerHandle` 的窄 imperative API 接管连接模式背景点击。
- [x] 目标节点创建放在 store 原子 action：`addConnectedNode()` 只有在节点创建和 connection 推导都合法时才持久化。
- [x] 只暴露图像生图链路的下游节点：source 选项限制在 generate/result。

**流程级约束核对**

- [x] 菜单点击阻止背景 pan：`ConnectionCreateMenu` 上阻止 `pointerdown/click` 冒泡，组件测试断言不调用 viewport commit。
- [x] 非法 source/target 不写盘：`src/store/canvas-store.test.ts:459` 覆盖 missing source 和 text -> result。
- [x] 重复/环路保护：`addConnectedNode()` 显式检查重复 connection 和 `wouldCreateCanvasConnectionCycle()`；虽然新目标节点通常不会重复，约束已落地。
- [x] 新节点位置 normalize 为整数世界坐标：store 使用 `normalizePoint()`，测试覆盖小数坐标取整。

**挂载点反向核对**

- [x] `CanvasViewport.tsx`：背景点击接管和世界坐标传入。
- [x] `CanvasNodeLayer.tsx`：连接创建菜单、选项、选择后的回调。
- [x] `CanvasWorkspace.tsx`：store action 透传。
- [x] `canvas-store.ts`：原子创建并连接 action。
- [x] 测试文件：Viewport、Workspace、store 三层证据。
- [x] roadmap/architecture：items、主文档和架构文档已回写。
- [x] 拔除沙盘推演：移除 `onConnectionCreate` 透传、`handleCanvasBlankPointerDown()` 分支、`ConnectionCreateMenu`、`addConnectedNode()` 及对应测试后，本 feature 在 UI 和 store 视角消失；其余既有连接到已有节点能力仍保留。

## 3. 验收场景核对

- [x] **S1**：点击 text node 连接入口后再点空白，出现连接创建菜单。
  - 证据：`CanvasViewport.test.tsx:363`；浏览器 smoke 截图 `C:\Users\admin\AppData\Local\Temp\pixai-canvas-connection-create-menu-open.png`。
- [x] **S2**：text source 菜单选择生成节点，创建 generate node 并建立 prompt connection。
  - 证据：`CanvasWorkspace.test.tsx:259`；浏览器 smoke 结果包含 `node_types: ["text", "generate"]` 和 `connection_labels: ["提示词"]`。
- [x] **S3**：image/result/config/batch source 只提供 generate 并建立合法 connection kind。
  - 证据：`canvas-store.test.ts:340`。
- [x] **S4**：generate source 只提供 result 并建立 result connection。
  - 证据：`CanvasViewport.test.tsx:437` 和 `canvas-store.test.ts:340`。
- [x] **S5**：菜单点击不触发背景平移或 viewport commit。
  - 证据：`CanvasViewport.test.tsx:363` 断言 `onViewportCommit` 未调用。
- [x] **S6**：非连接状态点击空白仍可平移视口。
  - 证据：既有 CanvasViewport pan 流程未改写；本轮 typecheck 和组件测试全绿。
- [x] **S7**：非法 source、非法目标、重复连接或潜在环路不写盘。
  - 证据：`canvas-store.test.ts:459` 覆盖非法 source/target；代码含重复和环路检查。
- [x] **S8**：新节点坐标按当前 viewport 正确反算。
  - 证据：`CanvasViewport.test.tsx:363`、`CanvasWorkspace.test.tsx:259`。
- [x] **S9**：不出现视频/音频入口，不新增 Canvas node type，不创建空 image node。
  - 证据：Canvas UI 测试反向断言；`src/shared/types.ts` 的 `CanvasNodeType` 未新增 video/audio。

**浏览器验证**

- [x] Python Playwright 访问 `http://127.0.0.1:5181/`，切到 Canvas，点击 text 节点 header 连接口，点击空白，菜单显示“从提示词连接 / 生成节点”，选择后生成节点和“提示词”连线出现在画布。
- [x] 截图：
  - `C:\Users\admin\AppData\Local\Temp\pixai-canvas-connection-create-menu-open.png`
  - `C:\Users\admin\AppData\Local\Temp\pixai-canvas-connection-create-menu-created.png`

## 4. 术语一致性

- `CanvasConnectedNodeInput`、`addConnectedNode`、`ConnectionCreateMenu`、`PendingConnectionCreateMenu`、`connectionCreateOptionsForSource` 和 design 术语一致。
- `screenPosition` 在实现中不需要持久保存，已回填 design，避免文档和代码不一致。
- 禁用词 grep：Canvas 代码中无 `video/audio` node type 或入口，仅测试和文档边界出现“视频/音频”。

## 5. 架构归并

- [x] `.codestable/architecture/ui-shadcn-workbench.md`
  - 已归并 Canvas connection create menu 术语、Viewport 背景点击接管、NodeLayer 菜单编排、Canvas store `addConnectedNode()` 和当前能力边界。
- [x] `.codestable/architecture/ARCHITECTURE.md`
  - 已在 Canvas 子系统索引、关键决策和硬边界中补充 connection authoring 能力。

归并后，只看 architecture 即可知道 Canvas 当前支持“连接到空白创建合法下游节点”，并知道它不创建空 image、不引入视频/音频。

## 6. requirement 回写

- [x] design frontmatter 指向 `reference-image-input`，该 requirement 已是 `current`。
- [x] 本 feature 是 Canvas 生图编排交互增强，没有改变参考图输入能力的用户故事、边界或 pitch；本轮无需更新 requirement。

## 7. roadmap 回写

- [x] `.codestable/roadmap/canvas-image-workbench-upgrade/canvas-image-workbench-upgrade-items.yaml`
  - `canvas-connection-create-menu` 已从 `in-progress` 改为 `done`，feature 指向 `2026-06-06-canvas-connection-create-menu`。
  - YAML 校验通过。
- [x] `.codestable/roadmap/canvas-image-workbench-upgrade/canvas-image-workbench-upgrade-roadmap.md`
  - 子 feature 清单中该项已同步为 `done`，并把范围收窄为 text/image/result/config/batch 创建 generate、generate 创建 result。

## 8. attention.md 候选盘点

- [x] 本 feature 未暴露新的、每个 feature 都会再踩一次的环境 / 工具 / 工作流注意事项。

## 9. 遗留

- 后续优化点：`CanvasNodeLayer.tsx` 已偏胖，后续若继续增加 inspector、右键菜单或多选系统，建议另起 refactor 拆分 `CanvasNodeCard` / `CanvasConnectionCreateMenu` / `CanvasConnectionLayer`。
- 已知限制：连接创建菜单不创建空 image node；图片仍必须从本地图片、历史图、图库图或参考图入口加入 Canvas。
- 实现阶段顺手发现：节点动作条原先会遮挡 header 连接按钮，已在本 feature 内把动作条上移到节点上方，避免真实浏览器里连接按钮被遮挡。

## 10. 验证命令

- `pnpm exec tsc --noEmit`：通过。
- `pnpm exec vitest run src/components/canvas/CanvasWorkspace.test.tsx src/components/canvas/CanvasViewport.test.tsx src/store/canvas-store.test.ts`：通过，3 files / 43 tests。
- `python .codestable\tools\validate-yaml.py --file .codestable\features\2026-06-06-canvas-connection-create-menu\canvas-connection-create-menu-checklist.yaml --yaml-only`：通过。
- `python .codestable\tools\validate-yaml.py --file .codestable\roadmap\canvas-image-workbench-upgrade\canvas-image-workbench-upgrade-items.yaml --yaml-only`：通过。
- Python Playwright smoke：通过。
