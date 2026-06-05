---
doc_type: issue-analysis
issue: 2026-06-05-canvas-node-interaction-regressions
status: draft
root_cause_type: state-pollution
related: [canvas-node-interaction-regressions-report.md]
tags: [canvas, node, frontend, interaction, reference-image]
---

# Canvas 节点交互回归根因分析

## 1. 问题定位

| 关键位置 | 说明 |
|---|---|
| `src/components/canvas/CanvasViewport.tsx:121-124` | 画布根层对所有滚轮事件一律 `preventDefault()` 并执行缩放，没有排除 `textarea` / `input` 这类可编辑子元素。 |
| `src/components/canvas/CanvasNodeLayer.tsx:58-70` | 节点层维护了一份本地 `draftNodes`，只要上游 `nodes` 变化就会整体 `setDraftNodes(nodes)`，会覆盖尚未提交的本地草稿。 |
| `src/components/canvas/CanvasNodeLayer.tsx:252-257` | 文本节点 `textarea` 在 `onChange` 里只更新本地 draft，在 `onBlur` 时才真正写回 store；同时没有拦截滚轮事件。 |
| `src/components/canvas/CanvasWorkspace.tsx:164-182` | 工具栏“参考图”按钮展示的是 `activeConversation.referenceImages`，并不是 Canvas 上已经存在的图片节点，因此入口语义和画布节点模型并不一致。 |
| `src/services/app-database.ts:265-278` | `addHistoryImageAsReference()` 会把会话参考图直接覆盖成单张 `[reference]`，如果这条接口继续被当成“累加参考图”使用，多图状态会被收缩成最后一张。 |
| `src/components/canvas/CanvasImageNodeBody.tsx:41-56` | 当前图片节点已经统一走 `imageSourceForDisplay()`，并使用 `object-contain` + 点击预览，不再是 report 里描述的旧实现。 |
| `src/components/canvas/CanvasImagePreviewModal.tsx:18-29` / `src/components/ui/dialog.tsx:50-89` | 预览弹窗已经通过 `Dialog` 的 `onOpenChange` 和默认关闭按钮接通关闭链路。 |
| `src/components/canvas/CanvasNodeLayer.tsx:194-222` / `:329-342` | 连线按钮、删除按钮和弧形连线路径都已经在当前代码里落地。 |
| `src/components/canvas/CanvasViewport.test.tsx:79-111` | 现有测试已覆盖图片节点 `object-contain`、预览打开、连线按钮、删除连线/节点等行为，说明 report 中这部分现象已经和当前代码不一致。 |

## 2. 失败路径还原

**正常路径**：  
用户在 Canvas 文本节点里输入长提示词 -> 文本框内部滚动只影响文本框本身 -> 用户继续编辑，等失焦时再把最终内容提交到 store -> 画布缩放、节点刷新都不应改写当前草稿。

**失败路径**：  
用户在 Canvas 文本节点里输入长提示词 -> `textarea` 的修改只停留在 `CanvasNodeLayer` 本地 `draftNodes` -> 鼠标停在输入区里滚动滚轮时，事件冒泡到 `CanvasViewport` 根层，被当成画布缩放处理 -> 视口更新触发 store / props 刷新 -> `CanvasNodeLayer` 的 `useEffect(() => setDraftNodes(nodes), [nodes])` 用旧的持久化内容整体覆盖本地草稿 -> 用户看到文本回退到上一次 `onBlur` 时保存的值；如果之前从未保存，就表现为清空。

**参考图入口的正常路径**：  
Canvas 中“图片节点”应该是参考图输入的唯一可见载体；用户添加本地图、历史图或会话参考图后，都以图片节点的形式参与连线和生成。

**参考图入口的失败路径**：  
当前工具栏“参考图”按钮并不读取 Canvas 图片节点，而是直接列出 `activeConversation.referenceImages` -> 当画布上已经存在多个图片节点时，这个列表和用户眼中的“当前可用参考图”不是同一套东西 -> 如果某些路径还走了 `addHistoryImageAsReference()` 的覆盖语义，会话侧列表还可能进一步退化成单张 -> 用户就会看到“按钮里只有一张，但画布上明明不止一张”的混乱状态。

**分叉点**：

- `src/components/canvas/CanvasViewport.tsx:121-124` + `src/components/canvas/CanvasNodeLayer.tsx:68-70` — 画布缩放事件和文本草稿状态发生了错误耦合。
- `src/components/canvas/CanvasWorkspace.tsx:164-182` — 工具栏入口选择了“会话参考图”而不是“画布图片节点”作为显示源，导致 UI 语义分叉。

## 3. 根因

**根因类型**：`state-pollution`

**根因描述**：  
这次回归并不是一个单点 bug，而是两组交互状态被错误耦合在一起：

1. **文本节点编辑状态和画布缩放状态耦合**。文本节点把输入草稿暂存在本地 `draftNodes`，但画布又把所有滚轮都当成缩放手势处理；一旦缩放触发 props 刷新，本地草稿就会被 store 里的旧值整体覆盖，直接造成文本回退或丢失。
2. **Canvas 参考图入口和 Canvas 节点模型耦合错位**。Canvas 已经有图片节点作为参考图输入载体，但工具栏里又保留了一套基于 `activeConversation.referenceImages` 的“参考图”下拉；它展示的是会话状态，不是画布状态，所以天然会和用户在画布上看到的图片节点数量、来源和用途对不上。

