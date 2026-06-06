---
doc_type: feature-acceptance
feature: 2026-06-06-canvas-generation-context-panel
status: accepted
accepted_at: 2026-06-06
roadmap: canvas-image-workbench-upgrade
roadmap_item: canvas-generation-context-panel
tags: [canvas, image-generation, workflow, context, ux]
---

# Canvas Generation Context Panel 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-06
> 关联方案 doc：`.codestable/features/2026-06-06-canvas-generation-context-panel/canvas-generation-context-panel-design.md`

## 1. 接口契约核对

**接口示例逐项核对**

- [x] `CanvasGenerationInputSummary`：类型已在 `src/services/canvas-workflow.ts:29` 落地，字段包含 prompt/local prompt/reference/config/batch/request/missing/config patch。
- [x] `summarizeCanvasGenerationInput(project, nodeId)`：函数已在 `src/services/canvas-workflow.ts:67` 落地，输入为 `CanvasProject + nodeId`，返回只读 summary。
- [x] 示例输入 -> 输出：`src/services/canvas-workflow.test.ts:75` 覆盖 2 个上游 prompt、2 张可用参考图、1 个 config、2 个 batch 变体，输出 `{ promptTextCount: 2, referenceImageCount: 2, requestCount: 2, config.n: 4 }`，与 design 示例一致。

**名词层“现状 -> 变化”逐项核对**

- [x] workflow 计划解析仍保留：`buildCanvasGenerationPlanForNode()` 和 `buildCanvasWorkflowPlan()` 签名未变。
- [x] 新增 summary 纯函数共用 prompt/config/batch 解析 helper，未引入 app-store、Provider、history 或 reference 依赖。
- [x] `CanvasGenerateNodeBody` 已新增 `inputSummary?: CanvasGenerationInputSummary` props，并只做展示。
- [x] `CanvasNodeLayer` 使用当前 draft nodes 和 connections 组装 render snapshot，向 generate body 传入 summary。

**流程图核对**

- [x] CanvasNodeLayer 渲染 generate node -> `generationInputSummaryByNodeId`。
- [x] 组装 project snapshot -> `renderCanvasProject()`。
- [x] 调用 `summarizeCanvasGenerationInput()` -> `src/components/canvas/CanvasNodeLayer.tsx:108`。
- [x] CanvasGenerateNodeBody 渲染 chips 和 missing prompt warning -> `src/components/canvas/CanvasGenerateNodeBody.tsx:75`。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] 生成节点运行前展示提示词、参考图、参数、批量和请求数：`CanvasViewport.test.tsx` 覆盖完整连接摘要，浏览器 smoke 也确认真实页面显示。
- [x] 缺少有效提示词时显示警示：`CanvasViewport.test.tsx` 覆盖 `缺提示词` 和 warning 文案。
- [x] summary 只读：没有 store action 或 project mutation 调用；只在 render path 中计算。
- [x] 单节点运行和 workflow run 语义不变：现有 app-store 执行入口未修改，`tsc` 和定向测试通过。

**明确不做逐项核对**

- [x] 未修改 Provider、ImageService、history、reference 或 Tauri API；本 feature 代码改动集中在 workflow service、Canvas UI 和测试。
- [x] 未读取参考图内容、history 内容或 Provider 配置；summary 只读取 Canvas project nodes/connections metadata。
- [x] 未新增视频、音频、账号、后端或参考项目 UI 体系；测试和浏览器 smoke 均确认页面无视频/音频入口。
- [x] 未实现 inspector、右侧参数面板、复杂 DAG、并发队列或后台批量。
- [x] 未拆分 `CanvasNodeLayer`，只补局部 summary bridge。

**关键决策落地**

- [x] 摘要计算放在 `canvas-workflow.ts`：`summarizeCanvasGenerationInput()` 已落地。
- [x] UI 摘要作为 `CanvasGenerateNodeBody` props：`inputSummary` 已落地。
- [x] NodeLayer 负责 project snapshot 桥接：`renderCanvasProject()` 已落地，未写 store。
- [x] 请求数展示 workflow 全量潜在请求数：summary 使用 `buildCanvasGenerationPlanForNode(project, node.id, 'all')`。

**流程级约束核对**

- [x] 纯函数：无网络、无 store、无 Provider/history/reference 读取。
- [x] 非 generate 或不存在节点返回空摘要：`canvas-workflow.test.ts` 覆盖 invalid node。
- [x] config patch 仍 clamp `n` 到 1-4：service test 覆盖 `n: 9 -> 4`。
- [x] batch 请求数只可见化，不绕过 8 次预算：执行预算仍在 `buildCanvasWorkflowPlan()`。
- [x] 禁止视频/音频入口：组件测试和浏览器 smoke 均核对。

**挂载点反向核对**

