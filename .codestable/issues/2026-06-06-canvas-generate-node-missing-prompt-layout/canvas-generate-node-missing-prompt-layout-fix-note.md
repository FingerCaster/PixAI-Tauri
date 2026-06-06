---
doc_type: issue-fix
issue: 2026-06-06-canvas-generate-node-missing-prompt-layout
path: fast-track
fix_date: 2026-06-06
tags: [canvas, ui, generate-node, layout]
---

# Canvas 生成节点缺提示词布局修复记录

## 1. 问题描述

Canvas 生成节点缺少提示词时，节点内部同时显示缺提示词摘要、提示词 textarea 和底部“待运行”占位区。节点高度较小时，textarea 被挤压，截图中表现为输入框区域和底部状态区拥挤，视觉上像提示词输入区被压扁。

## 2. 根因

`src/components/canvas/CanvasGenerateNodeBody.tsx` 在 `idle` 状态下也渲染底部输出占位区，并显示“待运行”。在新增生成上下文摘要后，生成节点内部固定区域变多，但新建节点和旧项目保存节点仍使用较低高度，导致缺提示词场景下中间 textarea 空间不足。

## 3. 修复方案

- 空闲状态不再渲染底部“待运行”输出占位区；输出区只在运行中、失败或有 partial preview 时显示。
- 新建生成节点默认高度调整为 340px。
- 渲染层对旧项目里的低高度 generate node 做最小显示高度兼容，避免旧 260px 节点继续压缩布局。
- 补充回归断言：缺提示词时不再出现“待运行”。

## 4. 改动文件清单

- `src/components/canvas/CanvasGenerateNodeBody.tsx`
- `src/components/canvas/CanvasNodeLayer.tsx`
- `src/store/canvas-store.ts`
- `src/services/canvas-projects.ts`
- `src/components/canvas/CanvasViewport.test.tsx`

## 5. 验证结果

- `pnpm exec tsc --noEmit`：通过。
- `pnpm exec vitest run src/components/canvas/CanvasViewport.test.tsx src/components/canvas/CanvasWorkspace.test.tsx src/store/canvas-store.test.ts src/services/canvas-projects.test.ts`：通过，4 files / 56 tests。
- Python Playwright smoke：通过。旧项目保存的 260px 生成节点在真实页面中显示为 340px；textarea 高度约 161px；节点文案包含“缺提示词”和缺提示词说明，不包含“待运行”。截图：`C:\Users\admin\AppData\Local\Temp\pixai-canvas-generate-node-missing-prompt-fix.png`。

## 6. 遗留事项

- 无本 issue 内遗留。
