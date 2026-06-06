---
doc_type: issue-fix
issue: 2026-06-06-settings-toggle-nested-button-warning
path: fast-track
fix_date: 2026-06-06
tags: [settings, react, html-validity, warning]
---

# SettingsToggleRow 嵌套 button 警告修复记录

## 1. 问题描述

全量测试运行时，`ShellLayout.test.tsx` 输出 React HTML 结构警告：`<button> cannot be a descendant of <button>`。警告来自工作台参数面板里的 `SettingsToggleRow`。

## 2. 根因

`src/components/settings/SettingsToggleRow.tsx` 外层用 `<button>` 实现整行点击，同时内部渲染 shadcn `Switch`。`Switch` 底层也是 `<button role="switch">`，最终形成 button 嵌套 button，触发 React hydration / HTML validity 警告。

## 3. 修复方案

- 移除内部 shadcn `Switch`，改为非交互的视觉开关 `span`。
- 外层保留唯一交互元素 `<button role="switch" aria-checked={checked}>`，继续支持整行点击切换。
- 保留原有尺寸、颜色和 off 状态 class，避免影响设置面板布局。

## 4. 改动文件清单

- `src/components/settings/SettingsToggleRow.tsx`

## 5. 验证结果

- `pnpm exec tsc --noEmit`：通过。
- `pnpm exec vitest run src/components/layout/ShellLayout.test.tsx src/components/settings/workspace/WorkspaceConfigPanel.test.tsx --reporter=dot`：通过，2 files / 5 tests，未再输出 nested button 警告。
- `pnpm exec vitest run --reporter=dot`：通过，33 files / 236 tests，未再输出 nested button 警告。

## 6. 遗留事项

- 无本 issue 内遗留。
