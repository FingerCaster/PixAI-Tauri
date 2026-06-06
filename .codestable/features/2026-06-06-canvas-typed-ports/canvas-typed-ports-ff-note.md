---
doc_type: feature-ff-note
feature: canvas-typed-ports
date: 2026-06-06
requirement:
tags: [canvas, workflow, connections]
---

## 做了什么
Canvas 节点连接改为 typed ports：文本、图片、结果、配置、批量都只能输入到生成节点，生成节点只输出到结果节点。生成成功后默认创建 result node，生成节点里的 prompt 文案改为“本节点提示词”。

## 改了哪些
- `src/services/canvas-projects.ts` — 新增按起点和终点共同判定连接类型的规则，过滤非法方向。
- `src/store/canvas-store.ts` — 连接创建复用 typed ports 规则，自动生成结果落到 result node。
- `src/components/canvas/CanvasNodeLayer.tsx` — 节点头部按合法端口显示连接入口，并在连线上显示连接语义标签。
- `src/components/canvas/CanvasGenerateNodeBody.tsx` — 将生成节点 prompt placeholder 改为“本节点提示词”。
- `src/**/*canvas*.test.ts` 与 `src/store/app-store.test.ts` — 更新旧连接语义和 result node 断言。

## 怎么验证的
已运行 `pnpm exec vitest run src/store/canvas-store.test.ts src/services/canvas-projects.test.ts src/components/canvas/CanvasViewport.test.tsx`，32 个定向测试通过。
已运行 `pnpm check`，TypeScript 校验通过，33 个测试文件 212 个测试通过。
