---
doc_type: feature-ff-note
feature: canvas-node-keyboard-layout
date: 2026-06-07
requirement:
tags: [canvas, node, keyboard, layout]
---

## 做了什么

Canvas 节点现在支持选中后按 Delete 键删除。自动创建节点时会从当前视口左上开始按行寻找空位，优先横向从左到右排布，避免新节点叠到已有节点上。

## 改了哪些

- `src/components/canvas/CanvasNodeLayer.tsx` — 复用现有选中态和删除逻辑，增加 Delete 键删除选中节点，并避开输入框 / 文本域编辑场景。
- `src/store/canvas-store.ts` — 将默认节点位置改成按节点真实尺寸和安全间距扫描空位，所有自动创建入口共用该逻辑。
- `src/components/canvas/CanvasWorkspace.test.tsx` / `src/store/canvas-store.test.ts` — 补充键盘删除和自动空位排布回归测试。

## 怎么验证的

已运行 `pnpm exec tsc --noEmit`、`pnpm exec vitest run --reporter=dot`，全量 34 个测试文件 / 254 个测试通过；`git diff --check` 通过。
