---
doc_type: issue-fix
issue: 2026-06-06-canvas-viewport-height-collapse
path: fast-track
fix_date: 2026-06-06
tags: [canvas, viewport, layout, frontend]
---

# Canvas 节点不可见修复记录

## 1. 问题描述

用户在 PixAI Dev 的 Canvas 页面打开“示例工程：金毛犬山地摄影全流程”后，左侧项目列表和左上项目信息都显示该项目有 13 个节点，但画布中央为空白，看不到任何节点。

## 2. 根因

`src/components/canvas/CanvasWorkspace.tsx` 中 `CanvasViewport` 的直接父容器只有 `relative min-w-0 flex-1`，不是 flex container。`CanvasViewport` 自身依赖 `flex-1` 撑满剩余高度，但父级不参与 flex 布局时，这个 `flex-1` 不会按预期生效，真实窗口里视口高度会塌缩。

项目标题栏、右侧助手和底部 dock 使用绝对定位或独立栏位，所以仍可见；节点层在 `CanvasViewport` 内部并受 `overflow-hidden` 裁剪，因此表现为“项目有节点，但画布空白”。

真实 dev 数据核对结果：

- `pixai-canvas-projects.json` 中示例工程确实有 13 个节点。
- 示例工程 viewport 为 `x=792, y=394, k=0.7`。
- 节点坐标按该 viewport 计算应落在可见区域，所以不是用户拖远或数据丢失。

## 3. 修复方案

- 将 `CanvasViewport` 的直接父容器改成 `relative flex min-h-0 min-w-0 flex-1 flex-col`。
- 保持右侧画布助手、浮动 command bar 和底部 dock 的现有结构不变。
- 补充 `CanvasWorkspace.test.tsx` 回归测试，锁定 `CanvasViewport` 父容器必须具备 `flex / flex-col / min-h-0`，并确认节点 DOM 正常渲染。

## 4. 改动文件清单

- `src/components/canvas/CanvasWorkspace.tsx`
- `src/components/canvas/CanvasWorkspace.test.tsx`

## 5. 验证结果

- `pnpm exec vitest run src/components/canvas/CanvasWorkspace.test.tsx --reporter=dot`：通过，23 个测试全部通过。
- `pnpm exec tsc --noEmit`：通过。
- Playwright smoke：把真实 dev 数据注入浏览器态 Vite 页面，打开 Canvas 示例工程后：
  - `[data-canvas-node-id]` 数量为 13。
  - `.canvas-viewport` bounding box 为 `1468 x 976`。
  - 首个节点 bounding box 正常可见。
  - 页面包含“金毛犬山地摄影”节点文本。
  - 截图：`C:\Users\admin\AppData\Local\Temp\pixai-canvas-visible-layout-smoke.png`。

## 6. 遗留事项

- 本次只修复 CanvasWorkspace 左侧画布区域的高度塌缩，不改 Canvas 节点布局、示例工程数据、右侧助手或 dock。
- 如果后续继续调整 Canvas shell 布局，应保留 `CanvasViewport` 父级 flex column 约束，避免 `flex-1` 再次失效。
