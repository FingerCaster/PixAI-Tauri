---
doc_type: issue-fix
issue: 2026-06-05-canvas-session-image-display
path: fast-track
fix_date: 2026-06-05
tags: [canvas, conversation, image-node, frontend]
---

# Canvas 会话归属与图片节点显示修复记录

## 1. 问题描述

- Canvas 生成结果会记录到别的会话里。
- Canvas 图片节点只显示局部图片，没有点击放大查看入口。
- 从参考图/本地图片加入 Canvas 后，部分图片节点为空白。

## 2. 根因

- `useCanvasStore.ensureDefaultProject()` 只要当前有 `activeProject` 就直接复用，没有校验该 project 的 `conversationId` 是否等于当前会话，导致切换会话后 Canvas 仍可能使用旧会话绑定的项目。
- 图片节点和结果节点直接用 `metadata.content` 作为 `<img src>`，没有经过 `imageSourceForDisplay()` 解析；本地路径、asset path 或 browser-memory 形式的来源无法稳定展示。
- 图片节点使用 `object-cover`，会裁切图片，且没有专用预览弹窗。

## 3. 修复方案

- `ensureDefaultProject()` 只复用 `conversationId` 匹配当前会话的 active project。
- 默认项目加载时会在已有项目中寻找同会话 project；找不到才创建新 project，避免 Canvas 生成写入别的会话。
- 新增 `CanvasImageNodeBody`，统一解析图片显示源，使用 `object-contain` 完整展示图片，并提供点击放大查看。
- 新增 `CanvasImagePreviewModal`，供普通图片节点和结果节点复用。
- Canvas 本地图片导入成功/失败都给明确 toast，不再静默吞掉错误。

## 4. 改动文件清单

- `src/store/canvas-store.ts`
- `src/components/canvas/CanvasImageNodeBody.tsx`
- `src/components/canvas/CanvasImagePreviewModal.tsx`
- `src/components/canvas/CanvasNodeLayer.tsx`
- `src/components/canvas/CanvasResultNodeBody.tsx`
- `src/components/canvas/CanvasWorkspace.tsx`
- `src/store/canvas-store.test.ts`
- `src/components/canvas/CanvasViewport.test.tsx`
- `src/components/canvas/CanvasWorkspace.test.tsx`

## 5. 验证结果

- `pnpm vitest run src/store/canvas-store.test.ts src/store/app-store.test.ts src/components/canvas/CanvasViewport.test.tsx src/components/canvas/CanvasWorkspace.test.tsx` 通过，4 个测试文件 / 50 个测试全部通过。
- `pnpm check` 通过，32 个测试文件 / 186 个测试全部通过。
- `pnpm build` 通过，仅有既有 Vite chunk size warning。

## 6. 遗留事项

无。
