---
doc_type: feature-ff-note
feature: canvas-guide-prompt-enrich
date: 2026-06-05
requirement:
tags: [canvas, prompt, onboarding, frontend]
---

## 做了什么

给 Canvas 工作台补了两项轻体验能力：文本节点可以直接丰富提示词；Canvas 工具栏新增引导按钮，并在首次进入 Canvas project 时自动打开可跳过的快速引导。

后续按用户反馈补了一次 Canvas toolbar 视觉整理：改成左侧项目上下文、中间节点工具、右侧引导/项目/重置/运行的三段式布局，并把低频导入导出收进“项目”菜单。

再次按反馈补齐 Canvas 项目切换：项目菜单里展示最近 Canvas 项目，选择项目后会打开对应画布，并把普通工作台左侧当前会话同步到该 Canvas 项目绑定的会话。

## 改了哪些

- `src/store/app-store.ts` — 新增 `enrichCanvasTextNode()`，复用现有 prompt service 更新 Canvas 文本节点内容。
- `src/store/app-store.ts` — 新增 `openCanvasProject()`，统一处理 Canvas 项目切换、绑定会话同步和运行记录加载。
- `src/store/canvas-store.ts` / `src/services/canvas-projects.ts` / `src/shared/types.ts` — Canvas 项目摘要补充 `conversationId`，`openProject()` 返回打开的完整项目。
- `src/components/canvas/CanvasNodeLayer.tsx` — 文本节点底部新增“丰富”按钮。
- `src/components/canvas/CanvasWorkspace.tsx` — 新增工具栏“引导”按钮、首次自动引导弹窗和跳过后的可重看提示；toolbar 改成三段式紧凑排布，导入导出收进“项目”菜单；项目菜单新增最近项目切换列表。
- `src/store/app-store.test.ts` / `src/store/canvas-store.test.ts` / `src/services/canvas-projects.test.ts` / `src/components/canvas/CanvasWorkspace.test.tsx` / `src/components/canvas/CanvasViewport.test.tsx` — 覆盖 Canvas 文本丰富、引导入口、节点回调、项目摘要和项目切换会话同步。

## 怎么验证的

`pnpm vitest run src/store/canvas-store.test.ts src/store/app-store.test.ts src/components/canvas/CanvasViewport.test.tsx src/components/canvas/CanvasWorkspace.test.tsx` 通过，4 个测试文件 / 50 个测试全部通过。

`pnpm vitest run src/components/canvas/CanvasWorkspace.test.tsx` 通过，1 个测试文件 / 9 个测试全部通过。

`pnpm vitest run src/services/canvas-projects.test.ts src/store/canvas-store.test.ts src/components/canvas/CanvasWorkspace.test.tsx` 通过，3 个测试文件 / 31 个测试全部通过。

`pnpm check` 通过，32 个测试文件 / 186 个测试全部通过。

最新 `pnpm check` 通过，32 个测试文件 / 188 个测试全部通过。

`pnpm build` 通过，仅有既有 Vite chunk size warning。

## 顺手发现

无。
