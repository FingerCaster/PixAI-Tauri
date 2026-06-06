---
doc_type: issue-fix
issue: 2026-06-06-canvas-batch-failure-results
path: fast-track
fix_date: 2026-06-06
tags: [canvas, batch, generation, failure-result]
---

# Canvas 批量节点失败结果修复记录

## 1. 问题描述

Canvas 生成节点连接批量节点后，节点摘要显示有多个批量变体，但点击单个生成节点运行时只生成了部分结果。截图中的批量节点有 3 个变体，配置节点 `n=2`，实际只显示 2 张结果图；失败项也没有在 Canvas 上形成可见结果或明确提示。

## 2. 根因

`src/services/canvas-workflow.ts` 的摘要使用 `buildCanvasGenerationPlanForNode(..., 'all')`，所以界面上显示的是全部批量变体数量；但 `src/store/app-store.ts` 的 `generateCanvasNode()` 原先按单节点运行路径只执行第一组计划，导致运行行为和摘要不一致。

同时，Canvas 生成失败只更新生成节点状态，没有把失败项写入 result 节点。混合成功/失败时，用户只能看到成功图片，无法从 Canvas 上知道哪些请求或 request index 失败。

## 3. 修复方案

- 单个 Canvas 生成节点运行时改为执行全部批量变体，并保留每个变体的 `n` 配置。
- `runCanvasGenerationPlanItem()` 返回 `{ succeeded, failed }`，让单节点批量运行和 workflow 运行都能准确累计成功/失败数量。
- 后端返回 failed history item、没有成功图、或请求抛错时，统一写入 Canvas 失败 result 节点。
- 失败 result 节点记录 `errorMessage`、`runId`、`historyItemId`、`requestIndex`、`batchIndex` 和 `promptVariant`，标题显示为类似 `批量 2 · #2 失败`。
- 批量运行存在失败时，通知显示 `Canvas 批量生成完成：X 成功，Y 失败`，生成节点保留部分失败错误摘要。

## 4. 改动文件清单

- `src/store/app-store.ts`
- `src/store/app-store.test.ts`
- `src/store/canvas-store.ts`

## 5. 验证结果

- `pnpm exec tsc --noEmit`：通过。
- `pnpm exec vitest run src/store/canvas-store.test.ts src/store/app-store.test.ts src/services/canvas-workflow.test.ts --reporter=dot`：通过，3 files / 61 tests。
- `pnpm exec vitest run --reporter=dot`：通过，33 files / 236 tests。

新增回归测试覆盖：批量节点 3 个变体、配置节点 `n=2`、其中一个返回 failed item 时，会发起 3 次生成请求，生成 5 个成功 result 节点和 1 个失败 result 节点，并给出 `5 成功，1 失败` 的通知。

## 6. 遗留事项

- 全量测试日志中仍有一个既有 HTML 警告：`SettingsToggleRow` 外层 button 内嵌 shadcn `Switch` button。测试通过，且不属于本次批量失败结果修复范围。
