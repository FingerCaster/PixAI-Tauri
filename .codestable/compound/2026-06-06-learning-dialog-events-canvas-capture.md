---
doc_type: learning
track: pitfall
date: 2026-06-06
slug: dialog-events-canvas-capture
component: canvas-dialog-interaction
severity: high
tags: [canvas, dialog, pointer-capture, react-portal, frontend]
---

# Canvas 弹窗按钮被画布拖拽层抢事件

## 1. 问题

Canvas 内的 Dialog / 弹层按钮多次出现点击无效：图片预览关闭按钮、文本节点放大编辑器关闭按钮、mask 编辑器里的画笔 / 橡皮 / 清空 / 保存等按钮都曾受影响。

这类问题不能再按单个按钮逐个绕过。它的本质是 Canvas 拖拽层和弹窗层之间缺少通用事件边界。

## 2. 症状

- 弹窗已经打开，Esc 可以退出，但右上角关闭按钮或工具栏按钮点击无效。
- 某个按钮通过局部 `pointerdown` capture 修复后，其他 Dialog 内按钮仍然失效。
- 问题通常只在 Canvas 视口内出现；普通页面弹窗不一定复现。
- 测试看起来可能只覆盖了弹窗打开 / Esc 关闭，没有覆盖鼠标点击按钮时是否触发底层画布事件。

## 3. 没用的做法

- 只给某一个关闭按钮加特殊处理。
- 只替换按钮组件或只调整 z-index。
- 只依赖 Radix Dialog 的 portal，以为 portal 到 `body` 后事件就不会再回到 Canvas。
- 只验证 Esc 能关闭弹窗，没有验证普通鼠标点击链路。

这些做法最多修掉一个症状，不能保证其他 Dialog / Popover / 工具按钮可用。

## 4. 解法

默认在通用弹层内容根处理事件隔离，而不是在单个按钮上打补丁。

当前项目的修复位置是 `src/components/ui/dialog.tsx`：`DialogContent` 在调用外部传入 handler 后，对 `pointerdown` / `pointermove` / `pointerup` / `pointercancel` / `mousedown` / `click` / `wheel` 调用 `stopPropagation()`，阻止弹窗内部交互继续冒泡到 Canvas 画布拖拽层。

相关修复记录见：

- `.codestable/issues/2026-06-05-canvas-node-interaction-regressions/canvas-node-interaction-regressions-fix-note.md`
- `src/components/ui/dialog.tsx`
- `src/components/canvas/CanvasViewport.tsx`
- `src/components/canvas/CanvasViewport.test.tsx`

## 5. 为什么有效

Radix Dialog 的 portal 只改变 DOM 挂载位置，不改变 React synthetic event 沿组件树冒泡的事实。

Canvas 视口组件在底层监听 `pointerdown` 并可能调用 `setPointerCapture` 进入拖拽 / 平移状态。Dialog 内容虽然渲染到了 `body`，但如果 React 事件继续冒泡回 Canvas 组件树，底层画布仍可能抢走 pointer capture，导致按钮后续 `click` 链路丢失。

所以真正的边界必须建在弹窗内容根：弹窗内部的 pointer / mouse / click / wheel 事件属于弹窗，不应继续交给 Canvas 视口处理。

## 6. 预防

- Canvas、拖拽画布、缩放容器、编辑器 surface 内新增 Dialog / Popover / Dropdown 时，先检查弹层内容根是否隔离 pointer / mouse / click / wheel 事件。
- 不要把“给某个按钮加 `onPointerDownCapture`”当成最终修复；这只能作为临时定位手段。
- 回归测试必须断言弹窗按钮点击不会触发底层 `setPointerCapture`、不会触发 viewport commit / pan / drag。
- 除了 Esc 关闭，还要用真实浏览器 smoke 验证右上角关闭按钮和弹窗内普通工具按钮。
- 后续遇到“按钮点了没反应但键盘快捷键有效”，优先排查 React portal 事件冒泡和底层 pointer capture。