- [x] `src/services/canvas-workflow.ts`：新增类型和纯函数。
- [x] `src/components/canvas/CanvasGenerateNodeBody.tsx`：新增 summary chips 和缺 prompt warning。
- [x] `src/components/canvas/CanvasNodeLayer.tsx`：新增 summary 计算和 props 透传。
- [x] `src/services/canvas-workflow.test.ts` / `CanvasViewport.test.tsx` / `CanvasWorkspace.test.tsx`：新增覆盖。
- [x] `.codestable/roadmap/canvas-image-workbench-upgrade/*`：已回写 done。
- [x] grep `summarizeCanvasGenerationInput|CanvasGenerationInputSummary|generationInputSummary` 未发现清单外挂载点。
- [x] 拔除沙盘推演：移除 service 类型/函数、GenerateBody props、NodeLayer summary bridge 和测试后，本 feature 行为消失，不影响 Canvas 其他生成执行入口。

## 3. 验收场景核对

- [x] generate node 没有本地或上游 prompt 时显示缺提示词警示。
  - 证据：`CanvasViewport.test.tsx` 缺 prompt 用例。
- [x] generate node 有本地 prompt 时显示本节点提示词已计入。
  - 证据：`canvas-workflow.test.ts` 完整摘要用例，`CanvasViewport.test.tsx` 显示 `提示词 1+本节点`。
- [x] 多个上游 text prompt 会计入提示词数量。
  - 证据：`canvas-workflow.test.ts` 统计 2 个非空 text prompt。
- [x] image/result 参考图连接会计入参考图数量。
  - 证据：`canvas-workflow.test.ts` 统计 image content 和 result reference binding，排除空 image。
- [x] config 连接会计入参数数量并保留 config patch。
  - 证据：`canvas-workflow.test.ts` 验证 `ratio/quality/n`。
- [x] batch 连接会显示非空变体数量和工作流请求数。
  - 证据：`canvas-workflow.test.ts` 和 `CanvasViewport.test.tsx` 均覆盖 2 个 batch 变体。
- [x] 单节点运行按钮行为不变，仍调用 `onGenerateNodeRun(nodeId)`。
  - 证据：`CanvasViewport.test.tsx` 原 run action 用例继续通过。
- [x] workflow run 预算和缺 prompt 过滤逻辑不变。
  - 证据：`canvas-workflow.test.ts` 原 workflow budget / missing prompt 用例继续通过。

**前端浏览器验证**

- [x] Playwright 打开 `http://127.0.0.1:5181/`，进入 Canvas，创建 text + generate，建立 prompt connection，generate node 显示 `提示词 1 / 参考图 0 / 参数 0 / 批量 0 / 工作流请求 1`。
- [x] 截图：`C:\Users\admin\AppData\Local\Temp\pixai-canvas-generation-context-panel-smoke.png`。

**自动化验证**

- [x] `pnpm exec tsc --noEmit`。
- [x] `pnpm exec vitest run src/services/canvas-workflow.test.ts src/components/canvas/CanvasViewport.test.tsx src/components/canvas/CanvasWorkspace.test.tsx` -> 3 files / 34 tests passed。
- [x] `git diff --check` 目标文件通过，仅有 CRLF warning。

## 4. 术语一致性

- `生成上下文摘要` / `CanvasGenerationInputSummary`：代码和 design 对齐。
- `本地提示词`：代码使用 `localPromptPresent` 表达。
- `上游提示词`：代码使用 incoming `prompt` text node 统计。
- `参考图输入`：代码使用 incoming `reference-image` image/result node 统计。
- `参数覆盖`：代码使用 incoming `config` node 和 config patch 表达。
- `批量变体`：代码使用 incoming `batch` node 非空行统计。
- 防冲突：未引入 design 外的新 Canvas 节点类型或媒体类型。

## 5. 架构归并

- [x] `.codestable/architecture/ui-shadcn-workbench.md`：已补 Canvas generation input summary 术语、CanvasNodeLayer/CanvasGenerateNodeBody 交互、workflow service 纯函数职责和当前能力边界。
- [x] `.codestable/architecture/ARCHITECTURE.md`：已补 Canvas 模式术语、Canvas 子系统索引、关键架构决定和已知约束。

## 6. requirement 回写

- [x] `reference-image-input` 是 current req。本 feature 没改变参考图导入能力，但让 Canvas 中已连接参考图数量在运行前可见；已在 `.codestable/requirements/reference-image-input.md` 补用户故事、解决方式和 2026-06-06 变更日志。

## 7. roadmap 回写

- [x] `.codestable/roadmap/canvas-image-workbench-upgrade/canvas-image-workbench-upgrade-items.yaml`：`canvas-generation-context-panel.status` 已从 `in-progress` 改为 `done`，feature 保持 `2026-06-06-canvas-generation-context-panel`。
- [x] `.codestable/roadmap/canvas-image-workbench-upgrade/canvas-image-workbench-upgrade-roadmap.md`：子 feature 清单已同步为 done。
- [x] items.yaml 已通过 `validate-yaml.py --yaml-only`。

## 8. attention.md 候选盘点

- [x] 本 feature 未暴露需要补入 attention.md 的新环境 / 命令 / 工作流硬约束。现有 `pnpm dev:client` 约束仍有效。

## 9. 遗留

- 后续优化点：`CanvasNodeLayer.tsx` 已偏胖，后续如果继续增加 inspector、右键菜单、多选或端口系统，建议另起 refactor 拆分。
- 已知限制：summary 只显示数量和缺 prompt，不展示具体参考图缩略、不做右侧 inspector，不改变单节点 batch 只取第一条的执行语义。
- 顺手发现：无。