**是否有多个根因**：是。

- **主根因**：文本编辑草稿的本地状态会被画布缩放触发的上游刷新覆盖。
- **次根因**：Canvas 工具栏“参考图”入口和图片节点承担了重复职责，且两者的数据源并不一致。
- **补充判断**：report 里“图片不居中 / 预览无法关闭 / 没有连线按钮 / 没有删除入口”这些现象，当前代码库里已经由 `2026-06-05-canvas-session-image-display` 和连线样式调整处理，不再是这份 issue 的现存根因。

## 4. 影响面

- **影响范围**：
  - 文本节点长内容编辑：稳定受影响。
  - Canvas 工具栏“参考图”入口：稳定存在语义混乱，且在某些会话参考图来源下会表现成多图丢失。
- **潜在受害模块**：
  - 所有依赖 `CanvasViewport` 滚轮缩放的可编辑节点（至少文本节点，后续若生成节点 textarea 也采用同样草稿模式，会有相同风险）。
  - 经典工作台与 Canvas 之间共享 `conversation.referenceImages` 的相关入口。
- **数据完整性风险**：有。
  - 文本节点会丢失尚未 `blur` 的用户输入。
  - 参考图入口会让用户误判当前可用于生成的参考图集合。
- **严重程度复核**：维持 **P1**。
  - 虽然 report 中部分图片显示问题已经被修掉，但“长文本编辑丢失”和“参考图入口语义错误”都还直接伤害基础使用链路，尤其前者已经是实际内容丢失。

## 5. 修复方案

### 方案 A：收窄到真实回归，并移除重复的“参考图”入口

- **做什么**：
  - 在 `CanvasViewport` 中忽略来自 `textarea` / `input` / `[contenteditable]` 的滚轮缩放。
  - 在文本节点输入区补上滚轮拦截，并增加“放大编辑”入口，让长文本不必在小节点里硬写。
  - 从 `CanvasWorkspace` 工具栏移除“参考图”按钮，只保留“本地图片 / 历史图加入 Canvas -> 图片节点 -> 连到生成节点”这一条输入路径。
- **优点**：
  - 直接切中当前还存在的两个真实问题。
  - 和用户已经表达过的产品方向一致：图片节点承担参考图职责，工具栏不再重复一套入口。
  - 改动范围集中在 Canvas 组件层，不需要重写参考图底层存储模型。
- **缺点 / 风险**：
  - 会改变现有工具栏信息架构，需要同步调整引导文案和测试。
  - 如果后续仍需要“会话级参考图管理”能力，得另找更清晰的承载位置。
- **影响面**：
  - `src/components/canvas/CanvasViewport.tsx`
  - `src/components/canvas/CanvasNodeLayer.tsx`
  - `src/components/canvas/CanvasWorkspace.tsx`
  - 对应 Canvas 组件测试

### 方案 B：保留“参考图”按钮，但把它改成和画布节点同语义

- **做什么**：
  - 修复文本滚轮问题同方案 A。
  - 保留工具栏“参考图”按钮，但它不再读 `activeConversation.referenceImages`，而是改成列出当前 Canvas 上的图片/结果节点，或明确区分“会话参考图”和“画布图片节点”两组列表。
  - 同时排查 `addHistoryImageAsReference()` 的覆盖语义是否仍有误用路径。
- **优点**：
  - 功能更完整，既保留入口又澄清数据源。
  - 如果未来要做“从会话参考图快速拉进 Canvas”的桥接，这条路更容易继续扩。
- **缺点 / 风险**：
  - UI 复杂度明显更高。
  - 需要重新设计“会话参考图”和“Canvas 图片节点”的边界，容易把 bug 修复扩成一轮交互重构。
- **影响面**：
  - `CanvasViewport` / `CanvasNodeLayer` / `CanvasWorkspace`
  - `useCanvasStore` 或 `useAppStore` 中和画布图片节点、参考图桥接相关逻辑

### 方案 C：深一点地重构节点草稿管理

- **做什么**：
  - 把文本节点草稿从 `draftNodes` 整体状态里拆出来，改成按节点独立管理，或改成 `onChange` 即写 store / debounce 持久化。
  - 统一为文本节点和生成节点提供共享的放大编辑器。
  - 再按 A 或 B 处理“参考图”入口。
- **优点**：
  - 能从根上减少“局部草稿被整体 props 覆盖”的类问题。
  - 对后续更多节点类型扩展更稳。
- **缺点 / 风险**：
  - 改动面最大，已经接近一次小型前端状态重构。
  - 和当前 issue 的止血诉求相比，性价比偏低。
- **影响面**：
  - `CanvasNodeLayer`
  - 可能波及 `CanvasGenerateNodeBody` / `CanvasBatchNodeBody` 等其他带输入草稿的节点体
  - 多个 Canvas 测试文件

### 推荐方案

**推荐方案 A**，理由：  
它把这份 issue 收窄回“当前仍真实存在的问题”，既能定点修掉文本节点内容回退，也顺着用户已经明确表达过的方向，把重复且混乱的“参考图”按钮移掉。相比保留按钮并继续解释两套图片语义，A 的改动更小、行为更直接，也更不容易把一次 bug 修复做成半套信息架构重构。
