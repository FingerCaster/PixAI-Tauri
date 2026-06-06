# Canvas Result Composition 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-06
> 关联方案 doc：`.codestable/features/2026-06-06-canvas-result-composition/canvas-result-composition-design.md`

## 1. 接口契约核对

**接口示例逐项核对**

- [x] `CanvasImageNodeInput` 新增 `requestIndex/batchRootId/batchIndex/promptVariant`：`src/store/canvas-store.ts:7` 已落地；`src/store/app-store.ts:1350` 在生成成功回写时传入 request/batch 上下文。
- [x] `CanvasNodeMetadata` 新增 result 组织字段：`src/shared/types.ts:57` 已落地，`src/services/canvas-projects.ts:389` normalize 保留合法值。
- [x] `recordGeneratedResult('generate-1', history-2...)` 示例：`src/store/canvas-store.ts:369` 选择可写 result node，`src/store/canvas-store.ts:544` 创建追加 result node，`src/components/canvas/CanvasResultNodeBody.tsx:62` 显示 `PNG · #2 · 批量 1 · History`。

**名词层"现状 → 变化"逐项核对**

- [x] result metadata 从仅保存基础图片字段扩展为可保存请求/批量上下文：一致。
- [x] `CanvasImageNodeInput` 从不带批量上下文扩展为带 request/batch metadata：一致。
- [x] `CanvasProjectService.normalizeCanvasNodeMetadata()` 保留新 metadata：一致，测试见 `src/services/canvas-projects.test.ts:278`。
- [x] `CanvasResultNodeBody` footer 从只显示 mime type 改为格式、请求编号、批量编号、History：一致，测试见 `src/components/canvas/CanvasViewport.test.tsx:1047`。

**流程图核对**

- [x] `pixaiApi.image.generate` 成功 items → app-store 遍历 successItems：`src/store/app-store.ts:1333`、`src/store/app-store.ts:1346`。
- [x] app-store 传 request/batch metadata：`src/store/app-store.ts:1358`。
- [x] canvas-store 判断可写 result node 或追加 result node：`src/store/canvas-store.ts:376`、`src/store/canvas-store.ts:377`。
- [x] ResultNodeBody 展示格式/编号/批量/History：`src/components/canvas/CanvasResultNodeBody.tsx:62`。

## 2. 行为与决策核对

**需求摘要逐项验证**

- [x] 空显式 result node 承载第一张成功图：`src/store/canvas-store.test.ts:757` 覆盖。
- [x] 后续不同 `historyItemId` 不覆盖第一张：`src/store/canvas-store.test.ts:801` 覆盖。
- [x] `n > 1` 多 success item 形成多个 result node / connection：`src/store/app-store.test.ts:1166` 覆盖。
- [x] 每个 result node 保留 `historyItemId/requestIndex/batchIndex/promptVariant`：`src/store/canvas-store.test.ts:846`、`src/services/canvas-projects.test.ts:307` 覆盖。
- [x] result node UI 显示简短格式、请求编号、批量编号和 History：`src/components/canvas/CanvasViewport.test.tsx:1047` 覆盖。
- [x] 生成执行、history 事实源、Provider、ImageService 不变：实现只触碰 app-store 的 Canvas 回写 payload 和 canvas-store/project/UI，未改 Provider/ImageService/history 结构。

**明确不做逐项核对**

- [x] 不改 Provider、ImageService、history、reference、Tauri API：diff 未触碰对应实现文件。
- [x] 不实现复杂 batch group 折叠/展开、动画或媒体资源包：无相关代码和入口。
- [x] 不新增视频/音频节点、入口或文案：浏览器 smoke 检查 body 不含“视频/音频”。
- [x] 不把 Canvas result metadata 变成新图片事实源：history 仍通过 `historyItemId` 指向最终事实源。
- [x] 不做多节点并发调度、后台队列、节点级取消 UI：workflow 执行语义未改。

**关键决策落地**

- [x] `historyItemId` 为最终事实源：result node metadata 保存 `historyItemId`，不会替代 history。
- [x] 显式 result node 只在可安全承载时复用：`findWritableConnectedResultNode()` 只选空节点或同 history item 节点。
- [x] 追加 result node 继续使用 `result` connection：`recordGeneratedResult()` 为追加节点补 `result` connection。
- [x] 批量上下文从 `CanvasGenerationPlanItem` 透传：`app-store.ts` 写入 `batchRootId/batchIndex/promptVariant`。

**挂载点反向核对**

- [x] 清单挂载点均有实际落点：types、app-store、canvas-store、canvas-projects、CanvasResultNodeBody、tests 均已命中。
- [x] grep 反向核查无清单外稳定挂载点：新增 result 组织概念只出现在上述文件和 CodeStable 文档。
- [x] 拔除沙盘推演：删除新增 metadata、`recordGeneratedResult` 选择逻辑、app-store payload、result footer 和对应测试后，本 feature 行为消失；无隐藏全局配置残留。

