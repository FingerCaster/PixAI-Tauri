---
doc_type: feature-ff-note
feature: local-edit-mask
date: 2026-06-06
requirement:
tags: [canvas, image-edit, mask]
---

## 做了什么
Canvas 图片节点和结果节点现在可以打开本地 mask 编辑器，用画笔/橡皮标记局部编辑区域并保存到节点 metadata。Canvas 生成时会把连线参考图对应的 mask 传给 image edit 请求。

## 改了哪些
- `src/components/canvas/CanvasMaskEditorModal.tsx` — 新增基于 canvas 的 mask 绘制、清空和保存弹窗。
- `src/components/canvas/CanvasImageNodeBody.tsx` / `CanvasNodeLayer.tsx` — 在图片/结果节点接入 mask 编辑入口并写回节点 metadata。
- `src/store/app-store.ts` / `src/services/image-service.ts` — Canvas 生成桥解析 reference mask，并只在 provider 请求层携带 mask 数据。
- `src/adapters/openai-compatible.ts` — images edits 发送 multipart `mask`，Responses image tool 发送 `input_image_mask`，并把带 mask 的参考图排到第一张。
- `src/services/canvas-projects.ts` / `src/shared/types.ts` — 持久化和规范化 `maskDataUrl` / `maskUpdatedAt`。

## 怎么验证的
已补充 Canvas UI、项目持久化、app-store 生成桥、OpenAI compatible adapter 和 ImageService 测试。

验证命令：`pnpm check`、`cargo check`、`pnpm build` 均通过。
