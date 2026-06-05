---
doc_type: issue-fix
issue: 2026-06-05-history-reuse-reference-fallback
path: fast-track
fix_date: 2026-06-05
tags: [gallery, history, reference-image, conversation, bugfix]
---

# 历史重做参考图回退修复记录

## 1. 问题描述

Gallery 的“用此重做”在部分历史项上会提示“原始参考图不可用”，但原会话和原始参考图实际上还在本地。

## 2. 根因

`reuseHistory` 只读取 `ImageHistoryItem.referenceImages`。当历史快照里的参考图载荷缺失，但原会话仍保留完整参考图时，现有逻辑不会回看原会话，导致误判成“不可用”。

## 3. 修复方案

- 重做时先查历史项关联的原会话。
- 优先使用历史快照里的原始参考图。
- 如果快照缺载荷，但原会话仍存在，就从原会话补回可恢复的参考图。
- 只有历史快照和原会话都拿不到可恢复引用时，才提示参考图不可用。

## 4. 改动文件清单

- `src/store/app-store.ts`
- `src/store/app-store.test.ts`
- `.codestable/requirements/history-reuse-workflow.md`
- `.codestable/architecture/ui-shadcn-workbench.md`

## 5. 验证结果

- `pnpm vitest run src/store/app-store.test.ts src/components/gallery/GalleryPage.test.tsx src/services/app-database.test.ts` 通过。
- `pnpm exec tsc --noEmit` 通过。

## 6. 遗留事项

- 无。