## 3. 验收场景核对

- [x] generate node 连接空 result node，单张成功图写入该节点。
  - 证据来源：`src/store/canvas-store.test.ts:692`、`src/store/canvas-store.test.ts:757`
  - 结果：通过。
- [x] 连续记录两张不同 `historyItemId`，第二张创建追加 result node，不覆盖第一张。
  - 证据来源：`src/store/canvas-store.test.ts:757`
  - 结果：通过。
- [x] `n > 1` 多 success item 生成多个 result node 和 result connection。
  - 证据来源：`src/store/app-store.test.ts:1166`
  - 结果：通过。
- [x] 重复记录同一 `historyItemId` 复用已有 result node。
  - 证据来源：`src/store/canvas-store.test.ts:812`
  - 结果：通过。
- [x] `requestIndex/batchIndex/promptVariant` 写入 metadata 并通过 normalize 保留。
  - 证据来源：`src/services/canvas-projects.test.ts:278`
  - 结果：通过。
- [x] result node footer 显示图片格式、请求编号、批量编号和 History。
  - 证据来源：`src/components/canvas/CanvasViewport.test.tsx:1047`
  - 结果：通过。
- [x] 结果节点仍可作为 `reference-image` 连到下游 generate node。
  - 证据来源：既有 `src/store/app-store.test.ts:1364` 继续通过。
  - 结果：通过。
- [x] 旧项目缺少新 metadata 时不报错。
  - 证据来源：既有旧 result node 渲染测试继续通过。
  - 结果：通过。

**前端浏览器验证**

- [x] Browser smoke：使用 Python Playwright 注入含两个 result node 的 Canvas project，打开 `http://127.0.0.1:5181/`，进入 Canvas 后确认 footer `PNG · #1 · History` 与 `PNG · #2 · 批量 1 · History` 可见，且页面不含“视频/音频”。
- [x] 截图：`C:\Users\admin\AppData\Local\Temp\pixai-canvas-result-composition-smoke.png`

## 4. 术语一致性

- 结果组织：设计文档、roadmap、架构文档使用一致。
- 显式 result node / 追加 result node：代码中以 `findWritableConnectedResultNode()` 与 `createGeneratedResultNodeAt()` 表达，语义一致。
- 结果编号：代码使用 `requestIndex` 显示 `#N`，和设计一致。
- 批量上下文：代码使用 `batchRootId/batchIndex/promptVariant`，和设计一致。
- 防冲突：未新增视频、音频、AGPL、AntD、Next.js、localforage 或 Go 后端相关术语。

## 5. 架构归并

- [x] `.codestable/architecture/ui-shadcn-workbench.md`：补充 Canvas result node / generated result node 术语、生成成功回写策略、result metadata、project normalize 和已知边界。
- [x] `.codestable/architecture/ARCHITECTURE.md`：补充 Canvas 模式多结果 result 节点组织、关键决定和硬边界。

归并后，未读过 design 的读者可以从架构文档知道：Canvas 多图/批量结果不会覆盖已有 result node，而会追加 result node；新 metadata 只用于展示，不改变 history/Provider 事实源。

## 6. requirement 回写

- [x] `requirement: reference-image-input` 指向 current req，且本次改了用户视角能力：已更新 `.codestable/requirements/reference-image-input.md`。
- [x] 用户故事补充 Canvas 多结果可继续作为参考图。
- [x] 解决方案补充多张结果保留为多个 result 节点。
- [x] 变更日志追加 2026-06-06 result composition 记录。

## 7. roadmap 回写

- [x] `.codestable/roadmap/canvas-image-workbench-upgrade/canvas-image-workbench-upgrade-items.yaml`：`canvas-result-composition.status` 已改为 `done`，`feature` 保持 `2026-06-06-canvas-result-composition`。
- [x] `.codestable/roadmap/canvas-image-workbench-upgrade/canvas-image-workbench-upgrade-roadmap.md`：主文档子 feature 清单已同步为 done，并更新结果组织协议。
- [x] YAML 校验通过。

## 8. attention.md 候选盘点

- [x] 无候选：本 feature 未暴露需要补入 attention.md 的新环境 / 工具 / 工作流信息。

## 9. 遗留

- 后续优化点：复杂 batch group 折叠/展开、结果分组视觉管理仍不做，后续如需要可单独 feature。
- 已知限制：Canvas workflow 仍是顺序执行，不做 DAG、并发、后台队列或节点级取消。
- 实现阶段顺手发现：`src/store/app-store.ts` 仍偏胖，Canvas 生成桥未来适合单独 refactor 拆分；本 feature 未混入结构性重构。
