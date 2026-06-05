---
doc_type: issue-fix
issue: 2026-06-05-canvas-connection-line-invisible
path: fast-track
fix_date: 2026-06-05
tags: [canvas, connection, frontend, css]
---

# Canvas 连线显示与形态修复记录

## 1. 问题描述

用户在 Canvas 中点击节点右上角链条按钮完成连线后，画布上没有可见连接线。修复可见性后，进一步发现连线从节点中心出发且是直线，不符合节点式画布预期；用户希望连线从真实链条按钮附近出发，并带有自然弧度。

## 2. 根因

`src/components/canvas/CanvasNodeLayer.tsx` 的 SVG 连线使用 `stroke="hsl(var(--primary))"`。当前项目 Tailwind v4 / shadcn 主题变量使用 `oklch(...)` 值，例如 `--primary: oklch(...)`，套进 `hsl(var(--primary))` 后会变成无效颜色，导致 SVG line 不可见。

同类问题也存在于 `src/components/canvas/CanvasViewport.tsx` 的画布背景和网格色值中，虽然不直接阻断连线创建，但会让 Canvas 视口颜色依赖无效 CSS。

连线可见后仍显得不自然，是因为旧实现用 `nodeCenter()` 取节点中心点，再用 `<line>` 直连；节点 header 的链条按钮只是交互入口，视觉线条没有对齐到该入口。

## 3. 修复方案

- 将 Canvas 连线 SVG 设为 `text-primary`，可见路径使用 `stroke="currentColor"`，复用 Tailwind 主题色，不再手写 `hsl(var(...))`。
- 将 Canvas 视口背景改为 `var(--background)`。
- 将 Canvas 网格线改为 `color-mix(in oklch, var(--border) 52%, transparent)`，兼容当前 oklch token。
- 将 Canvas 连线从 `<line>` 改为 `<path>` 贝塞尔曲线。
- 新增链条按钮锚点计算：按节点 header 高度、右侧 padding、`icon-sm` 尺寸和选中态删除按钮占位，计算真实链条按钮中心。
- 上下排列的节点走右侧弧线，左右排列的节点走平滑横向曲线。
- 补充 CanvasViewport 单测断言，防止连线 stroke 回退到无效变量写法，并锁定上下节点连接时的曲线路径。

## 4. 改动文件清单

- `src/components/canvas/CanvasNodeLayer.tsx`
- `src/components/canvas/CanvasViewport.tsx`
- `src/components/canvas/CanvasViewport.test.tsx`

## 5. 验证结果

- `pnpm vitest run src/components/canvas/CanvasViewport.test.tsx` 通过，4 个测试全部通过。
- `pnpm check` 通过，32 个测试文件 / 182 个测试全部通过。

## 6. 遗留事项

- `src/components/layout/MainLayout.tsx` 仍有历史遗留的 `hsl(var(...))` 背景写法，本次未顺手修改，避免扩大修复范围。
