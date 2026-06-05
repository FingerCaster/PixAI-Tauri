# History Reuse New Conversation 验收报告

> 阶段：阶段 3（验收闭环）
> 验收日期：2026-06-05
> 关联方案 doc：`.codestable/features/2026-06-05-history-reuse-new-conversation/history-reuse-new-conversation-design.md`

## 1. 接口契约核对

- [x] `src/services/app-database.ts:createConversation` 已支持 `title / draftPrompt / referenceImages` 初始化，创建后会持久化这些字段。
- [x] `src/store/app-store.ts:reuseHistory` 已从“更新当前会话”改为“创建并激活新会话”，入口仍然只吃单个 `ImageHistoryItem`。
- [x] `GalleryPage` 主动作文案已切到“用此重做”，和“复制提示词”保持分离。

## 2. 行为与决策核对

- [x] 需求摘要：点击历史项后，新会话会带入 prompt、model、ratio、size、quality，并在图生图场景下带入可恢复的原始参考图。
- [x] 明确不做：未回填当前 active conversation，未自动生成，未把历史输出图自动当参考图，`ImageTile` 的复制提示词动作保持不变。
- [x] 关键决策：Gallery 的主语义已经从“回填参数”切到“用此重做”，缺失参考图只提示、不阻塞。
- [x] 编排骨架：历史快照 -> 创建新会话 -> 激活新会话 -> 切到 workspace，这条链路在 store 里已经落地。
- [x] 流程级约束：点击前会话不被改写，历史项原会话不被 update，history 列表不因重做而被修改。

## 3. 验收场景核对

- [x] 文生图重做：`pnpm vitest run src/services/app-database.test.ts src/store/app-store.test.ts src/components/gallery/GalleryPage.test.tsx` 通过，`pnpm exec tsc --noEmit` 通过。
- [x] 图生图重做：浏览器里注入一条带 2 张原始参考图的历史，点击“用此重做”后，`appState.activeConversation.referenceCount = 1`，并显示 toast `已用历史重做，部分原始参考图不可用`。
- [x] 浏览器核对：Chrome headless 打开 `http://127.0.0.1:4173/` 后，Gallery 卡片主按钮文案为 `用此重做`；点击后 `appState.view = workspace`、`conversationCount = 2`、`toast` 可见、Composer 里出现 `图生图` badge。
- [x] 反向场景：浏览器里原始会话仍保留为第二条会话，标题与提示词保持原值，没有被当前会话覆盖。

## 4. 术语一致性

- [x] `历史复用`、`重做会话`、`原始参考图`、`复制提示词`、`失败重试` 在设计文档与代码命名里一致。
- [x] `GalleryPage.tsx` 中已不再出现“回填参数”语义，禁用词 grep 无新增命中。

## 5. 架构归并

- [x] `.codestable/architecture/ui-shadcn-workbench.md` 已写入 Gallery 的“用此重做”语义、`reuseHistory` 的新会话行为、referenceImages 恢复条件，以及“不覆盖 active conversation”的约束。
- [x] 这次没有额外新增架构 doc；现有 `ARCHITECTURE.md` 继续只做索引入口即可。

## 6. requirement 回写

- [x] `.codestable/requirements/history-reuse-workflow.md` 已从 `draft` 升为 `current`，并补了变更日志。
- [x] `implemented_by` 已指向 `ui-shadcn-workbench`，`VISION.md` 里的索引也已同步到 current。

## 7. roadmap 回写

- [x] 非 roadmap 起头 feature，没有 `roadmap` / `roadmap_item` 字段，因此无需回写 items.yaml。

## 8. attention.md 候选盘点

- [x] 本 feature 未暴露需要追加到 `.codestable/attention.md` 的新硬约束。

## 9. 遗留

- [x] 无已知遗留问题。
